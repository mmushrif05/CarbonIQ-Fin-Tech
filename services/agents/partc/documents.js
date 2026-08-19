/**
 * CarbonIQ FinTech — PCAF Part C: Document Intake
 *
 * Turns an uploaded policy schedule or bill of quantities into the text the
 * intake and mapping agents reason over. A user drops a PDF; the agent reads
 * it. That is the whole point of the first step being agentic rather than a
 * form.
 *
 * Three sources, in the order a client is likely to have them:
 *   fileId    — already uploaded to the Anthropic Files API (reusable 30 days)
 *   pdfBase64 — the PDF inline in the request
 *   text      — pasted content, which needs no vision pass at all
 *
 * Reads the document faithfully and does not interpret: classification and
 * mapping are the job of the agents downstream, which carry the domain rules.
 * Keeping transcription separate means a misread page shows up as a
 * transcription problem rather than a silently wrong emission figure.
 */

'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const config    = require('../../../config');

const TRANSCRIBE_PROMPT = `You are transcribing a construction insurance document so a PCAF Part C emissions assessment can be run against it.

Reproduce the document's content as faithfully as you can:
- Keep every number exactly as printed — premiums, sums insured, quantities, units, dates, periods.
- Preserve table structure using plain text columns or markdown tables.
- Keep section headings and, where the document shows them, page markers.
- Where a value is illegible or ambiguous, write [ILLEGIBLE] rather than guessing.

Do not summarise, interpret, convert units, or compute anything. Transcription only — the assessment engine performs every calculation downstream.`;

/**
 * @param {Object} params
 * @param {string} [params.fileId]     Anthropic Files API id (file_...)
 * @param {string} [params.pdfBase64]  base64-encoded PDF
 * @param {string} [params.text]       already-extracted text
 * @param {string} [params.hint]       e.g. "policy schedule pages 1-2"
 * @returns {Promise<{text:string, source:string, tokensUsed?:Object}>}
 */
async function readDocument({ fileId, pdfBase64, text, hint } = {}) {
  if (text && text.trim()) {
    return { text: text.trim(), source: 'text', tokensUsed: null };
  }
  if (!fileId && !pdfBase64) {
    throw new Error('A document is required: supply text, pdfBase64 or fileId.');
  }
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured — PDF reading is unavailable. Paste the document text instead.');
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const documentSource = fileId
    ? { type: 'file', file_id: fileId }
    : { type: 'base64', media_type: 'application/pdf', data: pdfBase64 };

  const instruction = hint
    ? `Transcribe this document. Focus on: ${hint}`
    : 'Transcribe this document in full.';

  const params = {
    model:      config.anthropicVisionModel,
    max_tokens: 16000,
    system:   [{ type: 'text', text: TRANSCRIBE_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [
      { type: 'document', source: documentSource },
      { type: 'text',     text: instruction }
    ] }]
  };

  // The Files API source requires the beta header.
  const response = fileId
    ? await client.beta.messages.create(params, { headers: { 'anthropic-beta': 'files-api-2025-04-14' } })
    : await client.messages.create(params);

  const out = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

  return {
    text: out,
    source: fileId ? 'fileId' : 'pdfBase64',
    tokensUsed: {
      input:  response.usage?.input_tokens  || 0,
      output: response.usage?.output_tokens || 0
    }
  };
}

module.exports = { readDocument, TRANSCRIBE_PROMPT };
