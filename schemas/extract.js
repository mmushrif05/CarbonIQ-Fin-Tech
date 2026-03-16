/**
 * CarbonIQ FinTech — BOQ Extract Request Schema
 *
 * Validates input for POST /v1/extract
 */

const Joi = require('joi');

const extractRequestSchema = Joi.object({
  // Raw BOQ content — CSV text, plain text, or JSON string
  content: Joi.string().min(10).max(100000).required()
    .description('Raw BOQ content: CSV rows, pasted text, or JSON string'),

  // Input format hint to guide the AI parser
  format: Joi.string().valid('csv', 'text', 'json').default('text')
    .description('Format of the content: csv | text | json'),

  // Optional project context to include in response
  projectName: Joi.string().max(200).optional()
    .description('Project name for reference in response'),

  // If true, also compute a preliminary carbon total
  computeTotal: Joi.boolean().default(true)
    .description('Whether to compute total embodied carbon from extracted materials'),
});

module.exports = { extractRequestSchema };
