/**
 * CarbonIQ FinTech — AI Material Extraction Service
 *
 * Uses Claude (claude-sonnet-4-6) to parse raw BOQ data from:
 *   - CSV text
 *   - Unstructured text (pasted from Excel, PDF, etc.)
 *   - JSON arrays
 *
 * Returns a structured materials array ready for /v1/score and /v1/pcaf.
 */

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const { MATERIAL_CARBON_FACTORS } = require('../models/constants');

const SUPPORTED_CATEGORIES = Object.keys(MATERIAL_CARBON_FACTORS);

const SYSTEM_PROMPT = `You are an expert construction carbon analyst embedded in a bank's green lending platform.
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

/**
 * Extract materials from raw BOQ input using Claude AI.
 *
 * @param {string} rawInput - Raw CSV, text, or JSON string
 * @param {string} inputFormat - 'csv' | 'text' | 'json'
 * @returns {Promise<Object>} { materials, summary, model, tokensUsed }
 */
async function extractMaterials(rawInput, inputFormat = 'text') {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. AI extraction is unavailable.');
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const userMessage = buildUserMessage(rawInput, inputFormat);

  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  });

  const rawText = response.content[0].text.trim();

  // Strip markdown code fences if present
  const jsonText = rawText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('AI returned invalid JSON. Raw response: ' + rawText.slice(0, 200));
  }

  if (!parsed.materials || !Array.isArray(parsed.materials)) {
    throw new Error('AI response missing materials array.');
  }

  // Enrich each material with carbon factor lookup
  const enriched = parsed.materials.map(mat => enrichWithFactor(mat));

  return {
    materials: enriched,
    summary: parsed.summary || {},
    model: response.model,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens
    }
  };
}

/**
 * Build the user message based on format.
 */
function buildUserMessage(rawInput, inputFormat) {
  const formatLabel = {
    csv: 'CSV (Bill of Quantities)',
    json: 'JSON',
    text: 'raw text (pasted from Excel, PDF, or document)'
  }[inputFormat] || 'raw text';

  return `Parse the following ${formatLabel} BOQ data and extract all construction materials:\n\n${rawInput}`;
}

/**
 * Enrich extracted material with ICE v3 factor and calculated emissions.
 */
function enrichWithFactor(mat) {
  const category = SUPPORTED_CATEGORIES.includes(mat.category) ? mat.category : 'other';
  const factorData = MATERIAL_CARBON_FACTORS[category];

  const enriched = {
    ...mat,
    category,
    emissionFactor: factorData.factor,
    emissionFactorUnit: factorData.unit,
    emissionFactorSource: factorData.source
  };

  if (mat.quantity != null && !isNaN(mat.quantity)) {
    enriched.totalKgCO2e = parseFloat((mat.quantity * factorData.factor).toFixed(2));
  } else {
    enriched.totalKgCO2e = null;
  }

  return enriched;
}

module.exports = { extractMaterials };
