/**
 * The regulated Part A §5.9 sovereign deliverable, pinned. The annual
 * disclosure and the per-holding report are each flattened to an outline —
 * every section, every table head and row, every figure, and the checklist —
 * and held to a committed golden, so a change to the document fails on the
 * document rather than on a well-formed-PDF check that a report with a section
 * missing would pass just as well.
 *
 * The publication instant and any ids are normalised, so it fails on what the
 * document says, not on the clock. UPDATE_GOLDEN=1 regenerates.
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

function normalise(text) {
  return text
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<published>')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<date>')
    .replace(/\b[0-9a-f]{16}\b/g, '<checksum>');
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
    default: L.push(`${indent}${blk.kind}: ${blk.text ?? ''}`);
  }
  return L;
}

function outline(model) {
  const L = [];
  L.push(`COVER: ${model.cover.title}`);
  L.push(`  subtitle: ${model.cover.subtitle ?? ''}`);
  L.push(`  insurer: ${model.cover.insurer}`);
  L.push(`  standard: ${model.cover.standard}`);
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

let disclosure, holding;
beforeAll(async () => {
  await store._resetMemory();
  const ids = [];
  for (const e of BOOK) ids.push(await sov.record(ORG, e));
  await register.stateBook(ORG, { reportingYear: 2024, totalLoansAndInvestments: 1e8, currency: 'USD', statedBy: 'Group CFO' });
  ({ model: disclosure } = await svc.annualDisclosure(ORG, 2024, { insurer: 'Demo Bank PLC', currency: 'USD' }));
  /* The Sri Lanka holding: provisional, carries both LULUCF boundaries. */
  const lk = ids.find(x => x.country && x.country.code === 'LK') || ids[ids.length - 1];
  ({ model: holding } = await svc.holdingReport(ORG, lk.exposureId, { insurer: 'Demo Bank PLC' }));
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
    expect(produced).toMatch(/SECTION 2 \[coverage\]/);
    expect(produced).toMatch(/ANNEX B \[annexTable\]/);
    expect(produced).toMatch(/INV-1: No/);
    /* Scope 1 on both LULUCF boundaries appears, and the two are never summed. */
    expect(produced).toMatch(/excl\. LULUCF/);
    expect(produced).toMatch(/incl\. LULUCF/);
  });
});
