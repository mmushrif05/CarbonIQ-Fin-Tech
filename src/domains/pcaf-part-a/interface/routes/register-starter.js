// @ts-check
/**
 * The starter book and the walkthrough's example borrowers, over HTTP.
 *
 *   POST   /v1/pcaf/part-a/starter            load the illustrative starter book, once
 *   GET    /v1/pcaf/part-a/starter/example    one illustrative loan, every field filled (?variant=reported|sector)
 *
 * Mounted from ./register.js on the same prefix and middleware; split out so
 * the register's own route file stays under the line limit.
 */

'use strict';

const { Router } = require('express');
const Joi = require('joi');
const authenticate = require('../../../../platform/auth/authenticate');
const { doc, body, obj, num } = require('../../../../platform/http/openapi-hints');
const validate = require('../../../../platform/http/validate');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const handle = require('../../../../platform/http/async-handler');
const store = require('../../../../platform/database/store');
const register = require('../../application/register');
const sovereign = require('../../application/sovereign-register');
const partaSettings = require('../../application/parta-settings');
const { installStarterBook, exampleExposure } = require('../../application/starter-book');

const router = Router();

/**
 * The starter book: one press on a deployment with no shell. Recorded, not the
 * sample — every row goes through the services and their engines — and
 * refused over a year that already holds exposures.
 */
router.post('/starter', authenticate, defaultLimiter,
  doc({ summary: 'Load the illustrative starter book into this organisation, across every built Part A class',
    description: 'Fifteen exposures across §5.1–§5.6 and two sovereign holdings for FY2025, each computed by its '
      + 'own engine on the way in, the book total stated, the entity’s boundary, base year, preparer and approver '
      + 'stated illustratively, and the illustrative SLFRS S2 statements recorded unless the entity has already '
      + 'recorded its own. Refused with 409 STARTER_NOT_EMPTY where the year already holds exposures, and for the '
      + 'preview organisation. Every figure and every statement is illustrative and is yours to edit.',
    response: body({ reportingYear: num, installed: obj, book: obj, settings: obj }, ['reportingYear', 'installed']) }),
  validate({ body: Joi.object({ by: Joi.string().max(200).optional(), reportingEntity: Joi.string().max(200).optional() }).unknown(false) }),
  handle(async (req, res) => {
    const actor = req.actor && req.actor.name ? req.actor.name : (req.body.by || null);
    res.status(201).json(await installStarterBook({ register, sovereign, store, settings: partaSettings }, req.orgId,
      { by: actor, reportingEntity: req.body.reportingEntity || null }));
  }));

/**
 * One illustrative loan, filled in, for the walkthrough's "a loan comes in"
 * step: the Lending Book opens its record form on it and the presenter
 * presses Record. A read; stores nothing.
 */
router.get('/starter/example', authenticate, defaultLimiter,
  doc({ summary: 'One illustrative business loan, every field filled, for the walkthrough to record live',
    description: 'The shape the record form takes, filled for one borrower, so a presenter shows what is '
      + 'collected without typing it. Nothing is stored until the form is submitted; the facility reference '
      + 'carries a short random suffix so the loan can be recorded more than once in rehearsal. '
      + '`variant=reported` (the default) is a borrower that reports its own scope 1 and 2; `variant=sector` '
      + 'is one that does not know its emissions, estimated from its industry on the held sector factor.',
    response: body({ example: obj }, ['example']) }),
  handle(async (req, res) => {
    res.json({ example: exampleExposure(req.query.reportingYear ? String(req.query.reportingYear) : undefined,
      req.query.variant ? String(req.query.variant) : undefined) });
  }));


module.exports = router;
