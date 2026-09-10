// @ts-check
/**
 * Types shared across the layers, in JSDoc.
 *
 * An application error carries, beside its message, the HTTP status it
 * answers with, a stable code a client can route on, and a remedy — the
 * half a user can act on. The error handler reads all three.
 *
 * @typedef {Error & { statusCode?: number, status?: number, code?: string, remedy?: string, details?: any, isJoi?: boolean }} AppError
 */

'use strict';

module.exports = {};
