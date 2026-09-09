/**
 * PCAF Part A §5.1 — listed equity and corporate bonds.
 *
 * The acceptance tests reproduce the standard's own worked examples to the
 * figure: Table 5.1-4 (six reporting lines over three companies), Box 5.1-2
 * (why EVIC and not EV), Box 5.1-3 (the market-value adjustment factor) and
 * Box 6.1-6 (the outstanding-weighted score). The rest pin the footnotes that
 * would be wrong silently.
 */

'use strict';

const { assessListedEquity } = require('../src/domains/pcaf-part-a/domain/listed-equity');
const { classify } = require('../src/domains/pcaf-part-a/domain/listed-equity/classify');
const { evic, equityPlusDebt } = require('../src/domains/pcaf-part-a/domain/listed-equity/denominator');
const { deriveOptions } = require('../src/domains/pcaf-part-a/domain/listed-equity/options');
const { estimate } = require('../src/domains/pcaf-part-a/domain/listed-equity/estimate');
const { rollUp } = require('../src/domains/pcaf-part-a/domain/listed-equity/portfolio');
const intensity = require('../src/domains/pcaf-part-a/domain/listed-equity/intensity');
const { fluctuation } = require('../src/domains/pcaf-part-a/domain/listed-equity/fluctuation');
const dq = require('../src/domains/pcaf-part-a/domain/data-quality');

const AS_OF = '2020-12-31';

/** A listed-equity exposure with an attribution factor of exactly `af`. */
function holding(name, af, em, extra = {}) {
  return {
    instrument: 'listed-equity', issuerListed: true, onBalanceSheetAtYearEnd: true,
    reportingYear: 2020,
    counterparty: { name, naceL2: extra.nace || '99' },
    outstanding: { amount: af * 1000, basis: 'market-value', currency: 'USD', asOf: AS_OF },
    denominator: { marketCapOrdinary: 600, marketCapPreferred: 0, totalDebtInterestBearing: 400,
      totalDebtNonInterestBearing: 0, minorityInterests: 0, asOf: AS_OF, currency: 'USD' },
    emissions: {
      scope1: { value: em.s1, basis: 'reported-unverified', period: 2020 },
      scope2: { value: em.s2, basis: 'reported-unverified', period: 2020 },
      scope3: { value: em.s3, basis: 'reported-unverified', period: 2020 },
    },
    removals: em.removals, creditsRetired: em.retired, creditsGenerated: em.generated,
    ...extra,
  };
}

describe('Table 5.1-4 — the standard\'s own portfolio (pp.49–50)', () => {
  // Forestry 10%, Industrial 25%, Energy 20%; EVIC 1,000 so outstanding = af × 1,000.
  const forestry   = assessListedEquity(holding('Forestry company',   0.10, { s1: 1000,  s2: 100,  s3: 5000,  removals: 20000, retired: 0,     generated: 5000 }));
  const industrial = assessListedEquity(holding('Industrial company', 0.25, { s1: 20000, s2: 5000, s3: 30000, removals: 0,     retired: 25000, generated: 0 }));
  const energy     = assessListedEquity(holding('Energy company',     0.20, { s1: 5000,  s2: 0,    s3: 10000, removals: 1000,  retired: 5000,  generated: 500 }));
  const book = rollUp([forestry, industrial, energy]);

  test('attribution factors are exactly the example\'s', () => {
    expect(forestry.attribution.value).toBe(0.1);
    expect(industrial.attribution.value).toBe(0.25);
    expect(energy.attribution.value).toBe(0.2);
  });

  test('six lines reproduce to the figure, and none is added to another', () => {
    const L = book.total.lines;
    expect(L.scope1.value).toBe(6100);
    expect(L.scope2.value).toBe(1260);
    expect(L.scope3.value).toBe(10000);
    expect(L.removals.value).toBe(2200);
    expect(L.creditsRetired.value).toBe(7250);
    expect(L.creditsGenerated.value).toBe(600);
    expect(L.scope1And2.value).toBe(7360);
    // nothing netted: no key anywhere in the roll-up holds emissions minus removals
    expect(JSON.stringify(book)).not.toMatch(/"net"/);
  });

  test('scope 3 is scored apart from scope 1 and 2, weighted by outstanding', () => {
    expect(book.total.dataQuality.scope1And2.score).toBe(2);
    expect(book.total.dataQuality.scope3.score).toBe(2);
    expect(book.total.dataQuality.scope1And2.basis).toBe('outstanding amount');
  });
});

describe('Box 5.1-2 — EVIC, not enterprise value (p.43)', () => {
  test('equity 50, debt 50, cash 20: EVIC attributes exactly 100% across providers', () => {
    const v = evic({ marketCapOrdinary: 50, totalDebtInterestBearing: 50, asOf: AS_OF, currency: 'USD' });
    expect(v.value).toBe(100);
    expect(50 / v.value + 50 / v.value).toBe(1);
  });

  test('an attempt to deduct cash is refused with the box cited', () => {
    expect(() => evic({ marketCapOrdinary: 50, totalDebtInterestBearing: 50, cash: 20, asOf: AS_OF }))
      .toThrow(/no deduction for cash/i);
  });

  test('an element outside the definition cannot be added (footnote 46)', () => {
    try {
      evic({ marketCapOrdinary: 50, totalDebtInterestBearing: 50, deferredTax: 10, asOf: AS_OF });
      throw new Error('should have refused');
    } catch (e) { expect(e.code).toBe('EVIC_UNKNOWN_ELEMENT'); }
  });

  test('missing minorities and non-interest-bearing debt are omitted and recorded (fn 45, 46)', () => {
    const v = evic({ marketCapOrdinary: 800, totalDebtInterestBearing: 400, asOf: AS_OF, currency: 'USD' });
    expect(v.value).toBe(1200);
    expect(v.assumptions.join(' ')).toMatch(/footnote 45/);
    expect(v.assumptions.join(' ')).toMatch(/footnote 46/);
  });

  test('a financial-institution investee must include customer deposits (p.43)', () => {
    expect(() => evic({ marketCapOrdinary: 800, totalDebtInterestBearing: 400, financialInstitution: true, asOf: AS_OF }))
      .toThrow(/customer deposits/i);
    const v = evic({ marketCapOrdinary: 800, totalDebtInterestBearing: 400, financialInstitution: true, customerDeposits: 5000, asOf: AS_OF });
    expect(v.value).toBe(6200);
  });
});

describe('Bonds to private companies (p.42 and footnotes 42, 44)', () => {
  test('negative book equity is set to zero and everything attributes to debt', () => {
    const v = equityPlusDebt({ totalEquity: -30, totalDebt: 120, asOf: AS_OF });
    expect(v.value).toBe(120);
    expect(v.inputs.totalEquity).toBe(0);
    expect(v.assumptions.join(' ')).toMatch(/footnote 42/);
  });

  test('where equity or debt is unavailable, total assets is the recorded fallback', () => {
    const v = equityPlusDebt({ totalAssets: 500, asOf: AS_OF });
    expect(v.value).toBe(500);
    expect(v.basis).toMatch(/footnote 44/);
  });

  test('a private issuer\'s bond uses equity plus debt, a listed issuer\'s uses EVIC', () => {
    expect(classify({ instrument: 'corporate-bond', issuerListed: false }).denominatorKind).toBe('equity-plus-debt');
    expect(classify({ instrument: 'corporate-bond', issuerListed: true }).denominatorKind).toBe('evic');
  });
});

describe('The gate — what this class refuses (p.40, Figure 5-1)', () => {
  test.each([
    ['derivative', 'NOT_DEBT_OR_EQUITY'],
    ['swap', 'NOT_DEBT_OR_EQUITY'],
    ['loan', 'BUSINESS_LOAN'],
    ['private-equity', 'UNLISTED_EQUITY'],
  ])('%s → %s', (instrument, code) => {
    try { classify({ instrument }); throw new Error('should have refused'); }
    catch (e) { expect(e.code).toBe(code); }
  });

  test('held for sale and known use of proceeds are refused', () => {
    expect(() => classify({ instrument: 'listed-equity', heldForSale: true })).toThrow(/held for sale/i);
    expect(() => classify({ instrument: 'listed-equity', useOfProceedsKnown: true })).toThrow(/use of proceeds/i);
  });

  test('a fund is followed through only when its holdings are known', () => {
    expect(() => classify({ instrument: 'listed-equity', viaFund: { holdingsKnown: false } })).toThrow(/5\.7/);
    expect(classify({ instrument: 'listed-equity', viaFund: { holdingsKnown: true, fundWeight: 0.4 } }).viaFund.fundWeight).toBe(0.4);
  });
});

describe('Options are derived from the basis of the figure (Table 5.1-2, p.47)', () => {
  const rep = (basis, extra = {}) => ({ value: 10, basis, ...extra });

  test('the table is the standard\'s: 1a=1 1b=2 2a=2 2b=3 3a=4 3b=5 3c=5', () => {
    const expected = { '1a': 1, '1b': 2, '2a': 2, '2b': 3, '3a': 4, '3b': 5, '3c': 5 };
    for (const [o, s] of Object.entries(expected)) expect(dq.score('listed-equity-corporate-bonds', o).score).toBe(s);
  });

  test('a provider figure must say what the provider did; an estimate is not Option 1', () => {
    expect(() => deriveOptions({ scope1: rep('provider', { provider: 'Vendor A' }), scope2: rep('reported-unverified') }))
      .toThrow(/provider's method/i);
    const relayed = deriveOptions({ scope1: rep('provider', { providerMethod: 'relayed' }), scope2: rep('reported-unverified') });
    expect(relayed.scope12.option).toBe('1b');
    const est = deriveOptions({ scope1: rep('provider', { providerMethod: 'estimated-economic' }), scope2: rep('reported-unverified') });
    expect(est.scope12.option).toBe('3a');
  });

  test('verified means a named verifier; without one it is not score 1', () => {
    expect(() => deriveOptions({ scope1: rep('reported-verified'), scope2: rep('reported-verified') })).toThrow(/verifier/i);
    const ok = deriveOptions({ scope1: rep('reported-verified', { verifier: 'Auditor LLP' }), scope2: rep('reported-verified', { verifier: 'Auditor LLP' }) });
    expect(ok.scope12.option).toBe('1a');
  });

  test('Option 2a cannot reach scope 3 (footnote 53)', () => {
    try {
      deriveOptions({ scope1: rep('energy-activity'), scope2: rep('energy-activity'), scope3: rep('energy-activity') });
      throw new Error('should have refused');
    } catch (e) { expect(e.code).toBe('OPTION_NOT_APPLICABLE_TO_SCOPE'); }
  });

  test('scope 1 and 2 on different bases score on the weaker', () => {
    const o = deriveOptions({ scope1: rep('reported-unverified'), scope2: rep('revenue-sector') });
    expect(o.scope12.option).toBe('3a');
    expect(o.scope12.note).toMatch(/weaker/);
  });

  test('a claimed option better than the basis needs a justification', () => {
    const base = holding('X', 0.1, { s1: 1, s2: 1, s3: 1 });
    expect(() => assessListedEquity({ ...base, dataQualityClaims: { scope12: '1a' } })).toThrow(/justification/i);
  });
});

describe('Estimation runs Table 10.1-1 and nothing else (p.191)', () => {
  const f = (value, vintage) => ({ value, unit: 'tCO2e per unit', source: 'EEIO test table', vintage });

  test('2a adds process emissions before attribution (fn 204)', () => {
    const r = estimate({ option: '2a', scope: '1', activity: { energy: [{ source: 'grid', quantity: 100, factor: f(0.5) }], processEmissions_tCO2e: 7 } });
    expect(r.value).toBe(57);
  });

  test('3b and 3c produce an already-attributed figure and print no factor', () => {
    const b = estimate({ option: '3b', scope: '1', outstanding: 1000, activity: { factor: f(0.002) } });
    expect(b.value).toBe(2);
    expect(b.alreadyAttributed).toBe(true);
    const c = estimate({ option: '3c', scope: '1', outstanding: 1000, activity: { assetTurnoverRatio: 0.8, factor: f(0.002) } });
    expect(c.value).toBe(1.6);
    expect(c.assumptions.join(' ')).toMatch(/No attribution factor/);
  });

  test('a whole exposure on 3b carries no attribution factor at all (fn 41)', () => {
    const r = assessListedEquity({
      instrument: 'listed-equity', issuerListed: true, reportingYear: 2026,
      counterparty: { name: 'Unknown-value Co' },
      outstanding: { amount: 1000, basis: 'market-value', currency: 'USD', asOf: AS_OF },
      emissions: {
        scope1: { basis: 'assets-sector', activity: { factor: f(0.001) } },
        scope2: { basis: 'assets-sector', activity: { factor: f(0.0005) } },
        scope3AbsentReason: 'no sector scope 3 factor held',
      },
    });
    expect(r.attribution).toBeNull();
    expect(r.denominator).toBeNull();
    expect(r.inventory.scope1.value).toBe(1);
    expect(r.inventory.scope1And2.value).toBe(1.5);
    expect(r.inventory.dataQuality.scope1And2.score).toBe(5);
    expect(r.inventory.scope3.absent).toBe(true);
    expect(r.inventory.scope3.reason).toMatch(/no sector scope 3 factor held/);
  });

  test('3a with another indicator needs the reason and keeps the score (fn 55)', () => {
    expect(() => estimate({ option: '3a', scope: '1', activity: { indicator: 'total assets', indicatorValue: 100, factor: f(0.1) } })).toThrow(/indicatorReason/);
    const r = estimate({ option: '3a', scope: '1', activity: { indicator: 'total assets', indicatorValue: 100, indicatorReason: 'holding company; revenue is dividends', factor: f(0.1) } });
    expect(r.value).toBe(10);
  });

  test('an economic factor is inflated to the reporting year when an index is given, and the omission is recorded when not (Box 6.1-5)', () => {
    const with_ = estimate({ option: '3a', scope: '1', reportingYear: 2026, deflator: { ratio: 1.25, index: 'CPI' }, activity: { revenue: 1000, factor: f(0.1, 2019) } });
    expect(with_.value).toBe(80);
    expect(with_.assumptions.join(' ')).toMatch(/inflated from 2019 to 2026/);
    const without = estimate({ option: '3a', scope: '1', reportingYear: 2026, activity: { revenue: 1000, factor: f(0.1, 2019) } });
    expect(without.value).toBe(100);
    expect(without.assumptions.join(' ')).toMatch(/without an inflation adjustment/);
  });
});

describe('Numerator in line with denominator (p.41)', () => {
  test('a bond entered at market value is refused', () => {
    const h = holding('B', 0.1, { s1: 1, s2: 1, s3: 1 });
    h.instrument = 'corporate-bond';
    expect(() => assessListedEquity(h)).toThrow(/book value/i);
  });

  test('numerator and denominator on different dates are refused — the Sri Lanka March/December case', () => {
    const h = holding('C', 0.1, { s1: 1, s2: 1, s3: 1 });
    h.denominator.asOf = '2020-03-31';
    try { assessListedEquity(h); throw new Error('should have refused'); }
    catch (e) { expect(e.code).toBe('VALUATION_DATE_MISMATCH'); }
  });

  test('outstanding above EVIC is refused, not capped', () => {
    const h = holding('D', 1.5, { s1: 1, s2: 1, s3: 1 });
    try { assessListedEquity(h); throw new Error('should have refused'); }
    catch (e) { expect(e.code).toBe('ATTRIBUTION_ABOVE_ONE'); }
  });
});

describe('Box 5.1-3 — the market-value adjustment factor (pp.52–53)', () => {
  const base = [{ e: 60000, mc: 800, d: 400, w: 0.4 }, { e: 100000, mc: 600, d: 400, w: 0.3 }, { e: 120000, mc: 400, d: 400, w: 0.2 }, { e: 120000, mc: 200, d: 400, w: 0.1 }];
  const curr = [{ e: 60000, mc: 960, d: 400, w: 0.4 }, { e: 100000, mc: 720, d: 400, w: 0.3 }, { e: 120000, mc: 480, d: 400, w: 0.2 }, { e: 120000, mc: 240, d: 400, w: 0.1 }];
  // The box's "Weight" is the holding's share of AuM (outstanding_i ÷ AuM), so
  // with AuM = 1,000 M$ the outstanding is weight × 1,000. Then the printed
  // formula Σ(outstanding_i ÷ EVIC_i × emissions_i) ÷ AuM collapses to
  // Σ W_i × (emissions_i ÷ EVIC_i), which is how the table tabulates it.
  const AUM = 1000;
  const toHoldings = rows => rows.map(r => ({ outstanding: r.w * AUM, evic: r.mc + r.d, emissions: r.e }));

  test('ADJ = 0.896, adjusted base 89.6, adjusted current 100.9', () => {
    const ib = intensity.economicIntensity(toHoldings(base), AUM);
    const it = intensity.economicIntensity(toHoldings(curr), AUM);
    // weighted intensities in tCO2e per M$, as the box tabulates them
    expect(+ib.value.toFixed(1)).toBe(100);
    expect(+it.value.toFixed(0)).toBe(90);
    const adj = intensity.adjustmentFactor(base.map((b, i) => ({ weightT: b.w, evicBase: b.mc + b.d, evicCurrent: curr[i].mc + curr[i].d })));
    expect(+adj.value.toFixed(3)).toBe(0.896);
    const a = intensity.adjustedIntensities({ intensityBase: ib.value, intensityCurrent: it.value, adj: adj.value });
    expect(+a.backward.base.toFixed(1)).toBe(89.6);
    expect(+a.currentYear.current.toFixed(1)).toBe(100.9);
    // the two restatements agree on the decarbonisation, ~0.9%
    expect(Math.abs(a.backward.change - a.currentYear.change)).toBeLessThan(0.0005);
    expect(a.requirement).toMatch(/both the unadjusted and the adjusted/);
    expect(a.applicability).toMatch(/banks/);
  });
});

describe('Box 6.1-6 — the outstanding-weighted score (p.168)', () => {
  test('3.03 across the class, 3.53 for oil & gas', () => {
    const rows = [
      { score: 3, outstanding: 522425 }, { score: 5, outstanding: 187449 }, { score: 1, outstanding: 82778 },
      { score: 1, outstanding: 108997 }, { score: 2, outstanding: 67556 }, { score: 5, outstanding: 54762 }];
    expect(dq.weightedByOutstanding(rows).score).toBe(3.03);
    expect(dq.weightedByOutstanding(rows.slice(0, 2)).score).toBe(3.53);
  });
});

describe('The book (Chapter 6)', () => {
  const a = assessListedEquity(holding('A Bank PLC', 0.1, { s1: 100, s2: 10, s3: 1000 }, { counterparty: { name: 'A Bank PLC', naceL2: '64', financialInstitution: true }, denominator: { marketCapOrdinary: 600, totalDebtInterestBearing: 400, financialInstitution: true, customerDeposits: 0, minorityInterests: 0, totalDebtNonInterestBearing: 0, asOf: AS_OF, currency: 'USD' } }));
  const b = assessListedEquity(holding('B Cement PLC', 0.2, { s1: 5000, s2: 500, s3: 2000 }, { nace: '23' }));
  const book = rollUp([a, b], { totalLoansAndInvestments: 3000 });

  test('financial-sector investees are rolled up apart, and the total still holds both', () => {
    expect(book.financialSector.exposures).toBe(1);
    expect(book.excludingFinancialSector.exposures).toBe(1);
    expect(book.total.lines.scope1.value).toBe(+(100 * 0.1 + 5000 * 0.2).toFixed(2));
    expect(book.financialSector.note).toMatch(/double count/);
  });

  test('sector disaggregation and coverage', () => {
    expect(Object.keys(book.bySector).sort()).toEqual(['23', '64']);
    expect(book.coverage.share).toBe(+((100 + 200) / 3000).toFixed(4));
  });

  test('an empty book is refused, not a position of zero', () => {
    expect(() => rollUp([])).toThrow(/not a position of zero/);
  });

  test('fluctuation decomposes a change into outstanding, value and emissions', () => {
    const prev = [assessListedEquity(holding('Co', 0.1, { s1: 1000, s2: 0, s3: 0 }, { identifiers: { isin: 'LK0001' } }))];
    const nxt = holding('Co', 0.1, { s1: 1000, s2: 0, s3: 0 }, { identifiers: { isin: 'LK0001' } });
    nxt.denominator.marketCapOrdinary = 1600;             // EVIC 1,000 → 2,000: share halves
    const curr = [assessListedEquity(nxt)];
    const f = fluctuation(prev, curr);
    expect(f.previousTotal).toBe(100);
    expect(f.currentTotal).toBe(50);
    expect(f.effects.companyValue).toBe(-50);
    expect(f.effects.outstandingAmount).toBe(0);
    expect(f.effects.emissions).toBe(0);
    expect(f.limitations).toMatch(/market-price movement/);
  });
});
