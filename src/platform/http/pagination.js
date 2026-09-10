// @ts-check
/**
 * Pagination on every list (gap A6).
 *
 * A list route answers as it always has — the whole collection — until the
 * caller asks for a page with `limit` (and, from the second page on,
 * `cursor`). A page answers the same top-level shape with the items cut to
 * the page and a `page` object beside them: `{ limit, nextCursor, hasMore }`.
 * `nextCursor` is opaque; a client passes it back and reads nothing into
 * it. Nothing else changes shape, so no integration built on the whole
 * list breaks on the day this ships, and a client that pages never sees
 * more than it asked for.
 *
 * `paged(...filters)` marks a route as one that pages, for the OpenAPI
 * generator: it reads the marker off the router and documents `limit`,
 * `cursor` and the filters, so the contract has one source.
 */

'use strict';

/** @typedef {import('../../shared/types').AppError} AppError */

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;

function badRequest(message, remedy) {
  const e = /** @type {AppError} */ (new Error(message));
  e.statusCode = 400; e.code = 'BAD_PAGE'; e.remedy = remedy;
  return e;
}

/**
 * The page a request asks for, or null when it asks for the whole list.
 * @returns {{limit: number, offset: number, cursor: string|null}|null}
 */
function pageParams(req) {
  const q = req.query || {};
  if (q.limit === undefined && q.cursor === undefined) return null;
  const limit = q.limit === undefined ? DEFAULT_LIMIT : Number(q.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw badRequest(`limit must be an integer from 1 to ${MAX_LIMIT}.`, `Send limit=${DEFAULT_LIMIT} for a first page.`);
  }
  let offset = 0;
  if (q.cursor !== undefined && q.cursor !== '') {
    /* Buffer.from() drops the characters it cannot decode, so a mangled
       cursor would quietly decode to page one; the shape is checked first. */
    const raw = String(q.cursor);
    const decoded = /^[A-Za-z0-9_-]{1,32}$/.test(raw) ? Buffer.from(raw, 'base64url').toString('utf8') : '';
    const n = /^\d+$/.test(decoded) ? Number(decoded) : NaN;
    if (!Number.isInteger(n) || n < 0) throw badRequest('The cursor is not one this API issued.', 'Start again without a cursor and follow page.nextCursor.');
    offset = n;
  }
  return { limit, offset, cursor: q.cursor || null };
}

const encodeCursor = offset => Buffer.from(String(offset)).toString('base64url');

/** One page of an array, and the page descriptor. */
function pageArray(items, { limit, offset }) {
  const all = Array.isArray(items) ? items : [];
  const slice = all.slice(offset, offset + limit);
  const hasMore = all.length > offset + limit;
  return { items: slice, page: { limit, nextCursor: hasMore ? encodeCursor(offset + limit) : null, hasMore, total: all.length } };
}

/**
 * Answer a list: the whole collection, or the page asked for, under `key`,
 * with any extra fields beside it.
 */
function sendList(req, res, key, items, extra = {}) {
  const p = pageParams(req);
  if (!p) return res.json({ [key]: items, ...extra });
  const { items: slice, page } = pageArray(items, p);
  res.locals.page = page;
  return res.json({ [key]: slice, page, ...extra });
}

/**
 * The items a list route should answer with, and the page descriptor (or
 * null), for a route whose response carries more than the array.
 */
function listView(req, res, items) {
  const p = pageParams(req);
  if (!p) return { items, page: null };
  const r = pageArray(items, p);
  res.locals.page = r.page;
  return r;
}

/** A marker middleware: this route pages, and filters by these query names. */
function paged(...filters) {
  const mw = (_req, _res, next) => next();
  Object.defineProperty(mw, 'name', { value: 'paged' });
  mw.filters = filters;
  return mw;
}

module.exports = { pageParams, pageArray, sendList, listView, paged, encodeCursor, MAX_LIMIT, DEFAULT_LIMIT };
