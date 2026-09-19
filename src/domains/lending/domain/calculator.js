// @ts-check
/**
 * CarbonIQ FinTech — the lending screens' arithmetic, done here and nowhere else
 *
 * Three screens used to compute their own figures in the browser: the PCAF
 * calculator (attribution, financed emissions, economic intensity, a scope
 * split), the new-project wizard (a bill of materials priced on the factor
 * table, an intensity, an attribution, two taxonomy quick-checks on
 * thresholds it invented) and the monitoring page (a year-on-year comparison
 * and the PCAF fluctuation analysis). Every one of those formulas, and every
 * table they read, was published to any browser that loaded the page — the
 * shape of this product's reasoning, readable from the developer tools — and
 * a figure a screen computes for itself is one the engine never stood
 * behind. The screens render what this module returns and compute nothing.
 *
 * Every function here is pure: it reads its inputs, the shared constants and
 * nothing else, so the same request answers the same way on every store.
 */

'use strict';

const { PCAF_DATA_QUALITY } = require('../../../shared/constants');

/** @typedef {import('../../../shared/types').AppError} AppError */

/** A refusal the route can send as it is: a 400 with the sentence the screen shows. */
function refuse(message) {
  return Object.assign(/** @type {AppError} */ (new Error(message)), { statusCode: 400, code: 'INVALID_INPUT' });
}

function round(n, dp = 1) {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/* ── The attribution calculator ─────────────────────────────────────────── */

/**
 * The indicative scope profile by phase and building type.
 *
 * This is **not a measured inventory** and is not printed on any disclosure:
 * it is the calculator's illustration of how a financed figure would fall
 * across the three scopes for a building of this type at this phase, and the
 * response says so beside it. Construction is dominated by scope 3 because
 * the embodied carbon of the materials is a supplier's emission, not the
 * borrower's own.
 */
const SCOPE_PROFILES = Object.freeze({
  Construction: Object.freeze({ s1: 0.08, s2: 0.14, s3: 0.78 }),
  Operational: Object.freeze({
    Commercial:     Object.freeze({ s1: 0.08, s2: 0.42, s3: 0.50 }),
    Residential:    Object.freeze({ s1: 0.15, s2: 0.35, s3: 0.50 }),
    Industrial:     Object.freeze({ s1: 0.35, s2: 0.40, s3: 0.25 }),
    Infrastructure: Object.freeze({ s1: 0.20, s2: 0.30, s3: 0.50 }),
    'Mixed-Use':    Object.freeze({ s1: 0.10, s2: 0.40, s3: 0.50 }),
  }),
});

const SCOPE_PROFILE_NOTE = 'An indicative allocation by project phase and building type, '
  + 'not a measured inventory: the three lines illustrate where a financed figure of this kind '
  + 'typically falls and are not reported on any disclosure.';

function scopeProfile(phase, type) {
  if (phase === 'Construction') return { key: 'Construction', split: SCOPE_PROFILES.Construction };
  const split = SCOPE_PROFILES.Operational[type] || SCOPE_PROFILES.Operational.Commercial;
  return { key: `Operational / ${SCOPE_PROFILES.Operational[type] ? type : 'Commercial'}`, split };
}

/**
 * PCAF attribution for one facility: outstanding over the project's equity
 * plus debt, capped at one, applied to the project's emissions.
 *
 * @param {{outstanding: number, equity: number, debt: number, emissions_tCO2e: number,
 *          projectPhase?: string, projectType?: string, dqScore?: number|string}} input
 */
function attribute(input) {
  const outstanding = Number(input.outstanding);
  const equity = Number(input.equity);
  const debt = Number(input.debt);
  const emissions = Number(input.emissions_tCO2e);
  if (!(outstanding > 0)) throw refuse('Outstanding amount must be greater than 0.');
  if (equity < 0 || debt < 0) throw refuse('Equity and debt cannot be negative.');
  if (!(emissions > 0)) throw refuse('Project emissions must be greater than 0.');
  const totalValue = equity + debt;
  if (!(totalValue > 0)) throw refuse('Total project value (Equity + Debt) must be greater than 0.');

  const attribution = Math.min(1, outstanding / totalValue);
  const financed = round(attribution * emissions, 1);
  const economicIntensity = round(financed / (outstanding / 1e6), 1);

  const phase = String(input.projectPhase || 'Operational');
  const type = String(input.projectType || 'Commercial');
  const profile = scopeProfile(phase, type);
  const s1 = round(financed * profile.split.s1, 1);
  const s2 = round(financed * profile.split.s2, 1);
  const s3 = round(financed * profile.split.s3, 1);
  const largest = Math.max(s1, s2, s3, 1);
  const bar = v => Math.round((v / largest) * 100);

  const dq = Number(input.dqScore);
  const dqScore = Number.isInteger(dq) && dq >= 1 && dq <= 5 ? dq : null;

  return {
    attribution: round(attribution, 3),
    capped: outstanding / totalValue > 1,
    outstanding, equity, debt, totalValue,
    emissions_tCO2e: emissions,
    financedEmissions_tCO2e: financed,
    economicIntensity_tCO2e_per_M: economicIntensity,
    scopes: {
      basis: 'indicative',
      profile: profile.key,
      note: SCOPE_PROFILE_NOTE,
      s1: { value_tCO2e: s1, barPct: bar(s1) },
      s2: { value_tCO2e: s2, barPct: bar(s2) },
      s3: { value_tCO2e: s3, barPct: bar(s3) },
    },
    dataQuality: dqScore ? { score: dqScore, label: PCAF_DATA_QUALITY[dqScore].label } : null,
    equation: 'attribution = min(1, outstanding ÷ (equity + debt)); financed = attribution × project emissions',
  };
}

/* ── The new-project estimate ───────────────────────────────────────────── */

/**
 * A bill of materials priced on the factor table, with the figures the
 * review step shows.
 *
 * A line whose category the table does not hold is **unpriced** — null, not
 * zero — and the count of what was left out travels with the total, because
 * a total drawn from six of nine lines means something different from one
 * drawn from all nine.
 *
 * @param {{materials: Array<{name?: string, category?: string, qty?: number, unit?: string}>,
 *          floorArea_m2?: number, loan?: {outstanding?: number, equity?: number, debt?: number}}} input
 * @param {Record<string, {factor: number, unit?: string, source?: string}>} factors
 */
function estimate(input, factors) {
  const materials = Array.isArray(input.materials) ? input.materials : [];
  const lines = materials.map((m, i) => {
    const category = String(m.category || '').toLowerCase();
    const row = factors[category];
    const factor = row && typeof row.factor === 'number' ? row.factor : null;
    const qty = Number(m.qty);
    const unit = m.unit === 'tonnes' ? 'tonnes' : 'kg';
    const qty_kg = Number.isFinite(qty) && qty >= 0 ? (unit === 'tonnes' ? qty * 1000 : qty) : null;
    const kgCO2e = factor === null || qty_kg === null ? null : round(qty_kg * factor, 1);
    return {
      index: i, name: String(m.name || ''), category, qty: Number.isFinite(qty) ? qty : null, unit,
      factor, factorSource: row && row.source ? row.source : null, kgCO2e,
    };
  });
  const priced = lines.filter(l => l.kgCO2e !== null);
  const totalKgCO2e = round(priced.reduce((s, l) => s + /** @type {number} */ (l.kgCO2e), 0), 1);
  const unpricedCount = lines.length - priced.length;
  const area = Number(input.floorArea_m2);
  const intensity = area > 0 ? round(totalKgCO2e / area, 1) : null;

  const loan = input.loan || {};
  const outstanding = Number(loan.outstanding);
  const denominator = Number(loan.equity) + Number(loan.debt);
  const attribution = outstanding > 0 && denominator > 0 ? Math.min(1, outstanding / denominator) : null;
  const totalTCO2e = round(totalKgCO2e / 1000, 3);
  const financed = attribution === null ? null : Math.round(totalTCO2e * attribution);

  return {
    lines,
    totals: {
      totalKgCO2e, totalTCO2e, pricedLines: priced.length, unpricedCount,
      intensity_kgCO2e_m2: intensity, floorArea_m2: area > 0 ? area : null,
    },
    attribution: attribution === null ? null : {
      factor: round(attribution, 3), outstanding, denominator, financedEmissions_tCO2e: financed,
    },
  };
}

/* ── Monitoring: the series and the comparison ──────────────────────────── */

/**
 * Every entry with its attribution and financed figure, the bar lengths for
 * the timeline, and the comparison of the latest year against the one before
 * — emissions movement, the data-quality trend and the PCAF fluctuation
 * analysis, which separates what moved because the bank's share moved from
 * what moved because the project's emissions did.
 *
 * @param {Array<{year: number, outstanding: number, equity: number, debt: number,
 *                emissions: number, dq?: number, attribution?: number, financed?: number}>} rows
 */
function monitoringSeries(rows) {
  const sorted = [...rows].filter(r => r && Number.isFinite(Number(r.year)))
    .sort((a, b) => Number(a.year) - Number(b.year));
  const entries = sorted.map(r => {
    const denominator = Number(r.equity) + Number(r.debt);
    const attribution = Number.isFinite(Number(r.attribution)) && r.attribution != null
      ? Number(r.attribution)
      : denominator > 0 ? Number(r.outstanding) / denominator : 0;
    const financed = Number.isFinite(Number(r.financed)) && r.financed != null
      ? Number(r.financed)
      : Math.round(Number(r.emissions) * attribution);
    return {
      year: Number(r.year), outstanding: Number(r.outstanding), equity: Number(r.equity), debt: Number(r.debt),
      totalValue: denominator, emissions: Number(r.emissions), dq: r.dq == null ? null : Number(r.dq),
      attribution: round(attribution, 4), financed, current: false, timelineBarPct: 0,
    };
  });
  if (entries.length) entries[entries.length - 1].current = true;
  const maxAttr = Math.max(0, ...entries.map(e => e.attribution));
  for (const e of entries) e.timelineBarPct = maxAttr > 0 ? Math.round((e.attribution / maxAttr) * 100) : 0;

  let comparison = null;
  if (entries.length >= 2) {
    const cur = entries[entries.length - 1];
    const prev = entries[entries.length - 2];
    const emissionsChangePct = prev.financed > 0 ? round(((cur.financed - prev.financed) / prev.financed) * 100, 1) : null;
    const attributionEffect = Math.round((cur.attribution - prev.attribution) * prev.emissions);
    const emissionsEffect = Math.round((cur.emissions - prev.emissions) * cur.attribution);
    comparison = {
      currentYear: cur.year, previousYear: prev.year,
      financed: { current: cur.financed, previous: prev.financed, changePct: emissionsChangePct },
      dataQuality: {
        current: cur.dq, previous: prev.dq,
        trend: cur.dq == null || prev.dq == null ? 'not scored' : cur.dq < prev.dq ? 'improving' : cur.dq > prev.dq ? 'weakening' : 'stable',
        years: entries.length,
      },
      fluctuation: {
        attributionEffect_tCO2e: attributionEffect,
        emissionsEffect_tCO2e: emissionsEffect,
        net_tCO2e: attributionEffect + emissionsEffect,
        note: 'The movement in the financed figure split into what moved because the bank\'s share '
          + 'moved and what moved because the project\'s emissions did (PCAF Part A, fluctuation analysis).',
      },
    };
  }
  return { entries, comparison };
}

module.exports = { attribute, estimate, monitoringSeries, SCOPE_PROFILES, SCOPE_PROFILE_NOTE };
