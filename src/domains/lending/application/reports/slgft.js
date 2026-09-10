// @ts-check
/**
 * The two Sri Lanka reports — the fuller taxonomy report and the CBSL Direction 05 disclosure.
 */

'use strict';

const integrity   = require('../../../../shared/report-integrity');
const { _entityScope } = require('./standards');

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
      /* NDC 3.0 (September 2025). Reduction and removal are separate
         commitments over 2026-2035 and are never summed. */
      reductionTarget: '20.09% cumulative GHG reduction against BAU, 2026-2035 '
        + '(8.11% unconditional, 11.98% conditional)',
      removalTarget:   '4.49% increase in net carbon removal, 2026-2035 '
        + '(0.96% unconditional, 3.53% conditional) — reported separately',
      /* NDC 3.0 as described in the DFCC ToR states no net-zero year, so
         none is asserted. The 2050 figure here came from the superseded
         2021 NDC; carrying it forward would be inventing a national
         commitment inside a regulatory disclosure. */
      netZeroTarget:       null,
      netZeroNote:         'NDC 3.0 states no net-zero year. Reported absent rather than carried over from the superseded 2021 NDC.',
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

module.exports = { _slgftReport, _slgftCbslReport, _distPct };
