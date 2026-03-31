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
function generateReport({ type, period, orgName, portfolioData, slgftData }) {
  const portfolio = portfolioData || _demoPortfolio(period);
  const meta = {
    generatedAt: new Date().toISOString(),
    reportingPeriod: `FY ${period}`,
    organisation: orgName || 'Your Organisation',
    reportId: `RPT-${type.toUpperCase()}-${period}-${Date.now()}`,
  };

  switch (type) {
    case 'pcaf':    return _pcafReport(meta, portfolio);
    case 'gri305':  return _gri305Report(meta, portfolio);
    case 'tcfd':    return _tcfdReport(meta, portfolio);
    case 'ifrs-s2': return _ifrsS2Report(meta, portfolio);
    case 'slgft':   return _slgftReport(meta, portfolio, slgftData || {});
    default:        throw new Error(`Unknown report type: ${type}`);
  }
}

// ---------------------------------------------------------------------------
// Report Builders
// ---------------------------------------------------------------------------

function _pcafReport(meta, p) {
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
    complianceChecklist: [
      { item: 'Absolute financed emissions reported',          met: true },
      { item: 'Physical intensity (tCO2e/m²) reported',       met: true },
      { item: 'Economic intensity (tCO2e/$M) reported',       met: true },
      { item: 'Weighted data quality score disclosed',         met: true },
      { item: 'Portfolio coverage percentage stated',          met: true },
      { item: 'Scope 1, 2, 3 breakdown included',             met: true },
      { item: 'Year-on-year fluctuation analysis provided',   met: true },
      { item: 'Methodology and boundaries documented',        met: true },
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

function _gri305Report(meta, p) {
  const s1 = Math.round(p.totalEmissions_tCO2e * 0.08);
  const s2 = Math.round(p.totalEmissions_tCO2e * 0.14);
  const s3 = Math.round(p.totalEmissions_tCO2e * 0.78);

  return {
    ...meta,
    type: 'gri305',
    title: 'GRI 305: Emissions Disclosure',
    standard: 'GRI 305: Emissions 2016 (referenced with GRI 1 Foundation 2021)',
    summary: {
      totalGHG_tCO2e: p.totalEmissions_tCO2e,
      scope1_tCO2e: s1,
      scope2_tCO2e: s2,
      scope3_tCO2e: s3,
      ghgIntensity_tCO2e_per_M_invested: (p.totalEmissions_tCO2e / (p.totalPortfolioValue_M || 1000)).toFixed(2),
    },
    disclosures: {
      'GRI 305-1': {
        title: 'Direct (Scope 1) GHG Emissions',
        value_tCO2e: s1,
        gases: ['CO2', 'CH4', 'N2O'],
        methodology: 'Emissions from on-site construction equipment and temporary facilities within bank-financed project boundaries.',
        biogenic_tCO2e: 0,
      },
      'GRI 305-2': {
        title: 'Energy Indirect (Scope 2) GHG Emissions',
        value_tCO2e: s2,
        approach: 'Location-based',
        methodology: 'Grid electricity consumed during construction. National grid emission factors applied per IEA 2024.',
        marketBased_tCO2e: Math.round(s2 * 0.9),
      },
      'GRI 305-3': {
        title: 'Other Indirect (Scope 3) GHG Emissions',
        value_tCO2e: s3,
        categories: [
          { cat: 'Category 1 — Purchased goods & services (embodied carbon)', tCO2e: Math.round(s3 * 0.85) },
          { cat: 'Category 11 — Use of sold products (financed emissions)', tCO2e: Math.round(s3 * 0.10) },
          { cat: 'Category 15 — Investments',                                tCO2e: Math.round(s3 * 0.05) },
        ],
        methodology: 'Embodied carbon from construction materials per CarbonIQ ECCS 6-step classification + ICE v3.0.',
      },
      'GRI 305-4': {
        title: 'GHG Emissions Intensity',
        ratio: `${(p.totalEmissions_tCO2e / (p.totalPortfolioValue_M || 1000)).toFixed(2)} tCO2e per $M outstanding`,
        denominatorMetric: 'Total outstanding construction loan portfolio value ($M)',
      },
      'GRI 305-5': {
        title: 'Reduction of GHG Emissions',
        reductions_tCO2e: p.yoy ? Math.max(0, p.yoy.prev_tCO2e - p.totalEmissions_tCO2e) : 0,
        initiatives: [
          'Green loan covenant requirements mandating embodied carbon reduction plans',
          'Preferential pricing (–15–25 bps) for projects achieving CarbonIQ Score ≥ 70',
          'Quarterly covenant monitoring with material substitution alerts',
        ],
      },
    },
    omissions: [
      { disclosure: 'GRI 305-6', reason: 'Ozone-depleting substance emissions not applicable to project finance lending.' },
      { disclosure: 'GRI 305-7', reason: 'NOx/SOx data not yet tracked at portfolio level — planned for FY2026.' },
    ],
  };
}

function _tcfdReport(meta, p) {
  return {
    ...meta,
    type: 'tcfd',
    title: 'Task Force on Climate-related Financial Disclosures (TCFD) Report',
    standard: 'TCFD Recommendations (2017) — Final Report & 2021 Guidance',
    summary: {
      totalExposure_M: p.totalPortfolioValue_M,
      climateRiskExposure_pct: 34,
      greenAligned_pct: p.taxonomyDist ? Math.round((p.taxonomyDist.green / p.totalProjects) * 100) : 42,
      carbonIntensity_tCO2e_per_M: (p.totalEmissions_tCO2e / (p.totalPortfolioValue_M || 1000)).toFixed(2),
    },
    pillars: {
      governance: {
        title: 'Governance',
        boardOversight: 'Board Risk Committee reviews climate-related risk quarterly. Climate KPIs included in executive scorecard from FY2025.',
        managementRole: 'ESG team (3 FTEs) uses CarbonIQ platform for portfolio-level embodied carbon tracking. Reports to Chief Risk Officer.',
        policies: [
          'Green Finance Policy (revised FY2025): mandates PCAF v3 reporting for all construction loans > $5M',
          'Climate Risk Appetite Statement: construction portfolio carbon intensity target of 40 tCO2e/$M by 2030',
        ],
      },
      strategy: {
        title: 'Strategy',
        risks: [
          {
            horizon: 'Short-term (1–3 years)',
            type: 'Transition',
            description: `Tightening embodied carbon regulations (ASEAN Taxonomy v3, EU Taxonomy 2024). Projects below benchmark face stranded-asset risk.`,
            financialImpact: 'Estimated $42M exposure in below-benchmark projects (9% of portfolio)',
          },
          {
            horizon: 'Medium-term (3–10 years)',
            type: 'Transition',
            description: 'Carbon pricing expansion. Singapore carbon tax rises to $50–80/tCO2e by 2030. Increases construction cost and default probability for high-carbon projects.',
            financialImpact: 'Carbon tax sensitivity: +$1.8M cost per $10/tCO2e price increase across portfolio',
          },
          {
            horizon: 'Long-term (10+ years)',
            type: 'Physical',
            description: 'Acute physical risks (flooding, heat stress) impacting collateral value in coastal projects. 12% of portfolio in high flood-risk zones.',
            financialImpact: 'Collateral impairment estimated at 8–15% for assets in RCP 4.5 high-risk zones',
          },
        ],
        opportunities: [
          'Green loan origination pipeline: 18 green-certified projects pre-approved, $340M pipeline',
          'Preferential ECB/HKMA capital treatment for green-aligned assets (RWA reduction incentives)',
          'First-mover position in APAC construction embodied carbon analytics',
        ],
        resilience: '2°C scenario analysis: Portfolio aligned with <400 kgCO2e/m² benchmark for 68% of projects. 1.5°C alignment requires upgrading 23 projects.',
      },
      riskManagement: {
        title: 'Risk Management',
        identificationProcess: 'Every new construction loan application scored by CarbonIQ Carbon Finance Score (0–100). Loans below 40 flagged for enhanced review.',
        assessmentProcess: 'Quarterly covenant monitoring checks material substitution, carbon budget adherence, and taxonomy alignment.',
        integration: 'Climate risk integrated into standard credit approval workflow. Carbon Finance Score included in credit memoranda from Q1 2025.',
        thresholds: [
          { score: '≥ 70', action: 'Green classification — eligible for green bond refinancing' },
          { score: '40–69', action: 'Transition — conditional approval with carbon reduction covenant' },
          { score: '< 40', action: 'Brown — escalation to credit committee required' },
        ],
      },
      metricsTargets: {
        title: 'Metrics & Targets',
        metrics: [
          { metric: 'Total financed emissions', value: `${p.totalEmissions_tCO2e.toLocaleString()} tCO2e`, period: meta.reportingPeriod },
          { metric: 'Carbon intensity', value: `${(p.totalEmissions_tCO2e / (p.totalPortfolioValue_M || 1000)).toFixed(1)} tCO2e / $M`, period: meta.reportingPeriod },
          { metric: 'Weighted PCAF data quality score', value: `${p.weightedDQ} / 5`, period: meta.reportingPeriod },
          { metric: 'Portfolio taxonomy alignment (Green)', value: `${p.taxonomyDist ? Math.round((p.taxonomyDist.green / p.totalProjects) * 100) : 42}%`, period: meta.reportingPeriod },
        ],
        targets: [
          { target: 'Reduce portfolio carbon intensity by 30% by 2030 (vs 2023 baseline)', status: 'On Track', progress_pct: 18 },
          { target: 'Achieve PCAF weighted DQ score ≤ 2.0 by 2027', status: 'In Progress', progress_pct: 40 },
          { target: '50% of new construction loans Green-classified by 2026', status: 'On Track', progress_pct: 62 },
        ],
      },
    },
  };
}

function _ifrsS2Report(meta, p) {
  return {
    ...meta,
    type: 'ifrs-s2',
    title: 'IFRS S2 Climate-related Disclosures',
    standard: 'IFRS S2 Climate-related Disclosures (ISSB, June 2023) — effective FY2024',
    summary: {
      totalFinancedEmissions_tCO2e: p.totalEmissions_tCO2e,
      scope1And2_tCO2e: Math.round(p.totalEmissions_tCO2e * 0.22),
      scope3_tCO2e: Math.round(p.totalEmissions_tCO2e * 0.78),
      climateRiskExposure_M: Math.round((p.totalPortfolioValue_M || 1000) * 0.34),
    },
    disclosures: {
      governanceAndStrategy: {
        paragraph: 'IFRS S2 §6–9',
        title: 'Governance and Strategy',
        content: [
          'Board-level oversight via Risk Committee (quarterly climate risk reviews).',
          'Management-level: ESG function embedded in credit risk team. CarbonIQ platform deployed for real-time portfolio carbon monitoring.',
          `Climate-related risks are integrated into the organisation's risk management framework and credit approval process.`,
        ],
      },
      risksAndOpportunities: {
        paragraph: 'IFRS S2 §10–19',
        title: 'Climate-related Risks and Opportunities Identified',
        transitionRisks: [
          'Policy: ASEAN Taxonomy v3 and PCAF v3 mandates increasing compliance costs.',
          'Technology: Transition to low-carbon construction materials may affect project economics.',
          'Market: Investor and borrower preference shifting toward green-certified assets.',
        ],
        physicalRisks: [
          'Acute: Extreme weather events affecting construction timelines and collateral values.',
          'Chronic: Sea-level rise impacting 12% of portfolio in coastal locations.',
        ],
        opportunities: [
          'Green loan products with preferential pricing (launched Q2 2025).',
          'Carbon advisory services generating fee income.',
        ],
      },
      financialEffects: {
        paragraph: 'IFRS S2 §20–22',
        title: 'Financial Effects of Climate-related Risks',
        currentPeriod: {
          additionalProvisions_M: 1.2,
          greenLoanRevenue_M: 3.8,
          carbonRiskAdjustedRWA_M: Math.round((p.totalPortfolioValue_M || 1000) * 0.08),
        },
        anticipated: 'Carbon price sensitivity: Each $10/tCO2e increase in Singapore carbon tax increases portfolio-level borrower cost by ~$1.8M annually, increasing PD on high-carbon projects by an estimated 0.3–0.8%.',
      },
      climateResilience: {
        paragraph: 'IFRS S2 §22',
        title: 'Climate Resilience Assessment',
        scenarios: [
          {
            scenario: 'Net Zero 2050 (1.5°C, IEA NZE)',
            portfolioAlignment_pct: 68,
            actionRequired: 'Upgrade 23 projects to meet <350 kgCO2e/m² threshold by 2027.',
          },
          {
            scenario: 'Delayed Transition (2°C, NGFS)',
            portfolioAlignment_pct: 82,
            actionRequired: 'Minor covenant tightening required for 9 projects.',
          },
          {
            scenario: 'Current Policies (3°C+)',
            portfolioAlignment_pct: 94,
            actionRequired: 'No immediate action required; long-term physical risk exposure increases.',
          },
        ],
      },
      emissionsData: {
        paragraph: 'IFRS S2 §29',
        title: 'GHG Emissions',
        scope1_tCO2e: Math.round(p.totalEmissions_tCO2e * 0.08),
        scope2_tCO2e: Math.round(p.totalEmissions_tCO2e * 0.14),
        scope3_tCO2e: Math.round(p.totalEmissions_tCO2e * 0.78),
        scope3Category15_tCO2e: Math.round(p.totalEmissions_tCO2e * 0.78),
        measurementApproach: 'PCAF v3 (Global GHG Accounting & Reporting Standard, Third Edition, December 2025).',
      },
      transitionPlan: {
        paragraph: 'IFRS S2 §22(e)',
        title: 'Transition Plan',
        committed: true,
        milestones: [
          { year: 2025, action: 'Deploy CarbonIQ across 100% of new construction loan originations' },
          { year: 2026, action: 'Green loan products covering 35% of construction portfolio' },
          { year: 2027, action: 'Achieve PCAF weighted DQ ≤ 2.0; third-party verification for top 20 projects' },
          { year: 2030, action: '30% carbon intensity reduction vs 2023 baseline' },
        ],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Sri Lanka Green Finance Taxonomy (SLGFT) Report
// ---------------------------------------------------------------------------

function _slgftReport(meta, p, slgft) {
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

    dnshCompliance: {
      status:     slgft.dnshStatus || 'Conditional',
      objectives: [
        { code: 'M', label: 'Climate Change Mitigation',       status: 'Compliant',    note: 'All green-classified projects below 600 kgCO2e/m² threshold.' },
        { code: 'A', label: 'Climate Change Adaptation',       status: 'Conditional',  note: '3 projects require climate risk assessment documentation.' },
        { code: 'P', label: 'Pollution Prevention & Control',  status: 'Compliant',    note: 'Waste management plans required for all construction loans.' },
        { code: 'E', label: 'Ecological Conservation',         status: 'In Progress',  note: 'Biodiversity impact assessments planned for Q3.' },
      ],
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
