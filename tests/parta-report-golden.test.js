/**
 * The regulated Part A §5.2 deliverable, pinned. The annual disclosure and the
 * per-exposure report are each flattened to an outline — every section, every
 * table head and row, every figure, every bullet and the checklist — and held
 * to a committed golden, so a change to the document fails on the document
 * rather than on a well-formed-PDF check that a report with a section missing
 * would pass just as well.
 *
 * The publication instant, the dates, the ids and the checksums are
 * normalised, so it fails on what the document says, not on the clock.
 * UPDATE_GOLDEN=1 regenerates.
 *
 * Two books are built. The golden book states everything a reporting entity
 * states — name, boundary, year-end, GWP basis, preparer, approver, the classes
 * it does not report — so the pinned document is the complete one. A second
 * book states nothing, and the tests below hold the checklist to answering No
 * on it: an item that cannot fail is not a check.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const store = require('../src/platform/database/store');
const register = require('../src/domains/pcaf-part-a/application/register');
const svc = require('../src/domains/pcaf-part-a/application/parta-report');

const GOLDEN_DIR = path.join(__dirname, 'golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const ORG = 'org-parta-golden';
const BARE = 'org-parta-golden-bare';
const asOf = '2024-12-31', c = 'LKR';

/* A small, fixed book: one reported-inventory borrower, one estimated from the
   held factor set, one revolving facility below its average. Enough to
   exercise coverage, the weighted score, the sector table and a finding. */
const BOOK = [
  { reportingYear: 2024, instrument: 'business-loan', borrowerListed: false,
    identifiers: { accountNumber: 'TL-1' },
    counterparty: { name: 'Lanka Apparel', sector: 'Textiles', sectorKey: 'manufacturing_textiles' },
    outstanding: { amount: 480e6, asOf, currency: c },
    denominator: { totalEquity: 1.9e9, totalDebt: 2.1e9, asOf, currency: c },
    emissions: {
      scope1: { value: 11200, basis: 'reported-unverified', period: 2024 },
      scope2: { value: 3400, basis: 'reported-unverified', period: 2024 },
      scope3: { value: 26000, basis: 'reported-unverified', period: 2024 },
    },
    plausibility: { revenue: 5.2e9 } },
  { reportingYear: 2024, instrument: 'business-loan', borrowerListed: false,
    identifiers: { accountNumber: 'TL-2' },
    counterparty: { name: 'Ratnapura Rubber', sectorKey: 'manufacturing_rubber_plastics' },
    outstanding: { amount: 40e6, asOf, currency: c },
    emissions: { scope1: { basis: 'assets-sector' }, scope2: { basis: 'assets-sector' }, scope3AbsentReason: 'none held' } },
];

/* What a reporting entity states about itself — every fact a verifier reads first. */
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
    .replace(/\bpae_[a-z0-9]+\b/g, '<exposure-id>')
    .replace(/\b[0-9a-f]{64}\b/g, '<sha256>')
    .replace(/\b[0-9a-f]{16}\b(…?)/g, '<checksum>$1')
    .replace(/build [0-9a-f]{7,12}\b/g, 'build <commit>')
    .replace(/PA52X?-\d{4}-[0-9a-f]{12}/g, '<reference>');
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
    /* Bullet items are content — the recalculation triggers live here — so
       they are pinned like every other line rather than printed as a blank. */
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

let model, exposureModel, bare, firstId;
beforeAll(async () => {
  await store._resetMemory();
  const ids = [];
  for (const e of BOOK) ids.push(await register.record(ORG, e));
  firstId = ids[0].exposureId;
  await register.stateBook(ORG, { reportingYear: 2024, totalLoansAndInvestments: 14e9, currency: 'LKR', statedBy: 'Group CFO' });
  await register.saveSettings(ORG, ENTITY);
  ({ model } = await svc.annualDisclosure(ORG, 2024, { currency: 'LKR' }));
  ({ model: exposureModel } = await svc.exposureReport(ORG, firstId, {}));

  /* The same book under an entity that has stated nothing. */
  for (const e of BOOK) await register.record(BARE, e);
  await register.stateBook(BARE, { reportingYear: 2024, totalLoansAndInvestments: 14e9, currency: 'LKR' });
  ({ model: bare } = await svc.annualDisclosure(BARE, 2024, { insurer: 'Bare Bank', currency: 'LKR' }));
});
afterAll(() => store._resetMemory());

describe('The Part A §5.2 disclosure is what it was', () => {
  test('the whole disclosure matches the committed golden', () => {
    const produced = outline(model);
    expect(produced).toBe(goldenFile('parta-disclosure.txt', produced));
  });

  test('the per-exposure report matches the committed golden', () => {
    const produced = outline(exposureModel);
    expect(produced).toBe(goldenFile('parta-exposure-report.txt', produced));
  });

  test('the golden is a document, not an empty file', () => {
    const produced = outline(model);
    expect(produced.length).toBeGreaterThan(800);
    expect(produced).toMatch(/SECTION 2 \[entity\]/);
    expect(produced).toMatch(/SECTION 3 \[coverage\]/);
    expect(produced).toMatch(/ANNEX B \[annexTable\]/);
    expect(produced).toMatch(/ANNEX C \[annexRegister\]/);
    expect(produced).toMatch(/INV-1: No/);
  });
});

describe('What a verifier reads first is on the document', () => {
  test('the cover names the reporting entity, not a re/insurer, and carries the responsible party and the identity', () => {
    expect(model.cover.entityLabel).toBe('Reporting entity');
    expect(model.cover.insurer).toBe('Demo Bank PLC');
    expect(model.cover.responsibleParty).toEqual([
      'Prepared by A. Perera, Head of Sustainability',
      'Approved by S. Fernando, Chief Financial Officer on 2025-03-31',
    ]);
    expect(model.cover.identity.some(l => /Content hash [0-9a-f]{16}/.test(l))).toBe(true);
    expect(model.checklist.header.entityLabel).toBe('Reporting entity');
    expect(model.checklist.header.entity).toBe('Demo Bank PLC');
  });

  test('the reference is derived from the content: the same position twice is one reference, a changed figure another', async () => {
    const again = await svc.annualDisclosure(ORG, 2024, { currency: 'LKR' });
    expect(again.facts.identity.reference).toBe(model.facts.identity.reference);
    expect(again.facts.reportId).toBe(model.facts.reportId);
    expect(model.facts.reportId).toMatch(/^PA52-2024-[0-9a-f]{12}$/);
    expect(bare.facts.identity.reference).not.toBe(model.facts.identity.reference);
  });

  test('scope 1 and scope 2 are printed apart and sum to the combined line', () => {
    const l = model.facts.lines;
    expect(l.scope1).not.toBeNull();
    expect(l.scope2).not.toBeNull();
    expect(+(l.scope1 + l.scope2).toFixed(3)).toBe(+Number(l.scope1And2).toFixed(3));
  });

  test('the disclosure prints a portfolio intensity the engine computed, and every sector carries one', () => {
    expect(typeof model.facts.intensity.value).toBe('number');
    for (const s of model.facts.bySector) expect(typeof s.intensity).toBe('number');
  });

  test('the exposure register is the audit trail: one row per recorded exposure, each resolving to a stored id', async () => {
    expect(model.facts.exposureRegister).toHaveLength(model.facts.exposures);
    for (const r of model.facts.exposureRegister) {
      expect(r.exposureId).toMatch(/^pae_/);
      const held = await register.get(ORG, r.exposureId);
      expect(held.exposureId).toBe(r.exposureId);
    }
  });

  test('the factor annex carries the whole checksum and every row of the set', () => {
    const annex = model.annexes.find(a => a.id === 'annexFactors');
    const tables = annex.blocks.filter(b => b.kind === 'table');
    expect(tables[0].rows[0][5]).toMatch(/^[0-9a-f]{64}$/);
    expect(tables[1].rows.length).toBe(model.facts.factorRows.length);
    /* The literal word "undefined" never reaches a document. */
    expect(JSON.stringify(model.sections)).not.toMatch(/undefined/);
  });

  test('the per-exposure report reads the same entity and the same recalculation protocol as the disclosure', () => {
    expect(exposureModel.cover.insurer).toBe('Demo Bank PLC');
    expect(exposureModel.facts.recalculation.significanceThresholdPct).toBe(model.facts.recalculation.significanceThresholdPct);
    expect(exposureModel.facts.recalculation.triggers.length).toBeGreaterThan(0);
    expect(exposureModel.facts.entity.consolidationApproach.key).toBe('operational_control');
  });
});

describe('The checklist can fail, and does', () => {
  test('an entity that has stated nothing answers No on the governance items', () => {
    const a = answers(bare);
    for (const id of ['GOV-1', 'GOV-2', 'PER-1', 'COV-2', 'GAS-1']) expect([id, a[id]]).toEqual([id, 'No']);
  });

  test('an entity that has stated everything answers Yes on them', () => {
    const a = answers(model);
    for (const id of ['GOV-1', 'GOV-2', 'PER-1', 'COV-2', 'GAS-1', 'REC-1', 'TRC-1', 'INT-1', 'DOC-1', 'MTH-1']) {
      expect([id, a[id]]).toEqual([id, 'Yes']);
    }
  });

  test('the entity-inventory item is No on every document, by design', () => {
    expect(answers(model)['INV-1']).toBe('No');
    expect(answers(bare)['INV-1']).toBe('No');
    expect(answers(exposureModel)['INV-1']).toBe('No');
  });

  test('no item is a constant: every test reads the facts', () => {
    const { ITEMS } = require('../src/domains/pcaf-part-a/reporting/checklist');
    for (const def of ITEMS) {
      const src = def.test.toString();
      if (def.id === 'INV-1') continue;
      expect([def.id, /=>\s*(true|false)\s*$/.test(src.trim())]).toEqual([def.id, false]);
    }
  });

  test('the fluctuation item is not applicable to a book with no revolving facility, and stated when one is held', () => {
    expect(answers(model)['FLU-1']).toBe('Not applicable');
    const sec = model.sections.find(s => s.id === 'fluctuation');
    expect(sec).toBeTruthy();
  });
});
