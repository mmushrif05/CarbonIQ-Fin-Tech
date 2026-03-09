/**
 * CarbonIQ FinTech — Schema Index
 *
 * Re-exports all Joi validation schemas from a single entry point.
 */

const { scoreRequestSchema, materialEntrySchema } = require('./score');
const { pcafRequestSchema } = require('./pcaf');
const { taxonomyRequestSchema } = require('./taxonomy');
const { covenantRequestSchema, covenantRuleSchema } = require('./covenants');
const { portfolioRequestSchema, portfolioAssetSchema } = require('./portfolio');
const { webhookCreateSchema, webhookUpdateSchema } = require('./webhooks');

module.exports = {
  // Score
  scoreRequestSchema,
  materialEntrySchema,

  // PCAF
  pcafRequestSchema,

  // Taxonomy
  taxonomyRequestSchema,

  // Covenants
  covenantRequestSchema,
  covenantRuleSchema,

  // Portfolio
  portfolioRequestSchema,
  portfolioAssetSchema,

  // Webhooks
  webhookCreateSchema,
  webhookUpdateSchema,
};
