/**
 * The job types this deployment can run, and the handler for each.
 *
 * The platform never imports a domain, so the handlers — which call the
 * engines — are registered from a composition root (`src/jobs.js`) and this
 * module only holds the table. A type nobody registered is refused at
 * enqueue with the list of those that exist.
 */

'use strict';

const handlers = new Map();

/**
 * @param {string} type        e.g. `partc.report`
 * @param {(payload: object, ctx: {orgId: string, jobId: string, requestId?: string, actor?: string}) => Promise<{result?: object, artifact?: {buffer: Buffer, contentType: string, filename: string}}>} fn
 * @param {{description?: string, scope?: string}} [meta]
 */
function register(type, fn, meta = {}) {
  if (typeof fn !== 'function') throw new TypeError(`handler for ${type} must be a function`);
  handlers.set(type, { fn, description: meta.description || '', scope: meta.scope || 'assess' });
}

function get(type) { return handlers.get(type) || null; }
function has(type) { return handlers.has(type); }
function types() { return [...handlers.entries()].map(([type, h]) => ({ type, description: h.description, scope: h.scope })); }
function _clear() { handlers.clear(); }

module.exports = { register, get, has, types, _clear };
