/**
 * CarbonIQ FinTech — Taxonomy Alignment Service
 *
 * Checks project carbon data against multiple green taxonomies:
 * - ASEAN Taxonomy v3 (Tier 1: Green, Tier 2: Transition)
 * - EU Taxonomy (DNSH criteria, WLC threshold)
 * - HK Green Classification Framework (Dark/Light Green, Transitioning)
 * - Singapore TSC (Green Mark alignment)
 * - Sri Lanka Green Finance Taxonomy (SLGFT) — SLSIC sector + activity code
 */

const {
  TAXONOMY_ASEAN, TAXONOMY_EU, TAXONOMY_HK, TAXONOMY_SG, TAXONOMY_LK
} = require('../config/constants');

/**
 * Check project against all taxonomies.
 *
 * @param {Object} projectMetrics - { totalEmission_tCO2e, buildingArea_m2, reductionPct, hasLCA, hasEPD, slsicSector, activityCode }
 * @returns {Object} Alignment results per taxonomy
 */
function checkAllTaxonomies(projectMetrics) {
  return {
    asean: checkASEAN(projectMetrics),
    eu: checkEU(projectMetrics),
    hongKong: checkHK(projectMetrics),
    singapore: checkSG(projectMetrics),
    sriLanka: checkSriLanka(projectMetrics),
    assessedAt: new Date().toISOString()
  };
}

function checkASEAN(metrics) {
  const intensity = metrics.buildingArea_m2 > 0
    ? (metrics.totalEmission_tCO2e * 1000) / metrics.buildingArea_m2
    : null;

  const criteria = TAXONOMY_ASEAN.tiers;

  if (intensity !== null && intensity <= criteria.green.construction.maxEmbodiedCarbon_kgCO2e_per_m2) {
    return { tier: 'green', label: criteria.green.label, intensity_kgCO2e_m2: intensity };
  }
  if (intensity !== null && intensity <= criteria.transition.construction.maxEmbodiedCarbon_kgCO2e_per_m2) {
    return { tier: 'transition', label: criteria.transition.label, intensity_kgCO2e_m2: intensity };
  }
  return { tier: 'not_aligned', label: 'Not Aligned', intensity_kgCO2e_m2: intensity };
}

function checkEU(metrics) {
  const requiresWLC = metrics.buildingArea_m2 > TAXONOMY_EU.criteria.construction.wholeLifeCarbonThreshold_m2;
  return {
    aligned: metrics.hasLCA && metrics.reductionPct >= 10,
    requiresWholeLifeCarbon: requiresWLC,
    dnshChecks: TAXONOMY_EU.criteria.construction.dnsh.map(c => ({
      criterion: c, status: 'pending_assessment'
    }))
  };
}

function checkHK(metrics) {
  const intensity = metrics.buildingArea_m2 > 0
    ? (metrics.totalEmission_tCO2e * 1000) / metrics.buildingArea_m2
    : null;

  // Approximate score based on reduction achievement
  const score = Math.min(100, Math.round(metrics.reductionPct * 2.5 + (metrics.hasEPD ? 20 : 0)));

  for (const [key, def] of Object.entries(TAXONOMY_HK.classifications)) {
    if (score >= def.minScore) {
      return { classification: key, label: def.label, score, beamPlus: def.beamPlus };
    }
  }
  return { classification: 'not_aligned', label: 'Not Aligned', score };
}

function checkSG(metrics) {
  const reductionPct = metrics.reductionPct || 0;
  let greenMark = null;

  for (const [key, def] of Object.entries(TAXONOMY_SG.greenMark)) {
    if (reductionPct >= def.minReduction) {
      greenMark = { level: key, label: def.label };
      break;
    }
  }

  return {
    greenMark: greenMark || { level: 'not_rated', label: 'Below threshold' },
    carbonTaxExposure_SGD: Math.round(metrics.totalEmission_tCO2e * TAXONOMY_SG.carbonTax.rate_SGD_per_tCO2e)
  };
}

/**
 * Check project against Sri Lanka Green Finance Taxonomy (SLGFT).
 * Uses SLSIC sector code, activity code, and embodied carbon intensity.
 */
function checkSriLanka(metrics) {
  const intensity = metrics.buildingArea_m2 > 0
    ? (metrics.totalEmission_tCO2e * 1000) / metrics.buildingArea_m2
    : null;

  const activityCode = metrics.activityCode || null;
  const slsicSector  = metrics.slsicSector  || null;

  // Look up activity from the taxonomy
  let matchedActivity = null;
  if (activityCode) {
    matchedActivity = TAXONOMY_LK.constructionActivities.find(a => a.code === activityCode) || null;
  }

  // Determine eligibility tier
  let tier, label, dnshStatus;

  if (matchedActivity && matchedActivity.eligibility === 'direct') {
    tier  = 'directly_eligible';
    label = 'Directly Eligible';
  } else if (intensity !== null && intensity <= TAXONOMY_LK.thresholds.green) {
    tier  = 'green';
    label = 'Green — Aligned';
  } else if (intensity !== null && intensity <= TAXONOMY_LK.thresholds.transition) {
    tier  = 'transition';
    label = 'Transition — Conditional';
  } else {
    tier  = 'not_aligned';
    label = intensity === null ? 'Pending Assessment' : 'Not Aligned';
  }

  // DNSH checklist — guiding principles
  dnshStatus = TAXONOMY_LK.guidingPrinciples.map(p => ({
    principle: p,
    status: 'pending_verification',
  }));

  // Sector info
  const sectorInfo = slsicSector ? TAXONOMY_LK.sectors[slsicSector] : null;

  // Objective classification from activity code prefix
  const objectiveCode = activityCode ? activityCode[0] : null;
  const objective = objectiveCode ? TAXONOMY_LK.environmentalObjectives[objectiveCode] : null;

  return {
    tier,
    label,
    intensity_kgCO2e_m2:  intensity !== null ? Math.round(intensity) : null,
    threshold_green:       TAXONOMY_LK.thresholds.green,
    threshold_transition:  TAXONOMY_LK.thresholds.transition,
    activityCode,
    matchedActivity:       matchedActivity || null,
    objective:             objective || null,
    slsicSector:           sectorInfo || null,
    dnshChecks:            dnshStatus,
    ndcContribution: {
      unconditional: TAXONOMY_LK.ndcTargets.unconditional,
      sdgs:          TAXONOMY_LK.ndcTargets.keySDGs,
    },
    framework: TAXONOMY_LK.name,
    version:   TAXONOMY_LK.version,
  };
}

module.exports = { checkAllTaxonomies, checkSriLanka };
