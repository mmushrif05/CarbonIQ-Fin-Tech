// @ts-check
/**
 * The shape every Part C route answers with, and the engine input a request body becomes.
 */

'use strict';

/**
 * The registers, minus the calculation trace.
 *
 * Annex C is every equation the engine executed, in order, with its inputs and
 * the factor each step consulted. That is the method itself — the same asset
 * `src/domains/pcaf-part-c/application/partc-methodology.js` exists to hold and the same reason nothing on
 * the website serves it. Served to a browser it is copyable by whoever loads
 * the page, which is by construction everybody.
 *
 * It is removed rather than refused, on the rule the methodology statement
 * already follows: a 403 announces that something exists to be taken, and
 * absence announces nothing. The trail is still built — the methodology
 * statement, the GWP basis and the disclosure checklist are all derived from
 * it — it just never reaches the wire.
 */
function _publicRegisters(registers) {
  if (!registers) return registers;
  const { assumptions, dataGaps, badges } = registers;
  return {
    assumptions,
    dataGaps,
    badges: badges ? { assumptions: badges.assumptions, dataGaps: badges.dataGaps } : badges
  };
}

/** Shape the client-facing response from an engine result. */
function _shapeResult(result, registers, extra = {}) {
  return {
    standard: result.standard,
    scopeModel: result.scopeModel,
    policy: result.policy,
    summary: result.summary,
    modules: {
      a4: result.modules.a4.value,
      a5: result.modules.a5.value,
      a5Breakdown: result.modules.a5Breakdown,
      b1: result.modules.b1.value,
      b4: result.modules.b4.value,
      b7: result.modules.b7.value
    },
    paretoVitalFew: result.modules.a4.vitalFew,
    // A figure, not a step: the tonnage the A4 module carried. It used to be
    // read off the calculation trace, which is no longer sent.
    a4MaterialMass_t: (result.modules.a4.inputs && result.modules.a4.inputs.totalMass_t) || null,
    beyondPcafAnnex: {
      total: result.beyondPcafAnnex.value,
      breakdown: result.beyondPcafAnnex.children.map(c => ({ module: c.module, label: c.label, value: c.value })),
      scopeNote: 'Voluntary whole-life annex — never part of the PCAF figure.'
    },
    deMinimis:   result.deMinimis,
    dataQuality: result.dataQuality,
    // PCAF requires a score beside any disclosed figure, so the scoring
    // travels with the figures rather than being fetched separately.
    dqScoring:  result.dqScoring || null,
    dqStatement: result.dqDisclosureStatement || null,
    disclosureNote: result.disclosureNote,
    sensitivity: result.sensitivity,
    vehicle:     result.vehicle,
    registers: _publicRegisters(registers),
    generatedAt: result.generatedAt,
    ...extra
  };
}

/** Shape the engine input from a validated request body. */
function _toEngineInput(body) {
  return {
    policy:     body.policy,
    materials:  body.materials,
    distances:  body.distances,
    siteInputs: body.siteInputs,
    useStage:   body.useStage,
    beyondPcaf: body.beyondPcaf,
    options:    body.options,
    hasEPD:     body.hasEPD
  };
}

module.exports = { _publicRegisters, _shapeResult, _toEngineInput };
