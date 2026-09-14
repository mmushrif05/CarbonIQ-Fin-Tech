// @ts-check
/**
 * The §5.9 documents, assembled: the annual sovereign disclosure from the
 * register's reporting-year position, and the per-holding report from one
 * held result. Both draw the same entity facts, the same assurance position
 * and its declaration as the §5.2 documents, through the one `shared()` the
 * §5.2 assembler exposes — so three documents from one book cannot describe
 * three entities. The holding report receives the entity's settings too, so it
 * can no longer contradict the annual disclosure on the recalculation protocol.
 */

'use strict';

const sovereign = require('./sovereign-register');
const reporting = require('../reporting/sovereign/report');
const { shared } = require('./parta-report');

function safe(s) { return String(s || 'report').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(); }

async function annualDisclosure(orgId, year, opts = {}) {
  const [position, rows, common] = await Promise.all([
    sovereign.position(orgId, String(year)),
    sovereign.rows(orgId, String(year)),
    shared(orgId, opts.country),
  ]);
  const input = {
    position, rows, reportingYear: String(year), insurer: opts.insurer,
    currency: opts.currency || (position.coverage && position.coverage.currency) || 'USD',
    assurance: common.assurance, assuranceDeclaration: common.assuranceDeclaration,
    recalculation: common.settings, meta: opts.meta || {},
  };
  const facts = reporting.disclosureFacts(input);
  return {
    facts,
    model: reporting.disclosureModel(input),
    input,
    safeName: `${safe(facts.insurer !== 'Reporting entity not stated' ? facts.insurer : opts.insurer)}-part-a-sovereign-${year}`,
  };
}

async function holdingReport(orgId, exposureId, opts = {}) {
  const [exposure, common] = await Promise.all([
    sovereign.get(orgId, exposureId),
    shared(orgId, opts.country),
  ]);
  const input = {
    result: exposure.result, insurer: opts.insurer,
    assurance: common.assurance, assuranceDeclaration: common.assuranceDeclaration,
    recalculation: common.settings,
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
