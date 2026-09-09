/**
 * CarbonIQ FinTech — Engine Bridge
 *
 * Interface to the existing CarbonIQ carbon calculation engine.
 * Reads from data.js and tender.js logic without modifying them.
 *
 * IMPORTANT: This bridge is READ-ONLY for the core engine.
 * It never calls functions that modify tender state, GWP factors,
 * or the 80% threshold.
 *
 * The bridge accesses engine results through Firebase (where the core
 * platform stores its calculation outputs), not by importing JS files
 * directly — because the core JS files are client-side (browser) code
 * that cannot be imported into Node.js without adaptation.
 */

const { getProjectTenders, getProjectEntries } = require('./firebase');

// ---------------------------------------------------------------------------
// Tender / BOQ Analysis Results
// ---------------------------------------------------------------------------

/**
 * Get the 80% significant materials for a project.
 * Reads from the tender scenario stored by the core engine.
 *
 * @param {string} projectId
 * @returns {Object} { items: [...], totalBaseline, totalTarget, threshold80Pct }
 */
async function get80PctMaterials(projectId) {
  const tenders = await getProjectTenders(projectId);
  if (!tenders) return null;

  // Find the active scenario (or the first one)
  const scenarios = Object.values(tenders);
  const active = scenarios.find(s => s.active) || scenarios[0];
  if (!active || !active.items) return null;

  const items = Object.values(active.items);

  // Sort by baseline emission descending (same as recalcTender80Pct)
  const sorted = items
    .filter(item => item.baselineEmission > 0)
    .sort((a, b) => b.baselineEmission - a.baselineEmission);

  const totalBaseline = sorted.reduce((sum, item) => sum + item.baselineEmission, 0);
  const threshold = totalBaseline * 0.80; // ISO 21930 mandated

  let cumulative = 0;
  const significant = [];
  for (const item of sorted) {
    cumulative += item.baselineEmission;
    significant.push({
      ...item,
      cumulativeEmission: cumulative,
      cumulativePercent: cumulative / totalBaseline,
      inTop80Pct: cumulative <= threshold || significant.length === 0
    });
  }

  return {
    items: significant,
    totalBaseline,
    totalTarget: items.reduce((sum, item) => sum + (item.targetEmission || 0), 0),
    threshold80Pct: threshold,
    totalItems: items.length,
    significantCount: significant.filter(i => i.inTop80Pct).length
  };
}

/**
 * Get emission summary for a project.
 *
 * @param {string} projectId
 * @returns {Object} { totalBaseline_tCO2e, totalTarget_tCO2e, reductionPct, materialCount, ... }
 */
async function getEmissionSummary(projectId) {
  const result = await get80PctMaterials(projectId);
  if (!result) return null;

  const { totalBaseline, totalTarget, items, significantCount, totalItems } = result;
  const reductionPct = totalBaseline > 0
    ? ((totalBaseline - totalTarget) / totalBaseline) * 100
    : 0;

  return {
    totalBaseline_tCO2e: Math.round(totalBaseline * 100) / 100,
    totalTarget_tCO2e: Math.round(totalTarget * 100) / 100,
    reduction_tCO2e: Math.round((totalBaseline - totalTarget) * 100) / 100,
    reductionPct: Math.round(reductionPct * 10) / 10,
    totalMaterials: totalItems,
    significantMaterials: significantCount,
    conversionFailures: items.filter(i => i.conversionFailed).length,
    unmatchedItems: items.filter(i => !i.category || i.category === 'Unmatched').length
  };
}

/**
 * Get the material breakdown for a project.
 *
 * @param {string} projectId
 * @returns {Object[]} Array of { category, type, totalEmission, count, percentage }
 */
async function getMaterialBreakdown(projectId) {
  const result = await get80PctMaterials(projectId);
  if (!result) return null;

  const byCategory = {};
  for (const item of result.items) {
    const cat = item.category || 'Unmatched';
    if (!byCategory[cat]) {
      byCategory[cat] = { category: cat, totalEmission: 0, count: 0, types: new Set() };
    }
    byCategory[cat].totalEmission += item.baselineEmission;
    byCategory[cat].count++;
    if (item.type) byCategory[cat].types.add(item.type);
  }

  return Object.values(byCategory)
    .map(cat => ({
      category: cat.category,
      totalEmission_tCO2e: Math.round(cat.totalEmission * 100) / 100,
      count: cat.count,
      percentage: result.totalBaseline > 0
        ? Math.round((cat.totalEmission / result.totalBaseline) * 1000) / 10
        : 0,
      types: [...cat.types]
    }))
    .sort((a, b) => b.totalEmission_tCO2e - a.totalEmission_tCO2e);
}

module.exports = {
  get80PctMaterials,
  getEmissionSummary,
  getMaterialBreakdown
};
