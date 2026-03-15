/**
 * CarbonIQ FinTech — PCAF v3 Output Service
 *
 * Formats CarbonIQ assessment output per PCAF v3 methodology.
 * Calculates data quality scores and attribution factors.
 *
 * PCAF Data Quality (1=best, 5=worst):
 *   1: Audited/verified project-specific EPD data
 *   2: Project-specific data from CarbonIQ with A1-A3 factors
 *   3: Assessment using ICE v3.0 generic database factors
 *   4: Building-type average proxy
 *   5: Sector-level average with no project-specific data
 *
 * Implementation: Step 7
 */

const { PCAF_DATA_QUALITY } = require('../config/constants');
const config = require('../config');

/**
 * Generate PCAF-compliant output for a project.
 *
 * @param {Object} params
 * @param {Object} params.emissionSummary - From engine bridge
 * @param {Object} params.materials80Pct - From engine bridge
 * @param {number} params.attributionFactor - Bank's share (0-1), default from config
 * @param {number} params.loanAmount - Bank's outstanding loan amount
 * @param {number} params.projectValue - Total project value
 * @returns {Object} PCAF-compliant output
 */
function generatePCAFOutput({ emissionSummary, materials80Pct, attributionFactor, loanAmount, projectValue }) {
  const attribution = attributionFactor || calculateAttribution(loanAmount, projectValue);
  const dataQuality = calculateDataQualityScore(materials80Pct);
  const financedEmissions = emissionSummary.totalBaseline_tCO2e * attribution;

  return {
    standard: `PCAF v${config.pcaf.version}`,
    scope: 'A1-A3 (Cradle-to-gate embodied carbon)',

    financedEmissions: {
      total_tCO2e: Math.round(financedEmissions * 100) / 100,
      attributionFactor: Math.round(attribution * 1000) / 1000,
      projectTotal_tCO2e: emissionSummary.totalBaseline_tCO2e
    },

    dataQuality: {
      score: dataQuality.score,
      label: PCAF_DATA_QUALITY[dataQuality.score].name,
      description: PCAF_DATA_QUALITY[dataQuality.score].description,
      justification: dataQuality.justification,
      improvementPath: dataQuality.improvementPath
    },

    methodology: {
      classificationSystem: 'ECCS 6-step hierarchy',
      emissionFactorSources: ['A1-A3 Consultant Approved', 'ICE Database v3.0'],
      complianceStandard: 'ISO 21930',
      significantMaterialMethod: '80% Pareto analysis',
      totalMaterials: emissionSummary.totalMaterials,
      classifiedMaterials: emissionSummary.totalMaterials - emissionSummary.unmatchedItems,
      conversionFailures: emissionSummary.conversionFailures
    },

    generatedAt: new Date().toISOString()
  };
}

function calculateAttribution(loanAmount, projectValue) {
  if (loanAmount && projectValue && projectValue > 0) {
    return Math.min(1, loanAmount / projectValue);
  }
  return config.pcaf.defaultAttribution;
}

function calculateDataQualityScore(materials) {
  if (!materials || !materials.items || materials.items.length === 0) {
    return {
      score: 5,
      justification: 'No project-specific data available.',
      improvementPath: 'Upload BOQ for material-level assessment (improves to score 2-3).'
    };
  }

  const significant = materials.items.filter(i => i.inTop80Pct);
  const withEPD = significant.filter(i => i.epdVerified);
  const withA13 = significant.filter(i => i.factorSource === 'A1-A3');

  // Score 1: All significant materials have verified EPDs
  if (withEPD.length === significant.length && significant.length > 0) {
    return {
      score: 1,
      justification: `All ${significant.length} significant materials have third-party verified EPDs.`,
      improvementPath: 'Maximum data quality achieved.'
    };
  }

  // Score 2: Project-specific assessment with A1-A3 consultant factors
  if (withA13.length > significant.length * 0.5) {
    return {
      score: 2,
      justification: `Project-specific assessment: ${withA13.length}/${significant.length} significant materials use consultant-approved A1-A3 factors.`,
      improvementPath: `Submit EPDs for ${significant.length - withEPD.length} remaining materials to achieve score 1.`
    };
  }

  // Score 3: Assessment using ICE generic factors
  return {
    score: 3,
    justification: `Assessment using ICE v3.0 database factors. ${materials.totalItems} materials classified.`,
    improvementPath: 'Request consultant-approved A1-A3 factors for significant materials to achieve score 2.'
  };
}

module.exports = { generatePCAFOutput };
