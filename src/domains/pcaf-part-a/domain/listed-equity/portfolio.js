/**
 * The book: many exposures, rolled up the way Chapter 6 asks.
 *
 * Six lines summed per group and never across lines. The data-quality score
 * is weighted by OUTSTANDING AMOUNT (Box 6.1-6, p.168) — scope 1 and 2
 * together, scope 3 apart (p.167). Exposures in the financial sector are
 * rolled up separately because PCAF recommends it (p.41): the scope 3 of a
 * bank includes its own financed emissions, and a book that holds bank paper
 * counts those a second time.
 *
 * Two things this module refuses to do. It never averages the scores of the
 * groups it produces — the weighting runs once, over exposures, per group. And
 * it never prints an attribution factor for an exposure estimated under 3b or
 * 3c, because there is none (fn 41); such exposures are counted, scored 5, and
 * their factor column reads "none".
 */

'use strict';

const dataQuality = require('../data-quality');

const LINES = ['scope1', 'scope2', 'scope1And2', 'scope3', 'removals', 'creditsRetired', 'creditsGenerated'];

const val = line => (line && Number.isFinite(line.value) && !line.absent) ? line.value : null;

function sumLines(results) {
  const out = {};
  for (const k of LINES) {
    const present = results.map(r => val(r.inventory[k])).filter(v => v !== null);
    out[k] = {
      value: present.length ? +present.reduce((s, v) => s + v, 0).toFixed(2) : null,
      unit: 'tCO2e',
      counted: present.length,
      absent: results.length - present.length,
    };
  }
  return out;
}

function weighted(results, pick) {
  return dataQuality.weightedByOutstanding(results.map(r => ({
    score: pick(r), outstanding: r.exposure.outstanding.effective,
  })));
}

function group(results, label) {
  const providers = new Set();
  results.forEach(r => {
    ['scope1', 'scope2', 'scope3'].forEach(s => {
      const o = r.inventory.dataQuality.scope1And2[s] || (r.inventory.dataQuality.scope3 && r.inventory.dataQuality.scope3[s]);
      if (o && o.provider) providers.add(o.provider);
    });
  });
  return {
    label,
    exposures: results.length,
    outstanding: +results.reduce((s, r) => s + r.exposure.outstanding.effective, 0).toFixed(2),
    lines: sumLines(results),
    dataQuality: {
      scope1And2: weighted(results, r => r.inventory.dataQuality.scope1And2.score),
      scope3: weighted(results, r => (r.inventory.dataQuality.scope3 && !r.inventory.dataQuality.scope3.absent) ? r.inventory.dataQuality.scope3.score : null),
      note: 'Weighted by outstanding amount (Box 6.1-6, p.168). Scope 3 weighted separately from scope 1 and 2 (p.167). An exposure without a score is excluded, not counted as zero.',
    },
    withoutAttributionFactor: results.filter(r => !r.attribution).length,
    providers: [...providers],
    providerNote: providers.size > 1
      ? `${providers.size} emissions data providers in use. PCAF recommends the same provider across equity and bonds because of the variability of scope 1 and 2 figures between providers (p.47).`
      : null,
  };
}

/**
 * @param {Object[]} results  outputs of assessListedEquity
 * @param {Object} [opts]
 * @param {number} [opts.totalLoansAndInvestments]  the whole book, for coverage (DCL p.124)
 */
function rollUp(results, opts = {}) {
  if (!Array.isArray(results) || !results.length) {
    const err = new Error('A roll-up needs at least one assessed exposure. An empty book is not a position of zero.');
    err.statusCode = 409; err.code = 'EMPTY_BOOK';
    throw err;
  }

  const nonFin = results.filter(r => !r.financialSector);
  const fin = results.filter(r => r.financialSector);

  const bySector = {};
  for (const r of results) {
    const k = r.exposure.counterparty.naceL2 || 'unclassified';
    (bySector[k] = bySector[k] || []).push(r);
  }

  /* Combined share per counterparty, where the book holds both equity and a
     bond of the same company (Chapter 4, p.29: EVIC makes the shares sum to
     at most 100% across providers, and this is where a reader checks it). */
  const byCounterparty = {};
  for (const r of results) {
    const k = r.exposure.counterparty.name || 'unnamed';
    const c = (byCounterparty[k] = byCounterparty[k] || { exposures: 0, attributionShare: 0, instruments: [] });
    c.exposures += 1;
    c.instruments.push(r.exposure.instrument);
    if (r.attribution) c.attributionShare = +(c.attributionShare + r.attribution.value).toFixed(6);
  }

  const total = group(results, 'Listed equity and corporate bonds');
  const outstanding = total.outstanding;
  const coverage = Number.isFinite(Number(opts.totalLoansAndInvestments)) && Number(opts.totalLoansAndInvestments) > 0
    ? { share: +(outstanding / Number(opts.totalLoansAndInvestments)).toFixed(4), basis: 'outstanding amount assessed ÷ total loans and investments', reference: 'PCAF Disclosure Checklist Part A, p.124' }
    : { share: null, reason: 'Total loans and investments not supplied; coverage cannot be stated (DCL p.124).' };

  return {
    assetClass: 'listed-equity-corporate-bonds',
    total,
    excludingFinancialSector: group(nonFin, 'Excluding financial-sector investees'),
    financialSector: fin.length
      ? { ...group(fin, 'Financial-sector investees'), note: 'Reported separately, as PCAF recommends (§5.1, p.41): scope 3 of a financial institution includes its own financed emissions, so the double count is made visible rather than hidden in the total.' }
      : null,
    bySector: Object.fromEntries(Object.entries(bySector).map(([k, rs]) => [k, group(rs, k)])),
    byCounterparty,
    coverage,
    separation: 'Absolute emissions, emission removals and carbon credits are separate lines and are not netted (pp.49–50). Scope 3 is separate from scope 1 and 2 (p.40).',
  };
}

module.exports = { rollUp, LINES };
