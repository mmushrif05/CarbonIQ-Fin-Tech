// @ts-check
/**
 * The reference set and the conformance matrix — the two GCF routes whose
 * answer does not depend on the caller, and the two that are cached.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../../platform/auth/authenticate');
const { doc, body, str, obj, arr } = require('../../../../../platform/http/openapi-hints');
const referenceCache = require('../../../../../platform/http/reference-cache');
const { defaultLimiter } = require('../../../../../platform/http/rate-limit');
const store = require('../../../infrastructure/store');
const screening = require('../../../domain/screening');
const partcStore = require('../../../../../platform/database/store');
const { RESULTS_AREAS: AREAS, IRMF, INSTRUMENT_CATALOGUE: INSTRUMENTS } = require('../../../domain/reference');
const { NDC3 } = require('../../../../../shared/ndc');

const conformance = require('../../../domain/conformance');

const router = Router();

/** The frameworks this tab is built on, so a screen never restates them. */
router.get('/reference', authenticate, defaultLimiter, referenceCache(), doc({ summary: 'Results areas, IRMF core indicators, NDC 3.0 and the instrument catalogue',
    description: 'The evidence tiers here are GCF appraisal classes — measured, modelled, '
      + 'benchmark, declared — and are deliberately not PCAF\'s 1-5 data-quality scale.',
    response: body({
      resultsAreas: obj, irmf: obj, ndc3: obj, instruments: obj,
      criteria: arr(), defaultWeights: obj, accreditation: obj, storage: obj,
    }, ['resultsAreas', 'irmf', 'ndc3', 'instruments']) }), (_req, res) => {
  res.json({
    resultsAreas: AREAS,
    irmf: IRMF,
    ndc3: NDC3,
    instruments: INSTRUMENTS,
    criteria: screening.GCF_CRITERIA,
    defaultWeights: screening.DEFAULT_WEIGHTS,
    accreditation: store.seedMeta().accreditation,
    storage: partcStore.capability(),
  });
});

/**
 * What this claims to do, where each commitment lives, and what proves it.
 *
 * A row a reviewer cannot check is worth little, so every rule names a file and
 * a test. tests/gcf-conformance.test.js fails the build if either citation
 * stops resolving, which is what keeps the claim from quietly rotting.
 */
router.get('/conformance', authenticate, defaultLimiter, referenceCache(),
  doc({ summary: 'ToR clause → implementation → proving test',
    response: body({
      source: str, generatedAt: str, summary: obj, disclaimer: str, rules: arr(),
    }, ['rules']) }),
  (_req, res) => {
    res.json(conformance.conformanceMatrix());
  });

module.exports = router;
