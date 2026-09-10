// @ts-check
/**
 * The clock a serverless request actually runs against.
 *
 * A Netlify function is killed at a fixed wall clock — 26 seconds on the Pro
 * plan. Nothing in this application's request path knew that. Each piece had
 * its own generous budget: the SDK allowed 20 seconds per call with a retry,
 * the agent loop allowed 20 iterations at 32,000 output tokens, and the PDF
 * transcription ran non-streamed at 16,000. Their sum could not possibly fit,
 * and when the ceiling arrived the process was killed mid-request.
 *
 * That is the worst way to fail. A killed process returns no body, so every
 * branch of the diagnosis in ai-status.js was bypassed and the browser fell
 * back to a bare "Mapping failed" — the least informative string available,
 * for the most diagnosable class of failure.
 *
 * A Deadline is one clock shared by everything in a single request. Each call
 * is given what is genuinely left rather than what it would like, and a call
 * that cannot finish is refused BEFORE it starts, so the answer is a 504 that
 * names the cause and the remedy instead of a silence.
 */

'use strict';

/** @typedef {import('../../shared/types').AppError} AppError */

const config = require('../config');
const { numberOr } = require('../../shared/numbers');

/** Time reserved to serialise and return a response after the last call. */
const RESPONSE_MARGIN_MS = 2500;

/** Below this, starting another model call cannot produce anything useful. */
const MIN_USEFUL_MS = 3000;

class Deadline {
  /**
   * @param {number} [budgetMs] total wall clock for this request
   */
  constructor(budgetMs) {
    this.startedAt = Date.now();
    this.budgetMs = Number(budgetMs) || config.functionTimeoutMs;
    this.endsAt = this.startedAt + this.budgetMs - RESPONSE_MARGIN_MS;
  }

  /** Milliseconds left before a response must already be on its way. */
  remaining() {
    return Math.max(0, this.endsAt - Date.now());
  }

  elapsed() {
    return Date.now() - this.startedAt;
  }

  /** Is there enough time left for another model call to be worth starting? */
  canStart(minMs = MIN_USEFUL_MS) {
    return this.remaining() >= minMs;
  }

  /**
   * The timeout to hand one SDK call: what it would like, or what is left.
   *
   * Never larger than the remaining budget, so the SDK gives up and throws a
   * catchable error while this process is still alive to explain it.
   */
  timeoutFor(preferredMs = config.anthropicTimeoutMs) {
    return Math.max(1000, Math.min(numberOr(preferredMs), this.remaining()));
  }

  /**
   * Refuse to begin work that cannot finish.
   *
   * @param {string} what human-readable name of the step being attempted
   * @throws {Error} carrying statusCode 504 and a remedy
   */
  assertCanStart(what, minMs = MIN_USEFUL_MS) {
    if (this.canStart(minMs)) return;
    const err = /** @type {AppError} */ (new Error(
      `Not enough time left to ${what}: ${Math.round(this.elapsed() / 1000)}s of the `
      + `${Math.round(this.budgetMs / 1000)}s request budget is already spent.`));
    err.statusCode = 504;
    err.code = 'DEADLINE_EXCEEDED';
    err.remedy = 'Paste the document text instead of uploading a PDF, or split it into smaller documents.';
    throw err;
  }

  /**
   * SDK client options for one call on this deadline.
   *
   * maxRetries is zero on purpose: a retry doubles the wall clock, and there
   * is no wall clock to spare. Retrying is what turned a 20-second ceiling
   * into a 40-second one against a 26-second function.
   */
  clientOptions(preferredMs) {
    return { timeout: this.timeoutFor(preferredMs), maxRetries: 0 };
  }
}

/**
 * A deadline from what the platform says is left, or the configured budget.
 *
 * `new Deadline()` starts counting when it is built — but the platform's
 * clock started at invocation, and everything before the handler is already
 * spent: a cold start of the bundle, Firebase initialising, the parse of an
 * 80KB base64 PDF body. A deadline built from the handler's own clock
 * believed it had the full 26 seconds when several were gone, handed the
 * SDK a timeout longer than the time that remained, and was killed by the
 * platform before the SDK could throw something catchable. That is how a
 * request ends with no body. Lambda's `getRemainingTimeInMillis()` is the
 * authoritative answer; the HTTP layer reads it off the invocation and
 * hands the figure here (`platform/http/deadline.js`), so this module knows
 * nothing about a request.
 *
 * @param {number} [remainingMs] what the platform says is left
 */
function fromRemaining(remainingMs) {
  const remaining = Number(remainingMs);
  if (Number.isFinite(remaining) && remaining > 0) return new Deadline(remaining);
  return new Deadline();
}

module.exports = { Deadline, fromRemaining, RESPONSE_MARGIN_MS, MIN_USEFUL_MS };
