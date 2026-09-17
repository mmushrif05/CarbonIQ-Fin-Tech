// @ts-check
/**
 * Reading the exposure register's stored projection.
 *
 * Migration 0008 computes a field set into a generated column at write time,
 * and every read that does not need the provenance trace comes through here:
 * a class's rows for a screen, every class's rows for the consolidated annex,
 * and the climate classification SLFRS S2 §29(b)-(d) are summed from. A stored
 * exposure is several kilobytes, most of it the trace; these reads take about
 * twenty fields, and pulling the whole record to reach them is the defect the
 * projection exists to end.
 *
 * Split from `register.js` along that seam rather than for its size: what
 * writes the register and what reads its projection are two jobs, and only the
 * second knows the projection's shape.
 */

'use strict';

const repo = require('../infrastructure/store');
const classes = require('./register-classes');
const exposureClimate = require('../domain/climate/exposure');

const DEFAULT_CLASS = classes.DEFAULT_CLASS;

/**
 * A projected row, in the shape the roll-up reads. Every projected field is a
 * path into the stored record, so nothing here restates the roll-up's inputs.
 * Two normalisations, both because `jsonb_strip_nulls` removes a null field
 * and leaves the object that held it: an exposure with no attribution factor
 * projects as `attribution: {}`, which is truthy; one with no findings
 * projects with no `findings` key at all.
 */
function inflate(row) {
  const r = row.result || {};
  const attribution = (r.attribution && r.attribution.value !== null && r.attribution.value !== undefined)
    ? r.attribution : null;
  const validation = r.validation || {};
  /* Same normalisation: an exposure with no facility projects as
     `facility: {}` or as `{ summary: null }`, both truthy. */
  const facility = r.facility && r.facility.summary && typeof r.facility.summary === 'object' ? r.facility : null;
  return {
    ...r,
    facility,
    exposure: {
      ...(r.exposure || {}),
      identifiers: { id: row.exposureId },
      reportingYear: row.reportingYear || null,
    },
    attribution,
    validation: { verdict: validation.verdict || 'clean', findings: validation.findings || [] },
    financialSector: Boolean(row.financialSector),
  };
}

/**
 * Every exposure of a year, as the roll-up sees it — the projected row, one
 * per exposure, in the shape the disclosure's audit-trail annex prints. The
 * same projection `position()` reads, so a figure in the annex is the figure
 * in the total; an empty year is an empty list here rather than a 409, because
 * an annex reads beside a position that has already refused.
 */
async function rows(orgId, reportingYear, opts = {}) {
  const { assetClass = DEFAULT_CLASS } = /** @type {{assetClass?: string}} */ (opts);
  const found = await repo.rollupsForYear(orgId, reportingYear);
  return found.filter(r => (r.assetClass || DEFAULT_CLASS) === assetClass).map(inflate);
}

/**
 * What SLFRS S2 §29(b)–(d) are summed from: one row per exposure carrying its
 * outstanding, its sector and the bank's own climate classification.
 *
 * Read from the projection, which is why migration 0012 put `climate` in it —
 * the alternative is pulling every several-kilobyte record back to reach three
 * fields, which is the defect the projection exists to prevent.
 */
async function climateRows(orgId, reportingYear) {
  const found = await repo.rollupsForYear(orgId, reportingYear);
  return found.map(r => {
    const ex = (r.result && r.result.exposure) || {};
    const cp = ex.counterparty || {};
    const inv = (r.result && r.result.inventory) || {};
    const s12 = inv.scope1And2 || {};
    return {
      exposureId: r.exposureId,
      assetClass: r.assetClass || DEFAULT_CLASS,
      counterparty: cp.name || null,
      sector: cp.sector || null,
      /* The closed-vocabulary key, where the class holds one. The industry
         table groups on the label a reader recognises; whether a sector is
         carbon-related is decided from the key, never from free text. */
      sectorKey: cp.sectorKey || null,
      outstanding: ex.outstanding ? ex.outstanding.value : null,
      /* Scope 1 and 2 only: the industry table reports the boundary each class
         reports on its headline, and scope 3 sits apart wherever it appears. */
      emissions: s12.value === undefined ? null : s12.value,
      climate: r.climate || null,
    };
  });
}

/** Every class's rows for a year from one read, keyed by class — the consolidated annex. */
async function rowsByClass(orgId, reportingYear) {
  const found = await repo.rollupsForYear(orgId, reportingYear);
  const out = {};
  for (const cls of Object.keys(classes.CLASSES)) out[cls] = [];
  for (const r of found) {
    const k = r.assetClass || DEFAULT_CLASS;
    (out[k] = out[k] || []).push(inflate(r));
  }
  return out;
}

module.exports = {
  inflate, rows, rowsByClass, climateRows,
  normaliseExposureClimate: exposureClimate.normaliseExposureClimate,
};
