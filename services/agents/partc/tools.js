/**
 * CarbonIQ FinTech — PCAF Part C: Agent Tool Registry
 *
 * The engine is wrapped as tools so Claude can drive it — but the division of
 * labour is deliberate and strict:
 *
 *   Claude does:  classification, extraction, BOQ-to-factor mapping, and
 *                 writing the narrative.
 *   The engine does: every arithmetic operation.
 *
 * An LLM must never multiply a mass by an emission factor in a regulatory
 * disclosure — the result would be unauditable and irreproducible. Every
 * figure that reaches a memo comes from a tool result computed by the pure
 * engine in services/pcaf-partc/.
 */

'use strict';

const { runPartC }   = require('../../pcaf-partc');
const factors        = require('../../pcaf-partc/factors');
const { attributionFactor } = require('../../pcaf-partc/attribution');
const { useStageYears }     = require('../../pcaf-partc/policy-gate');
const { buildRegisters }    = require('../../partc-registers');
const { buildForm, formAnswersToEngineInput } = require('./form');

// --- tool implementations ---------------------------------------------------

/** Every factor key Claude may map a BOQ line onto. */
function list_factor_keys() {
  const t = factors.allTables();
  return {
    densities:            Object.keys(t.densities.rows),
    massFactors:          Object.keys(t['mass-factors'].rows),
    wasteCategories:      Object.keys(t['waste-rates-rics-t18'].rows),
    serviceLifeCategories:Object.keys(t['service-lives'].rows),
    equipmentTypes:       Object.keys(t['refrigerant-leak'].rows),
    refrigerants:         Object.keys(t['refrigerant-gwp'].rows),
    units:                ['m3', 'm2', 'm', 'MT', 'kg', 'Nr'],
    guidance: 'Use densities for volumetric (m3) quantities and massFactors for everything else. Waste categories are RICS Table 18 names — pick the closest; an unmatched category falls back to the 5% default and is disclosed.'
  };
}

/** Inspect a single factor, with its tier and source. */
function lookup_factor({ table, key }) {
  if (!table || !key) return { error: 'table and key are required' };
  return factors.lookup(table, key);
}

/** Attribution factor only — useful for a quick check before a full run. */
function compute_attribution(policy) {
  const a = attributionFactor(policy || {});
  return { attributionFactor: a.value, equation: a.equation, inputs: a.inputs,
           assumptions: a.assumptions };
}

/** The scope gate, in isolation. */
function apply_policy_gate({ policyType, yearsOfCover }) {
  const g = useStageYears({ policyType, yearsOfCover });
  return { useStageYears: g.value, equation: g.equation, assumptions: g.assumptions };
}

/** Build the client form for a policy and a mapped BOQ. */
function build_client_form({ policy, materials, prefill }) {
  return buildForm({ policy: policy || {}, materials: materials || [], prefill: prefill || {} });
}

/**
 * The full Part C calculation. This is the ONLY tool that produces emissions
 * figures, and it is pure deterministic code.
 */
function compute_part_c(input) {
  const result = runPartC(input || {});
  const registers = buildRegisters(result);
  return {
    summary:        result.summary,
    scopeModel:     result.scopeModel,
    policy:         result.policy,
    moduleValues: {
      a4: result.modules.a4.value,
      a5: result.modules.a5.value,
      a5Breakdown: result.modules.a5Breakdown,
      b1: result.modules.b1.value,
      b4: result.modules.b4.value,
      b7: result.modules.b7.value
    },
    paretoVitalFew: result.modules.a4.vitalFew,
    beyondPcafAnnex: {
      total: result.beyondPcafAnnex.value,
      breakdown: result.beyondPcafAnnex.children.map(c => ({ module: c.module, value: c.value })),
      scopeNote: 'Voluntary whole-life annex. Never included in the PCAF figure.'
    },
    deMinimis:      result.deMinimis,
    dataQuality:    result.dataQuality,
    disclosureNote: result.disclosureNote,
    sensitivity: {
      moduleContributions: result.sensitivity.moduleContributions,
      topFactorGaps:       result.sensitivity.topFactorGaps.slice(0, 5)
    },
    registerCounts: registers.badges,
    limitations:    registers.assumptions.limitations.map(l => ({ severity: l.severity, message: l.message })),
    researchPriority: registers.dataGaps.researchPriority
  };
}

/** Convert completed form answers into the engine input shape, then compute. */
function compute_from_form_answers({ policy, materials, demolitionItems, answers }) {
  const input = formAnswersToEngineInput({
    policy: policy || {}, materials: materials || [],
    demolitionItems: demolitionItems || [], answers: answers || {}
  });
  return compute_part_c(input);
}

const TOOL_FUNCTIONS = {
  list_factor_keys,
  lookup_factor,
  compute_attribution,
  apply_policy_gate,
  build_client_form,
  compute_part_c,
  compute_from_form_answers
};

// --- Claude tool schemas ----------------------------------------------------

const MATERIAL_SCHEMA = {
  type: 'object',
  properties: {
    id:       { type: 'string', description: 'Stable identifier for this BOQ line' },
    name:     { type: 'string' },
    quantity: { type: 'number' },
    unit:     { type: 'string', enum: ['m3', 'm2', 'm', 'MT', 'kg', 'Nr'] },
    densityKey:    { type: 'string', description: 'Key from the densities table (volumetric items)' },
    massFactorKey: { type: 'string', description: 'Key from the mass-factors table (non-volumetric items)' },
    wasteCategory: { type: 'string', description: 'RICS Table 18 category name' },
    serviceLifeCategory: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
  },
  required: ['name', 'quantity', 'unit']
};

const TOOL_DEFINITIONS = [
  {
    name: 'list_factor_keys',
    description: 'List every factor key available for mapping BOQ lines: densities, mass factors, RICS Table 18 waste categories, service-life categories, equipment types and refrigerants. Call this before mapping so mappings use real keys.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'lookup_factor',
    description: 'Look up a single factor and see its value, data-quality tier and named source. Use when deciding between two candidate mappings.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'e.g. densities, mass-factors, waste-rates-rics-t18' },
        key:   { type: 'string' }
      },
      required: ['table', 'key']
    }
  },
  {
    name: 'compute_attribution',
    description: "Compute the insurer's attribution factor from the policy. Never calculate this yourself.",
    input_schema: {
      type: 'object',
      properties: {
        basis: { type: 'string', enum: ['motor', 'project_specific', 'annual', 'treaty'] },
        premium: { type: 'number' }, projectCost: { type: 'number' },
        revenue: { type: 'number' }, tco: { type: 'number' },
        ceded: { type: 'number' }, grossPremium: { type: 'number' },
        reinsuranceCeded: { type: 'number' }
      },
      required: ['basis']
    }
  },
  {
    name: 'apply_policy_gate',
    description: 'Resolve the use-stage window for a policy type. CAR and EAR carry no use stage; IDI and Property do. This decides whether B1, B4 and B7 are computed at all.',
    input_schema: {
      type: 'object',
      properties: {
        policyType: { type: 'string', enum: ['CAR', 'EAR', 'IDI', 'Property'] },
        yearsOfCover: { type: 'number' }
      },
      required: ['policyType']
    }
  },
  {
    name: 'build_client_form',
    description: 'Build the pre-filled, policy-gated client form from the policy and the mapped BOQ. Returns which fields the client must answer and which are hidden constants.',
    input_schema: {
      type: 'object',
      properties: {
        policy:    { type: 'object' },
        materials: { type: 'array', items: MATERIAL_SCHEMA },
        prefill:   { type: 'object' }
      },
      required: ['materials']
    }
  },
  {
    name: 'compute_part_c',
    description: 'Run the full PCAF Part C calculation: A4, A5, the policy gate, B1/B4/B7, the roll-up, the insurer IAE, the per-m2 factor, data quality and the disclosure note. This is the only source of emissions figures — never compute any of them yourself.',
    input_schema: {
      type: 'object',
      properties: {
        policy:     { type: 'object' },
        materials:  { type: 'array', items: MATERIAL_SCHEMA },
        distances:  { type: 'object', description: 'Map of materialId to {road, sea, rail, air} in km' },
        siteInputs: { type: 'object' },
        useStage:   { type: 'object' },
        beyondPcaf: { type: 'object' },
        options:    { type: 'object' }
      },
      required: ['policy', 'materials']
    }
  },
  {
    name: 'compute_from_form_answers',
    description: 'Run the full calculation directly from completed client form answers.',
    input_schema: {
      type: 'object',
      properties: {
        policy: { type: 'object' },
        materials: { type: 'array', items: MATERIAL_SCHEMA },
        demolitionItems: { type: 'array', items: MATERIAL_SCHEMA },
        answers: { type: 'object' }
      },
      required: ['materials', 'answers']
    }
  }
];

module.exports = { TOOL_FUNCTIONS, TOOL_DEFINITIONS, MATERIAL_SCHEMA };
