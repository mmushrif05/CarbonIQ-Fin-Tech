/**
 * The pipeline ranking: normalisation, the two-axis score, and the type split.
 */

'use strict';

const { round, sum } = require('./capital-math');
const { clamp01 } = require('./capital-math');

/**
 * Min-max across the candidates, so two quantities in different units can be
 * compared. Where every candidate is equal the spread is zero and normalising
 * would divide by it — they all score 0.5, which is the honest answer: this
 * measure does not separate them.
 */
function _normalise(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return values.map(() => null);
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  if (hi === lo) return values.map(v => (Number.isFinite(v) ? 0.5 : null));
  return values.map(v => (Number.isFinite(v) ? clamp01((v - lo) / (hi - lo)) : null));
}

/**
 * Rank what is waiting.
 *
 * @param {object} book
 * @param {number} carbonWeight 0..1 — 1 ranks on carbon alone, 0 on return
 *   alone, 0.5 weighs them equally. Whatever is passed is echoed in the
 *   result and printed beside the rank on screen.
 */
function pipeline(book, { carbonWeight = 0.5 } = {}) {
  const w = clamp01(Number.isFinite(Number(carbonWeight)) ? Number(carbonWeight) : 0.5);
  const waiting = book.investments.filter(i => i.status === 'pipeline');

  /* Carbon impact per unit of capital, so a large project does not outrank a
     more efficient one simply by being large. Reduction and avoidance are
     added here because both are impact a lender can claim to have helped
     bring about — but this is a selection score, not an inventory figure, and
     nothing derived from it reaches the emissions ledger. */
  const impactPerMillion = waiting.map((i) => {
    const e = i.emissions || {};
    const capital = Number(i.commitment) || 0;
    const benefit = (Number(e.reduction_tCO2e) || 0) + (Number(e.avoided_tCO2e) || 0);
    if (capital <= 0) return NaN;
    return benefit / (capital / 1e6);
  });

  const returns = waiting.map(i =>
    (i.expectedReturnPct === null || i.expectedReturnPct === undefined)
      ? NaN
      : Number(i.expectedReturnPct));

  const nImpact = _normalise(impactPerMillion);
  const nReturn = _normalise(returns);

  const rows = waiting.map((i, k) => {
    const e = i.emissions || {};
    const scorable = nImpact[k] !== null && nReturn[k] !== null;
    const missing = [];
    if (nImpact[k] === null) missing.push('carbon impact per unit of capital');
    if (nReturn[k] === null) missing.push('expected return');

    return {
      id: i.id,
      name: i.name,
      portfolioId: i.portfolioId,
      sector: i.sector,
      assetType: i.assetType,
      country: i.country,
      taxonomy: i.taxonomy,
      commitment: round(Number(i.commitment) || 0),
      expectedReturnPct: i.expectedReturnPct === null || i.expectedReturnPct === undefined
        ? null : round(Number(i.expectedReturnPct), 2),
      tenorYears: i.tenorYears ?? null,

      /* What this one would add to the book if it were written. Named as a
         contribution, because until it is committed it is not in any total. */
      financedEmissionContribution_tCO2e: round(
        (Number(e.incurred_tCO2e) || 0) + (Number(e.forward_tCO2e) || 0)),
      reduction_tCO2e: round(Number(e.reduction_tCO2e) || 0),
      avoided_tCO2e: round(Number(e.avoided_tCO2e) || 0),
      impact_tCO2e_perMillion: Number.isFinite(impactPerMillion[k])
        ? round(impactPerMillion[k], 1) : null,

      carbonScore: nImpact[k] === null ? null : round(nImpact[k], 3),
      financeScore: nReturn[k] === null ? null : round(nReturn[k], 3),
      score: scorable ? round(w * nImpact[k] + (1 - w) * nReturn[k], 3) : null,
      rankable: scorable,
      missing,
      dataQuality: e.dataQuality || null,
    };
  });

  const ranked = rows.filter(r => r.rankable).sort((a, b) => b.score - a.score);
  ranked.forEach((r, idx) => { r.rank = idx + 1; });
  const unrankable = rows.filter(r => !r.rankable);

  return {
    carbonWeight: round(w, 2),
    weightingNote: `Ranked on ${Math.round(w * 100)}% carbon impact and `
      + `${Math.round((1 - w) * 100)}% expected return. Both are min-max normalised across the `
      + `${rows.length} project${rows.length === 1 ? '' : 's'} waiting, so the scores compare `
      + `these candidates with each other and mean nothing on their own.`,
    count: rows.length,
    totalRequested: round(sum(rows, r => r.commitment)),
    totalContribution_tCO2e: round(sum(rows, r => r.financedEmissionContribution_tCO2e)),
    ranked,
    unrankable,
    unrankableNote: unrankable.length
      ? `${unrankable.length} project${unrankable.length === 1 ? ' is' : 's are'} not ranked because `
        + `something needed to score ${unrankable.length === 1 ? 'it' : 'them'} is missing. `
        + `They are listed unscored rather than placed last, because absent evidence is not low impact.`
      : null,
    byType: _byType(rows),
  };
}

/** What kind of thing is waiting, and how much it would cost to write. */
function _byType(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.sector || 'Unclassified';
    const cur = map.get(key) || { sector: key, count: 0, commitment: 0, contribution_tCO2e: 0 };
    cur.count += 1;
    cur.commitment += r.commitment;
    cur.contribution_tCO2e += r.financedEmissionContribution_tCO2e;
    map.set(key, cur);
  }
  return [...map.values()]
    .map(r => ({ ...r, commitment: round(r.commitment), contribution_tCO2e: round(r.contribution_tCO2e) }))
    .sort((a, b) => b.commitment - a.commitment);
}

module.exports = { _normalise, pipeline, _byType };
