/**
 * CarbonIQ FinTech — PCAF Part C: Report Builder (PDF and Word)
 *
 * One structured report object drives both formats, so the PDF and the Word
 * document can never diverge.
 *
 * Layout, per the agreed requirement that assumptions live separately from
 * the main screen:
 *
 *   Main report   result, scope, what drives the number, A4 Pareto, data
 *                 quality, disclosure statement
 *   Annex A       Assumptions and Limitations Register
 *   Annex B       Data Gap Ledger
 *   Annex C       Audit Trail
 *   Annex D       Beyond-PCAF whole-life annex (only when requested)
 */

'use strict';

const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, HeadingLevel, AlignmentType } = require('docx');

const { containsForbiddenLanguage } = require('./pcaf-partc/data-quality');
const { N, _p, _h, _table } = require('./partc-docgen');

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
function buildPartCReport({ result, registers, memo, meta = {}, includeWlcaAnnex = false }) {
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
    deMinimis: result.deMinimis,
    disclosureNote: result.disclosureNote,
    memo: memo || null,

    annexes: {
      A: registers.assumptions,
      B: registers.dataGaps,
      C: registers.auditTrail,
      D: includeWlcaAnnex ? {
        annex: 'D',
        title: 'Beyond-PCAF Whole-Life Annex (voluntary)',
        total: result.beyondPcafAnnex.value,
        entries: result.beyondPcafAnnex.children.map(c => ({
          module: c.module, label: c.label, value: c.value, equation: c.equation
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

  return report;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function buildPartCPDF(report) {
  const doc = new PDFDocument({ margin: 56, size: 'A4', compress: true });

  const H = (t, size = 13) => doc.moveDown(0.8).fontSize(size).fillColor('#0f172a').font('Helvetica-Bold').text(t);
  const P = (t, size = 9.5) => doc.fontSize(size).fillColor('#334155').font('Helvetica').text(t, { align: 'left' });
  const KV = (k, v) => {
    doc.fontSize(9.5).fillColor('#64748b').font('Helvetica').text(k, { continued: true });
    doc.fillColor('#0f172a').font('Helvetica-Bold').text(`   ${v}`);
  };

  // Cover
  doc.fontSize(20).fillColor('#0f172a').font('Helvetica-Bold').text(report.title);
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#64748b').font('Helvetica').text(report.standard);
  doc.moveDown(1);
  KV('Project', report.meta.projectName);
  if (report.meta.insurer) KV('Insurer', report.meta.insurer);
  if (report.meta.insured) KV('Insured', report.meta.insured);
  KV('Report ID', report.meta.reportId);
  KV('Generated', new Date(report.meta.generatedAt).toISOString().split('T')[0]);

  // 1 Result
  H('1. Result');
  KV('Construction (A4 + A5) — the PCAF figure', `${N(report.result.construction_kgCO2e)} kgCO2e`);
  KV('Use-stage (B1 + B4 + B7) — separate line', `${N(report.result.useStage_kgCO2e)} kgCO2e`);
  KV('Attribution factor', report.result.attributionFactor.toFixed(6));
  KV("Insurer's construction IAE", `${report.result.insurerIAE_tCO2e.toFixed(4)} tCO2e`);
  KV('Per-m2 construction factor', `${N(report.result.perM2Factor_kgCO2e_m2)} kgCO2e/m2`);
  doc.moveDown(0.4);
  doc.fontSize(8.5).fillColor('#b45309').font('Helvetica-Oblique').text(report.result.scopeWarning);

  // 2 Scope
  H('2. Scope applied');
  KV('Policy type', report.scope.policyType || 'not stated');
  KV('Use-stage years', String(report.scope.useStageYears));
  P(report.scope.note);

  // 3 Drivers
  H('3. What drives this number');
  for (const d of report.drivers) {
    P(`${d.module.padEnd(6)}  ${N(d.value).padStart(12)} kgCO2e   ${d.sharePct.toFixed(1)}%   ${d.label}`);
  }

  // 4 A4 Pareto
  H('4. Material transport (A4) — Pareto vital few');
  if (report.paretoVitalFew.length === 0) P('No materials assessed.');
  for (const v of report.paretoVitalFew) {
    P(`${v.name} — ${N(v.value)} kgCO2e (${(v.contributionPct * 100).toFixed(1)}% of A4)`);
  }

  // 5 Data quality
  H('5. Data quality');
  KV('Option', `${report.dataQuality.option} — ${report.dataQuality.optionLabel}`);
  KV('Score', `${report.dataQuality.score} (1 best, 5 worst)`);
  KV('Weakest factor tier', report.dataQuality.worstFactorTier || 'n/a');
  P(report.dataQuality.tierNote);

  // 6 Memo
  if (report.memo) { H('6. Assessment memo'); P(report.memo, 9); }

  // 7 Disclosure
  H('7. Disclosure statement');
  P(report.disclosureNote);

  // Annexes
  const annexTable = (a, rowsFn) => {
    if (!a) return;
    doc.addPage();
    doc.fontSize(15).fillColor('#0f172a').font('Helvetica-Bold').text(`Annex ${a.annex} — ${a.title}`);
    doc.moveDown(0.3);
    if (a.note) doc.fontSize(8.5).fillColor('#64748b').font('Helvetica-Oblique').text(a.note);
    doc.moveDown(0.5);
    rowsFn(a);
  };

  annexTable(report.annexes.A, a => {
    P(`${a.total} entries — ${a.counts.material} material, ${a.counts.notable} notable, ${a.counts.info} informational.`);
    doc.moveDown(0.4);
    a.entries.forEach((e, i) => {
      doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold')
         .text(`${i + 1}. [${e.severity.toUpperCase()}] ${e.module || e.source}`);
      doc.fontSize(9).fillColor('#334155').font('Helvetica').text(e.message);
      doc.moveDown(0.3);
    });
  });

  annexTable(report.annexes.B, a => {
    P(`${a.total} factor gaps — ${a.fallbacks} fallbacks, ${a.globalTier} Global-tier.`);
    doc.moveDown(0.3);
    doc.fontSize(9.5).fillColor('#0f172a').font('Helvetica-Bold').text('Research priority (by emissions flowing through each factor)');
    a.researchPriority.forEach(r => P(`${r.rank}. ${r.factorKey} — ${r.sharePct.toFixed(1)}% — ${r.gap}`));
    doc.moveDown(0.4);
    doc.fontSize(9.5).fillColor('#0f172a').font('Helvetica-Bold').text('All gaps');
    a.entries.forEach(e => P(`${e.factorKey} [${e.tier}] ${N(e.value)} ${e.unit || ''} — ${e.gap}`));
  });

  annexTable(report.annexes.C, a => {
    P(`${a.total} traced calculation steps.`);
    doc.moveDown(0.3);
    a.entries.forEach(e => {
      doc.fontSize(8.5).fillColor('#0f172a').font('Helvetica-Bold')
         .text(`${e.step}. ${e.module} — ${e.label}: ${N(e.value)} ${e.unit}`);
      doc.fontSize(8).fillColor('#475569').font('Helvetica').text(`   ${e.equation}`);
      if (e.factors.length) {
        e.factors.forEach(f => doc.fontSize(7.5).fillColor('#64748b')
          .text(`   · ${f.key} = ${f.value} [${f.tier}] ${f.reference || ''}`));
      }
    });
  });

  if (report.annexes.D) {
    annexTable(report.annexes.D, a => {
      P(`Annex total: ${N(a.total)} kgCO2e`);
      a.entries.forEach(e => P(`${e.module} — ${e.label}: ${N(e.value)} kgCO2e`));
    });
  }

  doc.end();
  return doc;
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<Buffer>} .docx buffer
 */
async function buildPartCDOCX(report) {
  const children = [];

  children.push(new Paragraph({ text: report.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.LEFT }));
  children.push(_p(report.standard, { italics: true, color: '64748B' }));
  children.push(_table(['Field', 'Value'], [
    ['Project', report.meta.projectName],
    ...(report.meta.insurer ? [['Insurer', report.meta.insurer]] : []),
    ...(report.meta.insured ? [['Insured', report.meta.insured]] : []),
    ['Report ID', report.meta.reportId],
    ['Generated', new Date(report.meta.generatedAt).toISOString().split('T')[0]]
  ]));

  children.push(_h('1. Result', HeadingLevel.HEADING_1));
  children.push(_table(['Metric', 'Value'], [
    ['Construction (A4 + A5) — the PCAF figure', `${N(report.result.construction_kgCO2e)} kgCO2e`],
    ['Use-stage (B1 + B4 + B7) — separate line', `${N(report.result.useStage_kgCO2e)} kgCO2e`],
    ['Attribution factor', report.result.attributionFactor.toFixed(6)],
    ["Insurer's construction IAE", `${report.result.insurerIAE_tCO2e.toFixed(4)} tCO2e`],
    ['Per-m2 construction factor', `${N(report.result.perM2Factor_kgCO2e_m2)} kgCO2e/m2`]
  ]));
  children.push(_p(report.result.scopeWarning, { italics: true, color: 'B45309' }));

  children.push(_h('2. Scope applied', HeadingLevel.HEADING_1));
  children.push(_table(['Field', 'Value'], [
    ['Policy type', report.scope.policyType || 'not stated'],
    ['Use-stage years', String(report.scope.useStageYears)],
    ['Mandatory', report.scope.model.mandatory],
    ['Optional', report.scope.model.optional],
    ['Beyond-PCAF', report.scope.model.beyondPcaf]
  ]));
  children.push(_p(report.scope.note));

  children.push(_h('3. What drives this number', HeadingLevel.HEADING_1));
  children.push(_table(['Module', 'kgCO2e', 'Share', 'Label'],
    report.drivers.map(d => [d.module, N(d.value), `${d.sharePct.toFixed(1)}%`, d.label])));

  children.push(_h('4. Material transport (A4) — Pareto vital few', HeadingLevel.HEADING_1));
  children.push(report.paretoVitalFew.length
    ? _table(['Material', 'kgCO2e', 'Share of A4'],
        report.paretoVitalFew.map(v => [v.name, N(v.value), `${(v.contributionPct * 100).toFixed(1)}%`]))
    : _p('No materials assessed.'));

  children.push(_h('5. Data quality', HeadingLevel.HEADING_1));
  children.push(_table(['Field', 'Value'], [
    ['Option', `${report.dataQuality.option} — ${report.dataQuality.optionLabel}`],
    ['Score', `${report.dataQuality.score} (1 best, 5 worst)`],
    ['Weakest factor tier', report.dataQuality.worstFactorTier || 'n/a'],
    ['Factors used', String(report.dataQuality.factorsUsed)],
    ['Factors with gaps', String(report.dataQuality.factorsWithGaps)]
  ]));
  children.push(_p(report.dataQuality.tierNote));

  if (report.memo) {
    children.push(_h('6. Assessment memo', HeadingLevel.HEADING_1));
    for (const line of String(report.memo).split('\n')) children.push(_p(line));
  }

  children.push(_h('7. Disclosure statement', HeadingLevel.HEADING_1));
  children.push(_p(report.disclosureNote, { bold: true }));

  // Annex A
  const A = report.annexes.A;
  children.push(new Paragraph({ text: `Annex A — ${A.title}`, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  children.push(_p(`${A.total} entries — ${A.counts.material} material, ${A.counts.notable} notable, ${A.counts.info} informational.`, { italics: true }));
  children.push(_table(['#', 'Severity', 'Module', 'Assumption or limitation'],
    A.entries.map((e, i) => [String(i + 1), e.severity, e.module || e.source, e.message])));

  // Annex B
  const B = report.annexes.B;
  children.push(new Paragraph({ text: `Annex B — ${B.title}`, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  children.push(_p(B.note, { italics: true }));
  children.push(_h('Research priority', HeadingLevel.HEADING_2));
  children.push(_table(['Rank', 'Factor', 'Share', 'Gap'],
    B.researchPriority.map(r => [String(r.rank), r.factorKey, `${r.sharePct.toFixed(1)}%`, r.gap])));
  children.push(_h('All gaps', HeadingLevel.HEADING_2));
  children.push(_table(['Factor', 'Value', 'Tier', 'Gap'],
    B.entries.map(e => [e.factorKey, `${N(e.value)} ${e.unit || ''}`, e.tier, e.gap])));

  // Annex C
  const C = report.annexes.C;
  children.push(new Paragraph({ text: `Annex C — ${C.title}`, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  children.push(_p(C.note, { italics: true }));
  children.push(_table(['Step', 'Module', 'Quantity', 'Equation', 'Value'],
    C.entries.map(e => [String(e.step), e.module, e.label, e.equation, `${N(e.value)} ${e.unit}`])));

  // Annex D
  if (report.annexes.D) {
    const D = report.annexes.D;
    children.push(new Paragraph({ text: `Annex D — ${D.title}`, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    children.push(_p(D.note, { italics: true, color: 'B45309' }));
    children.push(_table(['Module', 'Label', 'kgCO2e'],
      D.entries.map(e => [e.module, e.label, N(e.value)])));
    children.push(_p(`Annex total: ${N(D.total)} kgCO2e`, { bold: true }));
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

module.exports = { buildPartCReport, buildPartCPDF, buildPartCDOCX };
