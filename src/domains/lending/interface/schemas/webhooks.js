/**
 * CarbonIQ FinTech — Webhook Management Schema
 *
 * Validates input for the /v1/webhooks endpoint.
 * Banks register webhook URLs to receive async notifications
 * (e.g., score updates, covenant breaches, report generation).
 */

const Joi = require('joi');

const webhookCreateSchema = Joi.object({
  url: Joi.string().uri({ scheme: ['https'] }).required()
    .description('HTTPS endpoint that will receive webhook payloads'),
  events: Joi.array().items(
    Joi.string().valid(
      'score.completed',
      'score.updated',
      'covenant.breach',
      'covenant.warning',
      'portfolio.report_ready',
      'taxonomy.updated'
    )
  ).min(1).required()
    .description('Events to subscribe to'),
  secret: Joi.string().trim().min(16).max(256).optional()
    .description('Shared secret for HMAC payload signing — auto-generated if omitted'),
  metadata: Joi.object().pattern(
    Joi.string(), Joi.string().max(500)
  ).max(10).optional()
    .description('Arbitrary key-value pairs attached to webhook deliveries'),
  active: Joi.boolean().default(true),
});

const webhookUpdateSchema = Joi.object({
  url: Joi.string().uri({ scheme: ['https'] }).optional(),
  events: Joi.array().items(
    Joi.string().valid(
      'score.completed',
      'score.updated',
      'covenant.breach',
      'covenant.warning',
      'portfolio.report_ready',
      'taxonomy.updated'
    )
  ).min(1).optional(),
  active: Joi.boolean().optional(),
  metadata: Joi.object().pattern(
    Joi.string(), Joi.string().max(500)
  ).max(10).optional(),
}).min(1); // At least one field must be provided

module.exports = { webhookCreateSchema, webhookUpdateSchema };
