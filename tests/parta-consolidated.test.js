/**
 * The consolidated Part A position and the one document a bank files from it.
 *
 * Four rules, each proved rather than described: the headline sums each
 * recorded class on its own boundary and names them; the data-quality score
 * is one per class and never averaged across classes; coverage sums only the
 * classes in the book's currency and names the ones it excludes; and a class
 * that is not recorded is a row with a reason, never a silence. The document
 * is pinned to a golden, and the CSV register carries one row per exposure of
 * every class.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const request = require('supertest');

const store = require('../src/platform/database/store');
const app = require('../src/server');
const register = require('../src/domains/pcaf-part-a/application/register');
const sovereign = require('../src/domains/pcaf-part-a/application/sovereign-register');
const consolidated = require('../src/domains/pcaf-part-a/application/parta-consolidated');
const { issueKey } = require('./helpers/key');

const GOLDEN_DIR = path.join(__dirname, 'golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';
/* The organisation is the key's: the dashboard key's on the in-process store,
   a real row's on PostgreSQL. The book is seeded into whichever it is, so the
   route tests read the same book the service tests do. */
let ORG = 'org-parta-consolidated';
const asOf = '2024-12-31';

const LOANS = [
  { reportingYear: 2024, instrument: 'business-loan', borrowerListed: false, identifiers: { accountNumber: 'TL-1' },
    counterparty: { name: 'Lanka Apparel', sector: 'Textiles', sectorKey: 'manufacturing_textiles' },
    outstanding: { amount: 480e6, asOf, currency: 'LKR' },
    denominator: { totalEquity: 1.9e9, totalDebt: 2.1e9, asOf, currency: 'LKR' },
    emissions: { scope1: { value: 11200, basis: 'reported-unverified', period: 2024 }, scope2: { value: 3400, basis: 'reported-unverified', period: 2024 },
      scope3: { value: 26000, basis: 'reported-unverified', period: 2024 } },
    plausibility: { revenue: 5.2e9 } },
  { reportingYear: 2024, instrument: 'business-loan', borrowerListed: false, identifiers: { accountNumber: 'TL-2' },
    counterparty: { name: 'Ratnapura Rubber', sectorKey: 'manufacturing_rubber_plastics' },
    outstanding: { amount: 40e6, asOf, currency: 'LKR' },
    emissions: { scope1: { basis: 'assets-sector' }, scope2: { basis: 'assets-sector' }, scope3AbsentReason: 'none held' } },
];
/* A §5.4 property in the same register, keyed in square feet: the register
   holds every built class, and the consolidated position lays it beside the
   loans on its own table without averaging anything. */
const PROPERTIES = [
  { assetClass: 'commercial-real-estate', reportingYear: 2024, identifiers: { accountNumber: 'CRE-1' },
    counterparty: { name: 'Colombo Office Tower' }, buildingType: 'office', productType: 'purchase',
    exposure: { outstanding: 200e6, currency: 'LKR', asOf }, value: { atOrigination: 800e6 },
    floorArea: { value: 10763.91, unit: 'ft2' } },
];
const HOLDINGS = [
  { reportingYear: 2024, country: 'SG', instrument: 'sovereign-bond', exposure: { amount: 1e6, currency: 'USD' }, identifiers: { accountNumber: 'SG-1' } },
  { reportingYear: 2024, country: 'HK', instrument: 'sovereign-bond', exposure: { amount: 1e6, currency: 'USD' }, identifiers: { accountNumber: 'HK-1' } },
];
const ENTITY = {
  reportingEntity: 'Demo Bank PLC', consolidationApproach: 'operational_control',
  boundaryNote: 'The bank and its wholly owned subsidiaries.', fiscalYearEnd: '12-31', gwpBasis: 'IPCC AR6, 100-year',
  preparedBy: { name: 'A. Perera', role: 'Head of Sustainability' },
  approvedBy: { name: 'S. Fernando', role: 'Chief Financial Officer', date: '2025-03-31' },
  assetClassesNotReported: [{ assetClass: 'motor-vehicle-loans', reason: 'Immaterial: below one per cent of total loans and investments.' }],
};

function normalise(text) {
  return text
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<published>').replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<date>')
    .replace(/\bpa[es]_[a-z0-9]+\b/g, '<id>').replace(/\b[0-9a-f]{64}\b/g, '<sha256>')
    .replace(/\b[0-9a-f]{16}\b(…?)/g, '<checksum>$1').replace(/build [0-9a-f]{7,12}\b/g, 'build <commit>')
    .replace(/PA-\d{4}-[0-9a-f]{12}/g, '<reference>');
}
function outline(model) {
  const L = [`COVER: ${model.cover.title}`, `  ${model.cover.entityLabel}: ${model.cover.insurer}`];
  for (const line of model.cover.responsibleParty || []) L.push(`  responsible: ${line}`);
  const blk = (x, indent = '    ') => {
    if (x.kind === 'table') return [`${indent}table: ${x.head.join(' | ')}`, ...x.rows.map(r => `${indent}  row: ${r.map(c => String(c ?? '')).join(' | ')}`)];
    if (x.kind === 'figure') return [`${indent}figure: ${x.label} = ${x.value} ${x.unit || ''}`.trimEnd()];
    if (x.kind === 'bars') return [`${indent}bars: ${x.label}${x.unit ? ` (${x.unit})` : ''}`, ...(x.rows || []).map(r => `${indent}  bar: ${r.label} = ${r.value ?? '—'}`)];
    if (x.kind === 'bullets') return [`${indent}bullets:`, ...(x.items || []).map(i => `${indent}  - ${i}`)];
    if (x.kind === 'callout') return [`${indent}callout [${x.title || ''}]: ${x.text}`];
    if (x.kind === 'checklist') return [`${indent}checklist`];
    return [`${indent}${x.kind}: ${x.text ?? ''}`];
  };
  model.sections.forEach((s, i) => { L.push(`SECTION ${i + 1} [${s.id}] ${s.title}`); s.blocks.forEach(x => L.push(...blk(x))); });
  model.annexes.forEach(a => { L.push(`ANNEX ${a.annex} [${a.id}] ${a.title}`); a.blocks.forEach(x => L.push(...blk(x))); });
  L.push(`CHECKLIST: ${model.checklist.items.length} items`);
  model.checklist.items.forEach(i => L.push(`  ${i.id}: ${i.answer}`));
  return normalise(L.join('\n')) + '\n';
}
function goldenFile(name, produced) {
  const file = path.join(GOLDEN_DIR, name);
  if (UPDATE || !fs.existsSync(file)) { fs.writeFileSync(file, produced); return produced; }
  return fs.readFileSync(file, 'utf8');
}

let headers;
beforeAll(async () => {
  await store._resetMemory();
  const issued = await issueKey({ orgId: ORG });
  ORG = issued.orgId;
  headers = { 'X-API-Key': issued.key };
  for (const e of LOANS) await register.record(ORG, e);
  for (const e of PROPERTIES) await register.record(ORG, e);
  for (const h of HOLDINGS) await sovereign.record(ORG, h);
  await register.stateBook(ORG, { reportingYear: 2024, totalLoansAndInvestments: 14e9, currency: 'LKR', statedBy: 'Group CFO' });
  await register.saveSettings(ORG, ENTITY);
});
afterAll(() => store._resetMemory());

describe('The consolidated position across asset classes', () => {
  test('every Part A asset class is a row — recorded, not recorded, engine only, or not built — each with a reason', async () => {
    const pos = await consolidated.position(ORG, 2024);
    expect(pos.classes).toHaveLength(10);
    const byClass = Object.fromEntries(pos.classes.map(c => [c.assetClass, c]));
    expect(byClass['business-loans-unlisted-equity'].status).toBe('recorded');
    expect(byClass['sovereign-debt'].status).toBe('recorded');
    expect(byClass['commercial-real-estate'].status).toBe('recorded');
    expect(byClass['commercial-real-estate'].headline.basis).toMatch(/§5\.4/);
    expect(byClass['mortgages'].status).toBe('not-recorded');
    expect(byClass['mortgages'].reason).toMatch(/No exposures are recorded/);
    expect(byClass['securitizations'].status).toBe('not-built');
    for (const c of pos.classes.filter(x => x.status !== 'recorded')) expect(c.reason).toBeTruthy();
    /* The entity's stated reason overrides the system's, never the reverse. */
    expect(byClass['motor-vehicle-loans'].reasonStatedBy).toBe('entity');
    expect(byClass['motor-vehicle-loans'].reason).toMatch(/Immaterial/);
    expect(byClass['securitizations'].reasonStatedBy).toBe('system');
  });

  test('the headline sums each class on its own boundary and names them; scope 3 is summed apart', async () => {
    const pos = await consolidated.position(ORG, 2024);
    const at = k => pos.classes.find(c => c.assetClass === k);
    const [bl, cre, sv] = [at('business-loans-unlisted-equity'), at('commercial-real-estate'), at('sovereign-debt')];
    expect(bl.headline.label).toBe('Financed scope 1 and 2');
    expect(cre.headline.label).toBe('Financed scope 1 and 2');
    expect(sv.headline.label).toBe('Financed scope 1, excluding LULUCF');
    expect(pos.totals.headline.value).toBe(+(bl.headline.value + cre.headline.value + sv.headline.value).toFixed(2));
    expect(pos.totals.headline.basis).toMatch(/§5\.2.*scope 1 and 2/);
    expect(pos.totals.headline.basis).toMatch(/§5\.4.*scope 1 and 2/);
    expect(pos.totals.headline.basis).toMatch(/§5\.9.*excluding LULUCF/);
    expect(pos.totals.headline.note).toMatch(/never into it/);
    /* The property's construction scope 3 is absent, so scope 3 across classes is the loans' alone. */
    expect(cre.scope3.value).toBeNull();
    expect(pos.totals.scope3.value).toBe(bl.scope3.value);
    /* No key anywhere holds headline plus scope 3. */
    const flat = JSON.stringify(pos.totals);
    expect(flat).not.toMatch(/total(Including|With)Scope3/i);
  });

  test('the data-quality score is one per class, never averaged across classes', async () => {
    const pos = await consolidated.position(ORG, 2024);
    expect(pos.dataQuality.byClass).toHaveLength(3);
    expect(pos.dataQuality.byClass.map(c => c.table)).toEqual(['Box 6.1-6 option mapping (Table 5.2-1)', 'Table 5.4-1 option mapping', 'Table 5.9-6']);
    /* The property scores 4 (Option 2b) on its own table; the loans' score is not moved by it. */
    expect(pos.dataQuality.byClass.find(c => c.assetClass === 'commercial-real-estate').score).toBe(4);
    expect(pos.dataQuality.note).toMatch(/never averaged/);
    expect(pos.dataQuality.score).toBeUndefined();
    expect(pos.dataQuality.weighted).toBeUndefined();
  });

  test('coverage sums only the classes in the book’s currency and names the class it excludes', async () => {
    const pos = await consolidated.position(ORG, 2024);
    expect(pos.coverage.currency).toBe('LKR');
    expect(pos.coverage.assessedOutstanding).toBe(720e6);
    expect(pos.coverage.sharePct).toBe(+((720e6 / 14e9) * 100).toFixed(2));
    expect(pos.coverage.excluded).toEqual([expect.objectContaining({ assetClass: 'sovereign-debt', currency: 'USD', outstanding: 2e6 })]);
    expect(pos.outstandingItems.some(x => /denominated in USD/.test(x.what))).toBe(true);
  });

  test('a year with nothing recorded is a position of named absences, and a 409 on the document', async () => {
    const pos = await consolidated.position(ORG, 2019);
    expect(pos.classes.every(c => c.status !== 'recorded')).toBe(true);
    expect(pos.totals.headline.value).toBeNull();
    await expect(consolidated.annualDisclosure(ORG, 2019, {})).rejects.toMatchObject({ statusCode: 409, code: 'EMPTY_YEAR' });
  });
});

describe('The consolidated disclosure', () => {
  test('matches the committed golden', async () => {
    const { model } = await consolidated.annualDisclosure(ORG, 2024, {});
    const produced = outline(model);
    expect(produced).toBe(goldenFile('parta-consolidated-disclosure.txt', produced));
    expect(produced).toMatch(/SECTION 1 \[entity\]/);
    /* The body is the standard's order and the PCAF basis of preparation is
       the first two annexes; the register that is the audit trail follows. */
    expect(produced).toMatch(/SECTION 2 \[s2Governance\]/);
    expect(produced).toMatch(/ANNEX A \[annexFinanced\]/);
    expect(produced).toMatch(/ANNEX B \[annexBasis\]/);
    expect(produced).toMatch(/ANNEX E \[annexRegister\]/);
    expect(produced).toMatch(/INV-1: No/);
  });

  test('the register across classes is the audit trail: one row per exposure of every class, and the checklist reads it', async () => {
    const { model, facts } = await consolidated.annualDisclosure(ORG, 2024, {});
    expect(facts.exposureRegister).toHaveLength(5);
    expect(facts.exposureRegister.map(r => r.section).sort()).toEqual(['§5.2', '§5.2', '§5.4', '§5.9', '§5.9']);
    const cre = facts.exposureRegister.find(r => r.section === '§5.4');
    expect(cre.counterparty).toBe('Colombo Office Tower');
    expect(cre.option).toBe('2b');
    expect(cre.score).toBe(4);
    const a = Object.fromEntries(model.checklist.items.map(i => [i.id, i.answer]));
    for (const id of ['GOV-1', 'GOV-2', 'PER-1', 'COV-1', 'COV-2', 'GAS-1', 'ABS-1', 'ABS-2', 'ABS-3', 'MTH-1', 'DQ-1', 'REC-1', 'TRC-1', 'INT-1', 'DOC-1']) {
      expect([id, a[id]]).toEqual([id, 'Yes']);
    }
    expect(a['INV-1']).toBe('No');
    expect(facts.reportId).toMatch(/^PA-2024-[0-9a-f]{12}$/);
    expect(JSON.stringify(model.sections)).not.toMatch(/undefined/);
  });
});

describe('The routes', () => {
  test('GET /financed-emissions/:year answers the position; the disclosure answers JSON, PDF and Word; the register answers CSV', async () => {
    const pos = await request(app).get('/v1/pcaf/part-a/financed-emissions/2024').set(headers);
    expect(pos.status).toBe(200);
    expect(pos.body.classes).toHaveLength(10);

    const json = await request(app).get('/v1/pcaf/part-a/financed-emissions/2024/disclosure').set(headers);
    expect(json.status).toBe(200);
    expect(json.body.report.cover.entityLabel).toBe('Reporting entity');
    expect(json.body.report.checklist.items.find(i => i.id === 'INV-1').answer).toBe('No');

    const pdf = await request(app).get('/v1/pcaf/part-a/financed-emissions/2024/disclosure?format=pdf').set(headers).buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.body.slice(0, 5).toString()).toBe('%PDF-');

    const docx = await request(app).get('/v1/pcaf/part-a/financed-emissions/2024/disclosure?format=docx').set(headers).buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(docx.status).toBe(200);
    expect(docx.body.slice(0, 2).toString()).toBe('PK');

    const csv = await request(app).get('/v1/pcaf/part-a/financed-emissions/2024/register.csv').set(headers);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const lines = csv.text.trim().split(/\r\n/);
    expect(lines[0]).toBe(consolidated.CSV_COLUMNS.join(','));
    expect(lines).toHaveLength(6);
  });

  test('an empty year is a 409 on the document and a position of absences on the read', async () => {
    const doc = await request(app).get('/v1/pcaf/part-a/financed-emissions/2019/disclosure').set(headers);
    expect(doc.status).toBe(409);
    const pos = await request(app).get('/v1/pcaf/part-a/financed-emissions/2019').set(headers);
    expect(pos.status).toBe(200);
    expect(pos.body.classes.filter(c => c.status === 'recorded')).toHaveLength(0);
  });
});
