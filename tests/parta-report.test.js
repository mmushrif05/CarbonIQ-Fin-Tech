/**
 * The PCAF Part A §5.2 disclosure and per-exposure report.
 *
 * The report is one input to a bank's Chapter 6 financed-emissions
 * disclosure, not the disclosure — a distinction the document makes on its
 * face and the checklist enforces by never reaching a hundred per cent. Every
 * figure is one the register returned; the engine did the arithmetic and this
 * path recomputes none of it. Test names here are cited by the conformance
 * matrix, so a rename fails the conformance build.
 */

'use strict';

const store = require('../src/platform/database/store');
const register = require('../src/domains/pcaf-part-a/application/register');
const svc = require('../src/domains/pcaf-part-a/application/parta-report');
const reporting = require('../src/domains/pcaf-part-a/reporting/report');

const ORG = 'org-parta-report';
const asOf = '2024-12-31', c = 'LKR';

const textile = () => ({
  reportingYear: 2024, instrument: 'business-loan', borrowerListed: false,
  counterparty: { name: 'Lanka Apparel', sector: 'Textiles', sectorKey: 'manufacturing_textiles' },
  outstanding: { amount: 480e6, asOf, currency: c },
  denominator: { totalEquity: 1.9e9, totalDebt: 2.1e9, asOf, currency: c },
  emissions: {
    scope1: { value: 11200, basis: 'reported-unverified', period: 2024 },
    scope2: { value: 3400, basis: 'reported-unverified', period: 2024 },
    scope3: { value: 26000, basis: 'reported-unverified', period: 2024 },
  },
  plausibility: { revenue: 5.2e9 },
});

beforeEach(async () => { await store._resetMemory(); });

async function seed({ book = true } = {}) {
  const rec = await register.record(ORG, textile());
  if (book) {
    await register.stateBook(ORG, { reportingYear: 2024, totalLoansAndInvestments: 14e9, currency: 'LKR', statedBy: 'Group CFO' });
  }
  return rec;
}

describe('The annual §5.2 disclosure', () => {
  test('the annual disclosure reads in Chapter 6 order', async () => {
    await seed();
    const { model } = await svc.annualDisclosure(ORG, 2024, { insurer: 'Test Bank PLC' });
    const titles = model.sections.map(s => s.title);
    expect(titles).toEqual([
      'Scope and coverage', 'Gases and units', 'Absolute emissions', 'Methodology',
      'Data quality', 'Recalculation and significance', 'Emission intensity',
      'Limitations and the improvement plan', 'Conformance statement',
    ]);
    expect(model.annexes.map(a => a.annex)).toEqual(['A', 'B', 'C']);
  });

  test('scope 3 is a separate line and nothing is netted', async () => {
    await seed();
    const { facts } = await svc.annualDisclosure(ORG, 2024, { insurer: 'Test Bank PLC' });
    expect(facts.lines.scope1And2).toBeGreaterThan(0);
    expect(facts.lines.scope3).toBeGreaterThan(0);
    /* No single figure sums the two, and removals/credits are their own lines. */
    const { model } = await svc.annualDisclosure(ORG, 2024, { insurer: 'Test Bank PLC' });
    const abs = model.sections.find(s => s.id === 'absolute');
    const caption = abs.blocks.find(b => b.kind === 'caption');
    expect(caption.text).toMatch(/nets a credit or a removal/i);
    expect(caption.text).toMatch(/No row sums scope 1 and 2 with scope 3/i);
  });

  test('coverage is a percentage of the stated book, or absent', async () => {
    await seed({ book: true });
    const withBook = await svc.annualDisclosure(ORG, 2024, { insurer: 'B' });
    expect(withBook.facts.coverage.share).toBeGreaterThan(0);
    expect(withBook.facts.coverageStatement).toMatch(/total loans and investments/i);

    await store._resetMemory();
    await register.record(ORG, textile());   // no book stated
    const noBook = await svc.annualDisclosure(ORG, 2024, { insurer: 'B' });
    expect(noBook.facts.coverage.share === null || noBook.facts.coverage.share === undefined).toBe(true);
    expect(noBook.facts.coverageStatement).toMatch(/reported absent|absent rather than assumed/i);
  });

  test('the weighted score is a category with the scale stated', async () => {
    await seed();
    const { model } = await svc.annualDisclosure(ORG, 2024, { insurer: 'B' });
    const dq = model.sections.find(s => s.id === 'dataquality');
    const prose = dq.blocks.map(b => b.text || '').join(' ');
    expect(prose).toMatch(/1 is the highest quality, 5 the lowest/);
    expect(prose).toMatch(/never a mark out of five|not a mark out of five/i);
    /* A score is never rendered as a fraction. */
    const flat = JSON.stringify(model.sections);
    expect(flat).not.toMatch(/\b[1-5]\s*\/\s*5\b/);
  });

  test('the factor set is named with a checksum', async () => {
    await seed();
    const { model } = await svc.annualDisclosure(ORG, 2024, { insurer: 'B' });
    const annexA = model.annexes.find(a => a.annex === 'A');
    const flat = JSON.stringify(annexA);
    expect(flat).toMatch(/sector-factors/);
    expect(flat).toMatch(/[0-9a-f]{16}/);   // a checksum prefix
  });

  test('the checklist is answered from the report and cannot reach 100%', async () => {
    await seed();
    const { model } = await svc.annualDisclosure(ORG, 2024, { insurer: 'B' });
    const c = model.checklist;
    expect(c.items.length).toBeGreaterThan(10);
    /* The entity-inventory item is answered No, by rule, so the checklist can
       never be complete: this report is one asset class, not the inventory. */
    const inv = c.items.find(i => i.id === 'INV-1');
    expect(inv.answer).toBe('No');
    expect(inv.justification).toMatch(/asset class only|one input/i);
    expect(c.summary.requirements.met).toBeLessThan(c.summary.requirements.total);
  });

  test('a report with endorsement language is refused', () => {
    const facts = reporting.disclosureFacts({
      position: { total: { lines: {}, dataQuality: {} }, coverage: {}, bySector: {}, exposures: 0 },
      reportingYear: 2024, insurer: 'B',
    });
    facts.conformanceStatement = 'This report is PCAF certified and approved.';
    expect(() => require('../src/domains/pcaf-part-a/reporting/model').buildStandardModel(facts))
      .toThrow(/endorsement language/i);
  });
});

describe('The per-exposure report', () => {
  test('every figure is one the register returned', async () => {
    const rec = await seed();
    const stored = rec.result.inventory.scope1And2.value;
    const { facts } = await svc.exposureReport(ORG, rec.exposureId, { insurer: 'B' });
    /* The report reads the stored result; it does not recompute. */
    expect(facts.lines.scope1And2).toBe(stored);
    expect(facts.dataQuality.scope1And2.score).toBe(rec.result.inventory.dataQuality.scope1And2.score);
  });

  test('the per-exposure report carries the findings as its limitations', async () => {
    /* An overdraft below its average raises the footnote 71 finding. */
    await store._resetMemory();
    const rec = await register.record(ORG, {
      ...textile(), instrument: 'overdraft',
      outstanding: { amount: 60e6, averageOutstanding: 240e6, asOf, currency: c },
    });
    const { facts, model } = await svc.exposureReport(ORG, rec.exposureId, { insurer: 'B' });
    expect(facts.findings.some(f => f.code === 'FN71_YEAR_END_FLUCTUATION')).toBe(true);
    const lim = model.sections.find(s => s.id === 'limitations');
    expect(JSON.stringify(lim)).toMatch(/below the average balance/i);
  });
});

describe('The recalculation section (Chapter 6)', () => {
  test('the recalculation section prints the entity’s protocol and says so when no base year is set', async () => {
    await seed();
    const { model } = await svc.annualDisclosure(ORG, 2024, { insurer: 'B' });
    const sec = model.sections.find(s => s.id === 'recalculation');
    const flat = JSON.stringify(sec);
    /* No base year has been set for this entity, so the section says so on its
       face rather than implying the current year. */
    expect(flat).toMatch(/Not yet stated/);
    expect(flat).toMatch(/Open item/);
    /* The triggers the entity's protocol carries are printed. */
    expect(flat).toMatch(/triggers a recalculation|What triggers a recalculation/i);

    await register.saveSettings(ORG, { baseYear: 2020, significanceThresholdPct: 7 });
    const after = await svc.annualDisclosure(ORG, 2024, { insurer: 'B' });
    const sec2 = after.model.sections.find(s => s.id === 'recalculation');
    const flat2 = JSON.stringify(sec2);
    expect(flat2).toMatch(/2020/);
    expect(flat2).toMatch(/7% movement/);
    expect(flat2).not.toMatch(/Open item/);
  });
});
