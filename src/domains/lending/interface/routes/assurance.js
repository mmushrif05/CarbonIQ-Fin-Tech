// @ts-check
/**
 * CarbonIQ FinTech — the entity's assurance declaration
 *
 * Whether a third party has audited these figures cannot be derived from
 * anything held here, so it is recorded by the entity or reported absent.
 * See src/domains/lending/application/assurance.js for why there are three states and not two.
 */

'use strict';

const { Router } = require('express');

const authenticate = require('../../../../platform/auth/authenticate');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const validate = require('../../../../platform/http/validate');
const handle = require('../../../../platform/http/async-handler');
const assurance = require('../../application/assurance');
const store = require('../../../../platform/database/store');
const { assuranceSaveSchema, assuranceModeSchema } = require('../schemas/assurance');
const { doc, body, obj, str, bool, arr } = require('../../../../platform/http/openapi-hints');
const assuranceMode = require('../../../../platform/reporting/assurance-mode');
const { MODE_DETAIL, VERIFIED_REQUIRES } = require('../../../../shared/assurance-mode');
const { positionFor } = require('../../../baseline/application/assurance-position');

const router = Router();

router.get('/', authenticate, defaultLimiter,
  doc({ summary: "The entity's own declaration about external assurance",
    description: 'Three states and not two: assured, not assured, and not declared. Whether a '
      + 'third party has audited these figures cannot be derived from anything held here, so '
      + 'it is recorded by the entity or reported absent.',
    response: body({ assurance: obj }, ['assurance']) }), handle(async (req, res) => {
  res.json({ assurance: await assurance.read(req.orgId) });
}));

router.put('/', authenticate, defaultLimiter,
  validate({ body: assuranceSaveSchema }),
  doc({ summary: "Record the entity's assurance declaration",
    description: 'A declaration that cannot be stored is refused rather than accepted: an '
      + 'entity told its statement was saved on a runtime that cannot save it is worse off '
      + 'than one told plainly.',
    response: body({ assurance: obj }, ['assurance']) }), handle(async (req, res) => {
  /* A declaration that cannot be stored must not be accepted: an entity told
     its assurance statement was saved, on a runtime that cannot save it, is
     worse off than one told plainly that this deployment cannot persist. */
  store.assertWritable();
  res.json({ assurance: await assurance.save(req.orgId, req.body || {}) });
}));

/*
 * The operating mode sits under the same prefix as the entity's declaration
 * because a reader answering "what may this document claim" needs both, and
 * two prefixes for one question is how two screens come to disagree. They are
 * different facts with different owners, and the scopes say so: the
 * declaration is the entity's and needs `write`; the mode is the tool
 * provider's and needs `admin`.
 */
router.get('/mode', authenticate, defaultLimiter,
  doc({ summary: 'The operating mode, and what it rests on',
    description: 'Self-declared or verified. Verified is a request rather than an assertion: '
      + 'where the conditions it rests on are unmet the position resolves to self-declared and '
      + 'names why, and that is the sentence every document prints on its face.',
    response: body({
      mode: str, label: str, requested: str, downgraded: bool, statement: str,
      caution: str, chosenBy: str, unmet: arr(obj), modes: arr(obj), requires: arr(obj),
    }, ['mode', 'requested', 'statement']) }), handle(async (req, res) => {
  const position = await positionFor(req.orgId, {});
  res.json({
    ...position,
    modes: Object.values(MODE_DETAIL).map(m => ({
      id: m.id, label: m.label, recommended: m.recommended, caution: m.caution,
    })),
    requires: VERIFIED_REQUIRES.map(r => ({ id: r.id, requirement: r.requirement })),
  });
}));

router.put('/mode', authenticate, defaultLimiter,
  validate({ body: assuranceModeSchema }),
  doc({ summary: 'Set the operating mode — the tool provider\'s choice',
    description: 'Requires the admin scope. The mode is the tool provider\'s to set and never '
      + 'the reporting entity\'s: an entity that could choose verified for itself would be '
      + 'self-declaring by another name.',
    response: body({ mode: obj }, ['mode']) }), handle(async (req, res) => {
  /* Same reason as the declaration above: a mode the runtime cannot store is
     refused rather than accepted, because the next document would print the
     old one without saying so. */
  store.assertWritable();
  const actor = (req.actor && req.actor.label) || null;
  res.json({ mode: await assuranceMode.setFor(req.orgId, req.body.mode, actor) });
}));

module.exports = router;
