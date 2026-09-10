// @ts-check
/**
 * The shape every Part C route answers with, and the engine input a request body becomes.
 */

'use strict';

const { body, str, num, obj, orNull, arr } =
  require('../../../../../platform/http/openapi-hints');

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

/**
 * The shape `_shapeResult` answers with, for the document.
 *
 * The three tiers are separate keys and there is no key holding their sum.
 * `rollup.construction` is **the PCAF figure** (A4 + A5, mandatory);
 * `rollup.useStage` is the optional B1/B4/B7 line, policy-gated and never
 * summed with construction; `beyondPcafAnnex` is the voluntary annex and is
 * never in the PCAF figure at all. A client that added two of them would be
 * reporting a number no standard defines.
 */
const engineResultSchema = body({
  standard: obj, scopeModel: obj, policy: obj, summary: obj,
  modules: body({ a4: num, a5: num, a5Breakdown: obj, b1: num, b4: num, b7: num }),
  paretoVitalFew: arr(), a4MaterialMass_t: orNull(num),
  beyondPcafAnnex: body({ total: num, breakdown: arr(), scopeNote: str }),
  deMinimis: obj,
  /* PCAF requires a score beside any disclosed figure, so the scoring travels
     with the figures rather than being fetched separately. One score per
     project, decided by the option used — never an average, and never
     rendered as a fraction. */
  dataQuality: body({ option: str, score: num }),
  dqScoring: orNull(obj), dqStatement: orNull(str),
  disclosureNote: str, sensitivity: obj, vehicle: obj,
  registers: obj, generatedAt: str,
}, ['summary', 'modules', 'dataQuality']);

module.exports = { _publicRegisters, _shapeResult, _toEngineInput, engineResultSchema };
