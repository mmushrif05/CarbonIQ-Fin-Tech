/**
 * CarbonIQ FinTech — PCAF Part C: Sensitivity Analysis
 *
 * Ranks the inputs by how much of the disclosure they actually drive.
 *
 * In the MVP this feeds the REPORT: it tells the reader which handful of
 * numbers the disclosure really rests on, and it ranks the factor gaps by
 * aggregate materiality so Sri Lankan factor research can be prioritised by
 * evidence rather than intuition.
 *
 * In full development the same output repoints to drive the FORM — asking
 * only the three or four questions that move the number, instead of the full
 * fixed question set. Building it now means that switch is a re-wiring rather
 * than a rebuild.
 */

'use strict';

const { walk } = require('./provenance');

/**
 * Module-level contribution to the construction figure.
 */
function moduleContributions({ a4, a5, construction }) {
  const total = construction ? construction.value : 0;
  const rows = [];

  const push = (node, label) => {
    if (!node) return;
    rows.push({
      module: node.module, label: label || node.label,
      value: node.value,
      sharePct: total > 0 ? (node.value / total) * 100 : 0
    });
  };

  push(a4, 'A4 Transport to site');
  if (a5 && a5.children) a5.children.forEach(c => push(c));

  return rows.sort((x, y) => y.value - x.value);
}

/**
 * Rank the factors by the emissions flowing through them.
 *
 * A factor's materiality is the sum of the values of every leaf node that
 * consulted it, as a share of the construction figure. Gap-flagged factors
 * ranked this way become the research priority list.
 */
function factorMateriality(tree, constructionValue) {
  const totals = new Map();

  for (const node of walk(tree)) {
    if (!node.factors || node.factors.length === 0) continue;
    // Only count leaf-ish nodes carrying an emissions value, to avoid
    // double counting a parent and its children.
    if (node.unit !== 'kgCO2e') continue;
    if (node.children && node.children.some(c => c.unit === 'kgCO2e')) continue;

    for (const f of node.factors) {
      if (!f || !f.key) continue;
      const cur = totals.get(f.key) || { factor: f, value: 0, nodes: 0 };
      cur.value += node.value;
      cur.nodes += 1;
      totals.set(f.key, cur);
    }
  }

  return [...totals.values()]
    .map(r => ({
      key: r.factor.key,
      tier: r.factor.tier,
      reference: r.factor.reference,
      gap: r.factor.gap || null,
      isFallback: !!r.factor.fallback,
      emissionsThrough_kgCO2e: r.value,
      sharePct: constructionValue > 0 ? (r.value / constructionValue) * 100 : 0,
      appearances: r.nodes
    }))
    .sort((a, b) => b.emissionsThrough_kgCO2e - a.emissionsThrough_kgCO2e);
}

/**
 * The inputs worth asking about, ranked. Drives questioning in full dev.
 */
function rankedInputs({ a4, a5, construction }) {
  const total = construction ? construction.value : 0;
  const out = [];

  if (a5 && a5.children) {
    for (const sub of a5.children) {
      const share = total > 0 ? (sub.value / total) * 100 : 0;
      if (sub.module === 'A5.2') {
        out.push({ input: 'Site energy basis (previous-project fuel, or RICS default)',
                   module: 'A5.2', sharePct: share, priority: 1 });
      } else if (sub.module === 'A5.1') {
        out.push({ input: 'Demolition scope and haul distance', module: 'A5.1', sharePct: share, priority: 2 });
      } else if (sub.module === 'A5.3') {
        out.push({ input: 'Waste disposal distance', module: 'A5.3', sharePct: share, priority: 4 });
      }
    }
  }

  if (a4 && a4.items) {
    const vital = (a4.vitalFew || []).map(v => v.name);
    out.push({
      input: vital.length
        ? `Haul distance for the Pareto vital few: ${vital.join(', ')}`
        : 'Material haul distances',
      module: 'A4',
      sharePct: total > 0 ? (a4.value / total) * 100 : 0,
      priority: 3,
      detail: `${vital.length} of ${a4.items.length} materials account for ~80% of A4`
    });
  }

  return out.sort((a, b) => b.sharePct - a.sharePct);
}

function analyse({ a4, a5, construction, tree }) {
  const constructionValue = construction ? construction.value : 0;
  const factorRank = factorMateriality(tree, constructionValue);
  return {
    moduleContributions: moduleContributions({ a4, a5, construction }),
    rankedInputs: rankedInputs({ a4, a5, construction }),
    factorMateriality: factorRank,
    topFactorGaps: factorRank.filter(f => f.gap || f.isFallback).slice(0, 10)
  };
}

module.exports = { analyse, moduleContributions, factorMateriality, rankedInputs };
