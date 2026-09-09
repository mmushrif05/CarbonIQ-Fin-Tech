/**
 * CarbonIQ FinTech — PCAF Part C: Provenance Primitive
 *
 * Every number the Part C engine produces is a "traced value": the figure
 * plus the equation that made it, the inputs that fed it, the factors it
 * consulted (each with a data-quality tier and a named source), and any
 * assumptions taken along the way.
 *
 * This is deliberate. Spec §0a positions the product as "transparent,
 * audit-first, assumption-explicit — every number traces to an equation +
 * a named source + a data-quality tier". If the audit trail were narrated
 * after the fact it would drift from the arithmetic. Here it is generated
 * BY the arithmetic, so the two cannot disagree.
 *
 * The registers (assumptions, data gaps, audit trail) and the data-quality
 * score are all derived by walking the tree of traced values.
 */

'use strict';

/** Data-quality tiers, best first. Local (Sri Lankan) > Regional > Global. */
const TIERS = ['Local', 'Regional', 'Global'];

const TIER_RANK = { Local: 0, Regional: 1, Global: 2 };

/**
 * Build a traced value.
 *
 * @param {Object} spec
 * @param {number} spec.value          - The computed figure
 * @param {string} spec.unit           - e.g. 'kgCO2e'
 * @param {string} spec.module         - 'A4' | 'A5.1' | 'B1' | 'rollup' | ...
 * @param {string} spec.label          - Human-readable name of this quantity
 * @param {string} [spec.equation]     - The formula as written in the spec
 * @param {Object} [spec.inputs]       - Named inputs actually used
 * @param {Object[]} [spec.factors]    - Factor refs: {key,value,unit,tier,reference,gap?}
 * @param {Object[]} [spec.assumptions]- {code,message,severity}
 * @param {Object[]} [spec.children]   - Nested traced values
 * @returns {Object} traced value
 */
function traced({ value, unit, module, label, equation, inputs, factors, assumptions, children }) {
  return {
    value,
    unit:        unit        || 'kgCO2e',
    module:      module      || null,
    label:       label       || null,
    equation:    equation    || null,
    inputs:      inputs      || {},
    factors:     factors     || [],
    assumptions: assumptions || [],
    children:    children    || []
  };
}

/**
 * Record an assumption taken during calculation.
 *
 * severity:
 *   'info'     — a documented default was used as designed
 *   'notable'  — a benchmark stood in for actual data
 *   'material' — the assumption drives a large share of the result
 */
function assumption(code, message, severity = 'info', context = {}) {
  return { code, message, severity, context };
}

/**
 * Walk a traced-value tree depth-first, yielding every node.
 * @param {Object|Object[]} node
 * @returns {Object[]}
 */
function walk(node) {
  if (!node) return [];
  const nodes = Array.isArray(node) ? node : [node];
  const out = [];
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    out.push(n);
    if (n.children && n.children.length) out.push(...walk(n.children));
  }
  return out;
}

/**
 * Collect every distinct factor referenced anywhere in a tree.
 * Deduplicated by factor key.
 */
function collectFactors(tree) {
  const seen = new Map();
  for (const node of walk(tree)) {
    for (const f of node.factors || []) {
      if (f && f.key && !seen.has(f.key)) seen.set(f.key, f);
    }
  }
  return [...seen.values()];
}

/** Collect every assumption recorded anywhere in a tree (in encounter order). */
function collectAssumptions(tree) {
  const out = [];
  for (const node of walk(tree)) {
    for (const a of node.assumptions || []) {
      out.push({ ...a, module: node.module, label: node.label });
    }
  }
  return out;
}

/**
 * The worst (least local) tier present in a tree.
 * Drives the disclosed data-quality position: a result is only as good as
 * its weakest factor.
 *
 * @returns {'Local'|'Regional'|'Global'|null}
 */
function worstTier(tree) {
  let worst = null;
  for (const f of collectFactors(tree)) {
    if (!f.tier || TIER_RANK[f.tier] === undefined) continue;
    if (worst === null || TIER_RANK[f.tier] > TIER_RANK[worst]) worst = f.tier;
  }
  return worst;
}

/** Sum the .value of traced children, returning a plain number. */
function sumValues(nodes) {
  return (nodes || []).reduce((acc, n) => acc + (n && n.value ? n.value : 0), 0);
}

module.exports = {
  TIERS,
  TIER_RANK,
  traced,
  assumption,
  walk,
  collectFactors,
  collectAssumptions,
  worstTier,
  sumValues
};
