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
  COVENANT_DEFAULTS,
  RATE_LIMITS,
  BUILDING_BENCHMARKS
};
