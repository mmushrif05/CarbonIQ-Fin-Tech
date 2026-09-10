// @ts-check
/**
 * What this deployment may claim about the figures it prints.
 *
 * `src/shared/assurance-mode.js` holds the vocabulary and the rule;
 * `src/platform/reporting/assurance-mode.js` reads what the tool provider set
 * and applies it. Neither can reach the evidence, because the evidence is two
 * records this system holds: whether the governed values a figure rests on
 * have actually been released, and what the reporting entity has declared
 * about who assured them.
 *
 * It lives beside the baseline registry because the first half of that
 * evidence is the registry's own question — a figure screened against a
 * provisional shipped value is not a governed figure, whatever else is true
 * of it.
 *
 * Every document builder and every route goes through this one function.
 * Two assemblies of the same evidence are two answers to one question, and a
 * per-assessment report and an annual disclosure drawn from one book must not
 * state different assurance postures.
 */

'use strict';

const mode = require('../../../platform/reporting/assurance-mode');
const registry = require('./registry');
const declaration = require('../../lending/application/assurance');
const { fallback } = require('../../../platform/observability/logger');

/**
 * What this deployment may claim for one organisation, with the reasons where
 * it may claim less than it asked for.
 *
 * A failure to read either source leaves the evidence unmet, which downgrades
 * to self-declared. That is the safe direction: an unreachable baseline
 * registry must never be the reason a document says "verified".
 *
 * @param {string} orgId
 * @param {{country?: string}} [ctx]
 */
async function positionFor(orgId, ctx = {}) {
  const [effective, declared] = await Promise.all([
    registry.effectiveAll({ orgId, country: ctx.country || 'LK' })
      .catch(fallback('assurance.position.baselines', {})),
    declaration.read(orgId)
      .catch(fallback('assurance.position.declaration', {})),
  ]);
  return mode.positionFor(orgId, { baselines: effective, declaration: declared });
}

module.exports = { positionFor };
