// @ts-check
/**
 * One async handler for every route.
 *
 * Express 4 does not catch a rejected promise from a handler; without this a
 * thrown error is an unhandled rejection and the request hangs. Four route
 * files each carried their own copy of this wrapper together with their own
 * `fail()` that rendered a service error — four places for the shape of an
 * error response to drift. There is one now, and the rendering belongs to
 * the error handler, which already knows `statusCode`, `code` and `remedy`.
 */

'use strict';

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
