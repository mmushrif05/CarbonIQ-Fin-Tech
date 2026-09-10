// @ts-check
/**
 * The request context — what every log line and every error report needs to
 * know about the request it happened inside, without being handed it.
 *
 * The correlation id used to exist only on `req.requestId` and the response
 * header. A service-layer log written three calls deep had no way to carry
 * it, so a request could not be followed through the engines (gap D5). The
 * audit middleware now runs the rest of the request inside an
 * AsyncLocalStorage store holding the id and the request, and the logger's
 * mixin reads it at the moment a line is written — so a log anywhere under
 * the request carries `requestId`, `orgId` and `actor` with no parameter
 * threaded through any signature. The same mechanism the database client
 * uses to publish a transaction's connection.
 */

'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

/** Run `fn` with `ctx` as the current request context. */
function run(ctx, fn) {
  return als.run({ ...ctx }, fn);
}

/** The current request context, or null outside a request. */
function current() {
  return als.getStore() || null;
}

/** Merge fields into the current context, where one exists. */
function set(patch) {
  const c = als.getStore();
  if (c) Object.assign(c, patch);
  return c || null;
}

module.exports = { run, current, set };
