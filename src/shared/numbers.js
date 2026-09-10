// @ts-check
/**
 * One place that turns a value from outside into a number.
 *
 * There were six private helpers across the tree with three different
 * policies on absence, and no shared one. Two of them sat in
 * `partc-portfolio.js` — the module that computes the **disclosed**
 * premium-weighted data-quality score — where both were `v => Number(v) || 0`.
 *
 * That expression is the defect this codebase has now shipped three separate
 * times: `Number(null)` is `0`, and `0` is finite, so a field nobody filled in
 * arrives as a measured zero. It has produced a pipeline project ranked on a
 * 0% return it was never given, a blended return dragged down by a project
 * nobody had priced, and a ten-year drawdown series collapsed to one year that
 * reported $66.3M as the whole of $199M. Every one reached a screen with its
 * unit test passing.
 *
 * So the rule here is: **absence is answered before the number is.** A caller
 * that needs to tell "nothing was recorded" from "zero was recorded" asks
 * `maybeNumber` and gets `undefined`; a caller that has a defensible default
 * asks `numberOr` and says what the default is. Neither can be reached by
 * accident, which `Number(x) || 0` could.
 */

'use strict';

/**
 * A finite number, or `undefined` where there was not one.
 *
 * Absent: `null`, `undefined`, an empty or blank string, `NaN`, `Infinity`,
 * and anything not a number or a numeric string. A **boolean is absent** —
 * `Number(true)` is 1, and a tick-box is not a measurement; that coercion is
 * how a flag becomes a quantity.
 *
 * @param {unknown} value
 * @returns {number|undefined}
 */
function maybeNumber(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * A finite number, or `fallback` where there was not one.
 *
 * The fallback is explicit at every call site, so a reader can see whether
 * zero was a measurement or a stand-in for one.
 *
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
function numberOr(value, fallback = 0) {
  const n = maybeNumber(value);
  return n === undefined ? fallback : n;
}

/**
 * The same absence test, answered with `null` instead of `undefined`.
 *
 * Two sentinels for one idea is how a guard gets bypassed, so this exists for
 * exactly one reason: a figure that is **stored or serialised**. JSON has no
 * `undefined` — `JSON.stringify({a: undefined})` is `{}` — so a domain that
 * writes absence into a record or answers it on the wire has to write `null`
 * or the field disappears, and a disappeared field reads as one nobody thought
 * about. Inside a calculation, prefer `maybeNumber`.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function numberOrNull(value) {
  const n = maybeNumber(value);
  return n === undefined ? null : n;
}

/**
 * A finite integer, or `fallback`. Truncates towards zero, as `parseInt` does.
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
function intOr(value, fallback = 0) {
  const n = maybeNumber(value);
  return n === undefined ? fallback : Math.trunc(n);
}

/**
 * Whether this value is a number the arithmetic can use.
 * Say this rather than `if (x)`, which is false for a genuine zero.
 * @param {unknown} value
 */
function isNumeric(value) { return maybeNumber(value) !== undefined; }

/**
 * Sum the numeric values, ignoring the absent ones, and say how many were
 * ignored. A total that quietly counted absence as zero is a total nobody
 * can reconcile against the rows it came from.
 *
 * @param {unknown[]} values
 * @returns {{total: number, counted: number, skipped: number}}
 */
function sumNumeric(values) {
  let total = 0, counted = 0, skipped = 0;
  for (const v of values || []) {
    const n = maybeNumber(v);
    if (n === undefined) { skipped += 1; continue; }
    total += n; counted += 1;
  }
  return { total, counted, skipped };
}

module.exports = { maybeNumber, numberOr, numberOrNull, intOr, isNumeric, sumNumeric };
