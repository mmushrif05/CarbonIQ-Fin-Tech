/**
 * CarbonIQ FinTech — Webhook Registration Endpoint
 *
 * POST /v1/webhooks — Register for event notifications
 *
 * Banks register webhook URLs to receive real-time notifications
 * for events like covenant breaches, assessment completions, etc.
 * Payloads are signed with HMAC-SHA256 for verification.
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const validate = require('../../middleware/validate');
const { schemas } = require('../../middleware/validate');
const { webhookLimiter } = require('../../middleware/rate-limit');

const router = Router();

router.post('/',
  apiKeyAuth,
  validate({ body: schemas.webhookRegister }),
  webhookLimiter,
  async (req, res, next) => {
    try {
      // TODO (Step 13): Implement webhook registration
      // - Store subscription in Firebase /fintech/webhooks/
      // - Validate URL is reachable (optional ping)
      // - Return subscription ID for management

      res.status(501).json({
        error: 'NOT_IMPLEMENTED',
        message: 'Webhook registration endpoint — implementation in Step 13',
        planned: {
          events: [
            'covenant.breach',
            'covenant.warning',
            'assessment.complete',
            'score.change',
            'taxonomy.change',
            'verification.complete'
          ],
          security: 'HMAC-SHA256 signed payloads',
          retries: '3 retries with exponential backoff'
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
