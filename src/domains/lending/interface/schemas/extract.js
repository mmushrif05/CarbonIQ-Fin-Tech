// @ts-check
/**
 * CarbonIQ FinTech — BOQ Extract Request Schema
 *
 * Validates input for POST /v1/extract
 *
 * Accepts three input modes:
 *   1. content  — raw text, CSV, or JSON pasted directly (format: text|csv|json)
 *   2. pdfBase64 — base64-encoded PDF uploaded in the request body (format: pdf)
 *   3. fileId    — Anthropic Files API ID from a prior POST /v1/extract/upload call
 *
 * At least one of content, pdfBase64, or fileId must be present.
 */

const Joi = require('joi');

const extractRequestSchema = Joi.object({

  // --- Input mode 1: raw text/CSV/JSON ---
  content: Joi.string().min(10).max(100000).optional()
    .description('Raw BOQ content: CSV rows, pasted text, or JSON string'),

  // --- Input mode 2: PDF as base64 string ---
  // Practical limit: ~15 MB PDF → ~20 MB base64. Netlify Functions cap at 6 MB,
  // so for Netlify deployments keep PDFs under ~4 MB or use fileId instead.
  pdfBase64: Joi.string().optional()
    .description('Base64-encoded PDF file containing the Bill of Quantities'),

  // --- Input mode 3: pre-uploaded file ID (from POST /v1/extract/upload) ---
  fileId: Joi.string().pattern(/^file_/).optional()
    .description('Anthropic Files API file ID from a prior /v1/extract/upload call'),

  // --- Format hint ---
  // 'pdf' is set automatically when pdfBase64 or fileId is supplied,
  // but can also be passed explicitly.
  format: Joi.string().valid('csv', 'text', 'json', 'pdf').default('text')
    .description('Format of the content: csv | text | json | pdf'),

  // --- Optional page hint for large PDFs ---
  // Tell Claude which pages contain BOQ material tables to avoid wasting
  // tokens on cover sheets, specifications, drawings, etc.
  // Examples: "pages 12-45", "section 4", "appendix B"
  pageHint: Joi.string().max(200).optional()
    .description('Hint about which pages/sections contain BOQ tables, e.g. "pages 12-45"'),

  // --- Optional project context ---
  projectName: Joi.string().max(200).optional()
    .description('Project name for reference in the response'),

  // --- Compute carbon totals from extracted materials ---
  computeTotal: Joi.boolean().default(true)
    .description('Whether to compute total embodied carbon from extracted materials'),

})
  // At least one input mode must be provided
  .or('content', 'pdfBase64', 'fileId')
  .messages({
    'object.missing': 'Provide one of: content (text/CSV/JSON), pdfBase64 (PDF file), or fileId (pre-uploaded file ID)'
  });

/**
 * A BOQ PDF uploaded once, to be reused across extractions for thirty days.
 *
 * Separate from `extractRequestSchema` because it is a different request: this
 * one only carries the file, and the extraction options belong to the call
 * that names the returned `fileId`. One schema covering both would document an
 * upload as accepting a format hint it never reads.
 */
const extractUploadSchema = Joi.object({
  pdfBase64: Joi.string().required()
    .description('Base64-encoded PDF file containing the Bill of Quantities'),
  filename: Joi.string().max(255).default('boq.pdf')
    .description('Name recorded against the upload; shown back in run history'),
}).unknown(false);

module.exports = { extractRequestSchema, extractUploadSchema };
