// @ts-check
/**
 * The PCAF Part A §5.9 sovereign reporting service: assemble the facts a
 * document is built from, from the sovereign register and the settings, and
 * render it.
 *
 * The sovereign register holds the figures; the assurance position and the
 * recalculation protocol are read from their homes; the reporting layer
 * arranges them. Nothing here computes an emission — the register's position
 * already carries the engine's own results, and this service never recomputes
 * them.
 */

'use strict';

const sovereign = require('./sovereign-register');
const register = require('./register');
const reporting = require('../reporting/sovereign/report');
const { positionFor } = require('../../baseline/application/assurance-position');
const { fallback } = require('../../../platform/observability/logger');

function safe(s) { return String(s || 'report').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(); }

/**
 * The annual §5.9 disclosure of one reporting year. The sovereign position
 * refuses an empty year with a 409, so this refuses it the same way — "we hold
 * no sovereign debt" and "we have not measured yet" are different claims.
 */
async function annualDisclosure(orgId, year, opts = {}) {
  const position = await sovereign.position(orgId, String(year));
  const [assurance, recalculation] = await Promise.all([
    positionFor(orgId).catch(fallback('parta.sovereign.report.assurance', null)),
    register.getSettings(orgId).catch(fallback('parta.sovereign.report.settings', register.DEFAULT_SETTINGS)),
  ]);
  const input = {
    position, reportingYear: String(year), insurer: opts.insurer,
    currency: opts.currency || (position.coverage && position.coverage.currency) || 'USD',
    assurance: assurance || undefined, recalculation, meta: opts.meta || {},
  };
  return {
    facts: reporting.disclosureFacts(input),
    model: reporting.disclosureModel(input),
    input,
    safeName: `${safe(opts.insurer)}-part-a-sovereign-${year}`,
  };
}

/** The per-holding report for one recorded sovereign exposure. */
async function holdingReport(orgId, exposureId, opts = {}) {
  const exposure = await sovereign.get(orgId, exposureId);
  const assurance = await positionFor(orgId).catch(fallback('parta.sovereign.report.assurance', null));
  const input = {
    result: exposure.result, insurer: opts.insurer,
    assurance: assurance || undefined,
    meta: { reportId: exposure.exposureId, ...(opts.meta || {}) },
  };
  const name = (exposure.result.sovereign && (exposure.result.sovereign.name || exposure.result.sovereign.country)) || 'sovereign';
  return {
    facts: reporting.holdingFacts(input),
    model: reporting.holdingModel(input),
    input,
    safeName: `${safe(name)}-part-a-sovereign`,
  };
}

module.exports = { annualDisclosure, holdingReport };
