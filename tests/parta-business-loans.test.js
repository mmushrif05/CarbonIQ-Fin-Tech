/**
 * PCAF Part A §5.2 — business loans and unlisted equity.
 *
 * The first block is the standard's own worked example (Tables 5.2-2 and
 * 5.2-3, p.63) reproduced figure for figure. A test that checks our arithmetic
 * against our arithmetic proves nothing; this one knows something the code
 * does not, which is the only kind worth having.
 *
 * The rest holds the two things §5.2 does that §5.1 does not: the numerator is
 * defined twice and the second definition is not the price paid, and the
 * engine reports what the data says about itself without refusing anything.
 */

'use strict';

const { assessBusinessLoan } = require('../src/domains/pcaf-part-a/domain/business-loans');
const { classify } = require('../src/domains/pcaf-part-a/domain/business-loans/classify');
const { businessLoanOutstanding, unlistedEquityOutstanding } = require('../src/domains/pcaf-part-a/domain/business-loans/numerator');
const { rollUp } = require('../src/domains/pcaf-part-a/domain/business-loans/portfolio');
const dataQuality = require('../src/domains/pcaf-part-a/domain/data-quality');

/** A private-company loan whose attribution factor comes out at exactly `af`. */
const loan = (af, over = {}) => ({
  reportingYear: 2020,
  instrument: 'business-loan',
  borrowerListed: false,
  counterparty: { name: 'Borrower', sector: 'Example' },
  outstanding: { amount: 1e6 * af, asOf: '2020-12-31', currency: 'EUR' },
  denominator: { totalEquity: 6e5, totalDebt: 4e5, asOf: '2020-12-31', currency: 'EUR' },
  emissions: {
    scope1: { value: 1000, basis: 'reported-unverified', period: '2020' },
    scope2: { value: 100, basis: 'reported-unverified', period: '2020' },
    scope3: { value: 5000, basis: 'reported-unverified', period: '2020' },
  },
  ...over,
});

describe('the standard\'s own portfolio example (Tables 5.2-2 and 5.2-3, p.63)', () => {
  const rows = [
    { name: 'Forestry company', af: 0.10, s1: 1000, s2: 100, s3: 5000, rem: 20000, ret: 0, gen: 5000 },
    { name: 'Industrial company', af: 0.25, s1: 20000, s2: 5000, s3: 30000, rem: 0, ret: 25000, gen: 0 },
    { name: 'Energy company', af: 0.20, s1: 5000, s2: 0, s3: 10000, rem: 1000, ret: 5000, gen: 500 },
  ];

  const results = rows.map(r => assessBusinessLoan(loan(r.af, {
    counterparty: { name: r.name, sector: 'Example' },
    emissions: {
      scope1: { value: r.s1, basis: 'reported-unverified', period: '2020' },
      scope2: { value: r.s2, basis: 'reported-unverified', period: '2020' },
      scope3: { value: r.s3, basis: 'reported-unverified', period: '2020' },
    },
    removals: { value: r.rem },
    creditsRetired: { value: r.ret },
    creditsGenerated: { value: r.gen },
  })));

  test('each attribution factor is the share the table states', () => {
    expect(results.map(r => r.attribution.value)).toEqual([0.1, 0.25, 0.2]);
  });

  test('the six portfolio lines reproduce Table 5.2-3 exactly', () => {
    const l = rollUp(results).total.lines;
    expect(l.scope1.value).toBe(6100);
    expect(l.scope2.value).toBe(1260);
    expect(l.scope3.value).toBe(10000);
    expect(l.removals.value).toBe(2200);
    expect(l.creditsRetired.value).toBe(7250);
    expect(l.creditsGenerated.value).toBe(600);
  });

  test('no line is netted against another and none is summed across lines', () => {
    const book = rollUp(results);
    expect(book.total.lines).not.toHaveProperty('net');
    expect(book.total.lines).not.toHaveProperty('total');
    expect(book.separation).toMatch(/not netted/i);
  });
});

describe('Table 5.2-1 is this class\'s own table', () => {
  test('the option-to-score mapping is the one printed on p.60', () => {
    const got = Object.fromEntries(dataQuality.optionsFor('business-loans-unlisted-equity')
      .filter(o => o.option !== 'alt').map(o => [o.option, o.score]));
    expect(got).toEqual({ '1a': 1, '1b': 2, '2a': 2, '2b': 3, '3a': 4, '3b': 5, '3c': 5 });
  });

  test('it is a different table object from §5.1\'s, carrying the same scores', () => {
    const a = dataQuality.tableFor('business-loans-unlisted-equity');
    const b = dataQuality.tableFor('listed-equity-corporate-bonds');
    expect(a.table).toBe('Table 5.2-1');
    expect(b.table).toBe('Table 5.1-2');
    expect(a).not.toBe(b);
  });

  test('a score renders as a category with the scale beside it, never as a fraction', () => {
    const s = dataQuality.score('business-loans-unlisted-equity', '2b');
    expect(s.label).toBe('Data quality score: 3 (Option 2b)');
    expect(s.scale).toMatch(/1 is the highest/i);
    expect(s.label).not.toMatch(/\/\s*5/);
  });
});

describe('the numerator is defined twice (p.56)', () => {
  test('a business loan is disbursed debt less repayments', () => {
    const n = businessLoanOutstanding({ disbursed: 1000, repayments: 400, asOf: '2024-12-31' });
    expect(n.value).toBe(600);
    expect(n.equation).toMatch(/disbursed debt − repayments/);
  });

  test('a repaid loan attributes nothing, and says so rather than being dropped', () => {
    const n = businessLoanOutstanding({ disbursed: 1000, repayments: 1000, asOf: '2024-12-31' });
    expect(n.value).toBe(0);
    expect(n.assumptions.join(' ')).toMatch(/fully repaid/i);
  });

  test('a balance that disagrees with disbursed less repayments is refused, not picked between', () => {
    expect(() => businessLoanOutstanding({ amount: 900, disbursed: 1000, repayments: 400, asOf: '2024-12-31' }))
      .toThrow(/not the disbursed debt less repayments/);
  });

  test('unlisted equity is the share of the investee\'s book equity, not the price paid', () => {
    const n = unlistedEquityOutstanding({ sharesHeld: 25, totalShares: 100, investeeTotalEquity: 8e6, asOf: '2024-12-31' });
    expect(n.value).toBe(2e6);
    expect(n.inputs.relativeShare).toBe(0.25);
  });

  test('a holding larger than the company is refused', () => {
    expect(() => unlistedEquityOutstanding({ sharesHeld: 120, totalShares: 100, investeeTotalEquity: 1e6, asOf: '2024-12-31' }))
      .toThrow(/cannot exceed the company/);
  });

  test('negative investee equity gives an equity holder nothing, and records that the reading is ours', () => {
    const n = unlistedEquityOutstanding({ sharesHeld: 25, totalShares: 100, investeeTotalEquity: -4e6, asOf: '2024-12-31' });
    expect(n.value).toBe(0);
    expect(n.assumptions.join(' ')).toMatch(/footnote 75/i);
    expect(n.assumptions.join(' ')).toMatch(/recorded rather than assumed/i);
  });
});

describe('the gate (Figure 5-1 and p.55)', () => {
  test('a loan to a listed company is attributed on EVIC (footnote 86)', () => {
    expect(classify({ instrument: 'business-loan', borrowerListed: true }).denominatorKind).toBe('evic');
  });

  test('unlisted equity never reaches the EVIC branch', () => {
    expect(classify({ instrument: 'unlisted-equity', borrowerListed: false }).denominatorKind).toBe('equity-plus-debt');
  });

  test('a loan to a government is redirected, and a state-owned enterprise is not', () => {
    expect(() => classify({ instrument: 'business-loan', borrowerType: 'government', borrowerListed: false }))
      .toThrow(/sovereign debt/i);
    expect(classify({ instrument: 'business-loan', borrowerType: 'state-owned-enterprise', borrowerListed: false }).kind)
      .toBe('business-loan');
  });

  test('a known use of proceeds is redirected by what it buys, with footnote 72 beside it', () => {
    try {
      classify({ instrument: 'business-loan', borrowerListed: false, useOfProceedsKnown: true, proceedsPurpose: 'motor-vehicle' });
      throw new Error('should have refused');
    } catch (e) {
      expect(e.code).toBe('KNOWN_USE_OF_PROCEEDS');
      expect(e.message).toMatch(/§5\.6/);
      expect(e.message).toMatch(/Footnote 72/);
    }
  });

  test('an off-balance-sheet line of credit is excluded by name', () => {
    expect(() => classify({ instrument: 'revolving-credit', borrowerListed: false, offBalanceSheet: true }))
      .toThrow(/off-balance sheet/i);
  });

  test('a private equity fund goes to §5.7; shares in a private company stay here', () => {
    expect(() => classify({ instrument: 'private-equity', isInvestmentFund: true })).toThrow(/§5\.7/);
    expect(classify({ instrument: 'private-equity', borrowerListed: false }).kind).toBe('unlisted-equity');
  });

  test('listed equity and corporate bonds are sent to §5.1 even though the denominator is the same', () => {
    try {
      classify({ instrument: 'corporate-bond', borrowerListed: true });
      throw new Error('should have refused');
    } catch (e) {
      expect(e.message).toMatch(/Table 5\.1-2, not Table 5\.2-1/);
    }
  });
});

describe('the engine reports what the data says about itself, and refuses nothing for it', () => {
  test('a revolving facility far from its own average raises footnote 71 and still assesses', () => {
    const r = assessBusinessLoan(loan(0.1, {
      instrument: 'revolving-credit',
      outstanding: { amount: 100000, averageOutstanding: 400000, asOf: '2020-12-31', currency: 'EUR' },
    }));
    expect(r.inventory.scope1.value).toBeGreaterThan(0);
    expect(r.validation.verdict).toBe('accepted_with_findings');
    const f = r.validation.findings.find(x => x.code === 'FN71_YEAR_END_FLUCTUATION');
    expect(f.severity).toBe('material');
    expect(f.observed.movementPct).toBe(-75);
    expect(f.remedy).toMatch(/CarbonIQ's and is settable/);
  });

  test('a revolving facility with no average says the check did not run rather than passing', () => {
    const r = assessBusinessLoan(loan(0.1, { instrument: 'overdraft' }));
    expect(r.validation.findings.map(f => f.code)).toContain('FN71_AVERAGE_NOT_HELD');
  });

  test('a term loan raises no fluctuation finding at all', () => {
    const r = assessBusinessLoan(loan(0.1));
    expect(r.validation.findings.map(f => f.code)).not.toContain('FN71_AVERAGE_NOT_HELD');
    expect(r.validation.verdict).toBe('clean');
  });

  test('an emissions figure years behind the reporting year is reported, not rejected', () => {
    const r = assessBusinessLoan(loan(0.1, {
      emissions: {
        scope1: { value: 1000, basis: 'reported-unverified', period: '2017' },
        scope2: { value: 100, basis: 'reported-unverified', period: '2020' },
        scope3: { value: 5000, basis: 'reported-unverified', period: '2020' },
      },
    }));
    const f = r.validation.findings.find(x => x.code === 'EMISSIONS_DATA_LAG');
    expect(f.observed.lagYears).toBe(3);
    expect(r.inventory.scope1.value).toBe(100);
  });

  test('an intensity a thousand times its sector band is material, and the figure still stands', () => {
    const r = assessBusinessLoan(loan(0.1, {
      plausibility: { revenue: 1e6, sectorBand: { low: 5, high: 50 } },
    }));
    const f = r.validation.findings.find(x => x.code === 'INTENSITY_OUTSIDE_SECTOR_BAND');
    expect(f.severity).toBe('material');
    expect(f.statement).toMatch(/above the 5–50 band/);
    expect(r.inventory.scope1.value).toBe(100);
  });

  test('no sector band means the check says so rather than passing', () => {
    const r = assessBusinessLoan(loan(0.1, { plausibility: { revenue: 1e6 } }));
    expect(r.validation.findings.map(f => f.code)).toContain('INTENSITY_BAND_NOT_HELD');
  });

  test('a denominator larger than the balance sheet it came from is a finding', () => {
    const r = assessBusinessLoan(loan(0.1, {
      denominator: { totalEquity: 6e5, totalDebt: 4e5, totalAssets: 5e5, asOf: '2020-12-31', currency: 'EUR' },
    }));
    const f = r.validation.findings.find(x => x.code === 'DENOMINATOR_EXCEEDS_ASSETS');
    expect(f.effect).toMatch(/understates/);
  });

  test('a missing scope 3 is material and is never reported as zero', () => {
    const r = assessBusinessLoan(loan(0.1, {
      emissions: {
        scope1: { value: 1000, basis: 'reported-unverified', period: '2020' },
        scope2: { value: 100, basis: 'reported-unverified', period: '2020' },
        scope3AbsentReason: 'The borrower does not measure it.',
      },
    }));
    expect(r.inventory.scope3.absent).toBe(true);
    expect(r.inventory.scope3.value).toBeNull();
    expect(r.validation.findings.map(f => f.code)).toContain('SCOPE_3_NOT_REPORTED');
    expect(r.inventory.dataQuality.scope3.absent).toBe(true);
  });

  test('every finding names what would clear it', () => {
    const r = assessBusinessLoan(loan(0.1, {
      instrument: 'overdraft',
      plausibility: { revenue: 1e6 },
      emissions: {
        scope1: { value: 1000, basis: 'reported-unverified', period: '2020' },
        scope2: { value: 100, basis: 'reported-unverified', period: '2020' },
      },
    }));
    expect(r.validation.findings.length).toBeGreaterThan(1);
    for (const f of r.validation.findings) {
      expect(f.remedy).toBeTruthy();
      expect(f.reference).toBeTruthy();
      expect(['material', 'advisory']).toContain(f.severity);
    }
  });
});

describe('a bank can always report; what it cannot do is claim', () => {
  test('with no financial data at all, Option 3b still produces a figure at score 5', () => {
    const r = assessBusinessLoan({
      reportingYear: 2024,
      instrument: 'business-loan',
      borrowerListed: false,
      counterparty: { name: 'Unbanked SME' },
      outstanding: { amount: 250000, asOf: '2024-12-31', currency: 'LKR' },
      emissions: {
        scope1: { basis: 'assets-sector', activity: { factor: { value: 0.00004, unit: 'tCO2e/LKR', source: 'EXIOBASE', vintage: 2024 } } },
        scope2: { basis: 'assets-sector', activity: { factor: { value: 0.00001, unit: 'tCO2e/LKR', source: 'EXIOBASE', vintage: 2024 } } },
      },
    });
    expect(r.attribution).toBeNull();
    expect(r.inventory.dataQuality.scope1And2.score).toBe(5);
    expect(r.inventory.scope1.value).toBe(10);
    expect(r.validation.findings.map(f => f.code)).toContain('NO_ATTRIBUTION_FACTOR');
  });

  test('a score of 1 needs a named verifier', () => {
    expect(() => assessBusinessLoan(loan(0.1, {
      emissions: {
        scope1: { value: 1000, basis: 'reported-verified', period: '2020' },
        scope2: { value: 100, basis: 'reported-unverified', period: '2020' },
        scope3: { value: 5000, basis: 'reported-unverified', period: '2020' },
      },
    }))).toThrow(/Name the verifier/);
  });

  test('a better option than the evidence supports needs a justification, and is then recorded', () => {
    const claim = { dataQualityClaims: { scope12: '1a' } };
    expect(() => assessBusinessLoan(loan(0.1, claim))).toThrow(/Option 1a was claimed/);
    const r = assessBusinessLoan(loan(0.1, {
      dataQualityClaims: { ...claim.dataQualityClaims, justification: 'Assurance report held outside this system.' },
    }));
    expect(r.inventory.dataQuality.scope1And2.score).toBe(1);
    expect(r.inventory.dataQuality.scope1And2.overrideJustification).toMatch(/Assurance report/);
  });

  test('an attribution factor above 1 is refused rather than capped', () => {
    expect(() => assessBusinessLoan(loan(0.1, {
      outstanding: { amount: 2e6, asOf: '2020-12-31', currency: 'EUR' },
    }))).toThrow(/above 1/);
  });

  test('a numerator and a denominator on different dates is not an attribution factor', () => {
    expect(() => assessBusinessLoan(loan(0.1, {
      denominator: { totalEquity: 6e5, totalDebt: 4e5, asOf: '2020-03-31', currency: 'EUR' },
    }))).toThrow(/VALUATION_DATE_MISMATCH|same year-end/);
  });
});

describe('the book, and what to fix first', () => {
  const book = () => rollUp([
    assessBusinessLoan(loan(0.1, {
      counterparty: { name: 'Weak', sector: 'Textiles' },
      outstanding: { amount: 900000, asOf: '2020-12-31', currency: 'EUR' },
      denominator: { totalEquity: 6e6, totalDebt: 3e6, asOf: '2020-12-31', currency: 'EUR' },
      emissions: {
        scope1: { basis: 'revenue-sector', activity: { revenue: 5e6, factor: { value: 0.0002, unit: 'tCO2e/EUR', source: 'EXIOBASE', vintage: 2020 } } },
        scope2: { basis: 'revenue-sector', activity: { revenue: 5e6, factor: { value: 0.0001, unit: 'tCO2e/EUR', source: 'EXIOBASE', vintage: 2020 } } },
      },
    })),
    assessBusinessLoan(loan(0.1, { counterparty: { name: 'Strong', sector: 'Food' } })),
    assessBusinessLoan(loan(0.05, {
      counterparty: { name: 'A bank', sector: 'Finance', financialInstitution: true },
      denominator: { totalEquity: 6e5, totalDebt: 4e5, customerDeposits: 0, financialInstitution: true, asOf: '2020-12-31', currency: 'EUR' },
    })),
  ]);

  test('financial-sector borrowers are rolled up apart, as PCAF recommends', () => {
    const b = book();
    expect(b.financialSector.exposures).toBe(1);
    expect(b.financialSector.note).toMatch(/double count/);
    expect(b.excludingFinancialSector.exposures).toBe(2);
  });

  test('the disclosed score is weighted by outstanding amount and names its basis', () => {
    const dq = book().total.dataQuality.scope1And2;
    expect(dq.basis).toBe('outstanding amount');
    expect(dq.reference).toMatch(/p\.128/);
  });

  test('the plan is ordered by what each step is worth, not by how many rows it touches', () => {
    const plan = book().improvementPlan;
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps[0].option).toBe('3a');
    expect(plan.steps[0].movement).toBeGreaterThan(0);
    const weights = plan.steps.map(s => s.outstanding * (s.currentScore - plan.target));
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  test('a scenario score is never presented as the reported one', () => {
    const plan = book().improvementPlan;
    expect(plan.reportedScore.score).not.toBe(plan.steps[0].scenarioScore);
    expect(plan.scenarioNote).toMatch(/never printed as one/);
  });

  test('an empty book is refused rather than rendered as a position of zero', () => {
    expect(() => rollUp([])).toThrow(/not a position of zero/);
  });

  test('coverage without the whole book is absent with what it needs, not assumed complete', () => {
    expect(book().coverage.share).toBeNull();
    expect(book().coverage.reason).toMatch(/coverage cannot be stated/);
    expect(rollUp([assessBusinessLoan(loan(0.1))], { totalLoansAndInvestments: 1e6 }).coverage.share).toBe(0.1);
  });
});

describe('The held factor library, and the vintage of an economic factor', () => {
  const asOf = '2024-12-31';
  const held = (over = {}) => ({
    reportingYear: 2024, instrument: 'business-loan', borrowerListed: false,
    counterparty: { name: 'Ratnapura Rubber', sectorKey: 'manufacturing_rubber_plastics' },
    outstanding: { amount: 40e6, asOf, currency: 'LKR' },
    emissions: { scope1: { basis: 'assets-sector' }, scope2: { basis: 'assets-sector' }, scope3AbsentReason: 'none held' },
    ...over,
  });

  test('Option 3b with no factor supplied takes the held factor per unit of assets, and the result names the set', () => {
    const r = assessBusinessLoan(held());
    const row = require('../data/pcaf-parta/sector-factors.json').rows.manufacturing_rubber_plastics;
    expect(r.inventory.scope1.value).toBeCloseTo(40e6 * (row.scope1PerRevenue * row.assetTurnover) / 1e6, 6);
    expect(r.inventory.dataQuality.scope1And2.score).toBe(5);
    expect(r.factorRelease).toMatchObject({ rows: ['manufacturing_rubber_plastics'], checksum: expect.any(String) });
    expect(r.factorRelease.provisionalTables).toEqual(['sector-factors']);
    expect(r.inventory.scope1.inputs.factor.library.row).toBe('manufacturing_rubber_plastics');
    expect(r.inventory.scope1.assumptions.join(' ')).toMatch(/Provisional factor/);
  });

  test('Option 3c takes the per-revenue factor and the row’s asset turnover', () => {
    const r = assessBusinessLoan(held({
      emissions: { scope1: { basis: 'turnover-sector' }, scope2: { basis: 'turnover-sector' }, scope3AbsentReason: 'none held' },
    }));
    const row = require('../data/pcaf-parta/sector-factors.json').rows.manufacturing_rubber_plastics;
    expect(r.inventory.scope1.value).toBeCloseTo(40e6 * row.assetTurnover * (row.scope1PerRevenue / 1e6), 6);
    expect(r.inventory.scope1.assumptions.join(' ')).toMatch(/Asset turnover ratio .* taken from the held row/);
  });

  test('a factor supplied on the request stands, and the result names no held set', () => {
    const r = assessBusinessLoan(held({
      emissions: {
        scope1: { basis: 'assets-sector', activity: { factor: { value: 0.000001, unit: 'tCO2e/LKR', source: 'Bank', vintage: 2024 } } },
        scope2: { basis: 'assets-sector', activity: { factor: { value: 0.000001, unit: 'tCO2e/LKR', source: 'Bank', vintage: 2024 } } },
        scope3AbsentReason: 'none held',
      },
    }));
    expect(r.inventory.scope1.value).toBe(40);
    expect(r.factorRelease).toBeNull();
  });

  test('a sector that is not held is a refusal naming the two ways forward, never the nearest sector', () => {
    expect(() => assessBusinessLoan(held({ counterparty: { name: 'X', sector: 'Astrology' } })))
      .toThrow(expect.objectContaining({ code: 'FACTOR_REQUIRED', remedy: expect.stringMatching(/counterparty\.sectorKey/) }));
  });

  test('a factor held in LKR is not applied to an exposure in USD', () => {
    expect(() => assessBusinessLoan(held({ outstanding: { amount: 1e5, asOf, currency: 'USD' } })))
      .toThrow(/per unit of LKR and this exposure is in USD/);
  });

  test('a free-text sector mapped by name records the mapping on the trace', () => {
    const r = assessBusinessLoan(held({ counterparty: { name: 'X', sector: 'Rubber' } }));
    expect(r.inventory.scope1.assumptions.join(' ')).toMatch(/mapped to manufacturing_rubber_plastics .* by name/);
  });

  test('an economic factor four years old, applied without a deflator, is a finding; with a deflator it is not', () => {
    const own = vintage => ({
      scope1: { basis: 'assets-sector', activity: { factor: { value: 0.000001, unit: 'tCO2e/LKR', source: 'Bank', vintage } } },
      scope2: { basis: 'assets-sector', activity: { factor: { value: 0.000001, unit: 'tCO2e/LKR', source: 'Bank', vintage } } },
      scope3AbsentReason: 'none held',
    });
    const stale = assessBusinessLoan(held({ emissions: own(2020) }));
    const f = stale.validation.findings.filter(x => x.code === 'FACTOR_VINTAGE_STALE');
    expect(f).toHaveLength(2);
    expect(f[0].observed).toMatchObject({ vintage: 2020, ageYears: 4, thresholdYears: 3 });
    expect(f[0].reference).toMatch(/Box 6\.1-5/);
    expect(stale.inventory.scope1.value).toBe(40);

    const fresh = assessBusinessLoan(held({ emissions: own(2023) }));
    expect(fresh.validation.findings.map(x => x.code)).not.toContain('FACTOR_VINTAGE_STALE');

    const deflated = assessBusinessLoan(held({ emissions: own(2020), deflator: { ratio: 1.3, index: 'CCPI' } }));
    expect(deflated.validation.findings.map(x => x.code)).not.toContain('FACTOR_VINTAGE_STALE');

    const tighter = assessBusinessLoan(held({ emissions: own(2023), thresholds: { factorVintageYears: 1 } }));
    expect(tighter.validation.findings.map(x => x.code)).toContain('FACTOR_VINTAGE_STALE');
  });

  test('the intensity finding cites the band it was checked against', () => {
    const r = assessBusinessLoan(loan(0.1, {
      plausibility: { revenue: 1e6, sectorBand: { low: 5, high: 50, basis: 'the LK baseline, version 3' } },
    }));
    const f = r.validation.findings.find(x => x.code === 'INTENSITY_OUTSIDE_SECTOR_BAND');
    expect(f.reference).toMatch(/Band: the LK baseline, version 3/);
    expect(f.observed.band.basis).toBe('the LK baseline, version 3');
  });
});
