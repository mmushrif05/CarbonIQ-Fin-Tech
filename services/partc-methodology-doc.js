/**
 * CarbonIQ FinTech — PCAF Part C: the methodology statement as a document
 *
 * Renders buildMethodology() to PDF and Word from one structured object, on
 * the same primitives as the disclosure and per-assessment reports, so the
 * three documents cannot drift into describing the method differently.
 *
 * The full step-by-step trace is included but placed in an annex: a reviewer
 * reads the chain first and follows a number into the annex when they want
 * to challenge one, rather than wading through 58 steps to reach the point.
 */

'use strict';

const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, HeadingLevel, AlignmentType } = require('docx');

const { N, pdfWriter, _p, _h, _table } = require('./partc-docgen');
const { containsForbiddenLanguage } = require('./pcaf-partc/data-quality');

const _inputs = o => Object.entries(o || {})
  .map(([k, v]) => `${k}=${typeof v === 'number' ? N(v) : v}`).join(', ');

function _guard(m) {
  const prose = [
    m.conformance.statement, m.conformance.disclaimer, m.provenance.why,
    ...m.limits.map(l => l.effect)
  ].filter(Boolean).join('\n');
  const bad = containsForbiddenLanguage(prose);
  if (bad.length) {
    throw new Error(`Methodology blocked: PCAF endorsement language detected (${bad.join(', ')}).`);
  }
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function buildMethodologyPDF(m) {
  _guard(m);
  const doc = new PDFDocument({ margin: 56, size: 'A4', compress: true });
  const { H, P, KV, NOTE, WARN } = pdfWriter(doc);

  doc.fontSize(20).fillColor('#0f172a').font('Helvetica-Bold').text(m.title);
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#64748b').font('Helvetica').text(m.standard);
  doc.moveDown(0.8);
  P(m.provenance.claim);
  doc.moveDown(0.2);
  NOTE(m.provenance.why);
  doc.moveDown(0.3);
  KV('Traced calculation steps in the reference run', String(m.provenance.auditSteps));
  KV('Generated', new Date(m.generatedAt).toISOString().split('T')[0]);

  H('1. Scope and boundary');
  m.scope.tiers.forEach(t => KV(`${t.tier} — ${t.modules}`, t.treatment));
  doc.moveDown(0.3);
  P(m.scope.exclusion);
  doc.moveDown(0.3);
  doc.fontSize(9.5).fillColor('#0f172a').font('Helvetica-Bold').text('Policy gate');
  P(m.scope.policyGate.rule);
  P(m.scope.policyGate.consequence);
  P(m.scope.policyGate.override);
  doc.moveDown(0.3);
  WARN(m.scope.structuralEnforcement);

  H('2. The calculation chain');
  P('Each equation below was read out of an execution of the engine, in the order a project passes through it.');
  m.calculationChain.forEach(c => {
    doc.moveDown(0.45);
    doc.fontSize(10.5).fillColor('#0f172a').font('Helvetica-Bold')
       .text(`${c.module}${c.value !== null ? `  —  ${N(c.value)} ${c.unit}` : ''}`);
    if (c.narrative) { doc.fontSize(9).fillColor('#475569').font('Helvetica').text(c.narrative); }
    c.equations.forEach(eq => doc.fontSize(9).fillColor('#0f172a').font('Courier').text(`   ${eq}`));
    doc.fontSize(8.5).fillColor('#64748b').font('Helvetica-Oblique')
       .text(`   ${c.stepCount} traced step${c.stepCount === 1 ? '' : 's'} — see Annex A`);
  });

  H('3. The policy gate, demonstrated');
  P(m.policyGate.design);
  doc.moveDown(0.4);
  m.policyGate.rows.forEach(r => {
    const fmtv = v => typeof v === 'number' ? (v < 1 && v > 0 ? v.toFixed(6) : N(v)) : String(v);
    doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold')
       .text(`${r.measure}:  CAR ${fmtv(r.CAR)}   |   IDI ${fmtv(r.IDI)}${r.identical ? '   (identical)' : ''}`);
    if (r.note) doc.fontSize(8).fillColor('#64748b').font('Helvetica').text(`   ${r.note}`);
    doc.moveDown(0.2);
  });
  doc.moveDown(0.3);
  doc.fontSize(9.5).fillColor('#0f172a').font('Helvetica-Bold').text('Can a client buy a use stage onto a construction policy?');
  P(m.policyGate.overrideTest.description);
  KV('Use-stage years the gate admits', String(m.policyGate.overrideTest.useStageYears));
  KV('Use stage computed', `${N(m.policyGate.overrideTest.useStage_kgCO2e)} kgCO2e`);
  WARN(m.policyGate.overrideTest.conclusion);
  doc.moveDown(0.4);
  doc.fontSize(9.5).fillColor('#0f172a').font('Helvetica-Bold').text('How the use stage responds to the cover period');
  P('cover   gate      B1        B4        B7    use stage', 9);
  m.policyGate.coverSensitivity.forEach(c => P(
    `${String(c.yearsOfCover).padStart(4)}y  ${String(c.gateYears).padStart(4)}y  ${N(c.b1).padStart(9)} ${N(c.b4).padStart(9)} ${N(c.b7).padStart(9)} ${N(c.useStage).padStart(10)}`, 8.5));
  doc.moveDown(0.2);
  NOTE(m.policyGate.sensitivityNote);

  H('4. Worked example');
  P(m.workedExample.note);
  doc.moveDown(0.3);
  KV('Construction (A4 + A5)', `${N(m.workedExample.construction_kgCO2e)} kgCO2e`);
  KV('Use stage (B1 + B4 + B7)', `${N(m.workedExample.useStage_kgCO2e)} kgCO2e`);
  KV('Attribution factor', m.workedExample.attributionFactor.toFixed(6));
  KV("Insurer's attributed share", `${m.workedExample.insurerIAE_tCO2e.toFixed(4)} tCO2e`);
  KV('Per-m2 construction factor', `${N(m.workedExample.perM2Factor_kgCO2e_m2)} kgCO2e/m2`);
  doc.moveDown(0.3);
  WARN(m.workedExample.scopeWarning);

  doc.addPage();
  doc.fontSize(15).fillColor('#0f172a').font('Helvetica-Bold').text('5. Emission factors');
  doc.moveDown(0.3);
  NOTE(m.factorStore.note);
  doc.moveDown(0.3);
  KV('Tables', String(m.factorStore.tables));
  KV('Factor rows', String(m.factorStore.rowCount));
  KV('By tier', Object.entries(m.factorStore.byTier).map(([t, n]) => `${t} ${n}`).join(' · '));
  if (m.factorStore.localisationNote) { doc.moveDown(0.3); WARN(m.factorStore.localisationNote); }
  doc.moveDown(0.5);
  m.factorStore.rows.forEach(r => {
    doc.fontSize(8.5).fillColor('#0f172a').font('Helvetica-Bold')
       .text(`${r.key}  =  ${r.value} ${r.unit || ''}  [${r.tier}]`);
    if (r.reference) doc.fontSize(8).fillColor('#64748b').font('Helvetica').text(`   ${r.reference}`);
  });

  H('6. Data quality');
  P(`PCAF option to score, ${m.dataQuality.scale}`);
  m.dataQuality.options.forEach(o => P(`   ${o.option} → ${o.score}   ${o.label || ''}`, 9));
  doc.moveDown(0.3);
  KV('Aggregation across a book', m.dataQuality.aggregation);
  doc.moveDown(0.2);
  P(m.dataQuality.whyWeighted);
  P(m.dataQuality.tierRule);

  H('7. Conformance');
  P(m.conformance.statement);
  doc.moveDown(0.2);
  WARN(m.conformance.disclaimer);
  doc.moveDown(0.2);
  NOTE(m.conformance.antiRot);
  doc.moveDown(0.4);
  m.conformance.rules.forEach(r => {
    doc.fontSize(8.5).fillColor('#0f172a').font('Helvetica-Bold').text(`${r.id}  ·  ${r.clause}`);
    doc.fontSize(8.5).fillColor('#334155').font('Helvetica').text(`   ${r.rule}`);
    doc.fontSize(7.5).fillColor('#64748b').text(`   enforced: ${r.implementation}`);
    doc.fontSize(7.5).fillColor('#64748b').text(`   proven by: ${r.provingTest}`);
    doc.moveDown(0.2);
  });

  H('8. Limits, and what is not claimed');
  m.limits.forEach(l => {
    doc.fontSize(9.5).fillColor('#0f172a').font('Helvetica-Bold').text(l.area);
    P(l.limit);
    doc.fontSize(9).fillColor('#475569').font('Helvetica-Oblique').text(`   ${l.effect}`);
    doc.moveDown(0.2);
  });

  H('9. Division of labour');
  KV('The engine', m.divisionOfLabour.engine);
  KV('The language model', m.divisionOfLabour.model);
  doc.moveDown(0.2);
  WARN(m.divisionOfLabour.rule);

  // Annex A — the full trace
  doc.addPage();
  doc.fontSize(15).fillColor('#0f172a').font('Helvetica-Bold').text('Annex A — full calculation trace');
  doc.moveDown(0.3);
  NOTE('Every step the engine executed for the worked example, in order, with the inputs it used and the factors it consulted.');
  doc.moveDown(0.5);
  m.calculationChain.forEach(c => {
    c.steps.forEach(s => {
      doc.fontSize(8.5).fillColor('#0f172a').font('Helvetica-Bold')
         .text(`${s.step}. ${c.module} — ${s.label}: ${N(s.value)} ${s.unit}`);
      if (s.equation) doc.fontSize(8).fillColor('#475569').font('Courier').text(`   ${s.equation}`);
      const inp = _inputs(s.inputs);
      if (inp) doc.fontSize(7.5).fillColor('#64748b').font('Helvetica').text(`   ${inp}`);
      s.factors.forEach(f => doc.fontSize(7.5).fillColor('#64748b')
        .text(`   · ${f.key} = ${f.value} ${f.unit || ''} [${f.tier}]${f.fallback ? ' (fallback)' : ''} ${f.reference || ''}`));
      doc.moveDown(0.15);
    });
  });

  doc.end();
  return doc;
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------

async function buildMethodologyDOCX(m) {
  _guard(m);
  const c = [];

  c.push(new Paragraph({ text: m.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.LEFT }));
  c.push(_p(m.standard, { italics: true, color: '64748B' }));
  c.push(_p(m.provenance.claim, { bold: true }));
  c.push(_p(m.provenance.why, { italics: true }));
  c.push(_table(['Field', 'Value'], [
    ['Traced calculation steps', String(m.provenance.auditSteps)],
    ['Generated', new Date(m.generatedAt).toISOString().split('T')[0]]
  ]));

  c.push(_h('1. Scope and boundary', HeadingLevel.HEADING_1));
  c.push(_table(['Tier', 'Modules', 'Treatment'], m.scope.tiers.map(t => [t.tier, t.modules, t.treatment])));
  c.push(_p(m.scope.exclusion));
  c.push(_h('Policy gate', HeadingLevel.HEADING_2));
  [m.scope.policyGate.rule, m.scope.policyGate.consequence, m.scope.policyGate.override].forEach(t => c.push(_p(t)));
  c.push(_p(m.scope.structuralEnforcement, { italics: true, color: 'B45309' }));

  c.push(_h('2. The calculation chain', HeadingLevel.HEADING_1));
  c.push(_p('Each equation was read out of an execution of the engine, in the order a project passes through it.'));
  c.push(_table(['Module', 'Equation(s) executed', 'Steps', 'Value'],
    m.calculationChain.map(x => [x.module, x.equations.join('  |  '), String(x.stepCount),
      x.value !== null ? `${N(x.value)} ${x.unit}` : '—'])));
  m.calculationChain.filter(x => x.narrative).forEach(x => {
    c.push(_p(`${x.module} — ${x.narrative}`));
  });

  c.push(_h('3. The policy gate, demonstrated', HeadingLevel.HEADING_1));
  c.push(_p(m.policyGate.design));
  c.push(_table(['Measure', 'CAR (construction cover)', 'IDI (cover into occupation)', ''],
    m.policyGate.rows.map(r => {
      const f = v => typeof v === 'number' ? (v < 1 && v > 0 ? v.toFixed(6) : N(v)) : String(v);
      return [r.measure + (r.note ? ` — ${r.note}` : ''), f(r.CAR), f(r.IDI), r.identical ? 'identical' : 'differs'];
    })));
  c.push(_h('Can a client buy a use stage onto a construction policy?', HeadingLevel.HEADING_2));
  c.push(_p(m.policyGate.overrideTest.description));
  c.push(_table(['Measure', 'Value'], [
    ['Use-stage years the gate admits', String(m.policyGate.overrideTest.useStageYears)],
    ['Use stage computed', `${N(m.policyGate.overrideTest.useStage_kgCO2e)} kgCO2e`]
  ]));
  c.push(_p(m.policyGate.overrideTest.conclusion, { bold: true, color: 'B45309' }));
  c.push(_h('How the use stage responds to the cover period', HeadingLevel.HEADING_2));
  c.push(_table(['Cover entered', 'Gate admits', 'B1', 'B4', 'B7', 'Use stage'],
    m.policyGate.coverSensitivity.map(x => [`${x.yearsOfCover} y`, `${x.gateYears} y`,
      N(x.b1), N(x.b4), N(x.b7), N(x.useStage)])));
  c.push(_p(m.policyGate.sensitivityNote, { italics: true }));

  c.push(_h('4. Worked example', HeadingLevel.HEADING_1));
  c.push(_p(m.workedExample.note, { italics: true }));
  c.push(_table(['Measure', 'Value'], [
    ['Construction (A4 + A5)', `${N(m.workedExample.construction_kgCO2e)} kgCO2e`],
    ['Use stage (B1 + B4 + B7)', `${N(m.workedExample.useStage_kgCO2e)} kgCO2e`],
    ['Attribution factor', m.workedExample.attributionFactor.toFixed(6)],
    ["Insurer's attributed share", `${m.workedExample.insurerIAE_tCO2e.toFixed(4)} tCO2e`],
    ['Per-m² construction factor', `${N(m.workedExample.perM2Factor_kgCO2e_m2)} kgCO2e/m²`]
  ]));
  c.push(_p(m.workedExample.scopeWarning, { italics: true, color: 'B45309' }));

  c.push(new Paragraph({ text: '5. Emission factors', heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  c.push(_p(m.factorStore.note, { italics: true }));
  if (m.factorStore.localisationNote) c.push(_p(m.factorStore.localisationNote, { color: 'B45309' }));
  c.push(_table(['Factor', 'Value', 'Unit', 'Tier', 'Source'],
    m.factorStore.rows.map(r => [r.key, String(r.value), r.unit || '', r.tier, r.reference || '—'])));

  c.push(_h('6. Data quality', HeadingLevel.HEADING_1));
  c.push(_table(['Option', 'Score', 'Meaning'],
    m.dataQuality.options.map(o => [o.option, String(o.score), o.label || ''])));
  c.push(_p(m.dataQuality.aggregation, { bold: true }));
  c.push(_p(m.dataQuality.whyWeighted));
  c.push(_p(m.dataQuality.tierRule));

  c.push(new Paragraph({ text: '7. Conformance', heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  c.push(_p(m.conformance.statement, { bold: true }));
  c.push(_p(m.conformance.disclaimer, { italics: true, color: 'B45309' }));
  c.push(_p(m.conformance.antiRot, { italics: true }));
  c.push(_table(['ID', 'Clause', 'Rule', 'Enforced in', 'Proven by'],
    m.conformance.rules.map(r => [r.id, r.clause, r.rule, r.implementation, r.provingTest])));

  c.push(_h('8. Limits, and what is not claimed', HeadingLevel.HEADING_1));
  c.push(_table(['Area', 'Limit', 'Effect'], m.limits.map(l => [l.area, l.limit, l.effect])));

  c.push(_h('9. Division of labour', HeadingLevel.HEADING_1));
  c.push(_table(['Performed by', 'Responsibility'], [
    ['The calculation engine', m.divisionOfLabour.engine],
    ['The language model', m.divisionOfLabour.model]
  ]));
  c.push(_p(m.divisionOfLabour.rule, { bold: true, color: 'B45309' }));

  c.push(new Paragraph({ text: 'Annex A — full calculation trace', heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  c.push(_p('Every step the engine executed for the worked example, in order.', { italics: true }));
  const steps = m.calculationChain.flatMap(x => x.steps.map(s => [
    String(s.step), x.module, s.label, s.equation || '', _inputs(s.inputs),
    `${N(s.value)} ${s.unit}`,
    s.factors.map(f => `${f.key}=${f.value} [${f.tier}]`).join('; ')
  ]));
  c.push(_table(['#', 'Module', 'Quantity', 'Equation', 'Inputs', 'Value', 'Factors'], steps));

  return Packer.toBuffer(new Document({ sections: [{ properties: {}, children: c }] }));
}

module.exports = { buildMethodologyPDF, buildMethodologyDOCX };
