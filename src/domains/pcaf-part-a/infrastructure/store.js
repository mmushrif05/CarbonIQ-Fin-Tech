// @ts-check
/**
 * Where Part A exposures live: the one storage seam, like every other record.
 *
 * Two collections, both partitioned on the reporting institution. There is no
 * shared partition here and there should not be: an exposure is one bank's
 * lending, and the book total is one bank's statement about its own balance
 * sheet. Neither is ever the market's figure, which is what the shared
 * partition in `baselines` is for.
 *
 * The roll-up asks for the projected field set rather than the whole record.
 * That is not an optimisation bolted on afterwards — it is the difference
 * between a reporting-year position that answers in forty milliseconds and one
 * that takes a second, and the second is what this codebase has already
 * shipped once on Part C before the projection existed.
 */

'use strict';

const store = require('../../../platform/database/store');
const { definition } = require('../../../platform/database/collections');

const EXPOSURES = 'parta_exposures';
const BOOK = 'parta_book';
const SETTINGS = 'parta_settings';

/** The field set the stored projection holds — asked for by name, not by luck. */
const ROLLUP_FIELDS = Object.freeze(
  /** @type {any} */ (definition(EXPOSURES)).projections.rollup.fields.slice());

async function saveExposure(orgId, record) {
  return store.put(EXPOSURES, String(orgId), record.exposureId, record);
}

async function getExposure(orgId, exposureId) {
  return store.get(EXPOSURES, String(orgId), String(exposureId));
}

async function removeExposure(orgId, exposureId) {
  return store.remove(EXPOSURES, String(orgId), String(exposureId));
}

/**
 * Every exposure of a reporting year, whole.
 *
 * Used where the caller needs the trace — one exposure's own page, an export.
 * A roll-up must not call this; that is what `rollupsForYear` is for.
 */
async function exposuresForYear(orgId, reportingYear) {
  return store.query(EXPOSURES, String(orgId), {
    where: { reportingYear: String(reportingYear) },
  });
}

/** The projection, for the roll-up. Eighteen fields, not the whole trace. */
async function rollupsForYear(orgId, reportingYear) {
  return store.query(EXPOSURES, String(orgId), {
    where: { reportingYear: String(reportingYear) },
    fields: ROLLUP_FIELDS,
  });
}

/**
 * One page of a year's book, for a list a person reads.
 *
 * Whole records, not the projection: `page()` carries a cursor and a filter
 * and no field list, so there is nowhere to ask for one. That is the right
 * trade at a page a person reads — fifty rows — and the wrong one over a book,
 * which is why the roll-up goes through `rollupsForYear` instead and a test
 * asserts it does.
 */
async function pageForYear(orgId, reportingYear, opts = {}) {
  const { limit, cursor } = /** @type {{limit?: number, cursor?: string}} */ (opts);
  return store.page(EXPOSURES, String(orgId), {
    where: { reportingYear: String(reportingYear) },
    limit, cursor,
  });
}

/** Every reporting year this organisation holds anything for. */
async function years(orgId) {
  const all = await store.query(EXPOSURES, String(orgId), { fields: ['reportingYear'] });
  return [...new Set(all.map(r => String(r.reportingYear)))].sort();
}

async function saveBook(orgId, record) {
  return store.put(BOOK, String(orgId), record.reportingYear, record);
}

async function getBook(orgId, reportingYear) {
  return store.get(BOOK, String(orgId), String(reportingYear));
}

async function listBooks(orgId) {
  return store.list(BOOK, String(orgId));
}

/* The reporting entity's own settings — org-wide, one row per organisation
   under the id 'default'. The recalculation protocol Chapter 6 requires lives
   here, not on a per-year book row, because a base year is one claim about
   history and two years must not disagree about it. */
async function saveSettings(orgId, record) {
  return store.put(SETTINGS, String(orgId), 'default', record);
}

async function getSettings(orgId) {
  return store.get(SETTINGS, String(orgId), 'default');
}

module.exports = {
  EXPOSURES, BOOK, SETTINGS, ROLLUP_FIELDS,
  saveExposure, getExposure, removeExposure, exposuresForYear, rollupsForYear, pageForYear, years,
  saveBook, getBook, listBooks,
  saveSettings, getSettings,
};
