// @ts-check
/**
 * The §5.2 documents, assembled: the annual disclosure from the register's
 * reporting-year position, and the per-exposure report from one held result.
 *
 * Both draw the same entity facts and the same assurance position, so the two
 * documents from one book cannot describe two entities or two postures. The
 * per-exposure report used to be built without the entity's settings, and so
 * printed "no recalculation protocol has been stated" beside an annual
 * disclosure that stated one — two documents from one book contradicting
 * each other on a "shall" item. Both receive the settings now.
 *
 * The exposure rows the roll-up read travel into the annual disclosure as the
 * audit-trail annex; the assurance declaration travels in so a verified cover
 * names its verifier.
 */

'use strict';

const register = require('./register');
const reporting = require('../reporting/report');
const { positionFor } = require('../../baseline/application/assurance-position');
const declaration = require('../../lending/application/assurance');
const baselines = require('../../baseline/application/registry');
const { METRIC: BAND_METRIC, DEFAULT_COUNTRY } = require('./plausibility');
const { fallback } = require('../../../platform/observability/logger');

async function bandBasis(orgId, country) {
  const r = await baselines.effective(BAND_METRIC, { country: country || DEFAULT_COUNTRY, orgId })
    .catch(fallback('parta.report.band', null));
  if (!r || !r.resolved) return null;
  return { basis: r.basis, provisional: r.provisional, version: r.version, scope: r.scope };
}

function safe(s) { return String(s || 'report').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(); }

/** The facts every §5.2 document shares: assurance, its declaration, the entity's settings, the band. */
async function shared(orgId, country) {
  const [assurance, assuranceDeclaration, band, settings] = await Promise.all([
    positionFor(orgId).catch(fallback('parta.report.assurance', null)),
    declaration.read(orgId).catch(fallback('parta.report.declaration', null)),
    bandBasis(orgId, country),
    register.getSettings(orgId).catch(fallback('parta.report.settings', register.DEFAULT_SETTINGS)),
  ]);
  return { assurance: assurance || undefined, assuranceDeclaration: assuranceDeclaration || undefined, band, settings };
}

async function annualDisclosure(orgId, year, opts = {}) {
  const [position, rows, common] = await Promise.all([
    register.position(orgId, String(year)),
    register.rows(orgId, String(year)),
    shared(orgId, opts.country),
  ]);
  const input = {
    position, rows, reportingYear: String(year), insurer: opts.insurer,
    currency: opts.currency || (position.coverage && /** @type {any} */ (position.coverage).currency) || 'LKR',
    assurance: common.assurance, assuranceDeclaration: common.assuranceDeclaration,
    band: common.band, recalculation: common.settings, meta: opts.meta || {},
  };
  const facts = reporting.disclosureFacts(input);
  return {
    facts,
    model: reporting.disclosureModel(input),
    input,
    safeName: `${safe(facts.insurer !== 'Reporting entity not stated' ? facts.insurer : opts.insurer)}-part-a-${year}`,
  };
}

async function exposureReport(orgId, exposureId, opts = {}) {
  const [exposure, common] = await Promise.all([
    register.get(orgId, exposureId),
    shared(orgId, opts.country),
  ]);
  const input = {
    result: exposure.result, insurer: opts.insurer,
    assurance: common.assurance, assuranceDeclaration: common.assuranceDeclaration,
    band: common.band, recalculation: common.settings,
    meta: { reportId: exposure.exposureId, ...(opts.meta || {}) },
  };
  return {
    facts: reporting.exposureFacts(input),
    model: reporting.exposureModel(input),
    input,
    safeName: `${safe((exposure.result.exposure.counterparty || {}).name)}-part-a`,
  };
}

module.exports = { annualDisclosure, exposureReport, shared };
