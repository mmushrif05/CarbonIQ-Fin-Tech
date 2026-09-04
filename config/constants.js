/**
 * CarbonIQ FinTech — Business Constants
 *
 * Thresholds, taxonomy criteria, PCAF scores, and scoring weights.
 * These are the business rules that drive the FinTech layer.
 *
 * IMPORTANT: The 80% threshold (0.80) is in the core engine (tender.js)
 * and is mandated by ISO 21930. Do NOT duplicate or override it here.
 */

const NDC3 = require('../data/gcf/ndc3.json');

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

const TAXONOMY_SL = {
  version: 2022,
  framework: 'CBSL Direction No. 05/2022 + Sri Lanka Green Finance Taxonomy (SLGFT)',
  /* The 520/780 bands are this product's own carbon-intensity screen. The
     taxonomy held in this repository sets no absolute kgCO2e/m2 threshold at
     all — its construction criteria are relative (M6.1, M6.3) or
     certification-based (M6.2). The numbers are unchanged because changing them
     would rescore live projects; the claim made about them is what changed. */
  intensityScreenSource: "CarbonIQ FinTech — this product's own banding, not a taxonomy "
    + 'threshold. The SLGFT contains no absolute kgCO2e/m2 figure.',
  criteria: {
    construction: {
      maxEmbodiedCarbon_kgCO2e_per_m2_green: 520,
      maxEmbodiedCarbon_kgCO2e_per_m2_transition: 780,
      requiresSLFRS_S2: true,
    }
  },
  classifications: {
    /* Was "Green (CBSL Compliant)". Compliance against the taxonomy is
       determined by the Central Bank, not by this software — the same failure
       services/report-integrity.js exists to prevent, where a report asserted
       'Compliant' to the regulator that decides compliance. */
    green: { label: 'Green (intensity screen)', maxIntensity: 520 },
    transition: { label: 'Transition (intensity screen)', maxIntensity: 780 },
    not_aligned: { label: 'Not Aligned', maxIntensity: Infinity },
  },
  certifications: {
    /* The taxonomy names Green SL Gold and Platinum for activity M6.2 and
       attaches NO percentage to either. These minReduction figures come from
       somewhere else and are marked as unevidenced rather than deleted, because
       the screening code still reads them. */
    greensl_platinum: { label: 'Green SL Platinum', minReduction: 40, inSourceDocument: false },
    greensl_gold: { label: 'Green SL Gold', minReduction: 25, inSourceDocument: false },
    note: 'The taxonomy requires Green SL Rated Gold or Platinum for M6.2 and states no '
      + 'percentage reduction for either. The figures above are not from the taxonomy.',
  },
  notes: 'CBSL Direction No. 05/2022 mandates green finance classification for all licensed banks. SLFRS S2 (aligned to IFRS S2) phased adoption from 2025.',
};

// ---------------------------------------------------------------------------
// Sri Lanka Green Finance Taxonomy — the SLGFT v2024 structure
//
// TAXONOMY_SL above and TAXONOMY_LK here both describe Sri Lankan green
// finance, and they do not agree on the construction thresholds: TAXONOMY_SL
// classifies Green at <= 520 kgCO2e/m2 and Transition at <= 780, while
// TAXONOMY_LK uses 600 and 900. They were written on separate branches from
// different readings of the rules.
//
// Both are kept, each still feeding the code written against it, because
// silently adopting one set of numbers would rescore live projects: a
// building at 560 kgCO2e/m2 is Green under one and Transition under the
// other, which changes what a bank may call a green loan. Which figure is
// correct is a regulatory question for CBSL, not a merge decision.
// ---------------------------------------------------------------------------

const TAXONOMY_LK = {
  /* The edition this repository actually holds. The cover of
     SLGFT-Sri-Lanka-Green-Finance-Taxonomy-May2022.pdf reads "May 2022", and
     the PDF was created 2022-05-04. This file previously said 2024, and the
     Green Loan Certificate stamped "SLGFT v2024" onto a document carrying a
     SHA-256 audit hash — a version claim nobody could check, which is the same
     shape as the superseded NDC targets. If a later edition exists it should be
     added to this repository and this constant moved with it. */
  version: '2022-05',
  edition: 'May 2022',
  sourceDocument: 'SLGFT-Sri-Lanka-Green-Finance-Taxonomy-May2022.pdf',
  sourceNote: 'The document\'s activity numbering has systematic gaps, so it is a subset '
    + 'rather than the complete activity list. See docs/SLGFT-SOURCES.md.',
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

  /* Activities, transcribed from the taxonomy in this repository.
   *
   * Source: SLGFT-Sri-Lanka-Green-Finance-Taxonomy-May2022.pdf, root of this
   * repository. `criterion` is the document's own "Metric & Threshold for Sri
   * Lanka" wording, quoted rather than paraphrased.
   *
   * This list previously carried invented codes and mislabelled real ones. All
   * of the following were wrong against the source and are corrected here:
   *
   *   M1.1 "Green Buildings — New Construction" at 600 kgCO2e/m2 — construction
   *   is macro-sector SIX in the taxonomy, and the criterion for new buildings
   *   is RELATIVE, not an absolute carbon intensity. It is now M6.3.
   *
   *   M6.1 "Clean Transportation Infrastructure" — M6.1 is renovation of
   *   existing buildings. Electric rail infrastructure is M6.7.
   *
   *   A2.1 "Flood-Resilient Construction" — A2.1 is a FINANCIAL SERVICES
   *   activity: affordable climate insurance for agriculture and tourism.
   *   Climate-resilient construction is A3.1.
   *
   *   E1.1 and E3.1 do not appear in the document at all. E1.6-E1.8 are
   *   agriculture and E3.5-E3.6 are waste management.
   *
   * `inSourceDocument: false` marks an activity this repository asserts but
   * cannot evidence. The document's activity numbering has systematic gaps
   * (M4.5, M4.6, then M4.11), so it is a SUBSET rather than the complete list —
   * absence here means unevidenced, not excluded.
   */
  constructionActivities: [
    { code: 'M6.1', label: 'Renovation of existing buildings', objective: 'M',
      macroSector: 'Construction', threshold_kgCO2e_m2: null, eligibility: 'threshold',
      inSourceDocument: true,
      criterion: 'The building renovation leads to a reduction of primary energy demand '
        + '(PED) / energy consumption / GHG emissions of at least 30%.' },

    { code: 'M6.2', label: 'Acquisition and ownership of buildings', objective: 'M',
      macroSector: 'Construction', threshold_kgCO2e_m2: null, eligibility: 'certification',
      inSourceDocument: true,
      criterion: 'Green SL Rated buildings: Gold and Platinum.' },

    { code: 'M6.3', label: 'Construction of new buildings', objective: 'M',
      macroSector: 'Construction', threshold_kgCO2e_m2: null, eligibility: 'threshold',
      inSourceDocument: true,
      criterion: 'The GHG emissions / energy consumption / Primary Energy Demand (PED) of '
        + 'the building resulting from the construction, is at least 10% lower than the '
        + 'threshold set by a relevant national/international nearly zero-energy building '
        + 'requirements.',
      note: 'A RELATIVE criterion. It cannot be evaluated from a carbon intensity alone — '
        + 'it needs the nearly zero-energy benchmark for Sri Lanka, which this system does '
        + 'not hold. An M6.3 determination is therefore absent, not computable.' },

    { code: 'M6.7', label: 'Infrastructure for electric rail transport', objective: 'M',
      macroSector: 'Construction', threshold_kgCO2e_m2: null, eligibility: 'threshold',
      inSourceDocument: true,
      criterion: 'Scope: electrified rail only. Criteria on the infrastructure itself.' },

    { code: 'A3.1', label: 'Climate-resilient warehouse and storage for agricultural buffer stocks',
      objective: 'A', macroSector: 'Construction', threshold_kgCO2e_m2: null,
      eligibility: 'direct', inSourceDocument: true,
      criterion: 'Construction and operation of flood-proof warehouses and storage, as a '
        + 'measure to improve disaster risk preparedness and management.' },

    { code: 'M4.5', label: 'Electricity generation from hydropower', objective: 'M',
      macroSector: 'Electric power generation, transmission and distribution',
      threshold_kgCO2e_m2: null, eligibility: 'threshold', inSourceDocument: true,
      criterion: 'Run-of-river without an artificial reservoir; OR power density above '
        + '5 W/m2; OR life-cycle GHG emissions below 100 gCO2e/kWh, calculated using '
        + 'ISO 14067:2018, ISO 14064-1:2018 or the G-res tool and verified by an '
        + 'independent third party.' },

    { code: 'M4.6', label: 'Electricity generation from bio-energy', objective: 'M',
      macroSector: 'Electric power generation, transmission and distribution',
      threshold_kgCO2e_m2: null, eligibility: 'threshold', inSourceDocument: true,
      criterion: 'Total rated thermal input less than 2 MW. GHG emission savings from the '
        + 'use of biomass are at least 80% relative to the fossil fuel comparator.' },

    /* Solar and wind do not appear in the taxonomy held here. The document's
       electricity activities are M4.5 (hydropower) and M4.6 (bio-energy), and
       its numbering skips M4.1-M4.4 — so these are almost certainly in the full
       taxonomy under codes this repository cannot confirm. They are kept
       because the product screens solar projects, and marked unevidenced so no
       screen prints a code nobody can check. */
    { code: null, label: 'Solar PV — electricity generation', objective: 'M',
      macroSector: 'Electric power generation, transmission and distribution',
      threshold_kgCO2e_m2: null, eligibility: 'direct', inSourceDocument: false,
      criterion: null,
      note: 'Not present in the taxonomy document held in this repository. Previously '
        + 'asserted as M4.1, which the document does not contain. The activity code and '
        + 'criterion must be confirmed against the complete taxonomy before either is '
        + 'printed on a certificate.' },

    { code: null, label: 'Wind energy', objective: 'M',
      macroSector: 'Electric power generation, transmission and distribution',
      threshold_kgCO2e_m2: null, eligibility: 'direct', inSourceDocument: false,
      criterion: null,
      note: 'Not present in the taxonomy document held in this repository. Previously '
        + 'asserted as M4.3.' },
  ],

  /* Carbon-intensity bands — CarbonIQ's own screen, NOT taxonomy thresholds.
   *
   * The taxonomy contains no absolute kgCO2e/m2 threshold anywhere. A full-text
   * sweep of all 26 pages returns exactly one figure per unit area and it is
   * unrelated (5 W/m2 power density, hydropower). Its construction criteria are
   * relative (M6.1, M6.3) or certification-based (M6.2).
   *
   * The numbers below are unchanged, because they are a useful internal screen
   * and changing them would rescore live projects. What changed is the claim
   * made about them: they are this product's own banding and must not be
   * described as SLGFT alignment or CBSL compliance.
   */
  intensityScreen: {
    source: "CarbonIQ FinTech — this product's own carbon-intensity banding",
    notTaxonomy: 'The Sri Lanka Green Finance Taxonomy sets no absolute kgCO2e/m2 '
      + 'threshold. These bands are an internal screen and are not a taxonomy determination.',
    directlyEligible:   null,          // activity meets criteria regardless of intensity
    green:              600,           // ≤ 600 kgCO2e/m2
    transition:         900,           // ≤ 900 kgCO2e/m2
  },

  /* Kept under the old key so existing callers keep working. Same numbers, and
     the honest labelling lives on intensityScreen above. */
  thresholds: {
    directlyEligible:   null,
    green:              600,
    transition:         900,
  },

  /* NDC targets Sri Lanka committed to.
   *
   * NDC 3.0, issued September 2025, supersedes the 2021 NDC this file used to
   * carry (4.5% unconditional / 14.5% conditional by 2030, net zero 2050).
   * Three things changed and each of them matters:
   *
   *   The period is 2026-2035 and the target is *cumulative* over it, not a
   *   single-year 2030 figure.
   *
   *   Reduction and removal are two separate commitments. 20.09% is the
   *   emission reduction; 4.49% is the increase in net carbon removal. They
   *   are never added, and a project that removes carbon has not reduced
   *   emissions.
   *
   *   There is no net-zero year in NDC 3.0 as described in the DFCC ToR, so
   *   this file no longer asserts one. An absent commitment is reported
   *   absent rather than carried forward from a superseded document.
   *
   * The figures live in data/gcf/ndc3.json with their source and vintage, so
   * there is one place they are stated. */
  ndcTargets: NDC3,

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
  TAXONOMY_SL,
  TAXONOMY_LK,
  COVENANT_DEFAULTS,
  RATE_LIMITS,
  BUILDING_BENCHMARKS
};
