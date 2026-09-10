// @ts-check
/**
 * CarbonIQ FinTech — the master baseline table.
 *
 *   GET  /v1/baselines/metrics            what may be governed, and what reads it
 *   GET  /v1/baselines                    the master table an administrator edits
 *   GET  /v1/baselines/effective          what is in force for this caller, and why
 *   POST /v1/baselines                    record a draft
 *   POST /v1/baselines/:id/release        put it in force
 *   POST /v1/baselines/:id/supersede      a new version, with the reason a restatement needs
 *   PUT  /v1/baselines/pledge             the organisation's own commitment
 *   GET  /v1/baselines/pledge             where it stands against it
 *
 * Two scopes of authority, and the difference is the whole point. An
 * organisation governs **its own** baseline with `write` and `lock`, the same
 * scopes it uses for its own records. A **country or global** baseline is the
 * market's figure — every institution on the deployment resolves against it —
 * so releasing one needs `admin`. A tenant able to move the country band would
 * move it for every other bank, and a figure that can be moved that way is
 * worth nothing to any of them.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const validate = require('../../../../platform/http/validate');
const handle = require('../../../../platform/http/async-handler');
const referenceCache = require('../../../../platform/http/reference-cache');
const { doc } = require('../../../../platform/http/openapi-hints');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const registry = require('../../application/registry');
const { heldScopes } = require('../../../../platform/auth/scopes');
const {
  createBaselineSchema, supersedeSchema, pledgeSchema, listQuerySchema,
} = require('../schemas/baselines');

const router = Router();

/** The context a registry call runs in: who is asking, and what they may govern. */
const ctxOf = req => ({
  orgId: req.orgId || null,
  actor: (req.actor && req.actor.name) || req.orgId || null,
  /* `admin` is what separates governing the market's figure from governing
     your own. The route's own required scope is enforced before the handler
     runs; this asks the same resolver what the credential actually holds, so
     the two can never mean different things by "admin". */
  mayGovernMarket: (heldScopes(req).scopes || []).includes('admin'),
});

/** The country a resolution is for: asked for, else the organisation's own. */
const countryOf = req => String(req.query.country || req.orgCountry || 'LK').toUpperCase();

router.get('/metrics',
  authenticate, defaultLimiter, referenceCache(),
  doc({ summary: 'The metrics a baseline can govern, and what in the product reads each' }),
  handle(async (_req, res) => res.json(registry.metrics())));

router.get('/effective',
  authenticate, defaultLimiter,
  doc({
    summary: 'The baselines in force for this caller, each with the provenance behind it',
    query: {
      country: 'ISO 3166-1 alpha-2. Defaults to the organisation\'s own country.',
      metric: 'One metric rather than all of them.',
    },
  }),
  handle(async (req, res) => {
    const ctx = { country: countryOf(req), orgId: req.orgId || null };
    if (req.query.metric) {
      return res.json({ effective: { [String(req.query.metric)]: await registry.effective(String(req.query.metric), ctx) }, ...ctx });
    }
    res.json({ effective: await registry.effectiveAll(ctx), ...ctx });
  }));

router.get('/pledge',
  authenticate, defaultLimiter,
  doc({
    summary: "Where the organisation stands against its own pledge",
    query: {
      metric: 'Which baseline the pledge is measured against.',
      currentValue: 'The figure the book stands at today. Supplied by the caller: this endpoint does not read the book.',
      asOfYear: 'The year that figure is for. Defaults to this year.',
    },
  }),
  handle(async (req, res) => {
    const metric = String(req.query.metric || 'construction_intensity_kgCO2e_m2');
    res.json(await registry.pledgeProgress(metric,
      { country: countryOf(req), orgId: req.orgId || null },
      { currentValue: req.query.currentValue, asOfYear: req.query.asOfYear }));
  }));

router.get('/',
  authenticate, defaultLimiter,
  validate({ query: listQuerySchema }),
  doc({ summary: 'The master table: every baseline version this caller can see, with the shipped seed beside it' }),
  handle(async (req, res) => res.json(await registry.list(req.orgId || null, req.query))));

router.post('/',
  authenticate, defaultLimiter,
  validate({ body: createBaselineSchema }),
  doc({ summary: 'Record a baseline as a draft. A draft is not in force.', status: 201 }),
  handle(async (req, res) => {
    const ctx = ctxOf(req);
    const input = { ...req.body, orgId: req.body.orgId || (req.body.scope === 'organisation' ? ctx.orgId : null) };
    res.status(201).json({ baseline: await registry.createDraft(input, ctx) });
  }));

router.post('/:baselineId/release',
  authenticate, defaultLimiter,
  doc({ summary: 'Put a draft in force, superseding the version it replaces in one transaction' }),
  handle(async (req, res) => {
    res.json({ baseline: await registry.releaseDraft(req.params.baselineId, ctxOf(req)) });
  }));

router.post('/:baselineId/supersede',
  authenticate, defaultLimiter,
  validate({ body: supersedeSchema }),
  doc({ summary: 'A new version of a released baseline, carrying the movement and the reason', status: 201 }),
  handle(async (req, res) => {
    res.status(201).json({ baseline: await registry.supersede(req.params.baselineId, req.body, ctxOf(req)) });
  }));

router.put('/pledge',
  authenticate, defaultLimiter,
  validate({ body: pledgeSchema }),
  doc({ summary: "Record the organisation's own pledge against its baseline" }),
  handle(async (req, res) => {
    const { metric, ...pledge } = req.body;
    res.json({ baseline: await registry.setPledge(metric, pledge, ctxOf(req)) });
  }));

module.exports = router;
