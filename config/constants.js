/**
 * CarbonIQ FinTech — Business Constants
 *
 * Thresholds, taxonomy criteria, PCAF scores, and scoring weights.
 * These are the business rules that drive the FinTech layer.
 *
 * IMPORTANT: The 80% threshold (0.80) is in the core engine (tender.js)
 * and is mandated by ISO 21930. Do NOT duplicate or override it here.
 */

// ---------------------------------------------------------------------------
// Carbon Finance Score (CFS) — 0 to 100
// ---------------------------------------------------------------------------

const CFS_WEIGHTS = {
  material: 0.30,       // % of 80% materials with verified EPDs
  compliance: 0.20,     // % of entries through approval workflow
  verification: 0.15,   // External verifier sign-off status
  reduction: 0.20,      // Actual reduction % vs baseline
  certification: 0.15   // Green certification level achieved
};

const CFS_THRESHOLDS = {
  green: 70,            // CFS >= 70 → Green classification
  transition: 40,       // CFS 40-69 → Transition classification
  brown: 0              // CFS < 40 → Brown classification
};

// ---------------------------------------------------------------------------
// PCAF Data Quality Scores (1 = best, 5 = worst)
// ---------------------------------------------------------------------------

const PCAF_DATA_QUALITY = {
  1: { name: 'Audited', description: 'Third-party verified, project-specific EPD data' },
  2: { name: 'Verified', description: 'Project-specific data from CarbonIQ assessment with A1-A3 factors' },
  3: { name: 'Estimated', description: 'Assessment using ICE v3.0 generic database factors' },
  4: { name: 'Proxy', description: 'Building-type average (tCO2e/m2) from sector benchmarks' },
  5: { name: 'Unknown', description: 'Sector-level average with no project-specific data' }
};

// ---------------------------------------------------------------------------
// Taxonomy Classification Criteria
// ---------------------------------------------------------------------------

const TAXONOMY_ASEAN = {
  version: 3,
  tiers: {
    green: {
      label: 'Green (Tier 1)',
      description: 'Activities that are already making a substantial contribution to climate mitigation',
      construction: {
        maxEmbodiedCarbon_kgCO2e_per_m2: 500,
        requiresLCA: true,
        requiresEPD: true
      }
    },
    transition: {
      label: 'Transition (Tier 2)',
      description: 'Activities on a pathway to green within a defined timeframe',
      construction: {
        maxEmbodiedCarbon_kgCO2e_per_m2: 800,
        requiresReductionPlan: true
      }
    }
  }
};

const TAXONOMY_EU = {
  version: 2024,
  criteria: {
    construction: {
      // EU Taxonomy: buildings > 5000m² require Whole Life Carbon calculation
      wholeLifeCarbonThreshold_m2: 5000,
      // Do No Significant Harm (DNSH) criteria
      dnsh: [
        'climate_adaptation',
        'water_marine',
        'circular_economy',
        'pollution_prevention',
        'biodiversity'
      ]
    }
  }
};

const TAXONOMY_HK = {
  version: 2024,
  classifications: {
    dark_green: { label: 'Dark Green', minScore: 85, beamPlus: 'Platinum' },
    light_green: { label: 'Light Green', minScore: 65, beamPlus: 'Gold' },
    transitioning: { label: 'Transitioning', minScore: 40, beamPlus: 'Silver' },
    not_aligned: { label: 'Not Aligned', minScore: 0, beamPlus: null }
  }
};

const TAXONOMY_SG = {
  version: 2024,
  greenMark: {
    superLowEnergy: { minReduction: 60, label: 'Super Low Energy' },
    zeroCarbonReady: { minReduction: 80, label: 'Zero Carbon Ready' },
    platinum: { minReduction: 40, label: 'Platinum' },
    goldPlus: { minReduction: 30, label: 'Gold Plus' }
  },
  carbonTax: {
    rate_SGD_per_tCO2e: 45,   // 2026-2027
    rate_2030_low: 50,
    rate_2030_high: 80
  }
};

// ---------------------------------------------------------------------------
// Sri Lanka Green Finance Taxonomy (SLGFT)
// Based on SLSIC sector classification — presented to DFCC Bank
// ---------------------------------------------------------------------------

const TAXONOMY_LK = {
  version: 2024,
  name: 'Sri Lanka Green Finance Taxonomy',
  regulator: 'Central Bank of Sri Lanka (CBSL)',

  // 4 Environmental Objectives
  environmentalObjectives: {
    M: { code: 'M', label: 'Climate Change Mitigation',    description: 'Reducing greenhouse gas emissions and transitioning to a low-carbon economy' },
    A: { code: 'A', label: 'Climate Change Adaptation',    description: 'Building resilience to climate impacts across sectors' },
    P: { code: 'P', label: 'Pollution Prevention & Control', description: 'Preventing and reducing pollution to air, water, land and marine environments' },
    E: { code: 'E', label: 'Ecological Conservation & Resource Efficiency', description: 'Coastal/marine resources, land/water resources, biodiversity and ecosystems' },
  },

  // Guiding Principles
  guidingPrinciples: [
    'Substantial contribution to at least one environmental objective',
    'Do No Significant Harm (DNSH) to other environmental objectives',
    "Respect Sri Lanka's green development priorities",
    'Science-based screening criteria',
    'Compatible with international standards & practices',
    'Dynamic adjustment as thresholds evolve',
  ],

  // 13 SLSIC Sectors (Standard Industrial Classification)
  sectors: {
    A: { code: 'A', slsic: 'A 01-03', label: 'Agriculture, Forestry & Fishing',                    icis: 3,  slsicDivisions: 3  },
    B: { code: 'B', slsic: 'B 05-09', label: 'Mining & Quarrying',                                  icis: 5,  slsicDivisions: 3  },
    C: { code: 'C', slsic: 'C 10-33', label: 'Manufacturing',                                       icis: 24, slsicDivisions: 23 },
    D: { code: 'D', slsic: 'D 35',    label: 'Electricity, Gas, Steam & Air Conditioning Supply',   icis: 1,  slsicDivisions: 1  },
    E: { code: 'E', slsic: 'E 36-39', label: 'Water Supply; Sewerage, Waste Management',            icis: 4,  slsicDivisions: 3  },
    F: { code: 'F', slsic: 'F 41-43', label: 'Construction',                                        icis: 3,  slsicDivisions: 3  },
    G: { code: 'G', slsic: 'G 45-47', label: 'Wholesale & Retail Trade; Repair of Motor Vehicles',  icis: 3,  slsicDivisions: 3  },
    H: { code: 'H', slsic: 'H 49-53', label: 'Transportation & Storage',                            icis: 5,  slsicDivisions: 5  },
    I: { code: 'I', slsic: 'I 55-56', label: 'Accommodation & Food Service Activities',             icis: 2,  slsicDivisions: 2  },
    J: { code: 'J', slsic: 'J 58-63', label: 'Information & Communication',                         icis: 6,  slsicDivisions: 6  },
    K: { code: 'K', slsic: 'K 64-66', label: 'Financial & Insurance Activities',                    icis: 3,  slsicDivisions: 3  },
    L: { code: 'L', slsic: 'L 68',    label: 'Real Estate Activities',                              icis: 1,  slsicDivisions: 1  },
    M: { code: 'M', slsic: 'M 69-75', label: 'Professional, Scientific & Technical Activities',     icis: 7,  slsicDivisions: 7  },
  },

  // Activity code structure: {OBJ}{MACRO_SECTOR}.{ACTIVITY}
  // e.g. M4.2 = Mitigation, 4th macro-sector, 2nd activity
  activityCodeStructure: {
    format: '{objective}{macroSector}.{activity}',
    example: 'M4.2',
    breakdown: {
      objective:   'M = Mitigation | A = Adaptation | P = Pollution | E = Ecological',
      macroSector: 'Ordinal number of macro-sector under the objective',
      activity:    'Ordinal number of activity within the macro-sector',
    },
  },

  // Key activities for construction sector (F 41-43)
  constructionActivities: [
    { code: 'M1.1', label: 'Green Buildings — New Construction',          objective: 'M', threshold_kgCO2e_m2: 600,  eligibility: 'threshold' },
    { code: 'M1.2', label: 'Green Buildings — Renovation',                objective: 'M', threshold_kgCO2e_m2: null, eligibility: 'direct',    note: '≥30% energy performance improvement' },
    { code: 'M4.1', label: 'Solar PV — Electricity Generation',           objective: 'M', threshold_kgCO2e_m2: null, eligibility: 'direct' },
    { code: 'M4.2', label: 'Concentrated Solar Power (CSP)',               objective: 'M', threshold_kgCO2e_m2: null, eligibility: 'direct' },
    { code: 'M4.3', label: 'Wind Energy',                                  objective: 'M', threshold_kgCO2e_m2: null, eligibility: 'direct' },
    { code: 'M6.1', label: 'Clean Transportation Infrastructure',          objective: 'M', threshold_kgCO2e_m2: null, eligibility: 'direct' },
    { code: 'A2.1', label: 'Flood-Resilient Construction',                 objective: 'A', threshold_kgCO2e_m2: null, eligibility: 'direct' },
    { code: 'A2.2', label: 'Climate-Resilient Buildings',                  objective: 'A', threshold_kgCO2e_m2: null, eligibility: 'threshold', note: 'Climate risk assessment required' },
    { code: 'E1.1', label: 'Coastal & Marine Resource Protection',         objective: 'E', threshold_kgCO2e_m2: null, eligibility: 'direct' },
    { code: 'E3.1', label: 'Sustainable Land Use & Biodiversity',          objective: 'E', threshold_kgCO2e_m2: null, eligibility: 'direct' },
  ],

  // Embodied carbon thresholds for construction (kgCO2e/m2)
  thresholds: {
    directlyEligible:   null,          // activity meets criteria regardless of intensity
    green:              600,           // ≤ 600 kgCO2e/m2 — aligned
    transition:         900,           // ≤ 900 kgCO2e/m2 — transition
  },

  // NDC targets Sri Lanka committed to
  ndcTargets: {
    unconditional:  '4.5% GHG reduction by 2030 (vs BAU)',
    conditional:    '14.5% GHG reduction by 2030 (with international support)',
    netZeroTarget:  2050,
    keySDGs:        [7, 9, 11, 13, 14, 15],
  },

  // Carbon pricing (no formal tax yet — voluntary market)
  carbonPricing: {
    status:   'voluntary',
    currency: 'LKR',
    usdFx:    0.0031,
    current:  0,
    notes:    'No legislated carbon tax. Sri Lanka Carbon Credits Exchange (SLCCE) operational. Watch CBSL roadmap for mandatory pricing post-2027.',
    trajectory: [
      { year: 2025, rate: 0,   label: 'Voluntary credits only' },
      { year: 2027, rate: 500, label: 'Proposed SLCCE floor (LKR)' },
      { year: 2030, rate: 1500, label: 'NDC alignment scenario (LKR)' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Green Loan Covenant Defaults
// ---------------------------------------------------------------------------

const COVENANT_DEFAULTS = {
  metrics: [
    { id: 'total_tco2e', label: 'Total Embodied Carbon (tCO2e)', unit: 'tCO2e' },
    { id: 'tco2e_per_m2', label: 'Carbon Intensity (kgCO2e/m2)', unit: 'kgCO2e/m2' },
    { id: 'epd_coverage', label: 'EPD Coverage (%)', unit: '%' },
    { id: 'reduction_pct', label: 'Reduction from Baseline (%)', unit: '%' },
    { id: 'material_substitution_rate', label: 'Material Substitution Rate (%)', unit: '%' }
  ],
  operators: ['lt', 'lte', 'gt', 'gte', 'eq'],
  checkFrequencies: ['daily', 'weekly', 'monthly', 'quarterly', 'on_draw']
};

// ---------------------------------------------------------------------------
// API Rate Limits
// ---------------------------------------------------------------------------

const RATE_LIMITS = {
  default:   { windowMs: 60 * 1000, max: 100 },  // 100 req/min
  assess:    { windowMs: 60 * 1000, max: 10  },  // 10 assessments/min  (expensive AI call)
  extract:   { windowMs: 60 * 1000, max: 20  },  // 20 extractions/min  (AI-backed)
  portfolio: { windowMs: 60 * 1000, max: 30  },  // 30 portfolio queries/min
  webhook:   { windowMs: 60 * 1000, max: 50  },  // 50 webhook registrations/min
  agent:     { windowMs: 60 * 1000, max: 5   },  // 5 agent runs/min (multi-turn AI, most expensive)
};

// ---------------------------------------------------------------------------
// Building Type Benchmarks (kgCO2e/m2) — for PCAF scoring context
// ---------------------------------------------------------------------------

const BUILDING_BENCHMARKS = {
  residential_low_rise: { median: 350, p25: 280, p75: 450 },
  residential_high_rise: { median: 500, p25: 400, p75: 650 },
  commercial_office: { median: 550, p25: 420, p75: 700 },
  retail: { median: 400, p25: 300, p75: 550 },
  industrial_warehouse: { median: 250, p25: 180, p75: 350 },
  hospital: { median: 700, p25: 550, p75: 900 },
  education: { median: 400, p25: 300, p75: 520 },
  infrastructure: { median: 600, p25: 400, p75: 850 }
};

module.exports = {
  CFS_WEIGHTS,
  CFS_THRESHOLDS,
  PCAF_DATA_QUALITY,
  TAXONOMY_ASEAN,
  TAXONOMY_EU,
  TAXONOMY_HK,
  TAXONOMY_SG,
  TAXONOMY_LK,
  COVENANT_DEFAULTS,
  RATE_LIMITS,
  BUILDING_BENCHMARKS
};
