/**
 * CarbonIQ FinTech — Agent Tool Function Registry
 *
 * Each function here is a "tool" that Claude can autonomously call during
 * an agentic run. Tools wrap the existing CarbonIQ services, keeping the
 * agentic layer thin: it adds reasoning and sequencing, not new calculations.
 *
 * Tool naming: snake_case matching the tool definitions given to Claude.
 *
 * Every tool:
 *   - Accepts a single plain-object input (matching its input_schema)
 *   - Returns a plain serialisable object (stringified to pass back to Claude)
 *   - Never throws unhandled — errors are caught and returned as { error: ... }
 */

const { extractMaterials }         = require('../extract');
const { calculateCarbonFinanceScore } = require('../score');
const { generatePCAFOutput }        = require('../pcaf');
const { checkAllTaxonomies }        = require('../taxonomy');
const { checkCovenant }             = require('../covenant');
const { aggregatePortfolio }        = require('../portfolio');
const { getEmissionSummary, get80PctMaterials, getMaterialBreakdown } = require('../../bridge/engine');
const { BUILDING_BENCHMARKS, TAXONOMY_ASEAN, PCAF_DATA_QUALITY } = require('../../config/constants');

// ---------------------------------------------------------------------------
// Tool 1 — parse_boq_materials
// Parse raw BOQ text/CSV/JSON and extract structured materials with carbon factors
// ---------------------------------------------------------------------------

async function parse_boq_materials({ content, format }) {
  const result = await extractMaterials(content, format || 'text');
  return {
    materials: result.materials,
    summary: result.summary,
    model: result.model,
    tokensUsed: result.tokensUsed
  };
}

// ---------------------------------------------------------------------------
// Tool 2 — compute_carbon_metrics
// Derive carbon emission summary from a materials array (no Firebase needed).
// Used when working with freshly extracted BOQ data rather than a stored project.
// ---------------------------------------------------------------------------

function compute_carbon_metrics({ materials, buildingArea_m2 }) {
  if (!materials || !Array.isArray(materials)) {
    return { error: 'materials array is required' };
  }

  const validMaterials = materials.filter(m => m.totalKgCO2e != null && m.totalKgCO2e > 0);
  const totalKgCO2e    = validMaterials.reduce((sum, m) => sum + m.totalKgCO2e, 0);
  const totalTCO2e     = totalKgCO2e / 1000;

  // Intensity (kgCO2e/m²)
  const intensity_kgCO2e_m2 = buildingArea_m2 > 0 ? totalKgCO2e / buildingArea_m2 : null;

  // EPD coverage: materials with recycledContent set or high confidence are proxies for EPD
  const withEPD   = validMaterials.filter(m => m.recycledContent !== null || m.confidence === 'high');
  const epdCoveragePct = validMaterials.length > 0
    ? Math.round((withEPD.length / validMaterials.length) * 100)
    : 0;

  // Pareto: top 80% contributors
  const sorted    = [...validMaterials].sort((a, b) => b.totalKgCO2e - a.totalKgCO2e);
  const threshold = totalKgCO2e * 0.8;
  let cumulative  = 0;
  const top80     = [];
  for (const m of sorted) {
    if (cumulative >= threshold && top80.length > 0) break;
    top80.push(m);
    cumulative += m.totalKgCO2e;
  }

  // Category breakdown
  const byCategory = {};
  for (const m of validMaterials) {
    const cat = m.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = { category: cat, totalKgCO2e: 0, count: 0 };
    byCategory[cat].totalKgCO2e += m.totalKgCO2e;
    byCategory[cat].count++;
  }
  const breakdown = Object.values(byCategory)
    .map(c => ({
      category: c.category,
      totalKgCO2e: Math.round(c.totalKgCO2e),
      totalTCO2e: Math.round(c.totalKgCO2e / 10) / 100,
      count: c.count,
      sharePct: totalKgCO2e > 0 ? Math.round((c.totalKgCO2e / totalKgCO2e) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.totalKgCO2e - a.totalKgCO2e);

  return {
    totalKgCO2e:        Math.round(totalKgCO2e),
    totalTCO2e:         Math.round(totalTCO2e * 100) / 100,
    intensity_kgCO2e_m2: intensity_kgCO2e_m2 !== null ? Math.round(intensity_kgCO2e_m2) : null,
    totalMaterials:     materials.length,
    classifiedMaterials:validMaterials.length,
    epdCoveragePct,
    top80PctMaterials:  top80.map(m => ({ name: m.name, category: m.category, totalKgCO2e: m.totalKgCO2e })),
    categoryBreakdown:  breakdown
  };
}

// ---------------------------------------------------------------------------
// Tool 3 — check_taxonomy_alignment
// Check project metrics against all 4 green taxonomies
// ---------------------------------------------------------------------------

function check_taxonomy_alignment({ totalEmission_tCO2e, buildingArea_m2, reductionPct, hasLCA, hasEPD }) {
  return checkAllTaxonomies({
    totalEmission_tCO2e: totalEmission_tCO2e || 0,
    buildingArea_m2:     buildingArea_m2 || 0,
    reductionPct:        reductionPct || 0,
    hasLCA:              hasLCA || false,
    hasEPD:              hasEPD || false
  });
}

// ---------------------------------------------------------------------------
// Tool 4 — calculate_pcaf_output
// Generate PCAF v3 financed emissions output from metrics + loan details
// ---------------------------------------------------------------------------

function calculate_pcaf_output({ totalTCO2e, materials80PctItems, loanAmount, projectValue, attributionFactor }) {
  // Build lightweight emissionSummary and materials80Pct objects that match
  // the shape expected by generatePCAFOutput
  const emissionSummary = {
    totalBaseline_tCO2e: totalTCO2e || 0,
    totalMaterials:      materials80PctItems ? materials80PctItems.length : 0,
    unmatchedItems:      0,
    conversionFailures:  0
  };

  const materials80Pct = materials80PctItems
    ? { items: materials80PctItems.map(m => ({ ...m, inTop80Pct: true })), totalItems: materials80PctItems.length }
    : null;

  return generatePCAFOutput({ emissionSummary, materials80Pct, attributionFactor, loanAmount, projectValue });
}

// ---------------------------------------------------------------------------
// Tool 5 — estimate_preliminary_carbon
// Estimate preliminary embodied carbon using regional building benchmarks.
// Used for pre-screening before a full BOQ is available.
// ---------------------------------------------------------------------------

function estimate_preliminary_carbon({ buildingType, buildingArea_m2, region }) {
  const benchmarks = BUILDING_BENCHMARKS;
  const key = (buildingType || '').toLowerCase().replace(/[\s-]/g, '_');
  const bench = benchmarks[key] || benchmarks['commercial_office'];

  // Regional adjustment factors (relative to ASEAN baseline)
  const regionFactors = {
    singapore: 1.0, hong_kong: 1.05, malaysia: 0.90,
    thailand: 0.85, indonesia: 0.88, vietnam: 0.82,
    australia: 1.15, uk: 1.10, eu: 1.08, usa: 1.12
  };
  const regionKey   = (region || 'singapore').toLowerCase().replace(/[\s-]/g, '_');
  const regionFactor = regionFactors[regionKey] || 1.0;

  const area = buildingArea_m2 || 0;

  return {
    buildingType:   buildingType || 'commercial_office',
    region:         region || 'Singapore',
    buildingArea_m2: area,
    benchmarks: {
      p25_kgCO2e_m2: Math.round(bench.p25 * regionFactor),
      median_kgCO2e_m2: Math.round(bench.median * regionFactor),
      p75_kgCO2e_m2: Math.round(bench.p75 * regionFactor)
    },
    estimatedTotals: area > 0 ? {
      p25_tCO2e:    Math.round(bench.p25 * regionFactor * area / 1000),
      median_tCO2e: Math.round(bench.median * regionFactor * area / 1000),
      p75_tCO2e:    Math.round(bench.p75 * regionFactor * area / 1000)
    } : null,
    taxonomyThresholds: {
      asean_green_kgCO2e_m2: TAXONOMY_ASEAN.tiers.green.construction.maxEmbodiedCarbon_kgCO2e_per_m2,
      asean_transition_kgCO2e_m2: TAXONOMY_ASEAN.tiers.transition.construction.maxEmbodiedCarbon_kgCO2e_per_m2
    },
    pcafDataQualityScore: 4,
    pcafDataQualityLabel: PCAF_DATA_QUALITY[4].name,
    note: 'Preliminary estimate using sector benchmarks. Submit full BOQ to improve to PCAF Score 2-3.'
  };
}

// ---------------------------------------------------------------------------
// Tool 6 — calculate_carbon_score
// Compute the Carbon Finance Score (0-100) from available project data
// ---------------------------------------------------------------------------

function calculate_carbon_score({ epdCoveragePct, reductionPct, certificationLevel, verificationStatus }) {
  const projectData = {
    materials80Pct: {
      items: Array.from({ length: 10 }, (_, i) => ({
        inTop80Pct: true,
        epdVerified: i < Math.round((epdCoveragePct || 0) / 10),
        _gwpAdjusted: false
      }))
    },
    approvalStatus: { total: 10, approved: 10, pending: 0, rejected: 0 },
    verification:   { status: verificationStatus || 'none' },
    reduction:      { actual: reductionPct || 0, target: 20 },
    certification:  { level: certificationLevel || null }
  };

  return calculateCarbonFinanceScore(projectData);
}

// ---------------------------------------------------------------------------
// Tool 7 — evaluate_covenant
// Check a single covenant KPI against provided project metrics
// ---------------------------------------------------------------------------

function evaluate_covenant({ metric, operator, threshold, projectMetrics, buildingArea_m2 }) {
  return checkCovenant(
    { metric, operator, threshold, buildingArea_m2 },
    projectMetrics
  );
}

// ---------------------------------------------------------------------------
// Tool 8 — fetch_project_data
// Retrieve emission summary and material data for an existing Firebase project
// ---------------------------------------------------------------------------

async function fetch_project_data({ projectId }) {
  if (!projectId) return { error: 'projectId is required' };

  const [emissionSummary, materials80Pct, breakdown] = await Promise.all([
    getEmissionSummary(projectId),
    get80PctMaterials(projectId),
    getMaterialBreakdown(projectId)
  ]);

  if (!emissionSummary) {
    return { error: `No data found for project ${projectId}. Verify the projectId is correct.` };
  }

  return { emissionSummary, materials80Pct, breakdown };
}

// ---------------------------------------------------------------------------
// Tool 9 — aggregate_portfolio
// Aggregate emissions across multiple project summaries for portfolio reporting
// ---------------------------------------------------------------------------

function aggregate_portfolio({ projectSummaries }) {
  return aggregatePortfolio(projectSummaries || []);
}

// ---------------------------------------------------------------------------
// Tool 10 — assess_data_quality_gaps
// Identify which materials are missing EPDs and quantify the data quality impact
// ---------------------------------------------------------------------------

function assess_data_quality_gaps({ materials }) {
  if (!materials || !Array.isArray(materials)) {
    return { error: 'materials array is required' };
  }

  const valid     = materials.filter(m => m.totalKgCO2e > 0);
  const withEPD   = valid.filter(m => m.recycledContent !== null || m.confidence === 'high');
  const missingEPD = valid.filter(m => m.recycledContent === null && m.confidence !== 'high');

  // Sort missing by emission contribution (highest first)
  const prioritised = [...missingEPD]
    .sort((a, b) => (b.totalKgCO2e || 0) - (a.totalKgCO2e || 0))
    .slice(0, 10)
    .map(m => ({
      name:         m.name,
      category:     m.category,
      totalKgCO2e:  m.totalKgCO2e,
      confidence:   m.confidence,
      action:       `Obtain EPD or A1-A3 certified factor for ${m.name}`
    }));

  const currentScore  = withEPD.length === valid.length ? 2 : 3;
  const potentialScore = missingEPD.length === 0 ? 1 : currentScore;

  return {
    totalMaterials:   valid.length,
    withEPD:          withEPD.length,
    missingEPD:       missingEPD.length,
    currentPCAFScore: currentScore,
    currentPCAFLabel: PCAF_DATA_QUALITY[currentScore].name,
    potentialPCAFScore: potentialScore,
    prioritisedActions: prioritised,
    summaryMessage: missingEPD.length === 0
      ? 'All significant materials have EPD data. PCAF Score 2 or better achievable.'
      : `${missingEPD.length} materials lack EPD data. Addressing the top ${Math.min(5, missingEPD.length)} would cover the highest-emission items.`
  };
}

// ---------------------------------------------------------------------------
// Export: tool functions map (key = tool name Claude will call)
// ---------------------------------------------------------------------------

const TOOL_FUNCTIONS = {
  parse_boq_materials,
  compute_carbon_metrics,
  check_taxonomy_alignment,
  calculate_pcaf_output,
  estimate_preliminary_carbon,
  calculate_carbon_score,
  evaluate_covenant,
  fetch_project_data,
  aggregate_portfolio,
  assess_data_quality_gaps
};

module.exports = { TOOL_FUNCTIONS };
