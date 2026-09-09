/**
 * CarbonIQ FinTech — Schema Index
 *
 * Re-exports all Joi validation schemas from a single entry point.
 * Every new schema file MUST be registered here.
 */

const { scoreRequestSchema, materialEntrySchema } = require('../../domains/lending/interface/schemas/score');
const { pcafRequestSchema } = require('../../domains/lending/interface/schemas/pcaf');
const { taxonomyRequestSchema } = require('../../domains/taxonomy/interface/schemas/taxonomy');
const { covenantRequestSchema, covenantRuleSchema } = require('../../domains/lending/interface/schemas/covenants');
const { portfolioRequestSchema, portfolioAssetSchema } = require('../../domains/lending/interface/schemas/portfolio');
const { webhookCreateSchema, webhookUpdateSchema } = require('../../domains/lending/interface/schemas/webhooks');
const { extractRequestSchema } = require('../../domains/lending/interface/schemas/extract');
const { underwritingRequestSchema, screeningRequestSchema, covenantsRequestSchema, monitoringRequestSchema, portfolioReportRequestSchema } = require('../../domains/lending/interface/schemas/agent');
const { reportGenerateSchema } = require('../../domains/lending/interface/schemas/reports');
const { carbonPricingSchema } = require('../../domains/taxonomy/interface/schemas/carbon-pricing');
const { createProjectSchema, monitoringEntrySchema } = require('../../domains/lending/interface/schemas/projects');

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

  // Reports
  reportGenerateSchema,

  // Carbon Pricing
  carbonPricingSchema,

  // Projects
  createProjectSchema,
  monitoringEntrySchema,
};
