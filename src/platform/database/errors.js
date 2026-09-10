// @ts-check
/**
 * PostgreSQL errors, translated into the shape every route already handles:
 * `statusCode`, `code`, `message`, and a `remedy` where one exists.
 *
 * A foreign-key refusal is a 409 that names the table still referring to the
 * row, because "violates foreign key constraint partc_projects_org_id_client_id_fkey"
 * tells a user nothing and "this client still has projects" tells them what
 * to do. A connection failure is a 503, distinct from a 500, because the
 * caller's request was fine and the deployment was not.
 */

'use strict';

/** @typedef {import('../../shared/types').AppError} AppError */

const TABLE_LABELS = {
  partc_clients: 'client', partc_projects: 'project', partc_boq_revisions: 'BOQ revision',
  partc_assessments: 'assessment', partc_settings: 'settings',
  capital_portfolios: 'portfolio', capital_investments: 'investment', capital_payments: 'payment',
  gcf_projects: 'GCF pipeline record', gcf_entity: 'GCF entity record', assurance_declarations: 'assurance declaration',
};
const label = t => TABLE_LABELS[t] || t;

function make(statusCode, code, message, remedy, cause) {
  const err = /** @type {AppError} */ (new Error(message));
  err.statusCode = statusCode;
  err.code = code;
  if (remedy) err.remedy = remedy;
  if (cause) err.cause = cause;
  return err;
}

const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', '57P01', '57P02', '57P03', '08001', '08003', '08006', '28P01', '28000', '3D000']);

function translate(err) {
  if (!err || err.statusCode) return err;
  const code = String(err.code || '');
  const detail = String(err.detail || '');

  if (code === '23503') {
    /* Two directions. Deleting a parent: "still referenced from table X".
       Inserting a child: "is not present in table X". */
    const still = detail.match(/still referenced from table "([^"]+)"/);
    if (still) {
      return make(409, 'REFERENCE_VIOLATION',
        `This ${label(err.table)} still has at least one ${label(still[1])} attached and cannot be removed.`,
        `Remove or reassign the dependent ${label(still[1])} records first.`, err);
    }
    const missing = detail.match(/is not present in table "([^"]+)"/);
    if (missing) {
      return make(409, 'REFERENCE_VIOLATION',
        `This ${label(err.table)} refers to a ${label(missing[1])} that does not exist in this organisation.`,
        `Record the ${label(missing[1])} first, or correct the reference.`, err);
    }
    return make(409, 'REFERENCE_VIOLATION', `A reference on this ${label(err.table)} could not be satisfied.`, null, err);
  }
  if (code === '23505') {
    return make(409, 'DUPLICATE', `A ${label(err.table)} with the same identifying values already exists.`,
      detail || undefined, err);
  }
  if (code === '40001' || code === '40P01') {
    return make(409, 'CONCURRENT_UPDATE', 'Another change to the same records was committed first. Re-read and retry.', null, err);
  }
  if (code === '55000') {
    return make(409, 'APPEND_ONLY', err.message, null, err);
  }
  if (code === '42P01') {
    return make(503, 'SCHEMA_NOT_MIGRATED', `The database schema is missing a table (${err.message}).`,
      'Run `npm run db:migrate` against this DATABASE_URL.', err);
  }
  if (CONNECTION_CODES.has(code) || /timeout|terminated|connect/i.test(err.message || '')) {
    return make(503, 'STORAGE_UNREACHABLE', `PostgreSQL could not be reached: ${err.message}`,
      'Check DATABASE_URL, network access from this runtime, and that the database is up. Read-only endpoints and the calculation engine work without it.', err);
  }
  return err;
}

module.exports = { translate, TABLE_LABELS };
