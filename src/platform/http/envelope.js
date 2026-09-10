/**
 * The response envelope (gap F2), opt-in, with the old shapes kept (F3).
 *
 * Thirty-five distinct top-level shapes across the routes is what a client
 * generator meets today: `{ clients }`, `{ dashboard }`, `{ runId }`,
 * `{ success }`. The envelope is one shape for every response —
 *
 *   { data, meta: { requestId, timestamp, release, page? }, error: null }
 *   { data: null, meta, error: { code, message, remedy?, details?, requestId } }
 *
 * — and it is **asked for**, never imposed: `Accept:
 * application/vnd.carboniq.v1+json`, or `X-Envelope: 1`, or `?envelope=1`.
 * Every existing caller keeps the shape it was built on, for the whole of
 * v1; the envelope becomes the default in v2, and `docs/API-CONTRACT.md`
 * says so with the date. Every JSON response says which shape it is in
 * `X-Api-Envelope: legacy | v1`, so a client can tell from the wire, and a
 * legacy response carries a `Link` to the policy.
 *
 * A document — a PDF, a Word file — is bytes and is untouched.
 */

'use strict';

const { release } = require('../observability/release');

const VND = 'application/vnd.carboniq.v1+json';

function wantsEnvelope(req) {
  const accept = String(req.headers.accept || '');
  if (accept.includes(VND)) return true;
  const h = req.headers['x-envelope'];
  if (h !== undefined && String(h) !== '0' && String(h).toLowerCase() !== 'false') return true;
  const q = req.query && req.query.envelope;
  return q !== undefined && String(q) !== '0' && String(q).toLowerCase() !== 'false';
}

function toError(body, status, requestId) {
  const b = body && typeof body === 'object' ? body : { message: String(body) };
  const error = { code: b.error || (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR'), message: b.message || null, requestId: b.requestId || requestId || null };
  for (const k of ['remedy', 'details', 'reason', 'required', 'held', 'diagnose', 'unaffected', 'eventId', 'docs']) if (b[k] !== undefined) error[k] = b[k];
  return error;
}

function envelope(req, res, next) {
  const wants = wantsEnvelope(req);
  res.setHeader('X-Api-Envelope', wants ? 'v1' : 'legacy');
  if (!wants) {
    res.setHeader('Link', '</docs/API-CONTRACT.md>; rel="deprecation"; type="text/markdown"');
    return next();
  }
  const json = res.json.bind(res);
  res.json = body => {
    const status = res.statusCode || 200;
    const meta = { requestId: req.requestId || null, timestamp: new Date().toISOString(), release: release().short };
    if (res.locals.page) meta.page = res.locals.page;
    if (status >= 400) return json({ data: null, meta, error: toError(body, status, req.requestId) });
    let data = body;
    if (res.locals.page && data && typeof data === 'object' && !Array.isArray(data) && 'page' in data) {
      data = { ...data }; delete data.page;
    }
    return json({ data, meta, error: null });
  };
  res.type(VND);
  return next();
}

module.exports = envelope;
module.exports.wantsEnvelope = wantsEnvelope;
module.exports.VND = VND;
