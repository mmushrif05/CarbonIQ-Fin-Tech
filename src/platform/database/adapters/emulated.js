// @ts-check
/**
 * What a store without a query engine has to do by hand.
 *
 * PostgreSQL answers `query`, `page`, `count` and a projection natively. The
 * other three stores cannot, so they read the collection and filter it here.
 * That is what every caller used to do inline, and having it in one place is
 * what lets the four adapters be held to one conformance suite.
 *
 * These are deliberately the same functions the seam has always used, moved
 * rather than rewritten: the ordering rule below is a real difference from
 * PostgreSQL and changing it here would change figures.
 */

'use strict';

/** @typedef {import('../../../shared/types').AppError} AppError */

/** The value at a field name, which may be a dotted path into the record. */
const at = (rec, field) => (field.includes('.')
  ? field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), rec)
  : (rec == null ? undefined : rec[field]));

/**
 * Equality on a field, which may be a dotted path; an array means any of;
 * null matches absent. PostgreSQL answers the same `where` through a
 * generated column where the registry declares one, and the conformance
 * suite holds the two to the same answers.
 * @param {any} rec
 * @param {Record<string, any>} where
 */
const matches = (rec, where) => Object.entries(where).every(([k, v]) => {
  const actual = at(rec, k);
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.some(x => String(actual) === String(x));
  if (v === null) return actual === null || actual === undefined;
  return String(actual) === String(v);
});

/**
 * Ordering, with the SQL column names the seam speaks mapped to the record's
 * own keys.
 *
 * Note this sorts by `localeCompare` on the string form, so a numeric field
 * orders lexicographically here and numerically on PostgreSQL. That is a real
 * divergence between the stores; the conformance suite states it rather than
 * pretending otherwise, because closing it would change the order of existing
 * results on three stores to match a fourth.
 * @param {any[]} rows
 * @param {string|null} [orderBy]
 */
const sortBy = (rows, orderBy = 'created_at') => {
  if (orderBy === null) return [...rows];
  const desc = orderBy.startsWith('-');
  const f = orderBy.replace(/^-/, '');
  const key = f === 'created_at' ? 'createdAt' : f === 'updated_at' ? 'updatedAt' : f;
  const out = [...rows].sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')));
  return desc ? out.reverse() : out;
};

/* Copies the value at `parts` from src into dst, creating parents as needed.
   A segment ending in `[]` maps over an array. Returns whether anything was
   found, so an empty parent is not left behind for an absent child. */
function assign(dst, src, parts) {
  const [head, ...rest] = parts;
  const isArray = head.endsWith('[]');
  const key = isArray ? head.slice(0, -2) : head;
  if (src === null || typeof src !== 'object' || !(key in src)) return false;
  const val = src[key];
  if (!rest.length) { dst[key] = val; return true; }
  if (isArray) {
    if (!Array.isArray(val)) return false;
    const target = Array.isArray(dst[key]) ? dst[key] : val.map(() => ({}));
    val.forEach((item, i) => { if (item && typeof item === 'object') assign(target[i], item, rest); });
    dst[key] = target;
    return true;
  }
  const child = (dst[key] && typeof dst[key] === 'object' && !Array.isArray(dst[key])) ? dst[key] : {};
  const found = assign(child, val, rest);
  if (found || key in dst) dst[key] = child;
  return found;
}

/** The same subset a PostgreSQL projection returns, taken from a whole record. */
function pick(record, fields) {
  const out = {};
  for (const f of fields) assign(out, record, f.split('.'));
  return out;
}

/** `query` over rows already read from a store. */
function queryOver(rows, { where = {}, limit = null, orderBy = 'created_at', fields = null } = {}) {
  let out = sortBy(rows.filter(r => matches(r, where)), orderBy);
  if (limit) out = out.slice(0, limit);
  return fields ? out.map(r => pick(r, fields)) : out;
}

/**
 * `page` over rows already read from a store, with an offset cursor.
 *
 * A cursor this store did not issue is refused rather than decoded to page
 * one: silently starting again is how a client paging through a book reads
 * the first page forever and believes it has seen the whole thing.
 *
 * @param {any[]} rows
 * @param {{limit?: number, cursor?: string, where?: Record<string, any>}} [opts]
 */
function pageOver(rows, { limit = 50, cursor = undefined, where = {} } = {}) {
  const size = Math.min(500, Math.max(1, Number(limit) || 50));
  let offset = 0;
  if (cursor) {
    offset = Number(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!Number.isInteger(offset) || offset < 0) {
      const err = /** @type {AppError} */ (new Error('The cursor is not one this store issued.'));
      err.statusCode = 400;
      err.code = 'BAD_CURSOR';
      throw err;
    }
  }
  const all = sortBy(rows.filter(r => matches(r, where)));
  const items = all.slice(offset, offset + size);
  const more = all.length > offset + size;
  return { items, nextCursor: more ? Buffer.from(String(offset + size)).toString('base64url') : null, limit: size };
}

module.exports = { at, matches, sortBy, pick, assign, queryOver, pageOver };
