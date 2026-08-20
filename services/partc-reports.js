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
const { N, winAnsiSafe, _p, _h, _table } = require('./partc-docgen');

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

  winAnsiSafe(doc);

  /* Sections are numbered as they are written rather than by hand: the memo
     is optional, and a report that skipped from 5 to 7 read as though a
     section had been withheld. */
  let _n = 0;
  const H = (t, size = 13) => doc.moveDown(0.8).fontSize(size)
    .fillColor('#0f172a').font('Helvetica-Bold').text(`${++_n}. ${t}`);
  const SUB = t => { doc.moveDown(0.45); doc.fontSize(10).fillColor('#0f172a').font('Helvetica-Bold').text(t); };
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
  H('Result');
  const dq = report.dqScoring;
  const conScore = dq ? `   ·   data quality ${dq.construction.weighted} / 5` : '';
  const useScore = dq ? (dq.useStage.applies ? `   ·   data quality ${dq.useStage.weighted} / 5`
                                             : '   ·   not applicable (scope rule)') : '';
  KV('Construction (A4 + A5) — the PCAF figure', `${N(report.result.construction_kgCO2e)} kgCO2e${conScore}`);
  KV('Use-stage (B1 + B4 + B7) — separate line', `${N(report.result.useStage_kgCO2e)} kgCO2e${useScore}`);
  KV('Attribution factor', report.result.attributionFactor.toFixed(6));
  KV("Insurer's construction IAE", `${report.result.insurerIAE_tCO2e.toFixed(4)} tCO2e${conScore}`);
  KV('Per-m2 construction factor', `${N(report.result.perM2Factor_kgCO2e_m2)} kgCO2e/m2`);
  doc.moveDown(0.4);
  doc.fontSize(8.5).fillColor('#b45309').font('Helvetica-Oblique').text(report.result.scopeWarning);

  // 2 Scope
  H('Scope applied');
  KV('Policy type', report.scope.policyType || 'not stated');
  KV('Use-stage years', String(report.scope.useStageYears));
  P(report.scope.note);

  // 3 Drivers
  H('What drives this number');
  for (const d of report.drivers) {
    P(`${d.module.padEnd(6)}  ${N(d.value).padStart(12)} kgCO2e   ${d.sharePct.toFixed(1)}%   ${d.label}`);
  }

  // 4 A4 Pareto
  H('Material transport (A4) — Pareto vital few');
  if (report.paretoVitalFew.length === 0) P('No materials assessed.');
  for (const v of report.paretoVitalFew) {
    P(`${v.name} — ${N(v.value)} kgCO2e (${(v.contributionPct * 100).toFixed(1)}% of A4)`);
  }

  /* 5 Data quality — one section, not two.
     Two measures live here and they are different things: the PCAF option
     describes the method used, the rubric score describes the evidence
     behind each input. Split across separate sections they read as a
     contradiction (3 against 3.3); together, under their own headings,
     they read as what they are. */
  H('Data quality');
  SUB('PCAF option — the method used');
  KV('Option', `${report.dataQuality.option} — ${report.dataQuality.optionLabel}`);
  KV('Score', `${report.dataQuality.score} (1 best, 5 worst)`);
  KV('Weakest factor tier', report.dataQuality.worstFactorTier || 'n/a');
  P(report.dataQuality.tierNote);

  if (dq) {
    SUB('Reported scores — the evidence behind the inputs');
    KV('Construction (A4 + A5)', `${dq.construction.weighted} / 5`);
    KV('Use stage (B1 + B4 + B7)', dq.useStage.applies
      ? `${dq.useStage.weighted} / 5`
      : 'not applicable to this policy type (scope rule)');
    P(dq.basis, 9);
    P(dq.whyWeighted, 8.5);

    SUB('Module weighting');
    const band = (label, w) => {
      P(label, 9);
      w.rows.forEach(r => P(`   ${r.module.padEnd(5)} ${N(r.emissions).padStart(12)} kgCO2e   score ${r.score}   ${r.weightPct}%   contributes ${r.contribution}`, 8));
      P(`   weighted = ${w.weighted} / 5`, 8.5);
    };
    band('Construction (A4 + A5)', dq.construction);
    if (dq.useStage.applies) band('Use stage (B1 + B4 + B7)', dq.useStage);
    else P(dq.useStage.notApplicableNote, 8.5);

    SUB('Every input the run consumed');
    dq.inputs.forEach(i => P(
      `${String(i.stage || i.module).padEnd(6)} ${i.input.padEnd(20)} ${i.applies === false ? 'n/a' : i.score}   ${i.basis}   [${i.source}]`, 8));
  }

  // 6 Memo
  if (report.memo) { H('Assessment memo'); P(report.memo, 9); }

  // 7 Disclosure
  H('Disclosure statement');
  if (report.dqStatement) {
    P(report.dqStatement);
    doc.moveDown(0.35);
    doc.fontSize(8).fillColor('#64748b').font('Helvetica-Oblique')
       .text('Generated from this execution. Conformance is claimed; endorsement is not.');
    doc.moveDown(0.45);
    SUB('Scope note');
  }
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

  const dqw = report.dqScoring;

  /* The Word document numbers its sections as it writes them, for the same
     reason the PDF does: the memo is optional, and a gap in the numbering
     reads as a withheld section. */
  let _n = 0;
  const SEC = t => _h(`${++_n}. ${t}`, HeadingLevel.HEADING_1);

  children.push(SEC('Result'));
  children.push(_table(['Metric', 'Value', 'Data quality'], [
    ['Construction (A4 + A5) — the PCAF figure', `${N(report.result.construction_kgCO2e)} kgCO2e`,
      dqw ? `${dqw.construction.weighted} / 5` : '—'],
    ['Use-stage (B1 + B4 + B7) — separate line', `${N(report.result.useStage_kgCO2e)} kgCO2e`,
      dqw ? (dqw.useStage.applies ? `${dqw.useStage.weighted} / 5` : 'not applicable (scope rule)') : '—'],
    // Three columns now, so every row carries three cells or the table
    // renders ragged in Word.
    ['Attribution factor', report.result.attributionFactor.toFixed(6), ''],
    ["Insurer's construction IAE", `${report.result.insurerIAE_tCO2e.toFixed(4)} tCO2e`,
      dqw ? `${dqw.construction.weighted} / 5` : ''],
    ['Per-m2 construction factor', `${N(report.result.perM2Factor_kgCO2e_m2)} kgCO2e/m2`, '']
  ]));
  children.push(_p(report.result.scopeWarning, { italics: true, color: 'B45309' }));

  children.push(SEC('Scope applied'));
  children.push(_table(['Field', 'Value'], [
    ['Policy type', report.scope.policyType || 'not stated'],
    ['Use-stage years', String(report.scope.useStageYears)],
    ['Mandatory', report.scope.model.mandatory],
    ['Optional', report.scope.model.optional],
    ['Beyond-PCAF', report.scope.model.beyondPcaf]
  ]));
  children.push(_p(report.scope.note));

  children.push(SEC('What drives this number'));
  children.push(_table(['Module', 'kgCO2e', 'Share', 'Label'],
    report.drivers.map(d => [d.module, N(d.value), `${d.sharePct.toFixed(1)}%`, d.label])));

  children.push(SEC('Material transport (A4) — Pareto vital few'));
  children.push(report.paretoVitalFew.length
    ? _table(['Material', 'kgCO2e', 'Share of A4'],
        report.paretoVitalFew.map(v => [v.name, N(v.value), `${(v.contributionPct * 100).toFixed(1)}%`]))
    : _p('No materials assessed.'));

  /* One data-quality section carrying both measures under their own
     headings. The PCAF option describes the method; the rubric score
     describes the evidence behind each input. Reported as two separate
     sections they read as a contradiction. */
  children.push(SEC('Data quality'));
  children.push(_h('The method used — PCAF option', HeadingLevel.HEADING_2));
  children.push(_table(['Field', 'Value'], [
    ['Option', `${report.dataQuality.option} — ${report.dataQuality.optionLabel}`],
    ['Score', `${report.dataQuality.score} (1 best, 5 worst)`],
    ['Weakest factor tier', report.dataQuality.worstFactorTier || 'n/a'],
    ['Factors used', String(report.dataQuality.factorsUsed)],
    ['Factors with gaps', String(report.dataQuality.factorsWithGaps)]
  ]));
  children.push(_p(report.dataQuality.tierNote));

  if (dqw) {
    children.push(_h('The evidence behind the inputs — reported scores', HeadingLevel.HEADING_2));
    children.push(_table(['Scope', 'Weighted score'], [
      ['Construction (A4 + A5) — the PCAF figure', `${dqw.construction.weighted} / 5`],
      ['Use stage (B1 + B4 + B7) — separate line', dqw.useStage.applies
        ? `${dqw.useStage.weighted} / 5`
        : 'not applicable to this policy type (scope rule)']
    ]));
    children.push(_p(dqw.basis, { italics: true }));

    children.push(_h('The rubric', HeadingLevel.HEADING_2));
    children.push(_table(['Score', 'Meaning', 'Typical evidence'],
      dqw.rubric.map(r => [String(r.score), r.meaning, r.evidence])));

    children.push(_h('Module weighting', HeadingLevel.HEADING_2));
    const band = w => _table(['Module', 'kgCO2e', 'Score', 'Weight', 'Weighted contribution'],
      w.rows.map(r => [r.module, N(r.emissions), String(r.score), `${r.weightPct}%`, String(r.contribution)]));
    children.push(_p('Construction (A4 + A5)', { bold: true }));
    children.push(band(dqw.construction));
    children.push(_p(`Weighted data quality ${dqw.construction.weighted} of 5.`, { bold: true }));
    children.push(_p('Use stage (B1 + B4 + B7)', { bold: true }));
    if (dqw.useStage.applies) {
      children.push(band(dqw.useStage));
      children.push(_p(`Weighted data quality ${dqw.useStage.weighted} of 5.`, { bold: true }));
    } else {
      children.push(_p(dqw.useStage.notApplicableNote));
    }
    children.push(_p(dqw.whyWeighted));

    children.push(_h('Every input the run consumed', HeadingLevel.HEADING_2));
    children.push(_table(['Module', 'Input', 'Basis actually used', 'Score', 'Source'],
      dqw.inputs.map(i => [i.stage || i.module, i.input, i.basis,
        i.applies === false ? 'n/a' : String(i.score), i.source])));
  }

  if (report.memo) {
    children.push(SEC('Assessment memo'));
    for (const line of String(report.memo).split('\n')) children.push(_p(line));
  }

  children.push(SEC('Disclosure statement'));
  if (report.dqStatement) {
    children.push(_p(report.dqStatement, { bold: true }));
    children.push(_p('Generated from this execution. Conformance is claimed; endorsement is not.',
      { italics: true, color: '64748B' }));
    children.push(_h('Scope note', HeadingLevel.HEADING_2));
  }
  children.push(_p(report.disclosureNote));

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
