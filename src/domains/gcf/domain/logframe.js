// @ts-check
'use strict';

/**
 * The results logframe — where each GCF core indicator starts, where the
 * project commits to reach, and by when.
 *
 * GCF reports every project as "from a baseline to a target by a year". The
 * record already carries the current or expected figure on the indicator's own
 * field (mitigation.lifetime_tCO2e, beneficiaries.direct, …); Stage 1 added a
 * `results` map holding the baseline and target beside it. This composes the
 * two into one row per indicator so a screen and a report read the same shape.
 *
 * It computes nothing: it reads the current figure off the record by the
 * indicator's declared field path and reads the baseline and target off
 * `results`. Direct and indirect beneficiaries are separate indicators and are
 * never summed; each figure keeps its own evidence tier.
 */

const IRMF = require('./reference').IRMF;

/** Read a dotted path off an object, returning null rather than throwing. */
function at(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj) ?? null;
}

/** A traced figure {value, tier} or null — never a bare number. */
function traced(v) {
  if (v && typeof v === 'object' && 'value' in v) return { value: v.value, tier: v.tier || 'declared' };
  return null;
}

/**
 * One row per indicator the project reports against.
 * @returns {{rows: Array<object>, note: string}}
 */
function logframe(project = {}) {
  const results = (project && project.results) || {};
  const indicators = [...IRMF.coreIndicators, ...(IRMF.supplementary || [])];
  const rows = indicators.map((ind) => {
    const current = traced(at(project, ind.field));
    const r = results[ind.id] || {};
    const baseline = traced(r.baseline);
    const target = traced(r.target);
    const targetYear = (typeof r.targetYear === 'number') ? r.targetYear : null;
    return {
      id: ind.id,
      name: ind.name,
      unit: ind.unit,
      stream: (/** @type {any} */ (ind)).stream || null,
      core: IRMF.coreIndicators.some(c => c.id === ind.id),
      baseline,
      current,
      target,
      targetYear,
      // A row is worth showing when any of the three figures is present; an
      // indicator the project does not touch is left absent, not zeroed.
      present: Boolean(baseline || current || target),
    };
  });
  return {
    rows,
    note: 'Direct and indirect beneficiaries are separate indicators and are never summed. Each figure carries its own evidence tier.',
  };
}

module.exports = { logframe };
