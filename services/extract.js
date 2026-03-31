/**
 * CarbonIQ FinTech — AI Material Extraction Service
 *
 * Uses Claude AI to parse BOQ data from:
 *   - Text / CSV / JSON  → claude-sonnet-4-6  (fast, cheap)
 *   - PDF documents      → claude-opus-4-6    (best table recognition)
 *
 * Prompt caching is applied to the system prompt on every call,
 * reducing costs by 60-80% on repeated extraction requests.
 *
 * Returns a structured materials array ready for /v1/score and /v1/pcaf.
 */

'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const config    = require('../config');
const { MATERIAL_CARBON_FACTORS } = require('../models/constants');

const SUPPORTED_CATEGORIES = Object.keys(MATERIAL_CARBON_FACTORS);

// ---------------------------------------------------------------------------
// Shared system prompt — used by both text and PDF extraction paths.
// The cache_control marker tells Claude to cache this on first use;
// subsequent requests read from cache at ~10% of normal token cost.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT_TEXT = `You are an expert construction carbon analyst embedded in a bank's green lending platform.
Your task is to parse raw Bill of Quantities (BOQ) data and extract structured material information.

Extract each material line item and return a JSON array. For each item return:
{
  "name": "original material description from the BOQ",
  "category": one of [${SUPPORTED_CATEGORIES.join(', ')}],
  "quantity": numeric quantity (convert all values to kg — use typical densities if needed),
  "originalQuantity": the quantity as found in the source,
  "originalUnit": the unit as found in the source (kg, t, m3, m2, m, pieces, etc.),
  "recycledContent": percentage (0-100) if mentioned, else null,
  "confidence": "high" | "medium" | "low" — how confident you are in the category mapping,
  "notes": any assumptions made (e.g. density conversions, ambiguous descriptions)
}

Density assumptions for unit conversion:
- Concrete: 2400 kg/m3
- Steel/Rebar: 7850 kg/m3
- Timber/Wood: 550 kg/m3
- Glass: 2500 kg/m3
- Aluminium: 2700 kg/m3
- Masonry/Brick: 1800 kg/m3
- Insulation: 30 kg/m3
- Plastics: 950 kg/m3

If a material cannot be mapped to a known category, use "other".
If quantity is missing or unclear, set quantity to null and confidence to "low".

Return ONLY a valid JSON object in this exact format:
{
  "materials": [...],
  "summary": {
    "totalItems": number,
    "lowConfidenceItems": number,
    "unresolvableItems": number,
    "parseNotes": "brief description of any issues or assumptions"
  }
}`;

const SYSTEM_PROMPT_PDF = `You are an expert construction carbon analyst embedded in a bank's green lending platform.
You are reading a Bill of Quantities (BOQ) document. Your task is to:

1. Scan ALL pages of the document for material/item tables
2. Extract every individual material line item (NOT section sub-totals or grand totals)
3. Map each material to an ICE v3 carbon factor category
4. Return a complete structured JSON output

For each material item extract:
{
  "name": "original material description as written in the BOQ",
  "category": one of [${SUPPORTED_CATEGORIES.join(', ')}],
  "quantity": numeric quantity converted to kg,
  "originalQuantity": quantity as written in the document,
  "originalUnit": unit as written (kg, t, tonnes, m3, m2, LM, Nr, etc.),
  "recycledContent": percentage (0-100) if stated, else null,
  "pageRef": page number or section where this item was found,
  "confidence": "high" | "medium" | "low",
  "notes": any unit conversion assumptions or ambiguities
}

Density conversion factors (use when converting volume/area to kg):
- Concrete (all grades): 2400 kg/m3
- Reinforcing steel / rebar: 7850 kg/m3
- Structural steel sections: 7850 kg/m3
- Timber / engineered wood: 550 kg/m3
- Float / laminated glass: 2500 kg/m3
- Aluminium profiles / cladding: 2700 kg/m3
- Masonry / clay bricks / blockwork: 1800 kg/m3
- Mineral wool / rigid insulation: 30 kg/m3
- Plastics / GRP / PVC: 950 kg/m3

Important rules:
- Extract INDIVIDUAL line items only — skip sub-totals, provisional sums, and PC amounts
- If a BOQ section header describes a material category (e.g. "CONCRETE WORKS"), apply that context
  to ambiguous items within it
- "LM" = linear metres, "Nr" = number/pieces, "m2" = square metres
- For slab/floor items given in m2 with a thickness, compute volume = area × thickness then × density
- If the document has multiple BOQ sections (structural, architectural, MEP), extract from all sections
  that contain construction materials

Return ONLY a valid JSON object:
{
  "materials": [...],
  "summary": {
    "totalItems": number,
    "lowConfidenceItems": number,
    "unresolvableItems": number,
    "pagesScanned": "description of pages/sections found",
    "parseNotes": "any issues, gaps, or assumptions"
  }
}`;

// ---------------------------------------------------------------------------
// Text / CSV / JSON extraction
// ---------------------------------------------------------------------------

/**
 * Extract materials from raw text, CSV, or JSON input.
 *
 * @param {string} rawInput    - Raw text/CSV/JSON content
 * @param {string} inputFormat - 'csv' | 'text' | 'json'
 * @returns {Promise<{materials, summary, model, tokensUsed}>}
 */
async function extractMaterials(rawInput, inputFormat = 'text') {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. AI extraction is unavailable.');
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const formatLabel = { csv: 'CSV (Bill of Quantities)', json: 'JSON', text: 'raw text' }[inputFormat] || 'raw text';
  const userMessage = `Parse the following ${formatLabel} BOQ data and extract all construction materials:\n\n${rawInput}`;

  const response = await client.messages.create({
    model:      config.anthropicModel,
    max_tokens: 4096,
    // Structured output: response is guaranteed valid JSON — no markdown fences,
    // no preamble text. Removes the brittle regex cleanup in _parseAndEnrich.
    output_config: { format: { type: 'json_object' } },
    // Prompt caching — system prompt is identical on every call; cache it.
    system: [{ type: 'text', text: SYSTEM_PROMPT_TEXT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }]
  });

  return _parseAndEnrich(response);
}

// ---------------------------------------------------------------------------
// PDF extraction (Vision / Document API)
// ---------------------------------------------------------------------------

/**
 * Extract materials from a PDF BOQ using Claude's document understanding.
 *
 * Supports two source modes:
 *   - pdfBase64: base64-encoded PDF bytes passed directly in the request
 *   - fileId:    Anthropic Files API ID from a prior /v1/extract/upload call
 *
 * Uses claude-opus-4-6 for best accuracy on complex multi-column BOQ tables.
 *
 * @param {Object} opts
 * @param {string} [opts.pdfBase64]  - Base64-encoded PDF
 * @param {string} [opts.fileId]     - Anthropic Files API file ID (file_xxx)
 * @param {string} [opts.pageHint]   - Optional hint, e.g. "pages 12-45"
 * @returns {Promise<{materials, summary, model, tokensUsed}>}
 */
async function extractMaterialsFromPdf({ pdfBase64, fileId, pageHint } = {}) {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. AI extraction is unavailable.');
  }
  if (!pdfBase64 && !fileId) {
    throw new Error('extractMaterialsFromPdf requires either pdfBase64 or fileId.');
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  // Build the document source block
  let documentSource;
  if (fileId) {
    documentSource = { type: 'file', file_id: fileId };
  } else {
    documentSource = { type: 'base64', media_type: 'application/pdf', data: pdfBase64 };
  }

  // Build user message: PDF document block + text instruction
  const instructionParts = ['Extract all construction material line items from this Bill of Quantities document.'];
  if (pageHint) {
    instructionParts.push(`Focus on: ${pageHint}`);
  }
  instructionParts.push('Return the complete JSON as specified. Do not truncate — include every material item found.');

  const userContent = [
    { type: 'document', source: documentSource },
    { type: 'text',     text: instructionParts.join('\n') }
  ];

  // Files API requires beta header when using fileId source
  const createParams = {
    model:      config.anthropicVisionModel,
    max_tokens: 8192,
    // Structured output: PDF extraction always returns raw JSON — never markdown.
    output_config: { format: { type: 'json_object' } },
    // Prompt caching on the system prompt
    system: [{ type: 'text', text: SYSTEM_PROMPT_PDF, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }]
  };

  let response;
  if (fileId) {
    // Use beta namespace for Files API
    response = await client.beta.messages.create({
      ...createParams,
      betas: ['files-api-2025-04-14']
    });
  } else {
    response = await client.messages.create(createParams);
  }

  return _parseAndEnrich(response);
}

// ---------------------------------------------------------------------------
// Dispatcher — called by the route handler
// ---------------------------------------------------------------------------

/**
 * Unified entry point. Routes to the correct extraction path based on what
 * was provided in the validated request body.
 *
 * @param {Object} opts
 * @param {string} [opts.content]    - Raw text/CSV/JSON
 * @param {string} [opts.format]     - 'csv' | 'text' | 'json' | 'pdf'
 * @param {string} [opts.pdfBase64]  - Base64 PDF
 * @param {string} [opts.fileId]     - Files API ID
 * @param {string} [opts.pageHint]   - Page range hint for PDFs
 */
async function extractFromRequest({ content, format = 'text', pdfBase64, fileId, pageHint } = {}) {
  if (pdfBase64 || fileId || format === 'pdf') {
    return extractMaterialsFromPdf({ pdfBase64, fileId, pageHint });
  }
  return extractMaterials(content, format);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Parse Claude's JSON response and enrich each material with ICE v3 factor.
 */
function _parseAndEnrich(response) {
  // output_config json_object guarantees the response is raw valid JSON — no
  // markdown code fences, no preamble. A parse failure here means an API-level
  // contract violation, not a prompt formatting issue.
  const rawText = response.content[0].text;

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('AI returned invalid JSON. Raw response: ' + rawText.slice(0, 300));
  }

  if (!parsed.materials || !Array.isArray(parsed.materials)) {
    throw new Error('AI response missing materials array.');
  }

  const enriched = parsed.materials.map(mat => _enrichWithFactor(mat));

  return {
    materials:  enriched,
    summary:    parsed.summary || {},
    model:      response.model,
    tokensUsed: {
      input:           response.usage.input_tokens,
      output:          response.usage.output_tokens,
      cacheRead:       response.usage.cache_read_input_tokens  || 0,
      cacheCreated:    response.usage.cache_creation_input_tokens || 0
    }
  };
}

/**
 * Enrich a single extracted material with ICE v3 factor and calculated emissions.
 */
function _enrichWithFactor(mat) {
  const category  = SUPPORTED_CATEGORIES.includes(mat.category) ? mat.category : 'other';
  const factorData = MATERIAL_CARBON_FACTORS[category];

  const enriched = {
    ...mat,
    category,
    emissionFactor:       factorData.factor,
    emissionFactorUnit:   factorData.unit,
    emissionFactorSource: factorData.source
  };

  if (mat.quantity != null && !isNaN(mat.quantity)) {
    enriched.totalKgCO2e = parseFloat((mat.quantity * factorData.factor).toFixed(2));
  } else {
    enriched.totalKgCO2e = null;
  }

  return enriched;
}

module.exports = { extractMaterials, extractMaterialsFromPdf, extractFromRequest };
