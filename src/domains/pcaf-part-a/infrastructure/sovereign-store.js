// @ts-check
/**
 * Where §5.9 sovereign exposures live: the one storage seam, partitioned on the
 * reporting institution, exactly as the §5.2 exposures are.
 *
 * The book total and the entity settings are NOT here — they are shared with
 * §5.2 (`infrastructure/store.js`), because total loans and investments is the
 * whole balance sheet and the recalculation protocol is one entity-wide claim,
 * neither of them class-specific. Only the exposure rows differ by class, so
 * only they get a store of their own.
 *
 * The roll-up asks for the projected field set rather than the whole record,
 * the same second-versus-forty-milliseconds difference the §5.2 register
 * documents.
 */

'use strict';

const store = require('../../../platform/database/store');
const { definition } = require('../../../platform/database/collections');

const SOVEREIGN = 'parta_sovereign_exposures';

/** The field set the stored projection holds — asked for by name, not by luck. */
const ROLLUP_FIELDS = Object.freeze(
  /** @type {any} */ (definition(SOVEREIGN)).projections.rollup.fields.slice());

async function saveExposure(orgId, record) {
  return store.put(SOVEREIGN, String(orgId), record.exposureId, record);
}

async function getExposure(orgId, exposureId) {
  return store.get(SOVEREIGN, String(orgId), String(exposureId));
}

async function removeExposure(orgId, exposureId) {
  return store.remove(SOVEREIGN, String(orgId), String(exposureId));
}

/** Every exposure of a reporting year, whole — for a page a person reads. */
async function exposuresForYear(orgId, reportingYear) {
  return store.query(SOVEREIGN, String(orgId), { where: { reportingYear: String(reportingYear) } });
}

/** The projection, for the roll-up. */
async function rollupsForYear(orgId, reportingYear) {
  return store.query(SOVEREIGN, String(orgId), {
    where: { reportingYear: String(reportingYear) },
    fields: ROLLUP_FIELDS,
  });
}

/** One page of a year's book, whole records — a list a person reads. */
async function pageForYear(orgId, reportingYear, opts = {}) {
  const { limit, cursor } = /** @type {{limit?: number, cursor?: string}} */ (opts);
  return store.page(SOVEREIGN, String(orgId), { where: { reportingYear: String(reportingYear) }, limit, cursor });
}

/** Every reporting year this organisation holds sovereign exposures for. */
async function years(orgId) {
  const all = await store.query(SOVEREIGN, String(orgId), { fields: ['reportingYear'] });
  return [...new Set(all.map(r => String(r.reportingYear)))].sort();
}

/** Duplicate-check helper: the exposures in a year holding a given reference. */
async function byAccountNumber(orgId, reportingYear, accountNumber) {
  return store.query(SOVEREIGN, String(orgId), {
    where: { reportingYear: String(reportingYear), 'input.identifiers.accountNumber': String(accountNumber) },
    fields: ['exposureId', 'country.name'],
  });
}

module.exports = {
  SOVEREIGN, ROLLUP_FIELDS,
  saveExposure, getExposure, removeExposure, exposuresForYear, rollupsForYear, pageForYear, years,
  byAccountNumber,
};
