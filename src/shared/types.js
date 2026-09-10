// @ts-check
/**
 * The shared type vocabulary, in JSDoc, and the one narrowing helper that
 * makes it usable.
 *
 * This file was fourteen lines holding a single typedef — the entire shared
 * type vocabulary of a forty-two-thousand-line system. What is here now is
 * still deliberately small: the shapes that cross a layer boundary, and
 * nothing that belongs to one domain. A domain's own entities are declared
 * beside that domain's schema, where they can be held to it.
 *
 * @typedef {Error & { statusCode?: number, status?: number, code?: string, remedy?: string, details?: any, isJoi?: boolean }} AppError
 *   An application error carries, beside its message, the HTTP status it
 *   answers with, a stable code a client can route on, and a remedy — the
 *   half a user can act on. The error handler reads all four.
 *
 * @typedef {'measured'|'declared'|'absent'} StatementKind
 *   What a line in a disclosure is. `src/shared/report-integrity.js` exists
 *   because these three were once emitted as though they were all the second.
 *
 * @typedef {{ value: number|null, unit?: string, source?: string }} Quantity
 *   A figure that knows what it is. `Number(null)` is 0 and 0 is finite, so a
 *   bare number cannot distinguish "nothing was recorded" from "zero was".
 *
 * @typedef {{ scopes: string[]|null, unscoped: boolean }} HeldScopes
 */

'use strict';

/**
 * Narrow a caught value to something with a message.
 *
 * `catch (e)` gives `unknown`, because JavaScript can throw anything — a
 * string, a number, `undefined` from a rejected promise nobody gave a reason
 * to. Every site in this tree that reads `e.message`, `e.code` or `e.status`
 * was assuming otherwise, and the assumption held only because nothing
 * checked. This makes the narrowing explicit and gives a non-Error throw a
 * message rather than `undefined`.
 *
 * @param {unknown} value
 * @returns {AppError}
 */
function asError(value) {
  if (value instanceof Error) return /** @type {AppError} */ (value);
  const err = /** @type {AppError} */ (new Error(
    typeof value === 'string' ? value : `Non-error thrown: ${safeString(value)}`));
  if (value && typeof value === 'object') Object.assign(err, value);
  return err;
}

/** A description of any value that cannot itself throw. */
function safeString(value) {
  if (value === null || value === undefined) return String(value);
  try { return JSON.stringify(value) ?? String(value); } catch (_) { return Object.prototype.toString.call(value); }
}

module.exports = { asError, safeString };
