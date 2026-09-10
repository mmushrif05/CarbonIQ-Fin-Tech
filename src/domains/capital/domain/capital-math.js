// @ts-check
/**
 * Rounding and summation, shared by the metrics and the pipeline.
 */

'use strict';

const round = (n, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};
const sum = (rows, pick) => rows.reduce((t, r) => t + (Number(pick(r)) || 0), 0);

// ---------------------------------------------------------------------------
// The pipeline, and how to choose from it
// ---------------------------------------------------------------------------

const clamp01 = (v) => Math.max(0, Math.min(1, v));

module.exports = { round, sum, clamp01 };
