/**
 * CarbonIQ FinTech — Financial Reporting Service
 *
 * Generates four regulatory-grade report formats:
 *   1. PCAF Annual Disclosure   (PCAF v3, Dec 2025)
 *   2. GRI 305 Emissions        (GRI Standards 2016)
 *   3. TCFD Climate Risk        (TCFD Recommendations)
 *   4. IFRS S2 / ISSB           (IFRS S2 Climate Disclosures 2023)
 *
 * Usage:
 *   const { generateReport, buildPDF } = require('./reports');
 *   const report = generateReport({ type: 'pcaf', period: '2025', orgName: 'OCBC Bank', ... });
 *   const pdfStream = buildPDF(report);
 */

const PDFDocument = require('pdfkit');
const integrity   = require('./report-integrity');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a structured report object for the requested format.
 *
 * @param {Object} opts
 * @param {'pcaf'|'gri305'|'tcfd'|'ifrs-s2'|'slgft'} opts.type
 * @param {string} opts.period          - Reporting year, e.g. "2025"
 * @param {string} opts.orgName         - Bank / organisation name
 * @param {Object} [opts.portfolioData] - Pre-computed portfolio summary (optional; demo data used if omitted)
 * @param {Object} [opts.slgftData]     - SLGFT-specific data (NDC alignment, SDG, taxonomy dist)
 * @returns {Object} Structured report data
 */
function generateReport({ type, period, orgName, portfolioData, slgftData, entityDisclosures }) {
  /* A report built without a portfolio runs on sample figures. That is fine
     for a demonstration and unacceptable in a document that cites a standard,
     so the report says which it is on its own face rather than leaving the
     reader to assume the numbers are theirs. */
  const isDemo = !portfolioData;
  const portfolio = portfolioData || _demoPortfolio(period);
  const entity = entityDisclosures || null;
  const meta = {
    generatedAt: new Date().toISOString(),
    reportingPeriod: `FY ${period}`,
    organisation: orgName || 'Your Organisation',
    reportId: `RPT-${type.toUpperCase()}-${period}-${Date.now()}`,
    dataSource: isDemo ? 'SAMPLE DATA — NOT THIS ORGANISATION\'S PORTFOLIO' : 'Measured portfolio',
    ...(isDemo ? {
      sampleDataWarning: 'No portfolio was supplied, so every figure below is '
        + 'illustrative sample data. This document must not be filed, published or '
        + 'relied upon as a disclosure.'
    } : {}),
  };

  switch (type) {
    case 'pcaf':    return _withGaps(_pcafReport(meta, portfolio, entity));
    case 'gri305':  return _withGaps(_gri305Report(meta, portfolio, entity));
    case 'tcfd':    return _withGaps(_tcfdReport(meta, portfolio, entity));
    case 'ifrs-s2':    return _withGaps(_ifrsS2Report(meta, portfolio, entity));
    // Two Sri Lanka disclosures, kept as separate ids rather than merged.
    // 'slgft-cbsl' is the CBSL Direction 05 / SLFRS S2 disclosure already in
    // use; 'slgft' is the fuller taxonomy report that also carries NDC
    // contribution, SDG alignment, DNSH and carbon-pricing exposure. Folding
    // one id into the other would silently change what an existing caller
    // receives, so both remain addressable.
    case 'slgft-cbsl': return _withGaps(_slgftCbslReport(meta, portfolio, entity));
    case 'slgft':      return _withGaps(_slgftReport(meta, portfolio, slgftData || {}, entity));
    default:           throw new Error(`Unknown report type: ${type}`);
  }
}

/**
 * Attach the report's own list of what it could not state.
 *
 * A reader should not have to hunt through the body to discover which
 * disclosures are missing — and an assurance provider will ask for exactly
 * this list first. It is derived from the built report, so it cannot claim
 * completeness the sections do not have.
 */
function _withGaps(report) {
  const gaps = integrity.collectGaps(report);

  /* A checklist item that is not met is a gap too. Without this the summary
     could report "complete" while the body of the same report carried a
     failing item — which is the defect this whole module exists to stop. */
  for (const c of report.complianceChecklist || []) {
    if (!c.met) {
      gaps.push({
        path: 'complianceChecklist',
        status: integrity.NOT_PROVIDED,
        what: c.item,
        standardRef: c.standardRef || null,
      });
    }
  }

  report.gaps = {
    count: gaps.length,
    complete: gaps.length === 0,
    note: gaps.length === 0
      ? 'Every disclosure in this report is either measured from portfolio data or '
        + 'supplied by the reporting entity.'
      : 'The following disclosures are required by the cited standard and are not '
        + 'present. They are entity-level statements or figures this system does '
        + 'not measure, and are reported as absent rather than estimated.',
    items: gaps,
  };
  return report;
}

// ---------------------------------------------------------------------------
// Report Builders
// ---------------------------------------------------------------------------

function _pcafReport(meta, p, entity) {
  return {
    ...meta,
    type: 'pcaf',
    title: 'PCAF Annual Financed Emissions Disclosure',
    standard: 'PCAF Global GHG Accounting & Reporting Standard — Third Edition (December 2025)',
    summary: {
      totalProjects: p.totalProjects,
      portfolioCoverage_pct: p.coverage_pct,
      totalFinancedEmissions_tCO2e: p.totalEmissions_tCO2e,
      weightedDataQualityScore: p.weightedDQ,
      scope: 'A1–A3 Embodied Carbon (Cradle-to-Gate)',
      reportingBoundary: 'Construction & Project Finance Lending Portfolio',
    },
    assetClasses: p.assetClasses,
    dataQuality: {
      weighted: p.weightedDQ,
      distribution: p.dqDistribution,
      improvementTarget: `Reduce weighted DQ score to ${Math.max(1, p.weightedDQ - 0.5).toFixed(1)} by next reporting period`,
    },
    yearOnYear: p.yoy,
    /* Answered from the report rather than asserted. Every item was previously
       hardcoded met:true — including the Scope 1/2/3 breakdown, which was only
       "present" because it had been invented. A checklist that cannot fail
       tells a reader nothing. */
    complianceChecklist: [
      integrity.checklistItem('Absolute financed emissions reported', p.totalEmissions_tCO2e),
      integrity.checklistItem('Economic intensity (tCO2e/$M) reported', p.totalPortfolioValue_M),
      integrity.checklistItem('Weighted data quality score disclosed', p.weightedDQ),
      integrity.checklistItem('Portfolio coverage percentage stated', p.coverage_pct),
      integrity.checklistItem('Entity scope 1 and 2 emissions included',
        _entityScope(entity, 'scope1And2_tCO2e', 'PCAF')),
      integrity.checklistItem('Year-on-year fluctuation analysis provided', p.yoy),
      integrity.checklistItem('Methodology and boundaries documented', true),
    ],
    methodology: {
      classificationSystem: 'ECCS 6-step hierarchy',
      emissionFactors: 'ICE Database v3.0 (A1-A3 factors)',
      allocationMethod: 'Attribution factor = Outstanding Loan / (Total Equity + Total Debt)',
      significantMaterials: '80% Pareto analysis per ISO 21930',
      auditTrail: 'All calculations logged in CarbonIQ audit trail',
    },
  };
}

function _gri305Report(meta, p, entity) {
  /* The scope split used to be the portfolio total multiplied by 0.08, 0.14
     and 0.78. Those are not measurements. A lender's own scope 1 and 2 are its
     offices and vehicles — data this system has never been given — and its
     financed emissions are scope 3 Category 15 in full. So the total is
     reported where it belongs, and the rest is declared absent. */
  const s1 = _entityScope(entity, 'scope1_tCO2e', 'GRI 305-1');
  const s2 = _entityScope(entity, 'scope2_tCO2e', 'GRI 305-2');
  const s3 = p.totalEmissions_tCO2e;

  return {
    ...meta,
    type: 'gri305',
    title: 'GRI 305: Emissions Disclosure',
    standard: 'GRI 305: Emissions 2016 (referenced with GRI 1 Foundation 2021)',
    summary: {
      totalFinancedEmissions_tCO2e: p.totalEmissions_tCO2e,
      scope1_tCO2e: s1,
      scope2_tCO2e: s2,
      scope3Category15_tCO2e: s3,
      ghgIntensity_tCO2e_per_M_invested: (p.totalEmissions_tCO2e / (p.totalPortfolioValue_M || 1000)).toFixed(2),
      boundaryNote: 'This report covers the financed emissions of the construction '
        + 'lending portfolio. The entity\'s own operational emissions are outside '
        + 'what this system measures and must be supplied by the entity.',
    },
    disclosures: {
      'GRI 305-1': {
        title: 'Direct (Scope 1) GHG Emissions',
        value_tCO2e: s1,
        methodology: 'The reporting entity\'s own direct emissions (owned premises, '
          + 'vehicles, plant). Not derivable from a financed-emissions portfolio.',
      },
      'GRI 305-2': {
        title: 'Energy Indirect (Scope 2) GHG Emissions',
        value_tCO2e: s2,
        methodology: 'The reporting entity\'s own purchased electricity, heat and steam. '
          + 'Not derivable from a financed-emissions portfolio.',
      },
      'GRI 305-3': {
        title: 'Other Indirect (Scope 3) GHG Emissions',
        value_tCO2e: s3,
        categories: [
          /* For a lender, financed emissions are Category 15 in full. The
             previous split put 85% into Category 1 and 5% into Category 15,
             which inverts the single most material line in a bank's
             inventory. */
          { cat: 'Category 15 — Investments (financed emissions)', tCO2e: s3 },
        ],
        otherCategories: integrity.notMeasured(
          'Scope 3 categories other than 15',
          'This system measures financed emissions only. Purchased goods, business '
          + 'travel and the entity\'s other upstream categories are not held.'),
        methodology: 'Embodied carbon of financed construction per CarbonIQ ECCS 6-step '
          + 'classification and ICE v3.0, attributed to the lender by PCAF attribution factor.',
        dataQuality: p.weightedDQ,
      },
      'GRI 305-4': {
        title: 'GHG Emissions Intensity',
        ratio: `${(p.totalEmissions_tCO2e / (p.totalPortfolioValue_M || 1000)).toFixed(2)} tCO2e per $M outstanding`,
        denominatorMetric: 'Total outstanding construction loan portfolio value ($M)',
      },
      'GRI 305-5': {
        title: 'Reduction of GHG Emissions',
        /* Signed, not floored at zero. Clamping hid every year in which
           emissions rose, which is the movement a reader most needs to see. */
        movement_tCO2e: p.yoy
          ? +(p.yoy.prev_tCO2e - p.totalEmissions_tCO2e).toFixed(1)
          : integrity.notMeasured('Year-on-year movement',
              'No prior reporting period is held for comparison.'),
        movementNote: p.yoy
          ? 'A positive figure is a reduction against the prior period; a negative '
            + 'figure is an increase. A movement is not on its own evidence of '
            + 'performance where the composition of the book has changed.'
          : null,
        initiatives: integrity.declared(entity, 'reductionInitiatives',
          'Reduction initiatives undertaken by the reporting entity', 'GRI 305-5-b'),
      },
    },
    omissions: [
      { disclosure: 'GRI 305-6', reason: 'Ozone-depleting substances are not measured by this system.' },
      { disclosure: 'GRI 305-7', reason: 'NOx, SOx and other significant air emissions are not measured by this system.' },
    ],
    gaps: null,   // filled by _withGaps
  };
}

/**
 * The lender's own scope 1 or 2, which only the lender can supply.
 *
 * These were previously the financed-emissions total multiplied by a constant,
 * printed under a cited GRI clause.
 */
function _entityScope(entity, key, standardRef) {
  const supplied = entity && entity[key];
  if (typeof supplied === 'number' && Number.isFinite(supplied)) return supplied;
  return integrity.notMeasured(key.replace('_tCO2e', ''),
    'The reporting entity\'s own operational emissions. This system measures '
    + 'financed emissions and holds no data on the entity\'s premises, vehicles '
    + `or purchased energy. Required by ${standardRef}.`);
}

function _tcfdReport(meta, p, entity) {
  const greenPct = _greenAlignedPct(p);

  return {
    ...meta,
    type: 'tcfd',
    title: 'Task Force on Climate-related Financial Disclosures (TCFD) Report',
    standard: 'TCFD Recommendations (2017) — Final Report & 2021 Guidance',
    summary: {
      totalExposure_M: p.totalPortfolioValue_M,
      greenAligned_pct: greenPct,
      carbonIntensity_tCO2e_per_M: (p.totalEmissions_tCO2e / (p.totalPortfolioValue_M || 1000)).toFixed(2),
      weightedDataQualityScore: p.weightedDQ,
    },
    pillars: {
      /* Three of TCFD's four pillars describe what the entity does, not what
         its portfolio measures. They previously read as specific fact — a
         quarterly board review, a three-person ESG team reporting to the CRO,
         a $340M pipeline, 12% of the book in flood zones. None of it was
         known to this system. */
      governance: {
        title: 'Governance',
        boardOversight: integrity.declared(entity, 'boardOversight',
          'The board\'s oversight of climate-related risks and opportunities',
          'TCFD Governance a)'),
        managementRole: integrity.declared(entity, 'managementRole',
          'Management\'s role in assessing and managing climate-related risks',
          'TCFD Governance b)'),
        policies: integrity.declared(entity, 'climatePolicies',
          'The climate-related policies the entity has adopted', 'TCFD Governance'),
      },
      strategy: {
        title: 'Strategy',
        risks: integrity.declared(entity, 'climateRisks',
          'Climate-related risks identified over the short, medium and long term',
          'TCFD Strategy a)'),
        opportunities: integrity.declared(entity, 'climateOpportunities',
          'Climate-related opportunities identified', 'TCFD Strategy a)'),
        resilience: integrity.declared(entity, 'strategyResilience',
          'The resilience of the strategy under different climate scenarios, '
          + 'including a 2°C or lower scenario', 'TCFD Strategy c)'),
      },
      riskManagement: {
        title: 'Risk Management',
        identificationProcess: integrity.declared(entity, 'riskIdentificationProcess',
          'The entity\'s processes for identifying and assessing climate-related risks',
          'TCFD Risk Management a)'),
        integration: integrity.declared(entity, 'riskIntegration',
          'How those processes are integrated into overall risk management',
          'TCFD Risk Management c)'),
        /* This one the system genuinely does: the score and its bands are
           what CarbonIQ computes, so it is reported as measured. */
        portfolioScreening: {
          basis: 'Measured by this system',
          method: 'Every construction exposure carries a Carbon Finance Score (0–100) '
            + 'computed from its assessed embodied carbon.',
          bands: [
            { score: '≥ 70', classification: 'Green' },
            { score: '40–69', classification: 'Transition' },
            { score: '< 40', classification: 'Brown' },
          ],
        },
      },
      metricsTargets: {
        title: 'Metrics & Targets',
        metrics: [
          { metric: 'Total financed emissions', value: `${p.totalEmissions_tCO2e.toLocaleString()} tCO2e`, period: meta.reportingPeriod, basis: 'Measured' },
          { metric: 'Carbon intensity', value: `${(p.totalEmissions_tCO2e / (p.totalPortfolioValue_M || 1000)).toFixed(1)} tCO2e / $M`, period: meta.reportingPeriod, basis: 'Measured' },
          { metric: 'Weighted PCAF data quality score (1 = highest quality, 5 = lowest)', value: `${Number(p.weightedDQ).toFixed(2)}`, period: meta.reportingPeriod, basis: 'Measured' },
          { metric: 'Portfolio taxonomy alignment (Green)', value: greenPct === null ? 'Not measured' : `${greenPct}%`, period: meta.reportingPeriod, basis: 'Measured' },
        ],
        /* Targets and progress against them belong to the entity. The
           previous figures — 18%, 40%, 62% "On Track" — were literals. */
        targets: integrity.declared(entity, 'climateTargets',
          'The targets the entity uses to manage climate-related risks and '
          + 'opportunities, and performance against them', 'TCFD Metrics & Targets c)'),
      },
    },
    gaps: null,   // filled by _withGaps
  };
}

/** Green share of the book, or nothing — never a stand-in percentage. */
function _greenAlignedPct(p) {
  if (!p.taxonomyDist || !p.totalProjects) return null;
  return Math.round((p.taxonomyDist.green / p.totalProjects) * 100);
}

function _ifrsS2Report(meta, p, entity) {
  return {
    ...meta,
    type: 'ifrs-s2',
    title: 'IFRS S2 Climate-related Disclosures',
    standard: 'IFRS S2 Climate-related Disclosures (ISSB, June 2023) — effective FY2024',
    summary: {
      totalFinancedEmissions_tCO2e: p.totalEmissions_tCO2e,
      scope3Category15_tCO2e: p.totalEmissions_tCO2e,
      weightedDataQualityScore: p.weightedDQ,
      climateRiskExposure_M: integrity.notMeasured('Climate risk exposure',
        'Requires the entity\'s own risk classification of its exposures. This '
        + 'system measures financed emissions, not risk-weighted exposure.'),
    },
    disclosures: {
      /* IFRS S2 §6-9 is a description of how the entity is governed. Software
         cannot know who sits on a risk committee or how often it meets, and a
         plausible sentence in that position is a fabricated governance
         disclosure. It is attributed to the entity or reported absent. */
      governance: {
        paragraph: 'IFRS S2 §6',
        title: 'Governance',
        boardOversight: integrity.declared(entity, 'boardOversight',
          'How the board oversees climate-related risks and opportunities', 'IFRS S2 §6(a)'),
        managementRole: integrity.declared(entity, 'managementRole',
          'Management\'s role in assessing and managing climate-related risks', 'IFRS S2 §6(b)'),
      },
      strategy: {
        paragraph: 'IFRS S2 §9–13',
        title: 'Strategy',
        risksAndOpportunities: integrity.declared(entity, 'climateRisksAndOpportunities',
          'The climate-related risks and opportunities the entity has identified, '
          + 'with the time horizons over which each could reasonably be expected to '
          + 'affect it', 'IFRS S2 §10–12'),
        businessModelEffects: integrity.declared(entity, 'businessModelEffects',
          'Current and anticipated effects on the business model and value chain',
          'IFRS S2 §13'),
      },
      financialEffects: {
        paragraph: 'IFRS S2 §15–21',
        title: 'Financial Effects of Climate-related Risks',
        currentPeriod: integrity.declared(entity, 'financialEffectsCurrentPeriod',
          'Effects on the entity\'s financial position, performance and cash flows '
          + 'for the period', 'IFRS S2 §16'),
        anticipated: integrity.declared(entity, 'financialEffectsAnticipated',
          'Anticipated effects over the short, medium and long term', 'IFRS S2 §16(b)'),
      },
      climateResilience: {
        paragraph: 'IFRS S2 §22',
        title: 'Climate Resilience Assessment',
        scenarioAnalysis: integrity.declared(entity, 'scenarioAnalysis',
          'Climate-related scenario analysis, the scenarios used and the entity\'s '
          + 'assessment of its resilience under each', 'IFRS S2 §22'),
        note: 'Scenario alignment is a forward-looking judgement about the entity\'s '
          + 'strategy under stated assumptions. It is not derivable from a '
          + 'measured emissions inventory.',
      },
      emissionsData: {
        paragraph: 'IFRS S2 §29',
        title: 'GHG Emissions',
        scope1_tCO2e: _entityScope(entity, 'scope1_tCO2e', 'IFRS S2 §29(a)(i)'),
        scope2_tCO2e: _entityScope(entity, 'scope2_tCO2e', 'IFRS S2 §29(a)(ii)'),
        scope3Category15_tCO2e: p.totalEmissions_tCO2e,
        scope3OtherCategories: integrity.notMeasured(
          'Scope 3 categories other than 15',
          'This system measures financed emissions only.'),
        dataQuality: {
          weightedScore: p.weightedDQ,
          scale: 'PCAF data quality score: 1 is the highest quality, 5 the lowest.',
        },
        measurementApproach: 'PCAF Global GHG Accounting and Reporting Standard, '
          + 'Third Edition (December 2025), applied to the construction lending portfolio.',
      },
      transitionPlan: {
        paragraph: 'IFRS S2 §14',
        title: 'Transition Plan',
        plan: integrity.declared(entity, 'transitionPlan',
          'The entity\'s climate-related transition plan, including the targets it '
          + 'has set and the basis on which they were set', 'IFRS S2 §14'),
        note: 'A transition plan is a commitment made by the entity. It is not a '
          + 'property of its portfolio and cannot be asserted on its behalf.',
      },
    },
    gaps: null,   // filled by _withGaps
  };
}

// ---------------------------------------------------------------------------
// Sri Lanka Green Finance Taxonomy (SLGFT) Report
// ---------------------------------------------------------------------------

function _slgftReport(meta, p, slgft, entity) {
  // Taxonomy distribution — default to demo data if not supplied
  const taxDist = slgft.taxonomyDistribution || {
    green:      { count: 4,  pct: 40, financed_emissions_tCO2e: 12400 },
    transition: { count: 5,  pct: 50, financed_emissions_tCO2e: 19800 },
    not_aligned: { count: 1, pct: 10, financed_emissions_tCO2e: 5400  },
  };

  const totalLKProjects  = slgft.totalLKProjects || (taxDist.green.count + taxDist.transition.count + (taxDist.not_aligned?.count || 0));
  const totalLKEmissions = slgft.totalLKEmissions_tCO2e || Object.values(taxDist).reduce((s, t) => s + (t.financed_emissions_tCO2e || 0), 0);
  const ndcContrib       = slgft.ndcContribution_pct || 35;
  const alignedPct       = Math.round(((taxDist.green?.count || 0) + (taxDist.transition?.count || 0)) / totalLKProjects * 100);

  return {
    ...meta,
    type:     'slgft',
    title:    'Sri Lanka Green Finance Taxonomy (SLGFT) Compliance Report',
    standard: 'SLGFT v2024 · Central Bank of Sri Lanka (CBSL) · Direction No. 05 of 2022',
    summary: {
      reportingPeriod:         meta.reportingPeriod,
      totalLKProjects,
      slgftAligned_pct:        `${alignedPct}%`,
      totalFinancedEmissions:  `${(totalLKEmissions / 1000).toFixed(1)} ktCO2e`,
      ndcContribution:         `${ndcContrib}% estimated contribution to unconditional NDC target`,
      keySDGs:                 'SDG 7 · SDG 9 · SDG 11 · SDG 13 · SDG 14 · SDG 15',
      taxonomyVersion:         'SLGFT v2024',
      regulator:               'Central Bank of Sri Lanka (CBSL)',
    },

    regulatoryContext: {
      cbslDirection:           'Direction No. 05 of 2022 — Sustainable Finance',
      slfrs:                   'SLFRS S2 — Sri Lanka Financial Reporting Standard (climate disclosures)',
      taxonomyScope:           '13 SLSIC Sectors (A–M), 4 Environmental Objectives (M/A/P/E)',
      carbonThresholds:        'Green: ≤600 kgCO2e/m² · Transition: ≤900 kgCO2e/m² · Not Aligned: >900 kgCO2e/m²',
      carbonPricingStatus:     'Voluntary SLCCE market (2025) · Proposed SLCCE floor LKR 500/tCO2e (2027)',
    },

    taxonomyAlignment: {
      distribution: {
        green: {
          classification: 'Green — SLGFT Aligned',
          projectCount:   taxDist.green?.count || 0,
          portfolioPct:   `${taxDist.green?.pct || 0}%`,
          financed_tCO2e: taxDist.green?.financed_emissions_tCO2e || 0,
          loanPricing:    '−20 bps (Green Loan designation)',
        },
        transition: {
          classification: 'Transition — Pathway to Alignment',
          projectCount:   taxDist.transition?.count || 0,
          portfolioPct:   `${taxDist.transition?.pct || 0}%`,
          financed_tCO2e: taxDist.transition?.financed_emissions_tCO2e || 0,
          loanPricing:    '−8 bps (Sustainability-Linked Loan with ratchet)',
        },
        not_aligned: {
          classification: 'Not Aligned — Standard Classification',
          projectCount:   taxDist.not_aligned?.count || 0,
          portfolioPct:   `${taxDist.not_aligned?.pct || 0}%`,
          financed_tCO2e: taxDist.not_aligned?.financed_emissions_tCO2e || 0,
          loanPricing:    'Standard rate (no adjustment)',
        },
      },
      eligibilityTypes: {
        directEligibility:   'Activities meeting SLGFT criteria regardless of carbon intensity (e.g. M4.1 Solar PV)',
        thresholdEligibility: 'Construction activities assessed against embodied carbon thresholds',
      },
    },

    ndcAlignment: {
      unconditionalTarget: '4.5% GHG reduction by 2030 vs Business-As-Usual',
      conditionalTarget:   '14.5% GHG reduction by 2030 (with international support)',
      netZeroTarget:       '2050',
      portfolioContribution_pct: ndcContrib,
      keyDrivers: slgft.ndcKeyDrivers || [
        'Below-threshold embodied carbon intensity in green-classified projects',
        'Solar PV and clean energy infrastructure (directly eligible activities)',
        'Embodied carbon monitoring via ICE v3 factors and PCAF attribution',
      ],
      improvementLevers: [
        'Incentivise EPD procurement for top-3 emission materials (improves PCAF DQ score)',
        'Increase share of directly-eligible activities (M4.1, M4.2, M4.3) in portfolio',
        'Introduce SLCCE voluntary carbon credits for residual emissions offset',
      ],
    },

    sdgAlignment: {
      keySDGs: [
        { sdg: 7,  label: 'Affordable & Clean Energy',               relevance: 'high',   rationale: 'Solar PV and clean energy infrastructure financing.' },
        { sdg: 9,  label: 'Industry, Innovation & Infrastructure',   relevance: 'high',   rationale: 'Low-carbon construction and green building finance.' },
        { sdg: 11, label: 'Sustainable Cities & Communities',         relevance: 'high',   rationale: 'Urban green buildings reduce operational emissions.' },
        { sdg: 13, label: 'Climate Action',                           relevance: 'high',   rationale: 'Direct contribution to NDC targets and 2050 net zero.' },
        { sdg: 14, label: 'Life Below Water',                         relevance: 'medium', rationale: 'Coastal resilient construction (Activity A2.1).' },
        { sdg: 15, label: 'Life on Land',                             relevance: 'medium', rationale: 'Sustainable land use and biodiversity (Activity E3.1).' },
      ],
      sdgMonitoringFramework: 'Aligned with UNDP SDG Impact Standards for Finance',
    },

    /* A Do No Significant Harm assessment is made per activity against
       evidence. The four objectives were previously fixed verdicts with
       narrative notes — "3 projects require climate risk assessment
       documentation", "Biodiversity impact assessments planned for Q3" — that
       referred to projects and plans this system knows nothing about. */
    dnshCompliance: {
      status: slgft.dnshStatus || integrity.notMeasured('DNSH status',
        'A Do No Significant Harm assessment is made per activity against '
        + 'evidence held by the lender. It is not derivable from embodied carbon.'),
      objectives: (slgft.dnshObjectives && slgft.dnshObjectives.length)
        ? slgft.dnshObjectives
        : [
          { code: 'M', label: 'Climate Change Mitigation' },
          { code: 'A', label: 'Climate Change Adaptation' },
          { code: 'P', label: 'Pollution Prevention & Control' },
          { code: 'E', label: 'Ecological Conservation' },
        ].map(o => ({ ...o, status: integrity.notMeasured(`DNSH — ${o.label}`,
          'No assessment against this objective has been supplied for this portfolio.') })),
      guidingPrinciples: [
        'Respect for human rights and labour standards',
        'Transparency in environmental impact reporting',
        'Stakeholder engagement and community consultation',
        'Alignment with CBSL Green Finance roadmap',
      ],
    },

    carbonPricingExposure: {
      currentRate:        'LKR 0/tCO2e (voluntary SLCCE market, 2025)',
      projectedRate2027:  'LKR 500/tCO2e (proposed SLCCE regulatory floor)',
      projectedRate2030:  'LKR 1,500/tCO2e (NDC alignment scenario)',
      portfolioExposure2030: `LKR ${Math.round(totalLKEmissions * 1500 / 1e6)}M (estimated at LKR 1,500/tCO2e)`,
      recommendation:     'Green-classified projects reduce future carbon liability by ~40% vs not-aligned portfolio.',
    },

    verificationReadiness: {
      thirdPartyVerification: 'Recommended for green-classified projects > LKR 500M loan value',
      cbslReporting:          'Annual SLGFT portfolio disclosure recommended to CBSL from FY2026',
      auditTrail:             'All calculations logged in CarbonIQ audit trail with ICE v3 factor references',
      dataQualityTarget:      'PCAF DQ Score ≤ 2 for 80% of LK portfolio by FY2027',
    },

    nextSteps: [
      { priority: 'High',   action: 'Submit annual SLGFT portfolio report to CBSL by Q1 of following year' },
      { priority: 'High',   action: 'Complete DNSH climate risk assessments for 3 conditional projects' },
      { priority: 'Medium', action: 'Enroll transition-classified borrowers in carbon reduction covenant programme' },
      { priority: 'Medium', action: 'Commission third-party verification for top 5 green-classified projects' },
      { priority: 'Low',    action: 'Explore SLCCE voluntary carbon credit registration for eligible projects' },
    ],
  };
}

// ---------------------------------------------------------------------------
// PDF Builder
// ---------------------------------------------------------------------------

function buildPDF(report) {
  const doc = new PDFDocument({ margin: 56, size: 'A4', compress: true });

  _pdfCover(doc, report);
  _pdfSummaryTable(doc, report);
  _pdfSections(doc, report);
  _pdfFooterNote(doc, report);

  doc.end();
  return doc;
}

function _pdfCover(doc, report) {
  // Header bar
  doc.rect(0, 0, doc.page.width, 8).fill('#10b981');

  doc.moveDown(2);
  doc.fontSize(9).fillColor('#6e6e73').text('CONFIDENTIAL — BANK USE ONLY', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(22).fillColor('#1d1d1f').font('Helvetica-Bold')
     .text('CarbonIQ', { align: 'center' });
  doc.fontSize(14).fillColor('#6e6e73').font('Helvetica')
     .text('Bank Carbon Intelligence Platform', { align: 'center' });

  doc.moveDown(1.5);
  doc.fontSize(18).fillColor('#1d1d1f').font('Helvetica-Bold')
     .text(report.title, { align: 'center' });

  doc.moveDown(0.8);
  doc.fontSize(11).fillColor('#6e6e73').font('Helvetica')
     .text(`${report.organisation}  ·  ${report.reportingPeriod}`, { align: 'center' });

  doc.moveDown(0.4);
  doc.fontSize(9).fillColor('#aeaeb2')
     .text(report.standard, { align: 'center' });

  // Divider
  doc.moveDown(1.5);
  doc.moveTo(56, doc.y).lineTo(doc.page.width - 56, doc.y).lineWidth(0.5).strokeColor('#e5e5e7').stroke();
  doc.moveDown(1);
}

function _pdfSummaryTable(doc, report) {
  const summary = report.summary || {};
  const entries = Object.entries(summary);
  if (entries.length === 0) return;

  doc.fontSize(12).fillColor('#1d1d1f').font('Helvetica-Bold').text('Executive Summary');
  doc.moveDown(0.6);

  const colW = (doc.page.width - 112) / 2;
  let col = 0;
  let startX = 56;
  let rowY = doc.y;

  for (const [key, val] of entries) {
    const label = _humaniseKey(key);
    const value = String(val);
    const x = startX + col * (colW + 8);

    doc.fontSize(8).fillColor('#aeaeb2').font('Helvetica').text(label.toUpperCase(), x, rowY, { width: colW });
    doc.fontSize(11).fillColor('#1d1d1f').font('Helvetica-Bold').text(value, x, doc.y, { width: colW });

    col++;
    if (col >= 2) {
      col = 0;
      rowY = doc.y + 12;
      doc.y = rowY;
    } else {
      doc.y = rowY;
    }
  }

  doc.moveDown(2);
  doc.moveTo(56, doc.y).lineTo(doc.page.width - 56, doc.y).lineWidth(0.5).strokeColor('#e5e5e7').stroke();
  doc.moveDown(1);
}

function _pdfSections(doc, report) {
  const skip = new Set(['generatedAt', 'reportingPeriod', 'organisation', 'reportId', 'type', 'title', 'standard', 'summary']);
  const sections = Object.entries(report).filter(([k]) => !skip.has(k));

  for (const [key, value] of sections) {
    if (doc.y > doc.page.height - 140) doc.addPage();

    doc.fontSize(13).fillColor('#1d1d1f').font('Helvetica-Bold').text(_humaniseKey(key));
    doc.moveDown(0.5);
    _pdfValue(doc, value, 0);
    doc.moveDown(1);
  }
}

function _pdfValue(doc, value, depth) {
  const indent = 56 + depth * 14;
  const width = doc.page.width - indent - 56;

  /* An absent disclosure has to read as absent on the page, not as an object
     dump. It is set in italic amber so a reader scanning the document can see
     at a glance which statements the entity still has to make. */
  if (integrity.isPlaceholder(value)) {
    const label = value._status === integrity.NOT_PROVIDED
      ? 'Not provided by the reporting entity'
      : 'Not measured by this system';
    const detail = value.requirement || value.metric;
    const ref = value.standardRef ? ` (${value.standardRef})` : '';
    doc.fontSize(9).fillColor('#8a5a00').font('Helvetica-Oblique')
       .text(`${label}${ref} — ${detail}`, indent, doc.y, { width });
    if (value.reason || value.note) {
      doc.fontSize(8).fillColor('#6e6e73').font('Helvetica-Oblique')
         .text(value.reason || value.note, indent, doc.y, { width });
    }
    doc.moveDown(0.3);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'object' && item !== null) {
        _pdfValue(doc, item, depth + 1);
      } else {
        doc.fontSize(9).fillColor('#3d3d3f').font('Helvetica')
           .text(`• ${item}`, indent, doc.y, { width });
      }
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      if (doc.y > doc.page.height - 100) doc.addPage();

      if (typeof v === 'object' || Array.isArray(v)) {
        doc.fontSize(10).fillColor('#1d1d1f').font('Helvetica-Bold')
           .text(_humaniseKey(k), indent, doc.y, { width });
        doc.moveDown(0.3);
        _pdfValue(doc, v, depth + 1);
      } else {
        doc.fontSize(8).fillColor('#aeaeb2').font('Helvetica')
           .text(_humaniseKey(k).toUpperCase(), indent, doc.y, { width });
        doc.fontSize(9).fillColor('#3d3d3f').font('Helvetica')
           .text(String(v), indent, doc.y, { width });
        doc.moveDown(0.4);
      }
    }
  } else {
    doc.fontSize(9).fillColor('#3d3d3f').font('Helvetica')
       .text(String(value), indent, doc.y, { width: width });
    doc.moveDown(0.3);
  }
}

function _pdfFooterNote(doc, report) {
  const pageCount = doc.bufferedPageRange ? doc.bufferedPageRange().count : 1;
  doc.moveDown(2);
  doc.moveTo(56, doc.y).lineTo(doc.page.width - 56, doc.y).lineWidth(0.5).strokeColor('#e5e5e7').stroke();
  doc.moveDown(0.5);
  doc.fontSize(7.5).fillColor('#aeaeb2').font('Helvetica')
     .text(
       `Report ID: ${report.reportId}  ·  Generated: ${new Date(report.generatedAt).toUTCString()}  ·  Powered by CarbonIQ FinTech`,
       56, doc.y, { align: 'center', width: doc.page.width - 112 }
     );
}

function _slgftCbslReport(meta, p, entity) {
  return {
    ...meta,
    type: 'slgft-cbsl',
    title: 'SLGFT CBSL Green Finance Disclosure',
    standard: 'CBSL Direction No. 05/2022 · SLFRS S2 (Sri Lanka Financial Reporting Standard for Sustainability)',
    framework: 'Sri Lanka Green Finance Taxonomy (SLGFT)',
    summary: {
      totalProjects: p.totalProjects,
      portfolioCoverage_pct: p.coverage_pct,
      totalFinancedEmissions_tCO2e: p.totalEmissions_tCO2e,
      reportingBoundary: 'Construction & Project Finance Lending Portfolio — Sri Lanka Operations',
    },
    cbslCompliance: {
      directionNo05: {
        title: 'CBSL Direction No. 05 of 2022 — Green Finance Classification',
        /* A compliance status is a conclusion a supervisor or an assurance
           provider reaches. Asserting 'Compliant' in a document addressed to
           the regulator that decides it is not a disclosure, it is a claim. */
        status: integrity.notMeasured('Compliance status',
          'Compliance with Direction No. 05 is determined by the Central Bank, not '
          + 'by this system. What is reported here is the measured classification '
          + 'of the book against the taxonomy thresholds.'),
        greenLendingRatio_pct: _distPct(p, 'green'),
        transitionLendingRatio_pct: _distPct(p, 'transition'),
        brownLendingRatio_pct: _distPct(p, 'brown'),
        classificationMethodology: 'CarbonIQ Carbon Finance Score (0–100) applied to '
          + 'each construction exposure: 70 and above Green, 40–69 Transition, below 40 Brown.',
        thresholdCaveat: 'Two Sri Lankan embodied-carbon threshold sets are held in '
          + 'this system and they disagree (520/780 and 600/900 kgCO2e/m²). The '
          + 'classification above uses the set named in this report\'s taxonomy '
          + 'section. Which set applies is a question for CBSL and is not settled here.',
      },
      slfrsS2: {
        title: 'SLFRS S2 Climate-Related Disclosures',
        adoptionStatus: 'SLFRS S2 is being adopted in Sri Lanka on a phased basis. '
          + 'The entity\'s own phase and effective date should be confirmed with its auditor.',
        /* SLFRS S2 follows ISSB: four pillars, all four mandatory. Only
           metrics is derivable here. */
        governance: integrity.declared(entity, 'boardOversight',
          'Governance of climate-related risks and opportunities', 'SLFRS S2 §6'),
        strategy: integrity.declared(entity, 'climateRisksAndOpportunities',
          'Climate-related risks and opportunities, and their effects on strategy',
          'SLFRS S2 §9–13'),
        riskManagement: integrity.declared(entity, 'riskIdentificationProcess',
          'Processes to identify, assess and manage climate-related risks',
          'SLFRS S2 §24–26'),
        metricsAndTargets: {
          financedEmissions_tCO2e: p.totalEmissions_tCO2e,
          scope3Category15_tCO2e: p.totalEmissions_tCO2e,
          weightedDataQualityScore: p.weightedDQ,
          entityScope1And2: _entityScope(entity, 'scope1And2_tCO2e', 'SLFRS S2 §29(a)'),
          targets: integrity.declared(entity, 'climateTargets',
            'Climate-related targets set by the entity and performance against them',
            'SLFRS S2 §33–37'),
        },
        financialEffects: integrity.declared(entity, 'financialEffectsCurrentPeriod',
          'Effects of climate-related risks on financial position and performance',
          'SLFRS S2 §15–21'),
      },
    },
    taxonomyAlignment: {
      slgftGreen_pct: _distPct(p, 'green'),
      thresholds: {
        green_max_kgCO2e_m2: 520,
        transition_max_kgCO2e_m2: 780,
        source: 'TAXONOMY_SL. A second Sri Lankan set (600 / 900 kgCO2e/m²) is also '
          + 'held in this system for the same regulation. A project between the two '
          + 'is classified differently depending on which applies, so the set in '
          + 'force must be confirmed with CBSL before this figure is relied upon.',
      },
    },
    esgMetrics: {
      totalEmissions_tCO2e: p.totalEmissions_tCO2e,
      weightedDataQualityScore: p.weightedDQ,
      carbonIntensity_tCO2e_per_M: +(p.totalEmissions_tCO2e / (p.totalPortfolioValue_M || 1000)).toFixed(1),
    },
    /* A named bank's bond issuance, accreditation status and funding access
       are facts about that institution. They were literals here, and would
       have appeared in any organisation's report. */
    institutionalContext: integrity.declared(entity, 'institutionalContext',
      'Green and blue bond issuance, accreditation status and climate funding '
      + 'access, as stated by the entity'),
    targets: integrity.declared(entity, 'climateTargets',
      'Climate-related targets and measured progress against each', 'SLFRS S2 §33–37'),
    gaps: null,   // filled by _withGaps
  };
}

/** A share of the book, or nothing. Never a stand-in percentage. */
function _distPct(p, band) {
  if (!p.taxonomyDist || !p.totalProjects) {
    return integrity.notMeasured(`${band} lending ratio`,
      'No taxonomy classification is held for this portfolio.');
  }
  return Math.round((p.taxonomyDist[band] / p.totalProjects) * 100);
}

// ---------------------------------------------------------------------------
// Demo Portfolio Data (used when no real portfolio is provided)
// ---------------------------------------------------------------------------

function _demoPortfolio(period) {
  const yr = parseInt(period, 10);
  return {
    totalProjects: 87,
    coverage_pct: 94.2,
    totalEmissions_tCO2e: 48230,
    weightedDQ: 2.4,
    totalPortfolioValue_M: 1560,
    taxonomyDist: { green: 36, transition: 38, brown: 13 },
    dqDistribution: { '1': 8, '2': 31, '3': 29, '4': 14, '5': 5 },
    assetClasses: [
      { class: 'Commercial',      projects: 34, outstandingLoan_M: 680, emissions_tCO2e: 22400, intensity_tCO2e_M: 32.9 },
      { class: 'Residential',     projects: 28, outstandingLoan_M: 420, emissions_tCO2e: 14200, intensity_tCO2e_M: 33.8 },
      { class: 'Industrial',      projects: 15, outstandingLoan_M: 310, emissions_tCO2e: 8100,  intensity_tCO2e_M: 26.1 },
      { class: 'Infrastructure',  projects: 10, outstandingLoan_M: 150, emissions_tCO2e: 3530,  intensity_tCO2e_M: 23.5 },
    ],
    yoy: {
      prev_tCO2e: 42100,
      current_tCO2e: 48230,
      change_pct: '+14.6%',
      explanation: `Increase driven by 21% growth in portfolio size from ${yr - 1}. Carbon intensity (tCO2e/$M) improved by 3.1%.`,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _humaniseKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = { generateReport, buildPDF };
