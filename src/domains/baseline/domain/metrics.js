// @ts-check
/**
 * The metrics a baseline can govern — a closed vocabulary.
 *
 * A baseline is only worth something if everybody quoting it means the same
 * thing by it, so the metric decides the shape of the values, the unit, and
 * what in the product actually reads it. A metric nobody reads is declared
 * here as **provisioned** and says so, rather than being invented into the
 * seed with numbers no one can defend.
 *
 * The rule that governs the whole registry: *where a published standard sets
 * the figure, the standard's value wins and this holds only the citation;
 * where no standard sets one, the figure is regional judgement and this is
 * where it lives.* PCAF sets the method and does not set Sri Lanka's
 * baseline; that is what makes the second kind worth maintaining.
 */

'use strict';

/**
 * @typedef {Object} MetricDefinition
 * @property {string} key
 * @property {string} label
 * @property {string} unit
 * @property {string[]} fields the value keys a baseline for this metric carries
 * @property {'bands'|'single'} shape
 * @property {string} governs what reads it — or that nothing does yet
 * @property {boolean} wired whether the product reads it today
 * @property {string} [direction] for bands: whether lower is better
 */

/** @type {Record<string, MetricDefinition>} */
const METRICS = Object.freeze({
  construction_intensity_kgCO2e_m2: {
    key: 'construction_intensity_kgCO2e_m2',
    label: 'Construction carbon intensity screen',
    unit: 'kgCO2e/m²',
    shape: 'bands',
    fields: ['green', 'transition'],
    direction: 'lower_is_better',
    governs: 'The green / transition / not-aligned band on GET /v1/taxonomy and the '
      + 'tier printed on a Green Loan Certificate.',
    wired: true,
  },

  embodied_carbon_benchmark_kgCO2e_m2: {
    key: 'embodied_carbon_benchmark_kgCO2e_m2',
    label: 'Embodied carbon benchmark',
    unit: 'kgCO2e/m²',
    shape: 'single',
    fields: ['value'],
    direction: 'lower_is_better',
    governs: 'A typical figure for the building type, against which a project is read. '
      + 'Nothing reads it yet: the Part C benchmark library is built from an '
      + "organisation's own locked assessments, which is a stronger figure than any "
      + 'default would be.',
    wired: false,
  },

  grid_emission_factor_kgCO2e_kWh: {
    key: 'grid_emission_factor_kgCO2e_kWh',
    label: 'Grid emission factor',
    unit: 'kgCO2e/kWh',
    shape: 'single',
    fields: ['value'],
    governs: 'Site electricity in A5.2, and any figure converting kWh to carbon. '
      + 'Today that comes from the factor tables under data/factors, each row '
      + 'carrying its own tier and named source; a released baseline would '
      + 'override the grid row for a country.',
    wired: false,
  },

  data_quality_target_score: {
    key: 'data_quality_target_score',
    label: 'PCAF data-quality ambition',
    unit: 'PCAF score (1 is the highest quality, 5 the lowest)',
    shape: 'single',
    fields: ['value'],
    direction: 'lower_is_better',
    governs: 'The score an organisation has committed to reach across its book. '
      + 'Reported beside the disclosed premium-weighted score as a target, never '
      + 'blended into it.',
    wired: false,
  },
});

const KEYS = Object.freeze(Object.keys(METRICS));

/** @param {string} key */
function metric(key) {
  return METRICS[key] || null;
}

/**
 * Whether `values` is the shape this metric requires, and why not where it is
 * not. A band set must also be ordered: a green threshold above the
 * transition threshold is not a stricter screen, it is an unreadable one.
 *
 * @param {string} key
 * @param {Record<string, any>} values
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
function validateValues(key, values) {
  const def = METRICS[key];
  if (!def) return { ok: false, reason: `Unknown metric "${key}". Known: ${KEYS.join(', ')}.` };
  if (!values || typeof values !== 'object') return { ok: false, reason: 'Values are required.' };

  for (const f of def.fields) {
    const n = values[f];
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      return { ok: false, reason: `"${f}" must be a finite number (${def.unit}).` };
    }
    if (n < 0) return { ok: false, reason: `"${f}" cannot be negative.` };
  }
  const extra = Object.keys(values).filter(k => !def.fields.includes(k));
  if (extra.length) return { ok: false, reason: `Unexpected field(s): ${extra.join(', ')}. This metric carries ${def.fields.join(', ')}.` };

  if (def.shape === 'bands' && def.direction === 'lower_is_better' && values.green > values.transition) {
    return { ok: false, reason: `The green threshold (${values.green}) cannot be above the transition threshold (${values.transition}).` };
  }
  return { ok: true };
}

module.exports = { METRICS, KEYS, metric, validateValues };
