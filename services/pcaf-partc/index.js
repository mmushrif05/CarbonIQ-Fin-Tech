/**
 * CarbonIQ FinTech — PCAF Part C: Engine Orchestrator
 *
 * Pure, deterministic, no network and no API key. Given a fully-resolved
 * input object it returns the complete Part C result: module figures, the
 * roll-up, the insurer's IAE, the reusable per-m² factor, data quality,
 * the disclosure note, sensitivity analysis, plausibility findings and the
 * full traced-value tree the registers are built from.
 *
 * Scope discipline (spec §8), enforced by structure:
 *   MANDATORY   A4 + A5        -> result.rollup.construction   (the PCAF figure)
 *   OPTIONAL    B1 + B4 + B7   -> result.rollup.useStage       (separate line)
 *   BEYOND-PCAF B2 + B5 + B8   -> result.beyondPcafAnnex       (separate annex)
 *
 * The Beyond-PCAF annex is computed here but passed to rollup() nowhere; the
 * roll-up module does not import it at all.
 */

'use strict';

const { attributionFactor } = require('./attribution');
const { useStageYears }     = require('./policy-gate');
const { a4Total }           = require('./a4-transport');
const { a5Total }           = require('./a5-construction');
const { b1Refrigerant, deMinimisCheck } = require('./b1-refrigerant');
const { b4Replacement }     = require('./b4-replacement');
const { b7Water }           = require('./b7-water');
const { beyondPcafAnnex }   = require('./beyond-pcaf');
const { rollup }            = require('./rollup');
const { assessDataQuality, disclosureNote } = require('./data-quality');
const sensitivity           = require('./sensitivity');
const { runChecks }         = require('./checks');
const { collectAssumptions, collectFactors } = require('./provenance');
const factors               = require('./factors');

/**
 * @param {Object} input
 * @param {Object} input.policy       - { policyType, basis, premium, projectCost, revenue, tco, ceded, grossPremium, reinsuranceCeded, yearsOfCover, precision }
 * @param {Object[]} input.materials  - mapped BOQ lines
 * @param {Object} input.distances    - { [materialId]: { road, sea, rail, air } }
 * @param {Object} input.siteInputs   - { gifa_m2, demolitionKm, wasteDisposalKm, demolitionItems, demolitionMass_t, previousProject }
 * @param {Object} input.useStage     - { equipmentType, refrigerant, chargeKg, capacityKW, hvacServiceLifeYears, occupants, annualVolume_m3 }
 * @param {Object} [input.beyondPcaf] - { b2Allowance, b5Allowance, b8Manual }
 * @param {Object} [input.options]    - { evUsedOnSite }
 * @returns {Object} PartCResult
 */
function runPartC(input = {}) {
  const policy     = input.policy     || {};
  const materials  = input.materials  || [];
  const distances  = input.distances  || {};
  const site       = input.siteInputs || {};
  const use        = input.useStage   || {};
  const beyond     = input.beyondPcaf || {};
  const opts       = input.options    || {};

  const gifa = Number(site.gifa_m2) || 0;

  // --- 1. attribution -------------------------------------------------------
  const attribution = attributionFactor(policy);

  // --- 2. policy gate -------------------------------------------------------
  const gate = useStageYears({ policyType: policy.policyType, yearsOfCover: policy.yearsOfCover });
  const years = gate.value;

  // --- 3. construction modules (always) -------------------------------------
  const a4 = a4Total(materials, distances);
  const a5 = a5Total({
    demolitionItems:  site.demolitionItems || [],
    demolitionMass_t: site.demolitionMass_t,
    demolitionKm:     site.demolitionKm,
    gifa_m2:          gifa,
    previousProject:  site.previousProject,
    materials,
    wasteDisposalKm:  site.wasteDisposalKm
  });

  // --- 4. use-stage modules (gated) -----------------------------------------
  const b1 = b1Refrigerant({
    equipmentType: use.equipmentType, refrigerant: use.refrigerant,
    chargeKg: use.chargeKg, capacityKW: use.capacityKW,
    gifa_m2: gifa, useStageYears: years
  });

  const b4 = b4Replacement({
    useStageYears: years,
    chargeKg: b1.inputs.charge_kg,
    gwpValue: b1.inputs.gwp,
    hvacServiceLifeYears: use.hvacServiceLifeYears
  });

  const b7 = b7Water({
    occupants: use.occupants, gifa_m2: gifa,
    annualVolume_m3: use.annualVolume_m3, useStageYears: years
  });

  // --- 5. roll-up (B2/B5/B8 structurally cannot reach this) -----------------
  const rolled = rollup({ a4, a5, b1, b4, b7, attributionFactor: attribution, gifa_m2: gifa });

  // --- 6. Beyond-PCAF annex — separate, never in the roll-up ----------------
  const annex = beyondPcafAnnex({
    gifa_m2: gifa, useStageYears: years,
    b2Allowance: beyond.b2Allowance, b5Allowance: beyond.b5Allowance, b8Manual: beyond.b8Manual
  });

  // --- 7. quality, sensitivity, checks --------------------------------------
  const pcafTree = [attribution, gate, a4, a5, b1, b4, b7];

  const dataQuality = assessDataQuality({
    hasBoq: materials.length > 0,
    hasEPD: !!input.hasEPD,
    tree: pcafTree
  });

  const analysis = sensitivity.analyse({ a4, a5, construction: rolled.construction, tree: pcafTree });
  const findings = runChecks({ rollupResult: rolled, a4, a5, b1, policy, gifa_m2: gifa });

  const assumptions = collectAssumptions(pcafTree);
  const usedFactors = collectFactors(pcafTree);

  const scopeSummary = years > 0
    ? `Scope: construction (A4 + A5) reported as the PCAF figure; use-stage (B1, B4, B7) computed over a ${years}-year cover period and reported separately.`
    : 'Scope: construction (A4 + A5) only. The policy carries no use stage, so B1, B4 and B7 are zero.';

  const note = disclosureNote({
    option: dataQuality.option,
    score: dataQuality.score,
    limitations: assumptions.filter(a => a.severity !== 'info'),
    scopeSummary
  });

  // --- 8. informational: EV flag (captured, never calculated) ---------------
  const vehicle = {
    evUsedOnSite: !!opts.evUsedOnSite,
    calculated: false,
    note: 'Captured for information only. Site vehicle emissions are not added to any total in this release, to avoid double counting with A5.2 site energy.',
    factorAvailable: opts.evUsedOnSite ? factors.vehicleEF('EV') : null
  };

  return {
    standard: 'PCAF Global GHG Accounting and Reporting Standard — Part C (insurance-associated emissions)',
    scopeModel: {
      mandatory:  'A4 + A5 (construction) — the PCAF figure',
      optional:   'B1 + B4 + B7 (use stage) — separate line, policy gated',
      beyondPcaf: 'B2 + B5 + B8 — voluntary whole-life annex, never in the PCAF figure'
    },
    policy: {
      policyType: policy.policyType || null,
      basis: policy.basis || 'project_specific',
      useStageYears: years,
      gateReason: gate.equation
    },
    modules: {
      a4, a5,
      a5Breakdown: a5.children.map(c => ({ module: c.module, label: c.label, value: c.value })),
      b1, b4, b7
    },
    rollup: rolled,
    summary: rolled.summary,
    beyondPcafAnnex: annex,
    deMinimis: deMinimisCheck(b1.value, rolled.construction.value),
    dataQuality,
    disclosureNote: note,
    sensitivity: analysis,
    findings,
    assumptions,
    factorsUsed: usedFactors,
    vehicle,
    tree: pcafTree,
    generatedAt: new Date().toISOString()
  };
}

module.exports = { runPartC };
