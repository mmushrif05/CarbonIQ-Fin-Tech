// @ts-check
/**
 * PCAF, GRI 305, TCFD and IFRS S2: the lines each asks for, measured, declared or absent.
 */

'use strict';

const integrity   = require('../../../../shared/report-integrity');

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

module.exports = { _pcafReport, _gri305Report, _entityScope, _tcfdReport, _greenAlignedPct, _ifrsS2Report };
