// @ts-check
/**
 * CarbonIQ FinTech — PCAF Part A (financed emissions)
 *
 *   GET  /v1/pcaf/part-a/reference                    asset classes, archetypes, data-quality options
 *   POST /v1/pcaf/part-a/assess                       assess one exposure (§5.3 project finance)
 *   GET  /v1/pcaf/part-a/factors                      the Option 3 sector factor library and its release
 *   GET  /v1/pcaf/part-a/conformance                  the §5.2 conformance matrix: rule → code → test
 *   POST /v1/pcaf/part-a/business-loans/assess        assess one exposure (§5.2)
 *   POST /v1/pcaf/part-a/business-loans/portfolio     roll up a book and rank what to fix first (§5.2)
 *
 * Deterministic, and the engine is synchronous. No model call, so none of the
 * deadline machinery the agent routes need applies here — an assessment is
 * arithmetic and returns in single-digit milliseconds. The one read before it
 * is the baseline registry's, for the sector band an exposure is checked
 * against; nothing is stored.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { doc, body, str, num, arr, obj } = require('../../../../platform/http/openapi-hints');
const referenceCache = require('../../../../platform/http/reference-cache');
const validate   = require('../../../../platform/http/validate');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');

const handle = require('../../../../platform/http/async-handler');
const parta = require('../../domain');
const library = require('../../domain/sector-factors');
const sovereignData = require('../../domain/sovereign/dataset');
const { assessSovereign } = require('../../domain/sovereign');
const { sovereignRequestSchema } = require('../schemas/sovereign');
const { withSectorBand } = require('../../application/plausibility');
const { assessBusinessLoan } = require('../../domain/business-loans');
const businessLoansPortfolio = require('../../domain/business-loans/portfolio');
const { assessRequestSchema } = require('../schemas/pcaf-parta');
const { exposureSchema, portfolioRequestSchema } = require('../schemas/business-loans');
const { conformanceMatrix } = require('../../domain/conformance');

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
        {
          id: 'sovereign-debt',
          label: 'Sovereign debt',
          section: '5.9',
          definition: 'Sovereign bonds and loans of any maturity or currency, including issuance '
            + 'by a central bank on the sovereign’s behalf. Supranationals are not required. '
            + 'Loans to a state-owned enterprise are business loans; a municipal or regional issuer '
            + 'is sub-sovereign debt (§5.10).',
          denominator: 'PPP-adjusted GDP of the sovereign (international USD) — not equity plus debt',
          scopes: 'Scope 1 (domestic territorial, UNFCCC production emissions) shall be reported, '
            + 'both including and excluding LULUCF. Scope 2 (imported grid energy) and scope 3 '
            + '(non-energy imports) should be reported where available.',
          dataQualityOptions: parta.dataQuality.optionsFor('sovereign-debt'),
          dataQualityTable: parta.dataQuality.tableFor('sovereign-debt').table,
          countriesHeld: sovereignData.countriesHeld(),
          dataset: sovereignData.release(),
          thresholds: require('../../domain/sovereign/checks').DEFAULTS,
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

/**
 * The Option 3 factor library and the vocabulary it is keyed to, with the
 * release the figures rest on. Reference data: cached, and every row says
 * whether it is provisional.
 */
router.get('/factors', authenticate, defaultLimiter, referenceCache(),
  doc({ summary: 'PCAF Part A sector factor library — every row with its tier, source, vintage and gap, and the release checksum',
    description: 'Option 3 sector-average intensities per unit of revenue, keyed to a closed sector '
      + 'vocabulary (ISIC Rev.4 sections, with the divisions a Sri Lankan book holds). The shipped '
      + 'table is provisional and each row says why. An estimated figure names the table, version '
      + 'and checksum it was computed on.',
    response: body({ vocabulary: obj, table: obj, release: obj }, ['vocabulary', 'table', 'release']) }),
  (_req, res) => {
    res.json({ vocabulary: library.vocabulary(), table: library.table(), release: library.release() });
  });

/**
 * The §5.2 conformance matrix — rule → implementation → proving test.
 *
 * Reference data: cached, and every row names the code that enforces it and
 * the test that proves it. Each rule is re-proved by execution in
 * docs/CONFORMANCE-EVIDENCE.md, so a citation that merely resolves is not
 * mistaken for behaviour.
 */
router.get('/conformance', authenticate, defaultLimiter, referenceCache(),
  doc({ summary: 'PCAF Part A §5.2 conformance matrix — clause, implementation and proving test per rule',
    description: 'A self-declaration of conformance with the published §5.2 method, offered with the '
      + 'evidence needed to check it. PCAF does not approve, endorse or certify software, and the '
      + 'Third Edition asset-class additions have not been reviewed by the GHG Protocol.',
    response: body({ standard: str, rules: arr(), summary: obj }, ['standard', 'rules', 'summary']) }),
  (_req, res) => {
    res.json(conformanceMatrix());
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
 * §5.9 — one sovereign exposure.
 *
 * The whole class is one division: exposure ÷ PPP-adjusted GDP (p.144), never
 * equity plus debt. Scope 1 is reported both including and excluding LULUCF and
 * the two are never summed; scope 2 and 3 are shoulds, reported absent rather
 * than zero where not held; the consumption view is a separate recommended cut
 * and is never folded into the territorial figure. A country resolves from the
 * versioned dataset, or the figures are supplied on the request.
 */
router.post('/sovereign/assess',
  doc({ summary: 'PCAF Part A §5.9 financed emissions for one sovereign bond or loan',
    description: 'Attribution is exposure ÷ PPP-adjusted GDP (international USD), not equity plus '
      + 'debt. Scope 1 (domestic territorial, UNFCCC production) is returned both including and '
      + 'excluding LULUCF and never summed; scope 2 and 3 are reported separately where held and '
      + 'absent — not zero — where not. Data quality is scored from Table 5.9-6 by the emissions '
      + 'source. Reproduces the standard’s worked example (Table 10.3-2): $1M to Singapore → 106 '
      + 'tCO2e, to Hong Kong → 91.',
    response: body({ elapsedMs: num }) }), authenticate, defaultLimiter,
  validate({ body: sovereignRequestSchema }),
  (req, res, next) => {
    try {
      const startedAt = Date.now();
      const result = assessSovereign(req.body);
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
  handle(async (req, res) => {
    const startedAt = Date.now();
    const result = assessBusinessLoan(await withSectorBand(req.body, { orgId: req.orgId || null }));
    res.json({ ...result, elapsedMs: Date.now() - startedAt });
  }));

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
  handle(async (req, res) => {
    {
      const startedAt = Date.now();
      const ctx = { orgId: req.orgId || null };
      const results = [];
      for (const x of req.body.exposures) results.push(assessBusinessLoan(await withSectorBand(x, ctx)));
      const book = businessLoansPortfolio.rollUp(results, {
        totalLoansAndInvestments: req.body.totalLoansAndInvestments,
        improvementTarget: req.body.improvementTarget,
      });
      res.json({ ...book, exposures: results, elapsedMs: Date.now() - startedAt });
    }
  }));

module.exports = router;
