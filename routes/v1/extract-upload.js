/**
 * CarbonIQ FinTech — PDF Pre-Upload Endpoint
 *
 * POST /v1/extract/upload
 *
 * Uploads a PDF to the Anthropic Files API and returns a fileId.
 * Use this for PDFs larger than ~4 MB (Netlify body limit) or when
 * the same BOQ PDF will be extracted multiple times (avoids re-uploading).
 *
 * Workflow:
 *   1. POST /v1/extract/upload  { pdfBase64, filename? }  → { fileId }
 *   2. POST /v1/extract         { fileId, pageHint? }      → materials
 *
 * Uploaded files persist for 30 days in the Anthropic Files API.
 * Re-use the same fileId across multiple /v1/extract calls at no extra cost.
 */

'use strict';

const { Router }   = require('express');
const Anthropic    = require('@anthropic-ai/sdk');
const apiKeyAuth   = require('../../middleware/api-key');
const { extractLimiter } = require('../../middleware/rate-limit');
const config       = require('../../config');

const router = Router();

// ---------------------------------------------------------------------------
// POST /v1/extract/upload
// ---------------------------------------------------------------------------
router.post('/upload',
  apiKeyAuth,
  extractLimiter,
  async (req, res, next) => {
    try {
      if (!config.anthropicApiKey) {
        return res.status(503).json({
          error:   'AI_SERVICE_UNAVAILABLE',
          message: 'AI extraction service is not configured.'
        });
      }

      const { pdfBase64, filename = 'boq.pdf' } = req.body;

      if (!pdfBase64 || typeof pdfBase64 !== 'string') {
        return res.status(400).json({
          error:   'MISSING_PDF',
          message: 'pdfBase64 is required — provide the PDF as a base64-encoded string.'
        });
      }

      // Validate it looks like base64
      if (!/^[A-Za-z0-9+/]+=*$/.test(pdfBase64.replace(/\s/g, ''))) {
        return res.status(400).json({
          error:   'INVALID_BASE64',
          message: 'pdfBase64 does not appear to be valid base64.'
        });
      }

      const pdfBuffer = Buffer.from(pdfBase64, 'base64');

      // Sanity check: PDF magic bytes %PDF
      if (pdfBuffer.slice(0, 4).toString('ascii') !== '%PDF') {
        return res.status(400).json({
          error:   'INVALID_PDF',
          message: 'The decoded file does not appear to be a valid PDF (missing %PDF header).'
        });
      }

      const client = new Anthropic({ apiKey: config.anthropicApiKey });

      // Upload to Anthropic Files API using the SDK toFile helper
      const { toFile } = Anthropic;
      const file = await toFile(pdfBuffer, filename, { type: 'application/pdf' });

      const uploaded = await client.beta.files.upload(
        { file },
        { headers: { 'anthropic-beta': 'files-api-2025-04-14' } }
      );

      res.json({
        success:    true,
        fileId:     uploaded.id,
        filename:   uploaded.filename || filename,
        sizeBytes:  pdfBuffer.length,
        sizeMB:     parseFloat((pdfBuffer.length / 1024 / 1024).toFixed(2)),
        expiresIn:  '30 days',
        nextStep:   `POST /v1/extract with { "fileId": "${uploaded.id}" } to extract BOQ materials`,
        uploadedAt: new Date().toISOString()
      });

    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
