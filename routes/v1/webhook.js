/**
 * CarbonIQ FinTech — Webhook Management Endpoints
 *
 * POST   /v1/webhooks              — Register a new webhook subscription
 * GET    /v1/webhooks              — List subscriptions for this API key's org
 * DELETE /v1/webhooks/:id          — Deactivate a subscription
 *
 * Payloads are signed with HMAC-SHA256 (X-CarbonIQ-Signature header).
 * Delivery: up to 3 retries with exponential backoff.
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const validate = require('../../middleware/validate');
const { schemas } = require('../../middleware/validate');
const { webhookLimiter } = require('../../middleware/rate-limit');
const { registerWebhook, listWebhooks, deleteWebhook } = require('../../services/webhook');

const router = Router();

// ---------------------------------------------------------------------------
// POST /v1/webhooks — Register subscription
// ---------------------------------------------------------------------------
router.post('/',
  apiKeyAuth,
  validate({ body: schemas.webhookRegister }),
  webhookLimiter,
  async (req, res, next) => {
    try {
      const { url, events, secret } = req.body;
      const orgId = req.apiKey.orgId;

      const subscription = await registerWebhook(orgId, { url, events, secret });

      return res.status(201).json({
        ...subscription,
        message: secret
          ? 'Webhook registered. Sign verification uses your supplied secret.'
          : 'Webhook registered. Store the signingSecret — it will not be shown again.',
        verificationHeader: 'X-CarbonIQ-Signature',
        signatureFormat: 'sha256=<hex>',
        retryPolicy: '3 retries, exponential backoff (1s / 2s / 4s)'
      });
    } catch (err) {
      if (err.message === 'Database unavailable') {
        return res.status(503).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Webhook service is temporarily unavailable.'
        });
      }
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/webhooks — List active subscriptions
// ---------------------------------------------------------------------------
router.get('/',
  apiKeyAuth,
  webhookLimiter,
  async (req, res, next) => {
    try {
      const subscriptions = await listWebhooks(req.apiKey.orgId);
      return res.status(200).json({ subscriptions, total: subscriptions.length });
    } catch (err) {
      if (err.message === 'Database unavailable') {
        return res.status(503).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Webhook service is temporarily unavailable.'
        });
      }
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /v1/webhooks/:subscriptionId — Deactivate subscription
// ---------------------------------------------------------------------------
router.delete('/:subscriptionId',
  apiKeyAuth,
  webhookLimiter,
  async (req, res, next) => {
    try {
      const deleted = await deleteWebhook(req.params.subscriptionId, req.apiKey.orgId);
      if (!deleted) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Webhook subscription not found or access denied.'
        });
      }
      return res.status(200).json({ deleted: true, subscriptionId: req.params.subscriptionId });
    } catch (err) {
      if (err.message === 'Database unavailable') {
        return res.status(503).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Webhook service is temporarily unavailable.'
        });
      }
      next(err);
    }
  }
);

module.exports = router;
