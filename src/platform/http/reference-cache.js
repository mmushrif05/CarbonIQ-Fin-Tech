// @ts-check
/**
 * Caching for reference data (gap A8).
 *
 * Factor tables, the taxonomy, the Part A reference, the conformance
 * matrices, the GCF instruments: versioned JSON that changes only with a
 * deploy. A route that serves it is wrapped so that the body is built once
 * per process per release and answered from memory after that, and so that
 * the response carries a strong ETag and a `Cache-Control` a client may
 * honour — a second request with `If-None-Match` is answered 304 without a
 * body. `X-Cache: hit | miss` says which happened.
 *
 * The cache key is the URL and the release, so a deploy can never serve
 * the previous build's table. A record, a dashboard, a roll-up — anything a
 * write can change — is never wrapped, and a test asserts none of those
 * routes carries a `Cache-Control`.
 */

'use strict';

const crypto = require('crypto');
const { release } = require('../observability/release');

const cache = new Map();
const MAX_ENTRIES = 200;

function etagOf(text) {
  return `"${crypto.createHash('sha1').update(text).digest('hex')}"`;
}

/**
 * @param {{maxAge?: number, ttlMs?: number}} [opts] maxAge for the client (seconds), ttl in memory (ms)
 */
function referenceCache({ maxAge = 3600, ttlMs = 3600_000 } = {}) {
  const mw = (req, res, next) => {
    if (req.method !== 'GET') return next();
    const key = `${release().short || 'dev'} ${req.originalUrl}`;
    const now = Date.now();
    const hit = cache.get(key);
    res.setHeader('Cache-Control', `private, max-age=${maxAge}`);
    if (hit && hit.expires > now && !/no-cache/i.test(String(req.headers['cache-control'] || ''))) {
      res.setHeader('ETag', hit.etag);
      res.setHeader('X-Cache', 'hit');
      if (req.headers['if-none-match'] === hit.etag) return res.status(304).end();
      res.type('json');
      return res.status(hit.status).send(hit.text);
    }
    const json = res.json.bind(res);
    res.json = body => {
      const text = JSON.stringify(body);
      const etag = etagOf(text);
      const status = res.statusCode || 200;
      if (status === 200) {
        if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(key, { etag, text, status, expires: now + ttlMs });
      }
      res.setHeader('ETag', etag);
      res.setHeader('X-Cache', 'miss');
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.type('json');
      return res.status(status).send(text);
    };
    return next();
  };
  Object.defineProperty(mw, 'name', { value: 'referenceCache' });
  mw.maxAge = maxAge;
  return mw;
}

function _reset() { cache.clear(); }

module.exports = referenceCache;
module.exports._reset = _reset;
module.exports.etagOf = etagOf;
