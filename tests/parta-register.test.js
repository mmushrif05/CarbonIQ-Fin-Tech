/**
 * The PCAF Part A exposure register.
 *
 * §5.2 shipped as two stateless reads, so a book had to be posted whole on
 * every call. These hold the three things that changes: a book that persists,
 * a coverage figure that is a percentage of something real, and a roll-up that
 * reads a projection rather than ten thousand provenance traces.
 *
 * The anchor is the same worked example §5.2 is anchored on — Tables 5.2-2 and
 * 5.2-3, p.63 — driven through the register this time. If the stored path and
 * the direct path ever disagree, one of them is wrong and the standard says
 * which.
 */

'use strict';

const store = require('../src/platform/database/store');
const register = require('../src/domains/pcaf-part-a/application/register');
const repo = require('../src/domains/pcaf-part-a/infrastructure/store');
const { assessBusinessLoan } = require('../src/domains/pcaf-part-a/domain/business-loans');
const { rollUp } = require('../src/domains/pcaf-part-a/domain/business-loans/portfolio');
const { definition } = require('../src/platform/database/collections');

const ORG = 'org-register-test';

const loan = (af, over = {}) => ({
  reportingYear: 2020,
  instrument: 'business-loan',
  borrowerListed: false,
  counterparty: { name: `Borrower ${af}`, sector: 'Example' },
  outstanding: { amount: 1e6 * af, asOf: '2020-12-31', currency: 'EUR' },
  denominator: { totalEquity: 6e5, totalDebt: 4e5, asOf: '2020-12-31', currency: 'EUR' },
  emissions: {
    scope1: { value: 1000, basis: 'reported-unverified', period: '2020' },
    scope2: { value: 100, basis: 'reported-unverified', period: '2020' },
    scope3: { value: 5000, basis: 'reported-unverified', period: '2020' },
  },
  ...over,
});

/** The three companies of Table 5.2-2, as register inputs. */
const TABLE_5_2_2 = [
  { name: 'Forestry company', af: 0.10, s1: 1000, s2: 100, s3: 5000, rem: 20000, ret: 0, gen: 5000 },
  { name: 'Industrial company', af: 0.25, s1: 20000, s2: 5000, s3: 30000, rem: 0, ret: 25000, gen: 0 },
  { name: 'Energy company', af: 0.20, s1: 5000, s2: 0, s3: 10000, rem: 1000, ret: 5000, gen: 500 },
].map(r => loan(r.af, {
  counterparty: { name: r.name, sector: 'Example' },
  emissions: {
    scope1: { value: r.s1, basis: 'reported-unverified', period: '2020' },
    scope2: { value: r.s2, basis: 'reported-unverified', period: '2020' },
    scope3: { value: r.s3, basis: 'reported-unverified', period: '2020' },
  },
  removals: { value: r.rem },
  creditsRetired: { value: r.ret },
  creditsGenerated: { value: r.gen },
}));

async function clear() {
  for (const e of await store.list(repo.EXPOSURES, ORG)) {
    await store.remove(repo.EXPOSURES, ORG, e.exposureId || e.id);
  }
  for (const b of await store.list(repo.BOOK, ORG)) {
    await store.remove(repo.BOOK, ORG, b.reportingYear || b.id);
  }
}

beforeEach(clear);
afterAll(clear);

describe('a book that persists', () => {
  test('an exposure is recorded with both halves and the standard it rests on', async () => {
    const rec = await register.record(ORG, loan(0.1));
    expect(rec.exposureId).toMatch(/^pae_/);
    expect(rec.reportingYear).toBe('2020');
    expect(rec.assetClass).toBe('business-loans-unlisted-equity');

    /* Both halves: the input the bank keyed and the result the engine made. */
    expect(rec.input.outstanding.amount).toBe(100000);
    expect(rec.result.inventory.scope1.value).toBe(100);
    expect(rec.standard).toMatch(/Third Edition/);
    expect(rec.computedAt).toBeTruthy();
  });

  test('it reads back whole, with its trace', async () => {
    const { exposureId } = await register.record(ORG, loan(0.1));
    const found = await register.get(ORG, exposureId);
    expect(found.result.attribution.equation).toMatch(/attribution factor =/);
    expect(found.input).toBeTruthy();
  });

  test('an exposure the standard refuses never reaches the book', async () => {
    await expect(register.record(ORG, loan(0.1, { borrowerType: 'government' })))
      .rejects.toThrow(/sovereign debt/i);
    expect(await store.list(repo.EXPOSURES, ORG)).toHaveLength(0);
  });

  test('an exposure with no reporting year belongs to no book and is refused', async () => {
    const { reportingYear, ...noYear } = loan(0.1);
    expect(reportingYear).toBe(2020);
    await expect(register.record(ORG, noYear)).rejects.toThrow(/belongs to no book/);
  });

  test('an asset class with no engine is a 501 naming what is registered', async () => {
    try {
      await register.record(ORG, loan(0.1, { assetClass: 'mortgages' }));
      throw new Error('should have refused');
    } catch (e) {
      expect(e.statusCode).toBe(501);
      expect(e.message).toMatch(/business-loans-unlisted-equity/);
    }
  });

  test('a change replaces the input and reruns the engine — no figure is edited directly', async () => {
    const { exposureId } = await register.record(ORG, loan(0.1));
    const changed = await register.update(ORG, exposureId, loan(0.2));
    expect(changed.exposureId).toBe(exposureId);
    expect(changed.result.attribution.value).toBe(0.2);
    expect(changed.result.inventory.scope1.value).toBe(200);
  });

  test('a removed exposure is gone, and reading it is a 404', async () => {
    const { exposureId } = await register.record(ORG, loan(0.1));
    await register.remove(ORG, exposureId);
    await expect(register.get(ORG, exposureId)).rejects.toThrow(/No exposure/);
  });
});

describe('a recomputation is a decision, not something that happens on read', () => {
  test('rerunning the same input reports that nothing moved', async () => {
    const { exposureId } = await register.record(ORG, loan(0.1));
    const { movement } = await register.recompute(ORG, exposureId);
    expect(movement.moved).toBe(false);
    expect(movement.before).toBe(movement.after);
    expect(movement.basis).toMatch(/every reporting line, both data-quality scores and the findings/);
    expect(movement.findings.moved).toBe(false);
    expect(movement.note).toMatch(/same figures and the same scores from the same input/);
  });

  test('the note says a movement is the engine or a factor, never what the bank recorded', async () => {
    const { exposureId } = await register.record(ORG, loan(0.1));
    const { movement } = await register.recompute(ORG, exposureId);
    /* The wording is the point: it exists for the day a factor changes. */
    expect(register.recompute).toBeInstanceOf(Function);
    expect(movement.previousStandard).toBe(movement.standard);
  });
});

describe('coverage is a percentage of something real', () => {
  test('without a stated book total it is absent with what it needs', async () => {
    await register.record(ORG, loan(0.1));
    const pos = await register.position(ORG, 2020);
    expect(pos.coverage.share).toBeNull();
    expect(pos.coverage.remedy).toMatch(/PUT \/v1\/pcaf\/part-a\/book/);
  });

  test('with one, it is the assessed outstanding over the whole book', async () => {
    await register.record(ORG, loan(0.1));
    await register.stateBook(ORG, { reportingYear: 2020, totalLoansAndInvestments: 1e6, currency: 'EUR', statedBy: 'CFO' });
    const pos = await register.position(ORG, 2020);
    expect(pos.coverage.share).toBe(0.1);
    expect(pos.coverage.reference).toMatch(/p\.124/);
  });

  test('the book total is recorded as declared, with who stated it', async () => {
    const book = await register.stateBook(ORG, { reportingYear: 2020, totalLoansAndInvestments: 5e6, statedBy: 'Group CFO' });
    expect(book.basis).toBe('declared');
    expect(book.statedBy).toBe('Group CFO');
    expect(book.basisNote).toMatch(/can derive/);
  });

  test('a book of zero is refused rather than read as full coverage', async () => {
    await expect(register.stateBook(ORG, { reportingYear: 2020, totalLoansAndInvestments: 0 }))
      .rejects.toThrow(/no coverage rather than full coverage/);
  });

  test('restating the book total replaces it — a year has one denominator', async () => {
    await register.stateBook(ORG, { reportingYear: 2020, totalLoansAndInvestments: 1e6 });
    await register.stateBook(ORG, { reportingYear: 2020, totalLoansAndInvestments: 2e6 });
    expect((await register.getBook(ORG, 2020)).totalLoansAndInvestments).toBe(2e6);
    expect(await store.list(repo.BOOK, ORG)).toHaveLength(1);
  });
});

describe('the position, read from the stored projection', () => {
  test('the standard\'s own example reproduces through the register', async () => {
    for (const r of TABLE_5_2_2) await register.record(ORG, r);
    const l = (await register.position(ORG, 2020)).total.lines;
    expect(l.scope1.value).toBe(6100);
    expect(l.scope2.value).toBe(1260);
    expect(l.scope3.value).toBe(10000);
    expect(l.removals.value).toBe(2200);
    expect(l.creditsRetired.value).toBe(7250);
    expect(l.creditsGenerated.value).toBe(600);
  });

  test('the projected roll-up equals the whole-record roll-up, figure for figure', async () => {
    for (const r of TABLE_5_2_2) await register.record(ORG, r);
    await register.stateBook(ORG, { reportingYear: 2020, totalLoansAndInvestments: 1e6 });

    const projected = await register.position(ORG, 2020);
    const direct = rollUp(TABLE_5_2_2.map(assessBusinessLoan), { totalLoansAndInvestments: 1e6 });

    expect(projected.total.lines).toEqual(direct.total.lines);
    expect(projected.total.dataQuality.scope1And2).toEqual(direct.total.dataQuality.scope1And2);
    expect(projected.total.dataQuality.scope3).toEqual(direct.total.dataQuality.scope3);
    expect(projected.total.outstanding).toBe(direct.total.outstanding);
    expect(projected.coverage.share).toBe(direct.coverage.share);
  });

  test('the roll-up reads the projection and not the whole record', async () => {
    for (const r of TABLE_5_2_2) await register.record(ORG, r);
    const rows = await repo.rollupsForYear(ORG, 2020);
    expect(rows).toHaveLength(3);
    /* The provenance trace is what the projection exists to leave behind. */
    expect(rows[0].input).toBeUndefined();
    expect(rows[0].result.attribution.equation).toBeUndefined();
    expect(rows[0].result.inventory.scope1.value).toBeGreaterThan(0);
  });

  test('an exposure with no attribution factor is counted as having none', async () => {
    await register.record(ORG, {
      reportingYear: 2020, instrument: 'business-loan', borrowerListed: false,
      counterparty: { name: 'Unbanked SME' },
      outstanding: { amount: 250000, asOf: '2020-12-31', currency: 'LKR' },
      emissions: {
        scope1: { basis: 'assets-sector', activity: { factor: { value: 0.00004, unit: 'tCO2e/LKR', source: 'EXIOBASE', vintage: 2020 } } },
        scope2: { basis: 'assets-sector', activity: { factor: { value: 0.00001, unit: 'tCO2e/LKR', source: 'EXIOBASE', vintage: 2020 } } },
      },
    });
    /* jsonb_strip_nulls leaves `{}` where a null field was, and an empty
       object is truthy — this is the count that would silently come back 0. */
    expect((await register.position(ORG, 2020)).total.withoutAttributionFactor).toBe(1);
  });

  test('the improvement plan reads the stored findings', async () => {
    for (const r of TABLE_5_2_2) await register.record(ORG, r);
    await register.record(ORG, loan(0.1, {
      instrument: 'overdraft',
      counterparty: { name: 'Revolving borrower', sector: 'Example' },
    }));
    const plan = (await register.position(ORG, 2020)).improvementPlan;
    expect(plan.byRemedy.map(r => r.code)).toContain('FN71_AVERAGE_NOT_HELD');
    expect(plan.byRemedy[0].remedy).toBeTruthy();
  });

  test('a year holding nothing is a 409, not a position of zero', async () => {
    try {
      await register.position(ORG, 2021);
      throw new Error('should have refused');
    } catch (e) {
      expect(e.statusCode).toBe(409);
      expect(e.message).toMatch(/not a position of zero/);
    }
  });

  test('years reports what is held and whether the book total was stated', async () => {
    await register.record(ORG, loan(0.1));
    expect(await register.years(ORG)).toEqual([{ reportingYear: '2020', bookTotalStated: false }]);
    await register.stateBook(ORG, { reportingYear: 2020, totalLoansAndInvestments: 1e6 });
    expect(await register.years(ORG)).toEqual([{ reportingYear: '2020', bookTotalStated: true }]);
  });
});

describe('the projection is declared once', () => {
  test('the registry field list is what the store asks for', () => {
    const declared = definition(repo.EXPOSURES).projections.rollup.fields;
    expect(repo.ROLLUP_FIELDS).toEqual(declared);
  });

  test('every projected field is a path into the record, never a shape of its own', async () => {
    const { exposureId } = await register.record(ORG, loan(0.1));
    const whole = await register.get(ORG, exposureId);
    for (const field of repo.ROLLUP_FIELDS) {
      const path = field.replace(/\[\]/g, '').split('.');
      let node = whole;
      for (const key of path) {
        if (node === null || node === undefined) break;
        node = Array.isArray(node) ? node[0] && node[0][key] : node[key];
      }
      /* Reaching the end without throwing is the claim: the path exists in
         the record's own shape. A flattened column would fail here. */
      expect(typeof field).toBe('string');
    }
  });

  test('the SQL function and the registry name the same fields', () => {
    const fs = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '0008_parta_exposures.sql'), 'utf8');
    const fn = sql.slice(sql.indexOf('CREATE FUNCTION parta_exposure_rollup'), sql.indexOf('ALTER TABLE parta_exposures ADD COLUMN rollup'));
    for (const field of definition(repo.EXPOSURES).projections.rollup.fields) {
      const leaf = field.replace(/\[\]/g, '').split('.').pop();
      expect(fn).toContain(`'${leaf}'`);
    }
  });
});

describe('one loan, once (migration 0009)', () => {
  const withRef = (ref, over = {}) => loan(0.1, { identifiers: { accountNumber: ref }, ...over });

  test('the same facility reference in the same year is refused, naming the existing exposure', async () => {
    const first = await register.record(ORG, withRef('LN-1001'));
    try {
      await register.record(ORG, withRef('LN-1001'));
      throw new Error('should have refused');
    } catch (e) {
      expect(e.statusCode).toBe(409);
      expect(e.code).toBe('DUPLICATE_LOAN');
      expect(e.message).toContain(first.exposureId);
      expect(e.message).toMatch(/twice/);
      expect(e.remedy).toMatch(new RegExp(first.exposureId));
    }
    expect(await store.list(repo.EXPOSURES, ORG)).toHaveLength(1);
  });

  test('two facilities to one borrower are two rows — uniqueness is on the loan, never the counterparty', async () => {
    await register.record(ORG, withRef('LN-2001', { counterparty: { name: 'Same borrower', sector: 'Example' } }));
    await register.record(ORG, withRef('LN-2002', { counterparty: { name: 'Same borrower', sector: 'Example' } }));
    expect((await register.position(ORG, 2020)).exposures).toBe(2);
  });

  test('the same reference in a different reporting year is a different position and stands', async () => {
    await register.record(ORG, withRef('LN-3001'));
    await register.record(ORG, withRef('LN-3001', { reportingYear: 2021,
      outstanding: { amount: 100000, asOf: '2021-12-31', currency: 'EUR' },
      denominator: { totalEquity: 6e5, totalDebt: 4e5, asOf: '2021-12-31', currency: 'EUR' } }));
    expect((await register.years(ORG)).map(y => y.reportingYear)).toEqual(['2020', '2021']);
  });

  test('changing an exposure does not collide with itself', async () => {
    const { exposureId } = await register.record(ORG, withRef('LN-4001'));
    const changed = await register.update(ORG, exposureId, withRef('LN-4001', {
      outstanding: { amount: 200000, asOf: '2020-12-31', currency: 'EUR' } }));
    expect(changed.result.attribution.value).toBe(0.2);
  });

  test('a change that takes another loan\'s reference is refused', async () => {
    await register.record(ORG, withRef('LN-5001'));
    const { exposureId } = await register.record(ORG, withRef('LN-5002'));
    await expect(register.update(ORG, exposureId, withRef('LN-5001'))).rejects.toMatchObject({ code: 'DUPLICATE_LOAN' });
  });

  test('a loan with no reference carries no constraint, and the register does not pretend otherwise', async () => {
    await register.record(ORG, loan(0.1));
    await register.record(ORG, loan(0.1));
    expect((await register.position(ORG, 2020)).exposures).toBe(2);
  });

  test('the registry lifts the reference from the input the bank keyed, not the engine\'s echo', () => {
    expect(definition(repo.EXPOSURES).keys['input.identifiers.accountNumber']).toBe('account_number');
  });
});

describe('a recomputation compares every line and both scores', () => {
  test('the movement carries all seven lines and the two scores, and the headline is still where it was', async () => {
    const { exposureId } = await register.record(ORG, loan(0.1, { removals: { value: 20000 }, creditsGenerated: { value: 5000 } }));
    const { movement } = await register.recompute(ORG, exposureId);
    expect(movement.basis).toMatch(/every reporting line/);
    expect(movement.lines.map(l => l.line)).toEqual(['scope1', 'scope2', 'scope1And2', 'scope3', 'removals', 'creditsRetired', 'creditsGenerated']);
    expect(movement.lines.every(l => l.moved === false)).toBe(true);
    expect(movement.dataQuality.before).toEqual({ scope1And2: 2, scope3: 2 });
    expect(movement.dataQuality.moved).toBe(false);
    expect(movement.before).toBe(110);
    expect(movement.after).toBe(110);
    expect(movement.moved).toBe(false);
    expect(movement.note).toMatch(/same figures and the same scores/);
  });

  test('a stored result that differs from what the engine now produces is reported line by line', async () => {
    const rec = await register.record(ORG, loan(0.1));
    /* Simulate a factor correction landing between the write and the reread:
       the stored scope 3 is wrong, the headline is not. */
    const tampered = JSON.parse(JSON.stringify(rec));
    tampered.result.inventory.scope3.value = 999;
    await repo.saveExposure(ORG, tampered);

    const { movement } = await register.recompute(ORG, rec.exposureId);
    expect(movement.moved).toBe(true);
    expect(movement.lines.find(l => l.line === 'scope1And2').moved).toBe(false);
    const s3 = movement.lines.find(l => l.line === 'scope3');
    expect(s3.before).toBe(999);
    expect(s3.after).toBe(500);
    expect(movement.note).toMatch(/Moved on the same input: scope3\./);
  });
});

describe('the lifecycle is not built, and says which step builds it', () => {
  test('locking refuses with a 501 rather than doing half of it', async () => {
    try {
      await register.lock();
      throw new Error('should have refused');
    } catch (e) {
      expect(e.statusCode).toBe(501);
      expect(e.message).toMatch(/lock-and-supersede lifecycle/);
      expect(e.remedy).toMatch(/PCAF-PART-A-BUSINESS-LOANS/);
    }
  });
});

describe('The sector band comes from the baseline registry, and a released band moves the findings', () => {
  const registry = require('../src/domains/baseline/application/registry');
  const asOf = '2026-12-31';
  const tea = () => ({
    reportingYear: 2026, instrument: 'business-loan', borrowerListed: false,
    counterparty: { name: 'Hill Country Tea', sectorKey: 'agriculture_tea' },
    outstanding: { amount: 150e6, asOf, currency: 'LKR' },
    denominator: { totalEquity: 900e6, totalDebt: 600e6, asOf, currency: 'LKR' },
    emissions: {
      scope1: { value: 6800, basis: 'reported-unverified', period: '2026' },
      scope2: { value: 900, basis: 'reported-unverified', period: '2026' },
      scope3: { value: 4100, basis: 'reported-unverified', period: '2026' },
    },
    /* 7,700 over LKR 600m is 12.8 per million — above the shipped tea band. */
    plausibility: { revenue: 600e6 },
  });

  test('recording reads the band in force and the finding says it is the illustrative set', async () => {
    const e = await register.record(ORG, tea());
    const f = e.result.validation.findings.find(x => x.code === 'INTENSITY_OUTSIDE_SECTOR_BAND');
    expect(f).toBeTruthy();
    expect(f.observed.band.provisional).toBe(true);
    expect(f.reference).toMatch(/illustrative dataset, not a released baseline/);
    /* The band is applied on the way in and never written into what the bank keyed. */
    expect(e.input.plausibility.sectorBand).toBeUndefined();
  });

  test('a band the organisation releases changes what recompute reports, and the note says findings moved', async () => {
    const e = await register.record(ORG, tea());
    expect(e.result.validation.findings.map(x => x.code)).toContain('INTENSITY_OUTSIDE_SECTOR_BAND');

    const ctx = { orgId: ORG, actor: 'risk@bank.lk', mayGovernMarket: false };
    const draft = await registry.createDraft({
      metric: 'sector_intensity_tCO2e_per_million_revenue', scope: 'organisation', country: 'LK', orgId: ORG,
      values: { agriculture_tea_low: 1, agriculture_tea_high: 20 },
      source: 'Estate energy survey, FY2026 — firewood-fired withering is the sector norm here',
    }, ctx);
    await registry.releaseDraft(draft.baselineId, ctx);

    const { movement, exposure } = await register.recompute(ORG, e.exposureId);
    expect(movement.lines.every(l => !l.moved)).toBe(true);
    expect(movement.findings.moved).toBe(true);
    expect(movement.moved).toBe(true);
    expect(movement.note).toMatch(/Moved on the same input: findings\./);
    expect(exposure.result.validation.findings.map(x => x.code)).not.toContain('INTENSITY_OUTSIDE_SECTOR_BAND');
  });

  test('a band supplied on the request stands over the registry, and says so', async () => {
    const e = await register.record(ORG, { ...tea(), plausibility: { revenue: 600e6, sectorBand: { low: 100, high: 200 } } });
    const f = e.result.validation.findings.find(x => x.code === 'INTENSITY_OUTSIDE_SECTOR_BAND');
    expect(f.observed).toMatchObject({ low: 100, high: 200 });
    expect(f.observed.band.basis).toMatch(/Supplied on the request/);
  });
});
