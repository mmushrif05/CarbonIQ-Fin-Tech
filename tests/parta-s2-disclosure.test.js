/**
 * The consolidated disclosure read as the SLFRS S2 file.
 *
 * Nothing in Part A's arithmetic moved to make this document. What is proved
 * here is what S2 adds: the four pillars as the entity's own statements, the
 * entity's inventory beside the Category 15 figure this system measures, the
 * §29(b)–(d) amounts and the §32 industry table summed from a classification
 * the bank recorded exposure by exposure, and an index naming where every
 * paragraph is answered.
 *
 * Two of these matter more than the rest.
 *
 * A statement still equal to the illustrative pack is marked illustrative
 * wherever it is printed. A governance paragraph the tool provider wrote,
 * printed unmarked, would read as the bank's own — the failure
 * `src/shared/report-integrity.js` exists to prevent, in the direction that
 * matters most.
 *
 * And a paragraph nobody has answered is printed as not stated with its
 * clause, never omitted. A document that quietly dropped what it could not
 * answer would read as complete.
 */

'use strict';

const request = require('supertest');

const store = require('../src/platform/database/store');
const app = require('../src/server');
const register = require('../src/domains/pcaf-part-a/application/register');
const settings = require('../src/domains/pcaf-part-a/application/parta-settings');
const consolidated = require('../src/domains/pcaf-part-a/application/parta-consolidated');
const climate = require('../src/domains/pcaf-part-a/domain/climate');
const { issueKey } = require('./helpers/key');

let ORG = 'org-parta-s2';
let headers;
const asOf = '2024-12-31';

const cl = (t, p, o, code) => ({
  transitionRisk: { verdict: t, horizon: 'medium' },
  physicalRisk: { verdict: p, horizon: 'long' },
  opportunity: { verdict: o, taxonomyCode: code || null },
});

const LOANS = [
  { reportingYear: 2024, instrument: 'business-loan', borrowerListed: false, identifiers: { accountNumber: 'S2-1' },
    counterparty: { name: 'Lanka Apparel', sector: 'Textiles', sectorKey: 'manufacturing_textiles' },
    outstanding: { amount: 480e6, asOf, currency: 'LKR' },
    denominator: { totalEquity: 1.9e9, totalDebt: 2.1e9, asOf, currency: 'LKR' },
    emissions: { scope1: { value: 11200, basis: 'reported-unverified', period: 2024 }, scope2: { value: 3400, basis: 'reported-unverified', period: 2024 },
      scope3: { value: 26000, basis: 'reported-unverified', period: 2024 } },
    plausibility: { revenue: 5.2e9 },
    climate: cl('vulnerable', 'not_vulnerable', 'not_aligned') },
  { reportingYear: 2024, instrument: 'business-loan', borrowerListed: false, identifiers: { accountNumber: 'S2-2' },
    counterparty: { name: 'Solar Estates', sectorKey: 'electricity' },
    outstanding: { amount: 120e6, asOf, currency: 'LKR' },
    emissions: { scope1: { basis: 'assets-sector' }, scope2: { basis: 'assets-sector' }, scope3AbsentReason: 'none held' },
    climate: cl('not_vulnerable', 'vulnerable', 'aligned', 'M4.5') },
  /* One exposure deliberately unclassified, so the unassessed share on the
     page is a real figure rather than a book that classifies itself. */
  { reportingYear: 2024, instrument: 'business-loan', borrowerListed: false, identifiers: { accountNumber: 'S2-3' },
    counterparty: { name: 'Kandy Traders', sectorKey: 'wholesale_retail' },
    outstanding: { amount: 60e6, asOf, currency: 'LKR' },
    emissions: { scope1: { basis: 'assets-sector' }, scope2: { basis: 'assets-sector' }, scope3AbsentReason: 'none held' } },
];

const ENTITY = {
  reportingEntity: 'Demo Bank PLC', consolidationApproach: 'operational_control',
  boundaryNote: 'The bank and its wholly owned subsidiaries.', fiscalYearEnd: '12-31', gwpBasis: 'IPCC AR6, 100-year',
  preparedBy: { name: 'A. Perera', role: 'Head of Sustainability' },
  approvedBy: { name: 'S. Fernando', role: 'Chief Financial Officer', date: '2025-03-31' },
};

const STATED = {
  governance: { body: 'The Board Integrated Risk Management Committee.', frequency: 'quarterly',
    oversight: 'Responsibility is set out in the committee’s terms of reference.',
    managementRole: 'The Chief Risk Officer holds day-to-day responsibility.' },
  strategy: { horizonDefinitions: 'Short term is one year, medium term three years, long term ten years.',
    exposures: [{ title: 'Flood exposure on collateral', nature: 'risk', riskKind: 'physical_acute', horizon: 'medium', description: 'Secured lending in flood-prone districts.' }],
    businessModel: 'Concentrated in secured lending to manufacturing and agriculture.',
    transitionPlan: 'The plan runs to 2030 and rests on grid decarbonisation.' },
  riskManagement: { identification: 'Screened at origination and at annual review.',
    monitoring: 'Watched quarterly by the risk function.',
    integration: 'Carried inside the enterprise risk framework as a driver of credit risk.' },
  inventory: { scope1: { value: 412, basis: 'calculated', period: 'FY2024' },
    scope2Location: { value: 1860, basis: 'calculated', period: 'FY2024' } },
  targets: { entries: [{ name: 'Halve financed emissions intensity', targetKind: 'intensity', scopeCovered: 'financed_emissions', baseYear: 2024, targetYear: 2030, metric: 'tCO2e per million LKR outstanding', source: 'entity_set', validation: 'none' }] },
};

async function model(org = ORG) {
  return (await consolidated.annualDisclosure(org, 2024, {})).model;
}
const sectionOf = (m, id) => m.sections.find(s => s.id === id);
const annexOf = (m, id) => m.annexes.find(a => a.id === id);
const answers = m => Object.fromEntries(m.checklist.items.map(i => [i.id, i.answer]));
const flatten = section => JSON.stringify(section.blocks);

beforeAll(async () => {
  await store._resetMemory();
  const issued = await issueKey({ orgId: ORG });
  ORG = issued.orgId;
  headers = { 'X-API-Key': issued.key };
  for (const e of LOANS) await register.record(ORG, e);
  await register.stateBook(ORG, { reportingYear: 2024, totalLoansAndInvestments: 14e9, currency: 'LKR', statedBy: 'Group CFO' });
  await register.saveSettings(ORG, ENTITY);
});
afterAll(() => store._resetMemory());

describe('The four pillars, and whose words they are', () => {
  test('the disclosure reads in the standard’s order: the entity, then the four pillars, then what is outstanding', async () => {
    const m = await model();
    const ids = m.sections.map(s => s.id);
    expect(ids).toEqual(['entity', 's2Governance', 's2Strategy', 's2RiskManagement',
      's2Inventory', 's2CrossIndustry', 's2Industry', 's2Targets', 'limitations', 'conformance']);
    /* The PCAF Chapter 6 material — coverage, gases, the position by class,
       method, data quality, recalculation, intensity, uncertainty — is the
       basis of preparation for the category 15 metric and is printed as such:
       in the first two annexes, whole, and never in front of the first pillar.
       It used to be eight sections before governance, which made the file a
       PCAF document with S2 in the middle. */
    for (const id of ['coverage', 'gases', 'absolute', 'methodology', 'dataquality', 'recalculation', 'intensity', 'uncertainty']) {
      expect([id, ids.includes(id)]).toEqual([id, false]);
    }
    expect(m.annexes.slice(0, 2).map(a => a.id)).toEqual(['annexFinanced', 'annexBasis']);
    const financed = JSON.stringify(annexOf(m, 'annexFinanced').blocks);
    expect(financed).toMatch(/Share of total loans and investments assessed/);
    expect(financed).toMatch(/Financed emissions across the classes reported — the headline/);
    expect(financed).toMatch(/Economic emission intensity/);
    const basis = JSON.stringify(annexOf(m, 'annexBasis').blocks);
    for (const head of ['Gases and units', 'Methodology', 'Data quality', 'Recalculation and significance', 'Uncertainty']) {
      expect(basis).toContain(head);
    }
  });

  test('the category 15 figure in the metrics section is Annex A’s headline, moved and not recomputed', async () => {
    const m = await model();
    const inventory = sectionOf(m, 's2Inventory');
    const figure = inventory.blocks.find(x => x.kind === 'figure');
    expect(figure).toBeTruthy();
    expect(figure.value).toBe(Number(m.facts.totals.headline.value).toFixed(3));
    const annexFigure = annexOf(m, 'annexFinanced').blocks.find(x => x.kind === 'figure' && /the headline/.test(x.label));
    expect(annexFigure.value).toBe(figure.value);
  });

  test('a statement the entity has not made prints as not stated with the paragraph that asks for it', async () => {
    const m = await model();
    const gov = flatten(sectionOf(m, 's2Governance'));
    expect(gov).toMatch(/Not stated by the reporting entity/);
    expect(gov).toMatch(/S2 §6\(a\)/);
    expect(answers(m)['S2-GOV-1']).toBe('No');
    expect(answers(m)['S2-STR-1']).toBe('No');
    expect(answers(m)['S2-RSK-1']).toBe('No');
    expect(answers(m)['S2-TGT-1']).toBe('No');
    expect(answers(m)['INV-1']).toBe('No');
  });

  test('an illustrative statement is marked wherever it is printed, and one word of difference makes it the entity’s', async () => {
    const org = `${ORG}-illustrative`;
    await register.record(org, LOANS[0]);
    await settings.installIllustrativeClimate(org);
    const m = await model(org);
    const gov = flatten(sectionOf(m, 's2Governance'));
    expect(gov).toMatch(/Illustrative trial content supplied with the tool/);
    expect(gov).not.toMatch(/Stated by the reporting entity\./);
    expect(m.facts.s2.readiness.illustrative).toBe(climate.ILLUSTRATIVE_ITEMS);
    /* The whole document says so once, so a reader meets the caveat before
       the paragraphs rather than after them. */
    expect(gov).toMatch(/Illustrative content in this disclosure/);
    expect(answers(m)['S2-PRV-1']).toBe('No');

    await settings.saveSettings(org, { climate: { governance: { body: 'The Board Sustainability Committee.' } } });
    const after = await model(org);
    expect(flatten(sectionOf(after, 's2Governance'))).toMatch(/Stated by the reporting entity\./);
    expect(after.facts.s2.readiness.stated).toBe(1);
  });
});

describe('The metrics S2 asks for', () => {
  test('the entity’s own scope 1 and 2 sit beside Category 15, and no row sums them', async () => {
    const org = `${ORG}-inventory`;
    await register.record(org, LOANS[0]);
    await register.saveSettings(org, ENTITY);
    await settings.saveSettings(org, { climate: { inventory: STATED.inventory } });
    const m = await model(org);
    const section = sectionOf(m, 's2Inventory');
    const table = section.blocks.find(x => x.kind === 'table');
    const labels = table.rows.map(r => r[0]);
    expect(labels).toEqual([
      'Scope 1 — gross, direct',
      'Scope 2 — gross, location-based',
      'Scope 2 — gross, market-based (additional)',
      'Scope 3 — categories other than 15',
      'Scope 3 category 15 — financed emissions',
    ]);
    expect(table.rows[0][1]).toMatch(/^412 tCO2e$/);
    expect(table.rows[4][4]).toMatch(/Measured by this system/);
    /* Category 15 is moved, never recomputed: the figure in the inventory is
       the headline printed in the absolute-emissions section. */
    const pos = await consolidated.position(org, 2024);
    expect(m.facts.s2.inventory.category15.value).toBe(pos.totals.headline.value);
    expect(flatten(section)).toMatch(/No row above sums the others/);
    expect(answers(m)['INV-1']).toBe('Yes');
  });

  test('the §29(b)–(d) amounts are the engine’s sums, with the unassessed amount stated beside each share', async () => {
    const m = await model();
    const e = m.facts.s2.exposure;
    expect(e.transitionRisk.amount).toBe(480e6);
    expect(e.physicalRisk.amount).toBe(120e6);
    expect(e.opportunities.amount).toBe(120e6);
    /* Over the assessed outstanding, never over the whole book, and the
       unassessed amount travels beside it: a book nobody classified must read
       as unclassified rather than as safe. */
    expect(e.transitionRisk.assessedAmount).toBe(600e6);
    expect(e.transitionRisk.unassessedAmount).toBe(60e6);
    expect(e.transitionRisk.sharePct).toBe(80);
    const flat = flatten(sectionOf(m, 's2CrossIndustry'));
    expect(flat).toMatch(/S2 §29\(b\)/);
    expect(flat).toMatch(/S2 §29\(c\)/);
    expect(flat).toMatch(/S2 §29\(d\)/);
    expect(flat).toMatch(/Amount not yet assessed/);
    expect(answers(m)['S2-MET-1']).toBe('Yes');
  });

  test('the industry table carries the carbon-related subtotal on a stated boundary', async () => {
    const m = await model();
    const section = sectionOf(m, 's2Industry');
    const table = section.blocks.find(x => x.kind === 'table');
    expect(table.head[0]).toBe('Industry');
    expect(table.rows.length).toBe(3);
    const carbon = m.facts.s2.exposure.industries.carbonRelated;
    /* Textiles and electricity are carbon-related on the boundary this system
       states; wholesale and retail is not. */
    expect(carbon.outstanding).toBe(600e6);
    expect(carbon.basis).toMatch(/TCFD/);
    expect(flatten(section)).toMatch(/the boundary/i);
    expect(answers(m)['S2-IND-1']).toBe('Yes');
  });
});

describe('The index, and the guard over what a form can put on a page', () => {
  test('the S2 index resolves every paragraph to a section the document builds', async () => {
    const m = await model();
    const annex = annexOf(m, 'annexS2Index');
    expect(annex).toBeTruthy();
    /* A row may point at a section, by number, or at an annex, by letter —
       and at nothing else, because a cross-reference to a part the model did
       not build is a broken filed document. */
    const built = new Set([...m.sections.map(s => s.id), ...m.annexes.map(a => a.id)]);
    const named = new Map([
      ...m.sections.map((s, i) => [s.id, `Section ${i + 1}. ${s.title}`]),
      ...m.annexes.map(a => [a.id, `Annex ${a.annex}. ${a.title}`]),
    ]);
    for (const row of m.facts.s2.index) {
      expect([row.paragraph, built.has(row.section)]).toEqual([row.paragraph, true]);
    }
    const table = annex.blocks.find(x => x.kind === 'table');
    expect(table.rows.length).toBe(m.facts.s2.index.length);
    for (const row of table.rows) expect([...named.values()]).toContain(row[2]);
    /* The financed-emissions paragraphs are answered by the blocks this
       document always printed — now the first annex — which is the point: the
       file reads as S2 without a figure having been rewritten for S2. */
    const fe = m.facts.s2.index.find(r => r.paragraph.startsWith('S2 §29(a)(vi)'));
    expect(fe.section).toBe('annexFinanced');
    expect(fe.answered).toBe(true);
    /* And the measurement approach, which S2 §29(a)(iii) asks for and the
       registry now holds, is indexed to the inventory section. */
    const approach = m.facts.s2.index.find(r => r.paragraph === 'S2 §29(a)(iii)');
    expect(approach.section).toBe('s2Inventory');
  });

  test('endorsement language in a statement the entity recorded is refused at build', async () => {
    const org = `${ORG}-language`;
    await register.record(org, LOANS[0]);
    await settings.saveSettings(org, { climate: { governance: { body: 'Our method is PCAF approved.' } } });
    await expect(model(org)).rejects.toThrow(/endorsement language/i);
  });

  test('the S2 items pass once the entity has stated its facts, and the document serves in all three formats', async () => {
    await settings.saveSettings(ORG, { climate: STATED });
    const m = await model();
    const a = answers(m);
    for (const id of ['S2-GOV-1', 'S2-STR-1', 'S2-RSK-1', 'S2-MET-1', 'S2-IND-1', 'S2-TGT-1', 'INV-1']) {
      expect([id, a[id]]).toEqual([id, 'Yes']);
    }
    expect(m.cover.title).toMatch(/SLFRS S2/);

    const json = await request(app).get('/v1/pcaf/part-a/financed-emissions/2024/disclosure?format=json').set(headers);
    expect(json.status).toBe(200);
    expect(json.body.report.facts.s2.answeredParagraphs).toBe(m.facts.s2.answeredParagraphs);
    const pdf = await request(app).get('/v1/pcaf/part-a/financed-emissions/2024/disclosure?format=pdf').set(headers);
    expect(pdf.status).toBe(200);
    expect(pdf.body.slice(0, 5).toString()).toBe('%PDF-');
  });
});
