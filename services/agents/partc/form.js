/**
 * CarbonIQ FinTech — PCAF Part C: Client Form Builder
 *
 * Deterministic, not generative. The agent's intelligence goes into PRE-FILLING
 * this form (from the policy PDF and the BOQ) and into GATING it by policy
 * type — not into inventing questions.
 *
 * The MVP question set is fixed by agreement. What keeps it from being a
 * spreadsheet is that the client never sees a blank form:
 *
 *   · §1 material rows are generated from THEIR BOQ — any length, any wording
 *   · policy type, GIFA, premium and project cost arrive pre-filled from the
 *     policy document
 *   · every emission factor and benchmark is a hidden constant carrying its
 *     tier and reference
 *   · a CAR/EAR policy collapses §4, §6 and §7 entirely — a construction
 *     policy is never asked a refrigerant question
 *
 * Field visibility:
 *   'ask'      client answers
 *   'optional' collapsed; answer improves the result
 *   'hidden'   constant from the factor store; never shown
 *   'derived'  computed by the agent, shown read-only
 */

'use strict';

const factors = require('../../pcaf-partc/factors');
const { hasUseStage } = require('../../pcaf-partc/policy-gate');

function _constant(key, ref) {
  return {
    key, visibility: 'hidden', value: ref.value, unit: ref.unit || null,
    tier: ref.tier, reference: ref.reference, gap: ref.gap || null
  };
}

/**
 * Build the client form for a run.
 *
 * @param {Object} params
 * @param {Object} [params.policy]    - from the intake agent
 * @param {Object[]} [params.materials] - from the mapping agent
 * @param {Object} [params.prefill]   - anything already known
 * @returns {Object} form definition
 */
function buildForm({ policy = {}, materials = [], prefill = {} } = {}) {
  const opts = factors.options();
  const policyType = policy.policyType || prefill.policyType || null;
  const useStageApplies = policyType ? hasUseStage(policyType) : true;

  // --- §1 material transport --------------------------------------------
  const section1 = {
    id: 'materials',
    title: 'Material transport distances',
    description: 'One row per material from your BOQ. Enter the distance each travelled to site.',
    visible: true,
    rows: materials.map(m => ({
      materialId: m.id || m.name,
      material:   { value: m.name, visibility: 'derived', source: 'BOQ' },
      quantity:   { value: m.quantity, unit: m.unit, visibility: 'derived', source: 'BOQ' },
      road_km:    { value: (prefill.distances?.[m.id]?.road) ?? null, visibility: 'ask', unit: 'km' },
      sea_km:     { value: (prefill.distances?.[m.id]?.sea)  ?? null, visibility: 'ask', unit: 'km' },
      rail_km:    { value: (prefill.distances?.[m.id]?.rail) ?? null, visibility: 'ask', unit: 'km' },
      mapping:    {
        visibility: 'derived',
        densityKey: m.densityKey || null,
        massFactorKey: m.massFactorKey || null,
        wasteCategory: m.wasteCategory || null,
        confidence: m.confidence || null
      }
    })),
    note: 'Air freight is not asked in this release and is treated as zero.'
  };

  // --- §2 A5 construction inputs ----------------------------------------
  const section2 = {
    id: 'construction',
    title: 'Construction stage',
    visible: true,
    fields: [
      { key: 'demolitionKm', label: 'Demolition transport distance', unit: 'km',
        visibility: 'ask', value: prefill.demolitionKm ?? factors.a5Default('demolitionTransport_km').value,
        default: factors.a5Default('demolitionTransport_km').value },
      { key: 'gifa_m2', label: 'Project GIA / floor area', unit: 'm2',
        visibility: 'ask', required: true, value: prefill.gifa_m2 ?? null,
        source: prefill.gifa_m2 ? 'pre-filled from documents' : null },
      { key: 'wasteDisposalKm', label: 'Waste disposal distance', unit: 'km',
        visibility: 'ask', value: prefill.wasteDisposalKm ?? factors.a5Default('wasteDisposal_km').value,
        default: factors.a5Default('wasteDisposal_km').value }
    ],
    constants: [
      _constant('dieselEF', factors.a5Default('dieselEF')),
      _constant('gridEF',   factors.a5Default('gridEF')),
      _constant('ricsSiteEnergy_kgCO2e_m2', factors.a5Default('ricsSiteEnergy_kgCO2e_m2'))
    ],
    optionalBlock: {
      id: 'previousProject',
      title: 'Site data from a previous project',
      collapsed: true,
      description: 'Optional. If you have metered site data from a comparable project, it replaces the RICS default and materially improves the result.',
      fields: [
        { key: 'previousProject.area_m2',         label: 'Previous project area',        unit: 'm2',  visibility: 'optional' },
        { key: 'previousProject.fuel_L',          label: 'Previous project site fuel',   unit: 'L',   visibility: 'optional' },
        { key: 'previousProject.electricity_kWh', label: 'Previous project electricity', unit: 'kWh', visibility: 'optional' },
        { key: 'previousProject.durationMonths',  label: 'Previous project duration',    unit: 'months', visibility: 'optional' }
      ]
    }
  };

  // --- §3 vehicle usage --------------------------------------------------
  const section3 = {
    id: 'vehicle',
    title: 'Site vehicles',
    visible: true,
    fields: [
      { key: 'evUsedOnSite', label: 'EV used on site', type: 'boolean',
        visibility: 'optional', value: prefill.evUsedOnSite ?? false }
    ],
    note: 'Captured for information only. Not calculated into any total in this release, to avoid double counting with site energy.'
  };

  // --- §5 policy type (the gate) — rendered before the gated sections ----
  const section5 = {
    id: 'policy',
    title: 'Policy type',
    visible: true,
    isGate: true,
    fields: [
      { key: 'policyType', label: 'Policy type', type: 'select', options: opts.policyTypes,
        visibility: 'ask', required: true, value: policyType,
        source: policy.policyType ? 'classified from the policy document' : null },
      { key: 'yearsOfCover', label: 'Years of cover', unit: 'years',
        visibility: useStageApplies ? 'ask' : 'hidden',
        value: prefill.yearsOfCover ?? (useStageApplies ? 10 : 0),
        disabled: !useStageApplies,
        note: useStageApplies
          ? 'Default 10 years for IDI / Decennial cover.'
          : 'Not applicable: a CAR/EAR policy covers construction only and has no use stage.' }
    ],
    gateEffect: useStageApplies
      ? 'Use-stage modules B1, B4 and B7 will be computed and reported as a separate line.'
      : 'Use-stage modules B1, B4 and B7 are not applicable and will be reported as zero.'
  };

  // --- §4 B1 refrigerant (gated) ----------------------------------------
  const section4 = {
    id: 'refrigerant',
    title: 'Refrigerant (use stage)',
    visible: useStageApplies,
    gatedBy: 'policyType',
    gateMessage: useStageApplies ? null : 'Not applicable — CAR/EAR policy covers construction only.',
    fields: [
      { key: 'equipmentType', label: 'Equipment type', type: 'select', options: opts.equipmentTypes,
        visibility: 'ask', value: prefill.equipmentType ?? null,
        note: 'Annual leak rate is applied automatically from IPCC 2019 defaults.' },
      { key: 'refrigerant', label: 'Refrigerant type', type: 'select', options: opts.refrigerants,
        visibility: 'ask', value: prefill.refrigerant ?? null,
        note: 'GWP is applied automatically from IPCC AR5 (100-year).' },
      { key: 'chargeKg', label: 'Refrigerant charge', unit: 'kg', visibility: 'optional',
        value: prefill.chargeKg ?? null,
        note: 'Leave blank to estimate from floor area. The actual charge from the HVAC schedule gives a materially better result.' }
    ],
    constants: [
      _constant('chargeBenchmark_kg_per_m2', factors.b1b4Default('chargeBenchmark_kg_per_m2')),
      _constant('hvacServiceLife_years',     factors.b1b4Default('hvacServiceLife_years')),
      _constant('eolLossRate',               factors.b1b4Default('eolLossRate'))
    ]
  };

  // --- §6 B7 operational water (gated) ----------------------------------
  const section6 = {
    id: 'water',
    title: 'Operational water (use stage)',
    visible: useStageApplies,
    gatedBy: 'policyType',
    gateMessage: useStageApplies ? null : 'Not applicable — CAR/EAR policy covers construction only.',
    fields: [
      { key: 'occupants', label: 'Occupants', visibility: 'ask', value: prefill.occupants ?? null,
        note: 'Leave blank to derive from floor area.' },
      { key: 'annualVolume_m3', label: 'Annual water volume', unit: 'm3', visibility: 'optional',
        value: prefill.annualVolume_m3 ?? null,
        note: 'Metered consumption, if available, replaces the occupancy benchmark.' }
    ],
    constants: [
      _constant('occupantDensity', factors.waterBenchmark('occupantDensity_m2_per_person')),
      _constant('waterUsePerPersonDay', factors.waterBenchmark('waterUse_L_per_person_day')),
      _constant('supplyEF', factors.waterEF('supply')),
      _constant('wastewaterEF', factors.waterEF('wastewater'))
    ]
  };

  // --- §7 Beyond-PCAF annex (gated, voluntary) --------------------------
  const section7 = {
    id: 'beyondPcaf',
    title: 'Beyond-PCAF whole-life annex (voluntary)',
    visible: useStageApplies,
    voluntary: true,
    gatedBy: 'policyType',
    gateMessage: useStageApplies ? null : 'Not applicable — CAR/EAR policy covers construction only.',
    description: 'Optional whole-life extension. Delivered as a separate annex and never included in the PCAF figure.',
    fields: [
      { key: 'referenceStudyPeriod', label: 'Reference study period', unit: 'years', visibility: 'optional',
        value: factors.wlcaDefault('referenceStudyPeriod_years').value },
      { key: 'b2Allowance', label: 'B2 maintenance allowance', unit: 'kgCO2e/m2', visibility: 'optional',
        value: factors.wlcaDefault('b2Maintenance_kgCO2e_m2').value },
      { key: 'b5Allowance', label: 'B5 refurbishment allowance', unit: 'kgCO2e/m2', visibility: 'optional',
        value: factors.wlcaDefault('b5Refurbishment_kgCO2e_m2').value }
    ]
  };

  const sections = [section5, section1, section2, section3, section4, section6, section7];

  const askCount = sections
    .filter(s => s.visible)
    .reduce((n, s) => {
      const fields = (s.fields || []).filter(f => f.visibility === 'ask').length;
      const rows = (s.rows || []).length * 3; // road, sea, rail
      return n + fields + rows;
    }, 0);

  return {
    version: 'mvp-1',
    policyType,
    useStageApplies,
    sections,
    summary: {
      visibleSections: sections.filter(s => s.visible).length,
      hiddenSections:  sections.filter(s => !s.visible).length,
      fieldsToAnswer:  askCount,
      materialRows:    section1.rows.length,
      prefilled:       Object.keys(prefill).length
    }
  };
}

/**
 * Flatten client answers back into the engine's input shape.
 */
function formAnswersToEngineInput({ policy = {}, materials = [], demolitionItems = [], answers = {} }) {
  const distances = {};
  for (const [materialId, d] of Object.entries(answers.distances || {})) {
    distances[materialId] = {
      road: Number(d.road_km ?? d.road) || 0,
      sea:  Number(d.sea_km  ?? d.sea)  || 0,
      rail: Number(d.rail_km ?? d.rail) || 0,
      air:  0
    };
  }

  return {
    policy: {
      ...policy,
      policyType:   answers.policyType   ?? policy.policyType,
      yearsOfCover: answers.yearsOfCover ?? policy.yearsOfCover
    },
    materials,
    distances,
    siteInputs: {
      gifa_m2:          Number(answers.gifa_m2) || 0,
      demolitionKm:     answers.demolitionKm,
      wasteDisposalKm:  answers.wasteDisposalKm,
      demolitionItems,
      demolitionMass_t: answers.demolitionMass_t,
      previousProject:  answers.previousProject || null
    },
    useStage: {
      equipmentType:   answers.equipmentType,
      refrigerant:     answers.refrigerant,
      chargeKg:        answers.chargeKg,
      capacityKW:      answers.capacityKW,
      occupants:       answers.occupants,
      annualVolume_m3: answers.annualVolume_m3,
      hvacServiceLifeYears: answers.hvacServiceLifeYears
    },
    beyondPcaf: {
      b2Allowance: answers.b2Allowance,
      b5Allowance: answers.b5Allowance,
      b8Manual:    answers.b8Manual
    },
    options: { evUsedOnSite: !!answers.evUsedOnSite }
  };
}

module.exports = { buildForm, formAnswersToEngineInput };
