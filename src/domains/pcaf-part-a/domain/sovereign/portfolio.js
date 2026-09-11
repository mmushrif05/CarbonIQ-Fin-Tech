// @ts-check
/**
 * The §5.9 reporting-year position — the sovereign book rolled up.
 *
 * The rules that make a sovereign roll-up different from a business-loan one,
 * and each is a way a total could quietly say the wrong thing:
 *
 *   Scope 1 is summed on each LULUCF boundary separately and the two are never
 *   added together — they are the same emissions on two boundaries (§5.9,
 *   p.141). The including-LULUCF sum is partial where some sovereigns hold no
 *   including figure, and it says so with a held-count rather than reading as
 *   the whole book.
 *
 *   Scope 3 is summed apart from scope 1, never into it (a §5.9 should).
 *
 *   The disclosed data-quality score is weighted by OUTSTANDING amount (Part A
 *   p.128), the same function §5.2 uses and never Part C's premium weighting.
 *
 *   Coverage is assessed outstanding over the whole book (DCL p.124), or absent
 *   with what it needs — never a percentage of a book nobody stated.
 *
 * Every figure here is summed from what the register returned; nothing is
 * recomputed.
 */

'use strict';

const { weightedByOutstanding } = require('../data-quality');

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const r2 = (n) => +Number(n).toFixed(2);

/**
 * @param {any[]} rows   inflated exposures (see application/sovereign-register inflate)
 * @param {Object} [opts]
 * @param {number} [opts.totalLoansAndInvestments]
 * @param {string} [opts.currency]
 */
function rollUpSovereign(rows, opts = {}) {
  const { totalLoansAndInvestments, currency } = opts;

  const exclHeld = rows.filter(r => Number.isFinite(r.attributed.scope1Excl));
  const inclHeld = rows.filter(r => Number.isFinite(r.attributed.scope1Incl));
  const s2Held = rows.filter(r => Number.isFinite(r.attributed.scope2));
  const s3Held = rows.filter(r => Number.isFinite(r.attributed.scope3));

  const totals = {
    unit: 'tCO2e',
    financedScope1ExclLULUCF: r2(sum(exclHeld.map(r => r.attributed.scope1Excl))),
    financedScope1InclLULUCF: {
      value: inclHeld.length ? r2(sum(inclHeld.map(r => r.attributed.scope1Incl))) : null,
      heldCount: inclHeld.length,
      total: rows.length,
      note: inclHeld.length < rows.length
        ? 'Partial: the including-LULUCF figure is not held for every sovereign, so this sum covers '
          + `${inclHeld.length} of ${rows.length} holdings. It is never added to the excluding-LULUCF sum.`
        : 'Held for every sovereign; never added to the excluding-LULUCF sum.',
    },
    financedScope2: { value: s2Held.length ? r2(sum(s2Held.map(r => r.attributed.scope2))) : null, heldCount: s2Held.length },
    financedScope3: { value: s3Held.length ? r2(sum(s3Held.map(r => r.attributed.scope3))) : null, heldCount: s3Held.length },
    note: 'Scope 1 is reported on both LULUCF boundaries and the two are never summed; scope 3 is '
      + 'reported apart from scope 1 and never summed into it.',
    category: 'Scope 3 Category 15 (investments) of the reporting financial institution',
  };

  /* Disclosed score, weighted by outstanding amount (Part A p.128). */
  const dataQuality = {
    ...weightedByOutstanding(rows.map(r => ({ score: r.dqScore, outstanding: r.outstanding }))),
    scale: '1 is the highest data quality, 5 the lowest. A score is a category, never a mark out of five.',
  };

  const assessedOutstanding = r2(sum(rows.map(r => (Number.isFinite(r.outstanding) ? r.outstanding : 0))));
  const coverage = Number.isFinite(totalLoansAndInvestments) && Number(totalLoansAndInvestments) > 0
    ? {
        assessedOutstanding, totalLoansAndInvestments: Number(totalLoansAndInvestments), currency: currency || null,
        share: +((assessedOutstanding / Number(totalLoansAndInvestments)) * 100).toFixed(2),
        basis: 'assessed outstanding over total loans and investments (PCAF Disclosure Checklist Part A, p.124)',
      }
    : {
        assessedOutstanding, share: null,
        note: 'Coverage is reported absent rather than assumed: the reporting entity has not stated its total '
          + 'loans and investments for this year, and a percentage of a book nobody stated would be invented.',
      };

  /* Per-sovereign, so a reader sees which country carries the position. */
  const bySovereignMap = new Map();
  for (const r of rows) {
    const key = (r.country && r.country.code) || r.country && r.country.name || 'unknown';
    const g = bySovereignMap.get(key) || {
      country: (r.country && r.country.code) || null, name: (r.country && r.country.name) || null,
      exposures: 0, outstanding: 0, financedScope1ExclLULUCF: 0,
    };
    g.exposures += 1;
    g.outstanding += Number.isFinite(r.outstanding) ? r.outstanding : 0;
    g.financedScope1ExclLULUCF += Number.isFinite(r.attributed.scope1Excl) ? r.attributed.scope1Excl : 0;
    bySovereignMap.set(key, g);
  }
  const bySovereign = [...bySovereignMap.values()]
    .map(g => ({ ...g, outstanding: r2(g.outstanding), financedScope1ExclLULUCF: r2(g.financedScope1ExclLULUCF) }))
    .sort((a, b) => b.financedScope1ExclLULUCF - a.financedScope1ExclLULUCF);

  /* The improvement plan: every finding grouped by the sentence that clears it,
     material first. A score is a measurement; this is the task list. */
  const byCode = new Map();
  for (const r of rows) {
    for (const f of (r.findings || [])) {
      const g = byCode.get(f.code) || { code: f.code, severity: f.severity, remedy: f.remedy, reference: f.reference, count: 0, sovereigns: [] };
      g.count += 1;
      const label = (r.country && r.country.name) || (r.country && r.country.code) || r.exposureId;
      if (!g.sovereigns.includes(label)) g.sovereigns.push(label);
      byCode.set(f.code, g);
    }
  }
  const rank = { material: 0, advisory: 1 };
  const improvementPlan = [...byCode.values()]
    .sort((a, b) => (rank[a.severity] - rank[b.severity]) || (b.count - a.count));

  return {
    totals,
    dataQuality,
    coverage,
    bySovereign,
    improvementPlan,
    exposures: rows.length,
  };
}

module.exports = { rollUpSovereign };
