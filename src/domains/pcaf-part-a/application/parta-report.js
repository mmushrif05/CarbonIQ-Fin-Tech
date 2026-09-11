// @ts-check
/**
 * The PCAF Part A §5.2 reporting service: assemble the facts a document is
 * built from, from the register and the registries, and render it.
 *
 * The register holds the figures; the assurance position and the sector-band
 * baseline are read from their registries; the reporting layer arranges them.
 * Nothing here computes an emission — the register's position already carries
 * the engine's own results, and this service never recomputes them.
 */

'use strict';

const register = require('./register');
const reporting = require('../reporting/report');
const { positionFor } = require('../../baseline/application/assurance-position');
const baselines = require('../../baseline/application/registry');
const { METRIC: BAND_METRIC, DEFAULT_COUNTRY } = require('./plausibility');
const { fallback } = require('../../../platform/observability/logger');

/** The band resolution in force, as a basis line for the methodology section. */
async function bandBasis(orgId, country) {
  const r = await baselines.effective(BAND_METRIC, { country: country || DEFAULT_COUNTRY, orgId })
    .catch(fallback('parta.report.band', null));
  if (!r || !r.resolved) return null;
  return { basis: r.basis, provisional: r.provisional, version: r.version, scope: r.scope };
}

function safe(s) { return String(s || 'report').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(); }

/**
 * The annual §5.2 disclosure of one reporting year. Refuses an empty year the
 * same way the position does — a 409, because "we lent nothing" and "we have
 * not measured yet" are different claims.
 */
async function annualDisclosure(orgId, year, opts = {}) {
  const position = await register.position(orgId, String(year));
  const [assurance, band] = await Promise.all([
    positionFor(orgId).catch(fallback('parta.report.assurance', null)),
    bandBasis(orgId, opts.country),
  ]);
  const input = {
    position, reportingYear: String(year), insurer: opts.insurer,
    currency: opts.currency || (position.coverage && /** @type {any} */ (position.coverage).currency) || 'LKR',
    assurance: assurance || undefined, band, meta: opts.meta || {},
  };
  return {
    facts: reporting.disclosureFacts(input),
    model: reporting.disclosureModel(input),
    input,
    safeName: `${safe(opts.insurer)}-part-a-${year}`,
  };
}

/** The per-exposure report for one recorded exposure. */
async function exposureReport(orgId, exposureId, opts = {}) {
  const exposure = await register.get(orgId, exposureId);
  const [assurance, band] = await Promise.all([
    positionFor(orgId).catch(fallback('parta.report.assurance', null)),
    bandBasis(orgId, opts.country),
  ]);
  const input = {
    result: exposure.result, insurer: opts.insurer,
    assurance: assurance || undefined, band,
    meta: { reportId: exposure.exposureId, ...(opts.meta || {}) },
  };
  return {
    facts: reporting.exposureFacts(input),
    model: reporting.exposureModel(input),
    input,
    safeName: `${safe((exposure.result.exposure.counterparty || {}).name)}-part-a`,
  };
}

module.exports = { annualDisclosure, exposureReport };
