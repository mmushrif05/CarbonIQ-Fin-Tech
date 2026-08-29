/**
 * CarbonIQ FinTech — what a report is allowed to say.
 *
 * A regulatory disclosure has exactly three kinds of statement in it:
 *
 *   MEASURED  — computed from data this system holds, and traceable to it.
 *   DECLARED  — a fact only the reporting entity can know: who sits on its
 *               risk committee, what its board approved, what it has
 *               committed to. Software cannot compute these and must not
 *               invent them.
 *   ABSENT    — required by the standard, and not available. Saying so is a
 *               disclosure in its own right; a plausible-looking number in
 *               its place is not.
 *
 * The report builders previously emitted the first and third as though they
 * were the second. Scope 1/2/3 splits were the portfolio total multiplied by
 * 0.08, 0.14 and 0.78. Board oversight, FTE counts, loan pipelines, provisions
 * and scenario alignment percentages were literals. Every item of a PCAF
 * compliance checklist was hardcoded `met: true`. All of it printed under a
 * cited clause of a named standard.
 *
 * That is not a demo shortcut — it is the failure mode the rest of this
 * codebase is built to avoid. Part C refuses a 409 rather than render a year
 * with no locked assessments as a position of zero, because an empty
 * disclosure and an unmeasured one are different claims. The same rule has to
 * hold here, where the reader is a regulator or an assurance provider.
 *
 * So: measured values pass through, entity facts are attributed to the entity
 * or marked as not provided, and nothing is ever filled in.
 */

'use strict';

const NOT_PROVIDED = 'not_provided';
const NOT_MEASURED = 'not_measured';

/**
 * A statement the reporting entity must make, which it has not made.
 *
 * @param {string} requirement what the entity has to supply
 * @param {string} [standardRef] the clause that requires it
 */
function notProvided(requirement, standardRef) {
  return {
    _status: NOT_PROVIDED,
    requirement,
    standardRef: standardRef || null,
    note: 'Not provided by the reporting entity. This is an entity-level '
        + 'disclosure and cannot be derived from portfolio data.'
  };
}

/**
 * A figure the standard asks for that this system cannot compute.
 *
 * @param {string} metric the figure that is missing
 * @param {string} reason why it cannot be derived from what is held
 */
function notMeasured(metric, reason) {
  return { _status: NOT_MEASURED, metric, reason };
}

/** Is this a placeholder rather than a value? */
function isPlaceholder(v) {
  return Boolean(v) && typeof v === 'object'
    && (v._status === NOT_PROVIDED || v._status === NOT_MEASURED);
}

/**
 * An entity-level disclosure: what the entity supplied, or an honest gap.
 *
 * @param {Object} entity        entity-supplied disclosures, may be undefined
 * @param {string} key           the field being sought
 * @param {string} requirement   what the entity has to supply
 * @param {string} [standardRef] the clause that requires it
 */
function declared(entity, key, requirement, standardRef) {
  const value = entity && entity[key];
  if (value === undefined || value === null
      || (typeof value === 'string' && value.trim() === '')
      || (Array.isArray(value) && value.length === 0)) {
    return notProvided(requirement, standardRef);
  }
  return value;
}

/**
 * A checklist item answered from the report itself rather than asserted.
 *
 * The previous checklist declared every item met, including the Scope 1/2/3
 * breakdown that was only "present" because it had been invented.
 */
function checklistItem(item, value, standardRef) {
  return {
    item,
    met: value !== undefined && value !== null && !isPlaceholder(value),
    standardRef: standardRef || null,
    basis: isPlaceholder(value) ? value.reason || value.note : 'Present in this report'
  };
}

/** Every placeholder in a built report, so a cover page can summarise them. */
function collectGaps(node, path = '', out = []) {
  if (!node || typeof node !== 'object') return out;
  if (isPlaceholder(node)) {
    out.push({
      path,
      status: node._status,
      what: node.requirement || node.metric,
      standardRef: node.standardRef || null
    });
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    collectGaps(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

module.exports = {
  NOT_PROVIDED, NOT_MEASURED,
  notProvided, notMeasured, isPlaceholder, declared, checklistItem, collectGaps
};
