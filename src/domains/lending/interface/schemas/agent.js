// @ts-check
/**
 * CarbonIQ FinTech — Agent Request Schemas
 *
 * Joi validation schemas for all agent endpoints.
 * Each schema validates the request body before it reaches the agent.
 */

'use strict';

const { underwritingRequestSchema, screeningRequestSchema, originationRequestSchema } = require('./agent/lending');
const { covenantsRequestSchema, covenantReviewSchema } = require('./agent/covenants');
const { monitoringRequestSchema, portfolioReportRequestSchema } = require('./agent/monitoring');
const { borrowerCoachingRequestSchema, decisionTriageRequestSchema } = require('./agent/coaching');

module.exports = {
  underwritingRequestSchema,
  screeningRequestSchema,
  originationRequestSchema,
  covenantsRequestSchema,
  covenantReviewSchema,
  monitoringRequestSchema,
  portfolioReportRequestSchema,
  borrowerCoachingRequestSchema,
  decisionTriageRequestSchema,
};
