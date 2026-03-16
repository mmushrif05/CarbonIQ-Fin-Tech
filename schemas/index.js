/**
 * CarbonIQ FinTech — Schema Index
 *
 * Re-exports all Joi validation schemas from a single entry point.
 * Every new schema file MUST be registered here.
 */

const { scoreRequestSchema, materialEntrySchema } = require('./score');
const { pcafRequestSchema } = require('./pcaf');
const { taxonomyRequestSchema } = require('./taxonomy');
const { covenantRequestSchema, covenantRuleSchema } = require('./covenants');
const { portfolioRequestSchema, portfolioAssetSchema } = require('./portfolio');
const { webhookCreateSchema, webhookUpdateSchema } = require('./webhooks');
const { extractRequestSchema } = require('./extract');
const { underwritingRequestSchema, screeningRequestSchema, covenantsRequestSchema, monitoringRequestSchema, portfolioReportRequestSchema } = require('./agent');

module.exports = {
  // AI Extraction
  extractRequestSchema,

  // Agents
  underwritingRequestSchema,
  screeningRequestSchema,
  covenantsRequestSchema,
  monitoringRequestSchema,
  portfolioReportRequestSchema,

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
