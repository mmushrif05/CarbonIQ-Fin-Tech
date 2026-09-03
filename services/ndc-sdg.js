/**
 * CarbonIQ FinTech — NDC & SDG Alignment Service (Claude AI-powered)
 *
 * Analyses a construction project against Sri Lanka's National Determined
 * Contributions (NDC) and the Sustainable Development Goals (SDGs), as
 * defined in the Sri Lanka Green Finance Taxonomy (SLGFT v2024).
 *
 * NDC targets (Sri Lanka) — NDC 3.0, issued September 2025:
 *   - Reduction: 20.09% cumulative GHG reduction against BAU over 2026-2035
 *                (8.11% unconditional, 11.98% conditional)
 *   - Removal:   4.49% increase in net carbon removal over the same period
 *                (0.96% unconditional, 3.53% conditional)
 *
 * Reduction and removal are separate commitments and are never summed. The
 * figures come from data/gcf/ndc3.json so they are stated in one place; this
 * file used to carry the superseded 2021 targets inline, which is how it went
 * on citing them for a year after they were replaced.
 *
 * Key SDGs for construction sector:
 *   SDG 7  — Affordable & Clean Energy
 *   SDG 9  — Industry, Innovation & Infrastructure
 *   SDG 11 — Sustainable Cities & Communities
 *   SDG 13 — Climate Action
 *   SDG 14 — Life Below Water
 *   SDG 15 — Life on Land
 *
 * Uses Claude claude-sonnet-4-6 with prompt caching for cost efficiency.
 */

'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const config    = require('../config');
const { TAXONOMY_LK } = require('../config/constants');

// ---------------------------------------------------------------------------
// System prompt — cached for repeated calls
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert in Sri Lanka's National Determined Contributions (NDC) and the Sustainable Development Goals (SDGs), working within the Sri Lanka Green Finance Taxonomy (SLGFT v2024) framework as regulated by the Central Bank of Sri Lanka (CBSL).

Your role is to assess construction projects for:
1. NDC alignment — does the project contribute to Sri Lanka's GHG reduction targets?
2. SDG alignment — which SDGs does this project actively support?
3. DNSH (Do No Significant Harm) — does it avoid harming other environmental objectives?
4. Bankability narrative — concise green loan rationale for the lending officer.

Sri Lanka NDC 3.0 Targets (issued September 2025, period 2026-2035):
- Emission reduction: 20.09% cumulative against BAU (8.11% unconditional, 11.98% conditional)
- Net carbon removal: 4.49% increase (0.96% unconditional, 3.53% conditional)
- These are SEPARATE commitments. Never add them together, and never describe a removal as a reduction.
- Six mitigation sectors, nine adaptation sectors, loss and damage cross-cutting.
- Sector targets relevant to construction and infrastructure:
  * Electricity: 33.9% emission reduction, 70% renewable generation maintained from 2030
  * Energy demand: about 30,000 GWh reduction over the ten years
  * Transport: public transport passenger share 35% (2025) to 40% (2030) to 50% (2035); fleet efficiency +25% by 2035
  * Industry: circular economy across all industries; refrigeration converted to low-GWP technologies
  * Waste: 20.8% reduction over the ten years
  * Forestry: forest cover to at least 32% by 2035
  * Coastal: conservation and enhancement of blue carbon ecosystems
- Gender Equity and Social Inclusion (GESI) applies across all NDC actions.

SLGFT Environmental Objectives:
- M: Climate Change Mitigation
- A: Climate Change Adaptation
- P: Pollution Prevention & Control
- E: Ecological Conservation & Resource Efficiency

SLGFT Embodied Carbon Thresholds (construction):
- Green: ≤600 kgCO2e/m²
- Transition: ≤900 kgCO2e/m²
- Not Aligned: >900 kgCO2e/m²

Respond ONLY with valid JSON matching this exact structure:
{
  "ndcAlignment": {
    "tier": "strong" | "moderate" | "partial" | "not_aligned",
    "label": "human-readable tier label",
    "ndcContribution_pct": number (estimated % contribution to NDC targets, 0-100),
    "reductionTarget": "20.09% cumulative GHG reduction against BAU, 2026-2035 (8.11% unconditional, 11.98% conditional)",
    "removalTarget": "4.49% increase in net carbon removal, 2026-2035 (0.96% unconditional, 3.53% conditional) — reported separately, never added to the reduction target",
    "explanation": "2-3 sentence plain English explanation",
    "keyDrivers": ["driver 1", "driver 2", "driver 3"]
  },
  "sdgAlignment": [
    {
      "sdg": 7,
      "label": "Affordable & Clean Energy",
      "relevance": "high" | "medium" | "low",
      "rationale": "one sentence"
    }
  ],
  "dnshAssessment": {
    "overallStatus": "pass" | "conditional" | "fail",
    "checks": [
      { "objective": "M", "label": "Climate Change Mitigation", "status": "pass" | "conditional" | "fail", "note": "one sentence" },
      { "objective": "A", "label": "Climate Change Adaptation", "status": "pass" | "conditional" | "fail", "note": "one sentence" },
      { "objective": "P", "label": "Pollution Prevention & Control", "status": "pass" | "conditional" | "fail", "note": "one sentence" },
      { "objective": "E", "label": "Ecological Conservation", "status": "pass" | "conditional" | "fail", "note": "one sentence" }
    ]
  },
  "bankabilityNarrative": "3-4 sentence concise green loan rationale for a lending officer",
  "recommendations": ["actionable recommendation 1", "actionable recommendation 2", "actionable recommendation 3"],
  "confidenceScore": number (0-100, confidence in the analysis based on data quality)
}`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse a project's NDC and SDG alignment using Claude AI.
 *
 * @param {Object} projectData
 * @param {string}  projectData.name              - Project name
 * @param {string}  [projectData.region]          - Should be 'LK' for full analysis
 * @param {number}  [projectData.emissions_tCO2e] - Total embodied carbon
 * @param {number}  [projectData.buildingArea_m2] - GFA in m²
 * @param {string}  [projectData.slsicSector]     - SLSIC sector code (A-M)
 * @param {string}  [projectData.activityCode]    - SLGFT activity code (e.g. M1.1)
 * @param {number}  [projectData.reductionPct]    - Carbon reduction vs baseline (%)
 * @param {string}  [projectData.buildingType]    - Building type
 * @param {boolean} [projectData.hasEPD]          - Whether EPDs are available
 * @param {boolean} [projectData.hasLCA]          - Whether LCA was performed
 * @returns {Promise<Object>} NDC/SDG alignment analysis
 */
async function assessNdcSdgAlignment(projectData) {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const intensity = (projectData.emissions_tCO2e && projectData.buildingArea_m2)
    ? Math.round((projectData.emissions_tCO2e * 1000) / projectData.buildingArea_m2)
    : null;

  const activityInfo = projectData.activityCode
    ? TAXONOMY_LK.constructionActivities.find(a => a.code === projectData.activityCode)
    : null;

  const sectorInfo = projectData.slsicSector
    ? TAXONOMY_LK.sectors[projectData.slsicSector]
    : null;

  const userMessage = `Assess the following Sri Lanka construction project for NDC and SDG alignment:

Project: ${projectData.name || 'Unnamed Project'}
Building Type: ${projectData.buildingType || 'Not specified'}
SLSIC Sector: ${sectorInfo ? `${projectData.slsicSector} — ${sectorInfo.label}` : (projectData.slsicSector || 'Not specified')}
SLGFT Activity Code: ${projectData.activityCode || 'Not specified'}${activityInfo ? ` (${activityInfo.label}, eligibility: ${activityInfo.eligibility})` : ''}
Total Embodied Carbon: ${projectData.emissions_tCO2e ? projectData.emissions_tCO2e + ' tCO2e' : 'Not provided'}
Building Area: ${projectData.buildingArea_m2 ? projectData.buildingArea_m2 + ' m²' : 'Not provided'}
Embodied Carbon Intensity: ${intensity !== null ? intensity + ' kgCO2e/m²' : 'Cannot calculate — area not provided'}
Carbon Reduction vs Baseline: ${projectData.reductionPct != null ? projectData.reductionPct + '%' : 'Not specified'}
Has EPD: ${projectData.hasEPD ? 'Yes' : 'No'}
Has LCA: ${projectData.hasLCA ? 'Yes' : 'No'}

Based on the SLGFT thresholds (≤600 kgCO2e/m² = Green, ≤900 = Transition) and Sri Lanka's NDC targets, provide a full NDC/SDG alignment assessment in the required JSON format.`;

  const startedAt = new Date().toISOString();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = response.content[0]?.text || '{}';

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
  const jsonStr   = jsonMatch[1].trim();

  let analysis;
  try {
    analysis = JSON.parse(jsonStr);
  } catch (_) {
    throw new Error('AI returned invalid JSON — please retry.');
  }

  return {
    projectData: {
      name:             projectData.name,
      slsicSector:      projectData.slsicSector || null,
      activityCode:     projectData.activityCode || null,
      matchedActivity:  activityInfo || null,
      emissions_tCO2e:  projectData.emissions_tCO2e || null,
      buildingArea_m2:  projectData.buildingArea_m2 || null,
      intensity_kgCO2e_m2: intensity,
      reductionPct:     projectData.reductionPct || null,
    },
    analysis,
    framework: TAXONOMY_LK.name,
    version:   TAXONOMY_LK.version,
    regulator: TAXONOMY_LK.regulator,
    /* The whole NDC 3.0 block, from the one file that states it. Passed
       through rather than re-flattened into unconditional/conditional, which
       was the shape that could not hold two separate commitments. */
    ndcTargets: {
      version:   TAXONOMY_LK.ndcTargets._meta.title,
      issued:    TAXONOMY_LK.ndcTargets._meta.issued,
      period:    TAXONOMY_LK.ndcTargets._meta.period,
      reduction: TAXONOMY_LK.ndcTargets.reduction,
      removal:   TAXONOMY_LK.ndcTargets.removal,
      sectorCounts: TAXONOMY_LK.ndcTargets.sectorCounts,
      keySDGs:   TAXONOMY_LK.ndcTargets.keySDGs,
      gesi:      TAXONOMY_LK.ndcTargets.gesi,
    },
    meta: {
      model:       response.model,
      inputTokens:  response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      startedAt,
      completedAt: new Date().toISOString(),
    },
  };
}

module.exports = { assessNdcSdgAlignment };
