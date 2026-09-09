/**
 * CarbonIQ FinTech — the entity's assurance declaration
 *
 * Whether a third party has audited these figures cannot be derived from
 * anything held here, so it is recorded by the entity or reported absent.
 * See src/domains/lending/application/assurance.js for why there are three states and not two.
 */

const { Router } = require('express');

const apiKeyAuth = require('../../../../platform/auth/api-key');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const assurance = require('../../application/assurance');
const store = require('../../../../platform/database/store');

const router = Router();

const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

router.get('/', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json({ assurance: await assurance.read(req.apiKey.orgId) });
}));

router.put('/', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  /* A declaration that cannot be stored must not be accepted: an entity told
     its assurance statement was saved, on a runtime that cannot save it, is
     worse off than one told plainly that this deployment cannot persist. */
  store.assertWritable();
  res.json({ assurance: await assurance.save(req.apiKey.orgId, req.body || {}) });
}));

module.exports = router;
