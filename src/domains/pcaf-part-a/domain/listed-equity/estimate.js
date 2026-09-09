/**
 * The investee's emissions, where they have to be estimated.
 *
 * Annex Table 10.1-1 (p.191) gives one equation per option, and this module
 * runs exactly those and nothing else:
 *
 *   2a  Σ energy × factor  + process emissions        (process added BEFORE attribution, fn 204)
 *   2b  production × factor
 *   3a  revenue_c × (GHG_s ÷ revenue_s)                (another indicator permitted, fn 55)
 *   3b  outstanding × (GHG_s ÷ assets_s)               no attribution factor (fn 41)
 *   3c  outstanding × turnover_s × (GHG_s ÷ revenue_s) no attribution factor (fn 41)
 *
 * 3b and 3c return a figure that is already the institution's — the
 * outstanding amount is in the equation — and say so, so the attribution step
 * knows not to apply a factor twice.
 *
 * Economic factors carry a vintage. Box 6.1-5 (p.167) recommends inflating
 * score-4 and score-5 factors to the reporting year; a 2019 tCO2e-per-dollar
 * factor on 2026 revenue understates emissions by the inflation between them.
 * Where a deflator is supplied it is applied and both figures are printed;
 * where it is not, the omission is a recorded assumption, because the
 * recommendation is a "should" and silence would look like compliance.
 */

'use strict';

const { traced } = require('../provenance');

const REF = 'PCAF Part A Third Edition Annex Table 10.1-1 (p.191)';

function refuse(code, message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

const pos = (v, what, code) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw refuse(code, `${what} must be a number of zero or more.`);
  return n;
};

function describeFactor(f, what) {
  if (!f || !Number.isFinite(Number(f.value))) {
    throw refuse('FACTOR_REQUIRED', `${what} needs an emission factor with a value, its unit, source and vintage.`);
  }
  if (!f.source) throw refuse('FACTOR_SOURCE_REQUIRED', `${what}: name the factor's source. A factor without a publisher cannot be cited.`);
  return { value: Number(f.value), unit: f.unit || null, source: f.source, vintage: f.vintage || null, region: f.region || null, tier: f.tier || null };
}

/**
 * Box 6.1-5 inflation of an economic factor from its vintage to the
 * reporting year. The factor is per unit of currency of its vintage year;
 * dividing by the price-level ratio restates it per unit of reporting-year
 * currency.
 */
function inflate(factor, { reportingYear, deflator }) {
  const assumptions = [];
  if (!factor.vintage || !reportingYear || factor.vintage >= reportingYear) {
    return { value: factor.value, applied: false, assumptions };
  }
  if (!deflator || !Number.isFinite(Number(deflator.ratio)) || Number(deflator.ratio) <= 0) {
    assumptions.push(`Economic emission factor is of vintage ${factor.vintage} and applied to ${reportingYear} `
      + 'figures without an inflation adjustment. PCAF recommends inflating score 4 and 5 factors '
      + '(Box 6.1-5, p.167); no index was supplied, so the estimate is understated by the inflation between the two years.');
    return { value: factor.value, applied: false, assumptions };
  }
  const adjusted = factor.value / Number(deflator.ratio);
  assumptions.push(`Economic emission factor inflated from ${factor.vintage} to ${reportingYear} using `
    + `${deflator.index || 'the supplied index'} (price level ratio ${Number(deflator.ratio).toFixed(4)}), `
    + `${factor.value} → ${adjusted.toFixed(6)} per unit of ${reportingYear} currency (Box 6.1-5).`);
  return { value: adjusted, applied: true, ratio: Number(deflator.ratio), index: deflator.index || null, assumptions };
}

/**
 * @param {Object} p
 * @param {string} p.option           '2a' | '2b' | '3a' | '3b' | '3c'
 * @param {'1'|'2'|'3'} p.scope
 * @param {Object} p.activity         the inputs for the option
 * @param {number} [p.outstanding]    needed by 3b and 3c
 * @param {number} [p.reportingYear]
 * @param {Object} [p.deflator]       { ratio, index }
 */
function estimate({ option, scope, activity = {}, outstanding, reportingYear, deflator }) {
  const label = `scope ${scope}`;

  switch (option) {
    case '2a': {
      const rows = Array.isArray(activity.energy) ? activity.energy : [];
      if (!rows.length) throw refuse('ENERGY_ROWS_REQUIRED', `Option 2a for ${label} needs energy consumption by source (e.g. MWh of electricity, GJ of gas).`);
      const parts = rows.map((r, i) => {
        const q = pos(r.quantity, `energy row ${i + 1} quantity`, 'ENERGY_QUANTITY_INVALID');
        const f = describeFactor(r.factor, `energy row ${i + 1} (${r.source || 'unnamed'})`);
        return { source: r.source || null, quantity: q, unit: r.unit || null, factor: f, tCO2e: q * f.value };
      });
      const energy = parts.reduce((s, x) => s + x.tCO2e, 0);
      /* fn 204 — process emissions join the total before the factor is applied. */
      const process = activity.processEmissions_tCO2e === undefined ? 0
        : pos(activity.processEmissions_tCO2e, 'process emissions', 'PROCESS_INVALID');
      const assumptions = [];
      if (activity.processEmissions_tCO2e === undefined) {
        assumptions.push('No process emissions declared; taken as 0. Option 2a requires relevant process emissions to be added (Table 5.1-2).');
      }
      return traced({
        value: +(energy + process).toFixed(3),
        unit: 'tCO2e',
        equation: 'company emissions = Σ (energy consumption × emission factor) + process emissions',
        inputs: { energy: parts, processEmissions_tCO2e: process },
        basis: 'Estimated from primary energy-consumption data (Option 2a)',
        reference: REF,
        assumptions,
      });
    }

    case '2b': {
      const q = pos(activity.production, `${label} production quantity`, 'PRODUCTION_REQUIRED');
      const f = describeFactor(activity.factor, `${label} production factor`);
      return traced({
        value: +(q * f.value).toFixed(3),
        unit: 'tCO2e',
        equation: 'company emissions = production × emission factor',
        inputs: { production: q, productionUnit: activity.unit || null, factor: f },
        basis: 'Estimated from primary production data (Option 2b)',
        reference: REF,
      });
    }

    case '3a': {
      /* fn 55 — revenue may be replaced by another indicator, named. */
      const indicator = activity.indicator || 'revenue';
      const amount = pos(activity.revenue !== undefined ? activity.revenue : activity.indicatorValue,
        `${label} ${indicator}`, 'REVENUE_REQUIRED');
      const f = describeFactor(activity.factor, `${label} sector intensity per unit of ${indicator}`);
      const inf = inflate(f, { reportingYear, deflator });
      const assumptions = [...inf.assumptions];
      if (indicator !== 'revenue') {
        if (!activity.indicatorReason) {
          throw refuse('INDICATOR_REASON_REQUIRED',
            `Option 3a uses ${indicator} in place of revenue. Footnote 55 permits another indicator where revenue is `
            + 'unsuitable, provided the reasoning is made transparent. State indicatorReason.');
        }
        assumptions.push(`${indicator} used in place of revenue as the financial indicator: ${activity.indicatorReason} (footnote 55). The data quality score is unaffected.`);
      }
      return traced({
        value: +(amount * inf.value).toFixed(3),
        unit: 'tCO2e',
        equation: `company emissions = ${indicator} × (sector GHG emissions ÷ sector ${indicator})`,
        inputs: { [indicator]: amount, currency: activity.currency || null, factor: f, factorApplied: inf.value, inflation: inf.applied ? { ratio: inf.ratio, index: inf.index } : null },
        basis: `Estimated from the company's ${indicator} and a sector-average intensity (Option 3a)`,
        reference: REF,
        assumptions,
      });
    }

    case '3b': {
      const o = pos(outstanding, 'outstanding amount', 'OUTSTANDING_REQUIRED');
      const f = describeFactor(activity.factor, `${label} sector intensity per unit of assets`);
      const inf = inflate(f, { reportingYear, deflator });
      return Object.assign(traced({
        value: +(o * inf.value).toFixed(3),
        unit: 'tCO2e',
        equation: 'financed emissions = outstanding amount × (sector GHG emissions ÷ sector assets)',
        inputs: { outstanding: o, factor: f, factorApplied: inf.value, inflation: inf.applied ? { ratio: inf.ratio, index: inf.index } : null },
        basis: 'Rough estimate from the outstanding amount and a sector asset intensity (Option 3b)',
        reference: REF + '; footnote 41',
        assumptions: [...inf.assumptions,
          'No attribution factor: EVIC or total equity plus debt is not known, so the outstanding amount is '
          + 'multiplied directly by a sector-average intensity (footnote 41).'],
      }), { alreadyAttributed: true });
    }

    case '3c': {
      const o = pos(outstanding, 'outstanding amount', 'OUTSTANDING_REQUIRED');
      const t = pos(activity.assetTurnoverRatio, 'sector asset turnover ratio', 'TURNOVER_REQUIRED');
      const f = describeFactor(activity.factor, `${label} sector intensity per unit of revenue`);
      const inf = inflate(f, { reportingYear, deflator });
      return Object.assign(traced({
        value: +(o * t * inf.value).toFixed(3),
        unit: 'tCO2e',
        equation: 'financed emissions = outstanding amount × asset turnover ratio × (sector GHG emissions ÷ sector revenue)',
        inputs: { outstanding: o, assetTurnoverRatio: t, factor: f, factorApplied: inf.value, inflation: inf.applied ? { ratio: inf.ratio, index: inf.index } : null },
        basis: 'Rough estimate from the outstanding amount, a sector turnover ratio and a sector revenue intensity (Option 3c)',
        reference: REF + '; footnote 41',
        assumptions: [...inf.assumptions,
          'No attribution factor: EVIC or total equity plus debt is not known (footnote 41).'],
      }), { alreadyAttributed: true });
    }

    default:
      throw refuse('OPTION_NOT_ESTIMABLE', `Option ${option} is a reported-emissions option; nothing is estimated.`);
  }
}

module.exports = { estimate, inflate };
