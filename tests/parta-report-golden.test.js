/**
 * The regulated Part A §5.2 deliverable, pinned. The annual disclosure is
 * flattened to an outline — every section, every table head and row, every
 * figure, and the checklist — and held to a committed golden, so a change to
 * the document fails on the document rather than on a well-formed-PDF check
 * that a report with a section missing would pass just as well.
 *
 * The publication instant and any ids are normalised, so it fails on what the
 * document says, not on the clock. UPDATE_GOLDEN=1 regenerates.
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

let model;
beforeAll(async () => {
  await store._resetMemory();
  for (const e of BOOK) await register.record(ORG, e);
  await register.stateBook(ORG, { reportingYear: 2024, totalLoansAndInvestments: 14e9, currency: 'LKR', statedBy: 'Group CFO' });
  ({ model } = await svc.annualDisclosure(ORG, 2024, { insurer: 'Demo Bank PLC', currency: 'LKR' }));
});
afterAll(() => store._resetMemory());

describe('The Part A §5.2 disclosure is what it was', () => {
  test('the whole document matches the committed golden', () => {
    const produced = outline(model);
    expect(produced).toBe(goldenFile('parta-disclosure.txt', produced));
  });

  test('the golden is a document, not an empty file', () => {
    const produced = outline(model);
    expect(produced.length).toBeGreaterThan(800);
    expect(produced).toMatch(/SECTION 2 \[coverage\]/);
    expect(produced).toMatch(/ANNEX B \[annexTable\]/);
    expect(produced).toMatch(/INV-1: No/);
  });
});
