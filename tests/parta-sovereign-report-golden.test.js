/**
 * The regulated Part A §5.9 sovereign deliverable, pinned. The annual
 * disclosure and the per-holding report are each flattened to an outline —
 * every section, every table head and row, every figure, every bullet and the
 * checklist — and held to a committed golden, so a change to the document
 * fails on the document rather than on a well-formed-PDF check that a report
 * with a section missing would pass just as well.
 *
 * The publication instant, the dates, the ids and the checksums are
 * normalised, so it fails on what the document says, not on the clock.
 * UPDATE_GOLDEN=1 regenerates.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const store = require('../src/platform/database/store');
const sov = require('../src/domains/pcaf-part-a/application/sovereign-register');
const register = require('../src/domains/pcaf-part-a/application/register');
const svc = require('../src/domains/pcaf-part-a/application/sovereign-report');

const GOLDEN_DIR = path.join(__dirname, 'golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const ORG = 'org-parta-sovereign-golden';

/* A small, fixed book: Singapore and Hong Kong (the standard's own worked
   example, excluding-LULUCF only), and Sri Lanka (provisional, carrying both
   LULUCF boundaries) — enough to exercise the partial including-LULUCF sum,
   the weighted score, the by-sovereign table, coverage, and the findings. */
const BOOK = [
  { reportingYear: 2024, country: 'SG', instrument: 'sovereign-bond', exposure: { amount: 1e6, currency: 'USD' }, identifiers: { accountNumber: 'SG-1' } },
  { reportingYear: 2024, country: 'HK', instrument: 'sovereign-bond', exposure: { amount: 1e6, currency: 'USD' }, identifiers: { accountNumber: 'HK-1' } },
  { reportingYear: 2024, country: 'LK', instrument: 'sovereign-loan', exposure: { amount: 2e6, currency: 'USD' },
    dataQualityOption: '3b', dataQualityOverrideJustification: 'Provisional Sri Lanka dataset; scored as a proxy pending a released set.',
    identifiers: { accountNumber: 'LK-1' } },
];

/* What a reporting entity states about itself — the same facts the §5.2
   golden states, so the two documents from one book describe one entity. */
const ENTITY = {
  reportingEntity: 'Demo Bank PLC',
  consolidationApproach: 'operational_control',
  boundaryNote: 'The bank and its wholly owned subsidiaries; the leasing associate (40% held) is excluded.',
  fiscalYearEnd: '12-31',
  gwpBasis: 'IPCC AR6, 100-year',
  preparedBy: { name: 'A. Perera', role: 'Head of Sustainability' },
  approvedBy: { name: 'S. Fernando', role: 'Chief Financial Officer', date: '2025-03-31' },
  assetClassesNotReported: [
    { assetClass: 'listed-equity-corporate-bonds', reason: 'Immaterial: below one per cent of total loans and investments.' },
  ],
};

function normalise(text) {
  return text
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<published>')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<date>')
    .replace(/\bpas_[a-z0-9]+\b/g, '<holding-id>')
    .replace(/\b[0-9a-f]{64}\b/g, '<sha256>')
    .replace(/\b[0-9a-f]{16}\b(…?)/g, '<checksum>$1')
    .replace(/build [0-9a-f]{7,12}\b/g, 'build <commit>')
    .replace(/PA59X?-\d{4}-[0-9a-f]{12}/g, '<reference>');
}

function blockLines(blk, indent = '    ') {
  const L = [];
  switch (blk.kind) {
    case 'table':
      L.push(`${indent}table [${blk.head.length} cols] head: ${blk.head.join(' | ')}`);
      for (const row of blk.rows) L.push(`${indent}  row: ${row.map(x => String(x ?? '')).join(' | ')}`);
      if (blk.caption) L.push(`${indent}  caption: ${blk.caption}`);
      break;
    case 'figure':
      L.push(`${indent}figure: ${blk.label ?? ''} = ${blk.value ?? ''} ${blk.unit ?? ''}`.trimEnd());
      if (blk.score) L.push(`${indent}  score: ${blk.score}`);
      if (blk.note) L.push(`${indent}  note: ${blk.note}`);
      break;
    case 'callout':
      L.push(`${indent}callout${blk.title ? ` [${blk.title}]` : ''}: ${blk.text}`);
      break;
    case 'checklist': L.push(`${indent}checklist`); break;
    case 'bullets':
      L.push(`${indent}bullets:`);
      for (const item of blk.items || []) L.push(`${indent}  - ${item}`);
      break;
    default: L.push(`${indent}${blk.kind}: ${blk.text ?? ''}`);
  }
  return L;
}

function outline(model) {
  const L = [];
  L.push(`COVER: ${model.cover.title}`);
  L.push(`  subtitle: ${model.cover.subtitle ?? ''}`);
  L.push(`  ${model.cover.entityLabel || 'Re/insurer'}: ${model.cover.insurer}`);
  L.push(`  standard: ${model.cover.standard}`);
  for (const line of model.cover.responsibleParty || []) L.push(`  responsible: ${line}`);
  for (const line of model.cover.identity || []) L.push(`  identity: ${line}`);
  L.push(`  assurance: ${model.cover.assuranceMode} — ${model.cover.assuranceLabel}`);
  L.push('');
  let n = 1;
  for (const sec of model.sections) {
    L.push(`SECTION ${++n} [${sec.id}] ${sec.title}`);
    for (const blk of sec.blocks) L.push(...blockLines(blk));
    L.push('');
  }
  for (const anx of model.annexes) {
    L.push(`ANNEX ${anx.annex} [${anx.id}] ${anx.title}`);
    for (const blk of anx.blocks) L.push(...blockLines(blk));
    L.push('');
  }
  L.push(`CHECKLIST: ${model.checklist.items.length} items, `
    + `${model.checklist.items.filter(i => i.answer === 'Yes').length} Yes, `
    + `${model.checklist.items.filter(i => i.answer === 'No').length} No`);
  for (const item of model.checklist.items) L.push(`  ${item.id}: ${item.answer}`);
  return normalise(L.join('\n')) + '\n';
}

function goldenFile(name, produced) {
  const file = path.join(GOLDEN_DIR, name);
  if (UPDATE || !fs.existsSync(file)) { fs.writeFileSync(file, produced); return produced; }
  return fs.readFileSync(file, 'utf8');
}

const answers = model => Object.fromEntries(model.checklist.items.map(i => [i.id, i.answer]));

let disclosure, holding;
beforeAll(async () => {
  await store._resetMemory();
  const ids = [];
  for (const e of BOOK) ids.push(await sov.record(ORG, e));
  await register.stateBook(ORG, { reportingYear: 2024, totalLoansAndInvestments: 1e8, currency: 'USD', statedBy: 'Group CFO' });
  await register.saveSettings(ORG, ENTITY);
  ({ model: disclosure } = await svc.annualDisclosure(ORG, 2024, { currency: 'USD' }));
  /* The Sri Lanka holding: provisional, carries both LULUCF boundaries. */
  const lk = ids.find(x => x.country && x.country.code === 'LK') || ids[ids.length - 1];
  ({ model: holding } = await svc.holdingReport(ORG, lk.exposureId, {}));
});
afterAll(() => store._resetMemory());

describe('The Part A §5.9 sovereign disclosure is what it was', () => {
  test('the whole disclosure matches the committed golden', () => {
    const produced = outline(disclosure);
    expect(produced).toBe(goldenFile('parta-sovereign-disclosure.txt', produced));
  });

  test('the per-holding report matches the committed golden', () => {
    const produced = outline(holding);
    expect(produced).toBe(goldenFile('parta-sovereign-holding.txt', produced));
  });

  test('the disclosure is a document, not an empty file', () => {
    const produced = outline(disclosure);
    expect(produced.length).toBeGreaterThan(800);
    expect(produced).toMatch(/SECTION 2 \[entity\]/);
    expect(produced).toMatch(/SECTION 3 \[coverage\]/);
    expect(produced).toMatch(/ANNEX B \[annexTable\]/);
    expect(produced).toMatch(/ANNEX C \[annexRegister\]/);
    expect(produced).toMatch(/INV-1: No/);
    /* Scope 1 on both LULUCF boundaries appears, and the two are never summed. */
    expect(produced).toMatch(/excl\. LULUCF/);
    expect(produced).toMatch(/incl\. LULUCF/);
  });
});

describe('What a verifier reads first is on the sovereign document too', () => {
  test('the cover names the reporting entity, the responsible party and the identity', () => {
    expect(disclosure.cover.entityLabel).toBe('Reporting entity');
    expect(disclosure.cover.insurer).toBe('Demo Bank PLC');
    expect(disclosure.cover.responsibleParty.length).toBe(2);
    expect(disclosure.facts.reportId).toMatch(/^PA59-2024-[0-9a-f]{12}$/);
  });

  test('the holding register is the audit trail, one row per holding, and the dataset rows the book read are printed', () => {
    expect(disclosure.facts.exposureRegister).toHaveLength(disclosure.facts.exposures);
    expect(disclosure.facts.datasetRows.map(r => r.code).sort()).toEqual(['HK', 'LK', 'SG']);
    expect(typeof disclosure.facts.intensity.value).toBe('number');
    expect(JSON.stringify(disclosure.sections)).not.toMatch(/undefined/);
  });

  test('the holding report reads the same recalculation protocol as the disclosure', () => {
    expect(holding.facts.recalculation.triggers.length).toBeGreaterThan(0);
    expect(holding.facts.recalculation.significanceThresholdPct).toBe(disclosure.facts.recalculation.significanceThresholdPct);
    expect(holding.cover.insurer).toBe('Demo Bank PLC');
  });

  test('the checklist reads the facts: the governance items are Yes here and INV-1 is No', () => {
    const a = answers(disclosure);
    for (const id of ['GOV-1', 'GOV-2', 'PER-1', 'COV-2', 'GAS-1', 'TRC-1', 'MTH-1', 'INT-1', 'DOC-1']) expect([id, a[id]]).toEqual([id, 'Yes']);
    expect(a['INV-1']).toBe('No');
    const { ITEMS } = require('../src/domains/pcaf-part-a/reporting/sovereign/checklist');
    for (const def of ITEMS) {
      if (def.id === 'INV-1') continue;
      expect([def.id, /=>\s*(true|false)\s*$/.test(def.test.toString().trim())]).toEqual([def.id, false]);
    }
  });
});
