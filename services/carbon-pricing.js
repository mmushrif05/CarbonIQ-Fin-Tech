/**
 * CarbonIQ FinTech — Carbon Pricing & Financial Impact Service
 *
 * Converts physical carbon (tCO2e) into financial dollar values so banks
 * can quantify risk and opportunity in concrete monetary terms:
 *
 *   1. Carbon Tax Exposure    — annual tax liability at current + projected rates
 *   2. Loan Pricing Impact    — basis point adjustment → annual interest saving ($)
 *   3. Stranded Asset Risk    — financial impairment if project fails taxonomy threshold
 *   4. Price Sensitivity      — what-if table across $25 → $150/tCO2e scenarios
 *
 * Regional rates supported: SG · EU · MY · HK
 * Green loan pricing follows APAC Green Loan Principles (GLP) market practice.
 */

// ---------------------------------------------------------------------------
// Carbon Tax Rates by Region
// ---------------------------------------------------------------------------

const CARBON_TAX_RATES = {
  SG: {
    name: 'Singapore',
    currency: 'SGD',
    usdFx: 0.74,
    current: 45,           // SGD/tCO2e — legislated 2026-2027
    trajectory: [
      { year: 2024, rate: 25,  label: 'FY 2024 (actuals)' },
      { year: 2026, rate: 45,  label: 'FY 2026–2027 (current)' },
      { year: 2028, rate: 50,  label: 'FY 2028–2029 (legislated)' },
      { year: 2030, rate: 65,  label: 'FY 2030 (mid estimate)' },
    ],
    notes: 'Carbon Tax Act (revised 2022). Rate confirmed at SGD 45/tCO2e for 2026-2027; escalates to SGD 50-80/tCO2e by 2030.',
  },
  EU: {
    name: 'European Union ETS',
    currency: 'EUR',
    usdFx: 1.08,
    current: 65,           // EUR/tCO2e — 2024 annual average
    trajectory: [
      { year: 2024, rate: 65,  label: 'ETS 2024 (avg)' },
      { year: 2026, rate: 78,  label: 'ETS 2026 (projected)' },
      { year: 2028, rate: 90,  label: 'ETS 2028 (projected)' },
      { year: 2030, rate: 110, label: 'ETS 2030 (EU Fit-for-55 target)' },
    ],
    notes: 'EU Emissions Trading System. Construction materials subject to CBAM from 2026; direct site emissions under EU ETS Phase IV.',
  },
  MY: {
    name: 'Malaysia',
    currency: 'MYR',
    usdFx: 0.21,
    current: 35,           // MYR/tCO2e — launch rate 2026
    trajectory: [
      { year: 2026, rate: 35,  label: 'Launch rate (2026)' },
      { year: 2028, rate: 50,  label: 'Projected (2028)' },
      { year: 2030, rate: 75,  label: 'Projected (2030)' },
    ],
    notes: 'Carbon pricing announced in Budget 2024. Implementation planned 2026. Rate subject to gazette confirmation.',
  },
  HK: {
    name: 'Hong Kong',
    currency: 'HKD',
    usdFx: 0.128,
    current: 0,            // No direct carbon tax; voluntary carbon credit market
    trajectory: [
      { year: 2025, rate: 0,   label: 'No carbon tax (2025)' },
      { year: 2027, rate: 35,  label: 'Proposed rate (HKD, 2027)' },
      { year: 2030, rate: 80,  label: 'HKEX carbon market scenario' },
    ],
    notes: 'No legislated carbon tax. HKEX Core Climate launched 2022 for voluntary credits. Watch HKMA Net-Zero Financial Centre roadmap.',
  },
  LK: {
    name: 'Sri Lanka',
    currency: 'LKR',
    usdFx: 0.0031,
    current: 0,            // No legislated carbon tax; voluntary SLCCE market
    trajectory: [
      { year: 2025, rate: 0,    label: 'Voluntary credits only (2025)' },
      { year: 2027, rate: 500,  label: 'Proposed SLCCE floor (LKR/tCO2e)' },
      { year: 2030, rate: 1500, label: 'NDC alignment scenario (LKR/tCO2e)' },
    ],
    notes: 'No legislated carbon tax. Sri Lanka Carbon Credits Exchange (SLCCE) operational for voluntary credits. Watch CBSL Green Finance Taxonomy roadmap for mandatory pricing post-2027.',
  },
};

// ---------------------------------------------------------------------------
// Green Loan Pricing Tiers (APAC GLP market practice)
// ---------------------------------------------------------------------------

const PRICING_TIERS = {
  green: {
    label: 'Green',
    bps: -20,
    minBps: -25,
    maxBps: -15,
    description: 'Full green loan discount — CarbonIQ Score ≥ 70',
    rationale: 'APAC GLP market practice: -15 to -25 bps for verified green-classified projects',
  },
  transition: {
    label: 'Transition (SLL)',
    bps: -8,
    minBps: -12,
    maxBps: -5,
    description: 'Sustainability-Linked Loan ratchet — CarbonIQ Score 40–69',
    rationale: 'Partial discount; full discount unlocked when KPIs met at annual review',
  },
  brown: {
    label: 'Standard',
    bps: 0,
    minBps: 0,
    maxBps: 25,
    description: 'Standard pricing — CarbonIQ Score < 40',
    rationale: 'No green discount; may face +25 bps step-up under pending HKMA/MAS climate-risk pricing rules',
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full carbon financial impact analysis for a project.
 *
 * @param {Object} opts
 * @param {number}  opts.emissions_tCO2e    - Total project embodied carbon
 * @param {number}  opts.loanAmount         - Bank's outstanding loan (same currency as projectValue)
 * @param {number}  opts.projectValue       - Total project value
 * @param {string}  opts.region             - 'SG' | 'EU' | 'MY' | 'HK'
 * @param {number}  opts.cfsScore           - Carbon Finance Score (0-100)
 * @param {number}  [opts.buildingArea_m2]  - GFA in m² (for intensity calculations)
 * @param {number}  [opts.loanTerm_years]   - Loan term for cumulative calculations (default 5)
 * @returns {Object} Full financial impact breakdown
 */
function calculateFinancialImpact(opts) {
  const {
    emissions_tCO2e,
    loanAmount,
    projectValue,
    region,
    cfsScore,
    buildingArea_m2 = null,
    loanTerm_years  = 5,
  } = opts;

  const regionData    = CARBON_TAX_RATES[region] || CARBON_TAX_RATES.SG;
  const classification = _classify(cfsScore);
  const tier           = PRICING_TIERS[classification];
  const attribution    = projectValue > 0 ? Math.min(1, loanAmount / projectValue) : 0;
  const financedTCO2e  = Math.round(emissions_tCO2e * attribution * 100) / 100;

  const taxExposure    = _taxExposure(financedTCO2e, regionData);
  const loanPricing    = _loanPricing(tier, loanAmount, loanTerm_years);
  const strandedRisk   = _strandedAssetRisk(emissions_tCO2e, buildingArea_m2, projectValue, loanAmount, region, cfsScore);
  const sensitivity    = _priceSensitivity(financedTCO2e, regionData);

  return {
    inputs: {
      emissions_tCO2e,
      financedEmissions_tCO2e: financedTCO2e,
      attributionFactor: Math.round(attribution * 1000) / 1000,
      loanAmount,
      projectValue,
      region: regionData.name,
      cfsScore,
      classification,
      buildingArea_m2,
      loanTerm_years,
    },
    taxExposure,
    loanPricing,
    strandedRisk,
    sensitivity,
    summary: _summary(taxExposure, loanPricing, strandedRisk, regionData),
    calculatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tax Exposure
// ---------------------------------------------------------------------------

function _taxExposure(financedTCO2e, regionData) {
  const currentRate     = regionData.current;
  const currentLocalAmt = Math.round(financedTCO2e * currentRate);
  const currentUSD      = Math.round(currentLocalAmt * regionData.usdFx);

  const trajectory = regionData.trajectory.map(t => ({
    year:         t.year,
    label:        t.label,
    rate:         t.rate,
    localAmount:  Math.round(financedTCO2e * t.rate),
    usdAmount:    Math.round(financedTCO2e * t.rate * regionData.usdFx),
    currency:     regionData.currency,
  }));

  // Find peak exposure in trajectory
  const peak = trajectory.reduce((max, t) => t.usdAmount > max.usdAmount ? t : max, trajectory[0]);

  return {
    currentRate_local:  currentRate,
    currency:           regionData.currency,
    annualExposure_local: currentLocalAmt,
    annualExposure_USD:   currentUSD,
    peakExposure: {
      year:   peak.year,
      label:  peak.label,
      USD:    peak.usdAmount,
      local:  peak.localAmount,
    },
    trajectory,
    notes: regionData.notes,
  };
}

// ---------------------------------------------------------------------------
// Loan Pricing Impact
// ---------------------------------------------------------------------------

function _loanPricing(tier, loanAmount, loanTerm) {
  const bps           = tier.bps;
  const annualSaving  = Math.round(loanAmount * (Math.abs(bps) / 10000));
  const termSaving    = annualSaving * loanTerm;
  const npvSaving     = Math.round(termSaving * 0.85); // ~5% discount rate approximation

  const rangeMin = Math.round(loanAmount * (Math.abs(tier.minBps) / 10000));
  const rangeMax = Math.round(loanAmount * (Math.abs(tier.maxBps) / 10000));

  return {
    classification:   tier.label,
    adjustment_bps:   bps,
    range_bps:        { min: tier.minBps, max: tier.maxBps },
    description:      tier.description,
    rationale:        tier.rationale,
    financialImpact: {
      annualInterestSaving_USD: annualSaving,
      range_USD: { min: rangeMin, max: rangeMax },
      termSaving_USD:  termSaving,
      npvSaving_USD:   npvSaving,
      loanTerm_years:  loanTerm,
    },
    upgradeOpportunity: tier.label !== 'Green'
      ? `Improving CarbonIQ Score to ≥ 70 unlocks an additional ${Math.abs(PRICING_TIERS.green.bps - bps)} bps — worth $${_fmt(Math.round(loanAmount * Math.abs(PRICING_TIERS.green.bps - bps) / 10000))} / year.`
      : 'Maximum green pricing tier achieved.',
  };
}

// ---------------------------------------------------------------------------
// Stranded Asset Risk
// ---------------------------------------------------------------------------

function _strandedAssetRisk(tCO2e, buildingArea, projectValue, loanAmount, region, cfsScore) {
  // Taxonomy thresholds (kgCO2e/m²) — from constants
  const THRESHOLDS = { SG: 480, EU: 400, MY: 500, HK: 480 };
  const threshold   = THRESHOLDS[region] || 480;

  let riskLevel = 'low';
  let intensity = null;
  let exceedance_pct = 0;

  if (buildingArea && buildingArea > 0) {
    intensity = Math.round((tCO2e * 1000) / buildingArea); // kgCO2e/m²
    exceedance_pct = threshold > 0 ? Math.max(0, ((intensity - threshold) / threshold) * 100) : 0;
  } else {
    // Estimate risk from CFS score when no area is provided
    exceedance_pct = cfsScore < 40 ? 40 : cfsScore < 70 ? 15 : 0;
  }

  if (exceedance_pct > 30)      riskLevel = 'high';
  else if (exceedance_pct > 10) riskLevel = 'medium';
  else                          riskLevel = 'low';

  // Financial impairment estimate
  const impairmentFactors = { high: 0.15, medium: 0.07, low: 0.02 };
  const impairmentFactor  = impairmentFactors[riskLevel];
  const collateralImpairment_USD = Math.round(projectValue * impairmentFactor);
  const lenderExposure_USD       = Math.round(loanAmount   * impairmentFactor);

  const refinancingRisk = riskLevel === 'high'
    ? 'High: Project unlikely to qualify for green bond refinancing at current trajectory.'
    : riskLevel === 'medium'
    ? 'Medium: Marginal pass — covenant tightening required to secure green refinancing.'
    : 'Low: Project on track for green refinancing at maturity.';

  return {
    riskLevel,
    exceedance_pct: Math.round(exceedance_pct * 10) / 10,
    emissionsIntensity: intensity
      ? { value_kgCO2e_m2: intensity, threshold_kgCO2e_m2: threshold, benchmark: `${region} Taxonomy (${threshold} kgCO2e/m²)` }
      : { value_kgCO2e_m2: null, threshold_kgCO2e_m2: threshold, note: 'Provide building area for intensity calculation' },
    financialImpairment: {
      collateral_USD:    collateralImpairment_USD,
      lenderExposure_USD,
      impairmentFactor_pct: impairmentFactor * 100,
    },
    refinancingRisk,
    mitigationActions: _mitigationActions(riskLevel, cfsScore),
  };
}

function _mitigationActions(riskLevel, cfsScore) {
  if (riskLevel === 'high') {
    return [
      'Require low-carbon material substitution plan from borrower within 90 days',
      'Add embodied carbon KPI covenant (intensity ≤ threshold by completion)',
      'Increase monitoring frequency to quarterly draw checks',
      'Consider carbon offset covenant as backstop if reduction plan insufficient',
    ];
  }
  if (riskLevel === 'medium') {
    return [
      'Request EPDs for top 5 materials by carbon contribution',
      'Set semi-annual covenant milestone: 10% embodied carbon reduction',
      'Include material substitution alert in green loan agreement',
    ];
  }
  return [
    'Maintain standard annual covenant review',
    'Encourage EPD upgrades to achieve PCAF DQ Score ≤ 2 for annual disclosure',
  ];
}

// ---------------------------------------------------------------------------
// Price Sensitivity Table
// ---------------------------------------------------------------------------

function _priceSensitivity(financedTCO2e, regionData) {
  const scenarios = [25, 50, 75, 100, 125, 150];
  return {
    metric: 'Annual carbon tax on financed emissions',
    currency: 'USD (indicative)',
    note: `Based on ${financedTCO2e} tCO2e financed emissions. Current rate: ${regionData.currency} ${regionData.current}/tCO2e.`,
    table: scenarios.map(usdRate => ({
      carbonPrice_USD: usdRate,
      annualTax_USD:   Math.round(financedTCO2e * usdRate),
      change_vs_current: Math.round((financedTCO2e * usdRate) - (financedTCO2e * regionData.current * regionData.usdFx)),
    })),
  };
}

// ---------------------------------------------------------------------------
// Executive Summary
// ---------------------------------------------------------------------------

function _summary(taxExposure, loanPricing, strandedRisk, regionData) {
  const items = [];

  if (taxExposure.annualExposure_USD > 0) {
    items.push(`Current annual carbon tax exposure: $${_fmt(taxExposure.annualExposure_USD)} (${regionData.currency} ${taxExposure.currentRate_local}/tCO2e)`);
  } else {
    items.push(`No direct carbon tax in ${regionData.name} currently — but $${_fmt(taxExposure.trajectory.at(-1)?.usdAmount || 0)} exposure projected by ${taxExposure.trajectory.at(-1)?.year}.`);
  }

  items.push(`Loan pricing: ${loanPricing.adjustment_bps > 0 ? '+' : ''}${loanPricing.adjustment_bps} bps (${loanPricing.financialImpact.annualInterestSaving_USD > 0 ? '$' + _fmt(loanPricing.financialImpact.annualInterestSaving_USD) + '/yr saving' : 'no discount at current score'})`);

  items.push(`Stranded asset risk: ${strandedRisk.riskLevel.toUpperCase()} — estimated lender exposure $${_fmt(strandedRisk.financialImpairment.lenderExposure_USD)}`);

  return items;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _classify(score) {
  if (score >= 70) return 'green';
  if (score >= 40) return 'transition';
  return 'brown';
}

function _fmt(n) {
  return Number(n).toLocaleString('en-US');
}

module.exports = { calculateFinancialImpact, CARBON_TAX_RATES, PRICING_TIERS };
