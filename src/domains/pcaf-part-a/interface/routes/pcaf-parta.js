// @ts-check
/**
 * CarbonIQ FinTech — PCAF Part A (financed emissions)
 *
 *   GET  /v1/pcaf/part-a/reference                    asset classes, archetypes, data-quality options
 *   POST /v1/pcaf/part-a/assess                       assess one exposure (§5.3 project finance)
 *   POST /v1/pcaf/part-a/business-loans/assess        assess one exposure (§5.2)
 *   POST /v1/pcaf/part-a/business-loans/portfolio     roll up a book and rank what to fix first (§5.2)
 *
 * Deterministic and synchronous. No model call, so none of the deadline
 * machinery the agent routes need applies here — an assessment is arithmetic
 * and returns in single-digit milliseconds.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { doc, body, str, num, arr } = require('../../../../platform/http/openapi-hints');
const referenceCache = require('../../../../platform/http/reference-cache');
const validate   = require('../../../../platform/http/validate');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');

const parta = require('../../domain');
const { assessBusinessLoan } = require('../../domain/business-loans');
const businessLoansPortfolio = require('../../domain/business-loans/portfolio');
const { assessRequestSchema } = require('../schemas/pcaf-parta');
const { exposureSchema, portfolioRequestSchema } = require('../schemas/business-loans');

const router = Router();

/**
 * What a form needs to render itself.
 *
 * The options come from the asset class's own table rather than a list held in
 * the UI, so a screen cannot offer an option the engine would then reject, and
 * the two cannot drift.
 */
router.get('/reference', authenticate, defaultLimiter, referenceCache(), doc({ summary: 'Part A asset classes, archetypes and the data-quality options for each',
    description: 'The option-to-score mapping is resolved per asset class and there is no '
      + 'global lookup: Option 2b is score 2 in one class and 3 in another, so one table '
      + 'applied across classes would be wrong for some of them, silently.',
    response: body({ standard: str, assetClasses: arr() }, ['standard', 'assetClasses']) }), (_req, res, next) => {
  try {
    res.json({
      standard: parta.STANDARD,
      assetClasses: [
        {
          id: 'project-finance',
          label: 'Project finance',
          section: '5.3',
          definition: 'On-balance sheet loans or equity to projects or activities designated '
            + 'for specific purposes, with known use of proceeds — for example the construction '
            + 'and operation of a power plant, a wind or solar project, or energy efficiency projects.',
          denominator: 'total project equity plus debt',
          scopes: 'Scope 1 and 2 shall be reported. Scope 3 should be covered if relevant.',
          dataQualityOptions: parta.dataQuality.optionsFor('project-finance'),
          dataQualityTable: parta.dataQuality.tableFor('project-finance').table,
        },
        {
          id: 'business-loans-unlisted-equity',
          label: 'Business loans and unlisted equity',
          section: '5.2',
          definition: 'On-balance sheet loans and lines of credit to listed and unlisted businesses '
            + 'for general corporate purposes — revolving credit, overdrafts and loans secured on '
            + 'real estate included — and equity investments in companies not traded on a market. '
            + 'Loans to governments are sovereign or sub-sovereign debt; a loan to a state-owned '
            + 'enterprise is in this class.',
          denominator: 'total company equity plus debt, or EVIC where the borrower is listed',
          scopes: 'Scope 1, 2 and 3 of the borrower shall be reported, across all sectors, with '
            + 'scope 3 disclosed separately from scope 1 and 2.',
          instruments: {
            loans: [...require('../../domain/business-loans/classify').LOANS],
            equity: [...require('../../domain/business-loans/classify').EQUITY],
          },
          dataQualityOptions: parta.dataQuality.optionsFor('business-loans-unlisted-equity'),
          dataQualityTable: parta.dataQuality.tableFor('business-loans-unlisted-equity').table,
          thresholds: require('../../domain/business-loans/checks').DEFAULTS,
        },
      ],
      archetypes: parta.archetypes.list(),
      /* The countries a renewable project can be sited in, each with both
         factor bases and the source behind them. A screen offering a country
         the engine holds no factor for would be offering a refusal. */
      /* Everything country-dependent, so a form cannot offer a country or a
         technology the engine holds nothing for. */
      countryConfig: {
        unit: parta.countryConfig.CONFIG.unit,
        gridFactorUses: parta.countryConfig.CONFIG.grid_factor_uses,
        fallbackRule: parta.countryConfig.CONFIG.fallback_rule,
        staleAfterYears: parta.countryConfig.CONFIG.stale_after_years,
        verificationLevels: parta.countryConfig.CONFIG.verification_levels,
        yieldBasis: parta.countryConfig.CONFIG.yield_basis,
        degradation: parta.countryConfig.CONFIG.degradation,
        gridTrajectory: parta.countryConfig.CONFIG.grid_trajectory,
        technologies: parta.countryConfig.TECHNOLOGIES,
        technologyLimits: parta.countryConfig.CONFIG.technology_limits,
        globalDefaults: parta.countryConfig.CONFIG.global_defaults,
        countries: parta.countryConfig.countries(),
        coverage: parta.countryConfig.coverage(),
      },
      notes: {
        avoidedEmissions: 'Avoided emissions are no longer covered by Part A. From the '
          + 'Third Edition (December 2025) they sit in optional supplemental guidance, and '
          + 'figures resting on it are reported separately from the inventory.',
        dataQuality: 'The option-to-score mapping differs between asset classes, so the '
          + 'options above belong to this asset class alone.',
        derivedOption: 'Where a renewable project supplies its generation and country, the '
          + 'data quality option is derived from the data consumed rather than chosen. Naming a '
          + 'different option is then an override and requires a justification.',
        factorBasis: 'A grid average is what a consumer draws; a combined margin is what a new '
          + 'grid-connected renewable displaces. They are not interchangeable, and where the '
          + 'basis a purpose calls for is not held the substitution is reported rather than hidden.',
      },
    });
  } catch (err) { next(err); }
});

router.post('/assess',
  doc({ summary: 'PCAF Part A financed emissions for one asset',
    description: 'Data quality is weighted by outstanding amount (p.128), which is not how '
      + 'Part C weights it, so the two engines never share a weighting function. Avoided '
      + 'emissions are reported separately and never netted against the inventory (p.126).',
    response: body({ elapsedMs: num }) }), authenticate, defaultLimiter,
  validate({ body: assessRequestSchema }),
  (req, res, next) => {
    try {
      const startedAt = Date.now();
      const result = parta.assessExposure(req.body);
      res.json({ ...result, elapsedMs: Date.now() - startedAt });
    } catch (err) { next(err); }
  });

/**
 * §5.2 — one exposure.
 *
 * The response carries a `validation` block beside the figures: what the data
 * says about itself, as findings that never refuse and never change a number.
 * It is the half of the answer a bank cannot get from the standard.
 */
router.post('/business-loans/assess',
  doc({ summary: 'PCAF Part A §5.2 financed emissions for one business loan or unlisted equity holding',
    description: 'Six reporting lines, never netted; data quality by option from Table 5.2-1 and '
      + 'never averaged; EVIC where the borrower is listed and total equity plus debt otherwise. '
      + 'The validation block reports what the data says about itself — the footnote 71 year-end '
      + 'fluctuation of a revolving facility, the age of the emissions figure, a denominator that '
      + 'cannot have come from one balance sheet — as findings that change no figure.',
    response: body({ elapsedMs: num }) }), authenticate, defaultLimiter,
  validate({ body: exposureSchema }),
  (req, res, next) => {
    try {
      const startedAt = Date.now();
      const result = assessBusinessLoan(req.body);
      res.json({ ...result, elapsedMs: Date.now() - startedAt });
    } catch (err) { next(err); }
  });

/**
 * §5.2 — a book.
 *
 * A read: nothing is stored and no id is issued, so the same request twice
 * gives the same answer and moves nothing. The improvement plan is ordered by
 * how much of the disclosed score each remedy holds down, because a score is a
 * measurement and not a worklist.
 */
router.post('/business-loans/portfolio',
  doc({ summary: 'Roll up a book of §5.2 exposures and rank what to fix first',
    description: 'Six lines summed per group and never across lines; the disclosed score weighted '
      + 'by outstanding amount with scope 3 apart; financial-sector borrowers rolled up separately. '
      + 'Every figure under the improvement plan is a scenario run through the same weighting the '
      + 'disclosure uses and is never the reported score. Stores nothing.',
    response: body({ elapsedMs: num }) }), authenticate, defaultLimiter,
  validate({ body: portfolioRequestSchema }),
  (req, res, next) => {
    try {
      const startedAt = Date.now();
      const results = req.body.exposures.map(assessBusinessLoan);
      const book = businessLoansPortfolio.rollUp(results, {
        totalLoansAndInvestments: req.body.totalLoansAndInvestments,
        improvementTarget: req.body.improvementTarget,
      });
      res.json({ ...book, exposures: results, elapsedMs: Date.now() - startedAt });
    } catch (err) { next(err); }
  });

module.exports = router;
