/**
 * CarbonIQ FinTech — PCAF Part C: the per-assessment report
 *
 * Two things come out of here: the structured report object an API caller
 * receives, and the document a reviewer reads. They are built from the same
 * execution, and the document is drawn by the shared standard renderer in
 * partc-report-standard.js — the same one that draws the annual disclosure —
 * so a requirement satisfied in one document cannot go missing from the
 * other.
 *
 * Section order follows PCAF's Part C disclosure checklist rather than this
 * application's convenience: cover, scope and coverage, gases and units,
 * absolute emissions, methodology, data quality, recalculation, intensity,
 * limitations, conformance, annexes. The completed checklist is the last
 * annex, answered from the same facts the sections render.
 */

'use strict';

const { containsForbiddenLanguage } = require('./pcaf-partc/data-quality');
const standard = require('./partc-report-standard');

// ---------------------------------------------------------------------------
// Structured report object
// ---------------------------------------------------------------------------

/**
 * @param {Object} params
 * @param {Object} params.result     - runPartC() output
 * @param {Object} params.registers  - buildRegisters() output
 * @param {string} [params.memo]     - narrative from the disclosure agent
 * @param {Object} [params.meta]     - { projectName, insurer, insured, orgName, runId }
 * @param {boolean} [params.includeWlcaAnnex]
 */
function buildPartCReport({ result, registers, memo, meta = {}, settings = {}, includeWlcaAnnex = false }) {
  const s = result.summary;

  const report = {
    type: 'pcaf-part-c',
    title: 'PCAF Insurance-Associated Emissions Disclosure',
    standard: result.standard,
    meta: {
      projectName: meta.projectName || 'Unnamed project',
      insurer:     meta.insurer  || null,
      insured:     meta.insured  || null,
      organisation: meta.orgName || null,
      runId:       meta.runId    || null,
      generatedAt: result.generatedAt || new Date().toISOString(),
      reportId:    `PARTC-${(meta.runId || 'RUN').toUpperCase()}`
    },

    result: {
      constructionLabel: 'Construction (A4 + A5) — the PCAF figure',
      construction_kgCO2e: s.construction_kgCO2e,
      construction_tCO2e:  s.construction_tCO2e,
      useStageLabel: 'Use-stage (B1 + B4 + B7) — optional, reported separately',
      useStage_kgCO2e: s.useStage_kgCO2e,
      useStage_tCO2e:  s.useStage_tCO2e,
      attributionFactor: s.attributionFactor,
      insurerIAE_tCO2e:  s.insurerIAE_tCO2e,
      useStageInsurerShare_tCO2e: s.useStageInsurerShare_tCO2e,
      perM2Factor_kgCO2e_m2: s.perM2Factor_kgCO2e_m2,
      scopeWarning: 'The construction and use-stage figures are reported as separate lines and are never summed.'
    },

    scope: {
      policyType:    result.policy.policyType,
      useStageYears: result.policy.useStageYears,
      model:         result.scopeModel,
      note: result.policy.useStageYears > 0
        ? `Policy carries a ${result.policy.useStageYears}-year use stage. B1, B4 and B7 computed and reported separately.`
        : 'Policy covers construction only. B1, B4 and B7 are zero by scope rule, not by omission.'
    },

    modules: [
      { module: 'A4', label: 'Transport to site',   value: result.modules.a4.value, inPcafFigure: true },
      ...result.modules.a5Breakdown.map(b => ({ module: b.module, label: b.label, value: b.value, inPcafFigure: true })),
      { module: 'A5', label: 'Construction total',  value: result.modules.a5.value, inPcafFigure: true },
      { module: 'B1', label: 'Refrigerant',         value: result.modules.b1.value, inPcafFigure: false },
      { module: 'B4', label: 'Replacement (HVAC)',  value: result.modules.b4.value, inPcafFigure: false },
      { module: 'B7', label: 'Operational water',   value: result.modules.b7.value, inPcafFigure: false }
    ],

    drivers: result.sensitivity.moduleContributions,
    paretoVitalFew: result.modules.a4.vitalFew,
    dataQuality: result.dataQuality,
    // PCAF requires a score beside any disclosed figure, so the two scores
    // travel with the result rather than being an annex a reader may miss.
    dqScoring: result.dqScoring || null,
    dqStatement: result.dqDisclosureStatement || null,
    deMinimis: result.deMinimis,
    disclosureNote: result.disclosureNote,
    memo: memo || null,

    annexes: {
      A: registers.assumptions,
      B: registers.dataGaps,
      /*
       * Annex C is counted, not carried. The trace is every equation the
       * engine executed with its inputs and factors — the method rather than
       * the disclosure — and this report is generated from a screen anyone can
       * open. The count is what the traceability item is answered from; the
       * steps are retained and released to an assurance provider on request.
       */
      C: {
        annex: 'C',
        title: registers.auditTrail.title,
        total: registers.auditTrail.total,
        entries: [],
        note: `A trace of ${registers.auditTrail.total} steps is retained for every figure in `
          + 'this report and is released to an assurance provider on request. It is not '
          + 'reproduced in this document.'
      },
      D: includeWlcaAnnex ? {
        annex: 'D',
        title: 'Beyond-PCAF Whole-Life Annex (voluntary)',
        total: result.beyondPcafAnnex.value,
        // No equation column, for the same reason Annex C carries no steps.
        entries: result.beyondPcafAnnex.children.map(c => ({
          module: c.module, label: c.label, value: c.value
        })),
        note: 'Voluntary whole-life reporting under RICS / EN 15978. NOT part of the PCAF figure and never included in the construction or use-stage lines.'
      } : null
    }
  };

  // Language guard — conformance, never endorsement.
  const offending = containsForbiddenLanguage(
    [report.disclosureNote, report.memo].filter(Boolean).join('\n'));
  if (offending.length > 0) {
    throw new Error(`Report blocked: PCAF endorsement language detected (${offending.join(', ')}). Only conformance language is permitted.`);
  }

  /* What the document renderers need, kept off the JSON. See _model(). */
  Object.defineProperty(report, '_source', {
    value: { result, registers, settings, meta, memo: memo || null },
    enumerable: false, writable: false
  });

  return report;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * Rebuild the standard model from what the report was made of.
 *
 * The execution and its registers travel with the report on a non-enumerable
 * property, so the document renderers can reach them while the JSON an API
 * caller receives stays exactly what it always was. Passing them as extra
 * arguments instead would change a signature every existing caller uses, and
 * copying them onto the report would double the size of every JSON response.
 */
function _model(report) {
  if (!report._source) {
    throw new Error('This report was not built by buildPartCReport(), so the document cannot be rendered from it.');
  }
  const { result, registers, settings, meta, memo } = report._source;
  const facts = standard.assessmentFacts({ result, registers, settings, meta, memo });
  if (report.annexes.D) facts.beyondPcafAnnex = report.annexes.D;
  return standard.buildStandardModel(facts);
}

/** @returns {import('pdfkit')} a streaming A4 document in the house style */
function buildPartCPDF(report) {
  return standard.renderStandardPDF(_model(report));
}

/** @returns {Promise<Buffer>} .docx with real named styles */
async function buildPartCDOCX(report) {
  return standard.renderStandardDOCX(_model(report));
}

module.exports = { buildPartCReport, buildPartCPDF, buildPartCDOCX };
