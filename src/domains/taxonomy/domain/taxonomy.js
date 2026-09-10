// @ts-check
/**
 * CarbonIQ FinTech — Taxonomy Alignment Service
 *
 * Checks project carbon data against multiple green taxonomies:
 * - ASEAN Taxonomy v3 (Tier 1: Green, Tier 2: Transition)
 * - EU Taxonomy (DNSH criteria, WLC threshold)
 * - HK Green Classification Framework (Dark/Light Green, Transitioning)
 * - Singapore TSC (Green Mark alignment)
 *
 */

'use strict';

const {
  TAXONOMY_ASEAN, TAXONOMY_EU, TAXONOMY_HK, TAXONOMY_SG, TAXONOMY_SL
} = require('../../../shared/constants');

/**
 * Check project against all taxonomies.
 *
 * @param {Object} projectMetrics - { totalEmission_tCO2e, buildingArea_m2, reductionPct, hasLCA, hasEPD }
 * @returns {Object} Alignment results per taxonomy
 */
/**
 * @param {any} projectMetrics
 * @param {{sriLanka?: {green: number, transition: number, basis?: string, provisional?: boolean}}} [baselines]
 *   The Sri Lanka bands come from the master baseline registry, resolved by
 *   the caller and handed in. This layer imports no registry and reads no
 *   store — a screening engine that fetched its own thresholds could not be
 *   run twice against two of them, which is exactly what a restatement needs.
 *   Absent, it falls back to the shipped screen, and says so on the result.
 */
function checkAllTaxonomies(projectMetrics, baselines = {}) {
  return {
    asean: checkASEAN(projectMetrics),
    eu: checkEU(projectMetrics),
    hongKong: checkHK(projectMetrics),
    singapore: checkSG(projectMetrics),
    sriLanka: checkSL(projectMetrics, baselines.sriLanka),
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
 * The Sri Lanka screen.
 *
 * The bands are **this product's own intensity screen**, not a taxonomy
 * threshold: the SLGFT held in this repository sets no absolute kgCO2e/m²
 * figure anywhere, its construction criteria being relative (M6.1, M6.3) or
 * certification-based (M6.2). Two band sets used to be live at once — 520/780
 * here and 600/900 on the certificate — so a building at 560 was Green from
 * one endpoint and Transition from another. There is one set now, and it is
 * governed: released, versioned and superseded through the baseline registry
 * rather than edited in a constants file.
 *
 * @param {any} metrics
 * @param {{green: number, transition: number, basis?: string, provisional?: boolean}} [bands]
 */
function checkSL(metrics, bands) {
  const intensity = metrics.buildingArea_m2 > 0
    ? (metrics.totalEmission_tCO2e * 1000) / metrics.buildingArea_m2
    : null;

  const given = bands || /** @type {{green?: number, transition?: number, basis?: string, provisional?: boolean}} */ ({});
  const green = Number.isFinite(Number(given.green))
    ? Number(given.green) : TAXONOMY_SL.classifications.green.maxIntensity;
  const transition = Number.isFinite(Number(given.transition))
    ? Number(given.transition) : TAXONOMY_SL.classifications.transition.maxIntensity;

  const screen = {
    green, transition,
    basis: given.basis || 'Shipped intensity screen — no baseline was resolved for this request.',
    provisional: bands ? given.provisional !== false : true,
    isTaxonomyThreshold: false,
  };
  const framework = 'CBSL Direction No. 05/2022 + SLGFT';

  if (intensity !== null && intensity <= green) {
    return { classification: 'green', label: TAXONOMY_SL.classifications.green.label, intensity_kgCO2e_m2: intensity, framework, screen };
  }
  if (intensity !== null && intensity <= transition) {
    return { classification: 'transition', label: TAXONOMY_SL.classifications.transition.label, intensity_kgCO2e_m2: intensity, framework, screen };
  }
  return { classification: 'not_aligned', label: 'Not Aligned', intensity_kgCO2e_m2: intensity, framework, screen };
}

module.exports = { checkAllTaxonomies };
