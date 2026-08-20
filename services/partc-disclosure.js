/**
 * CarbonIQ FinTech — PCAF Part C: the annual disclosure
 *
 * The document an insurer publishes for a reporting year, built from the
 * locked assessments in its own book. Where the per-assessment report
 * (partc-reports.js) explains one project, this explains a position.
 *
 * Three properties are deliberate:
 *
 *   Nothing is narrated. Every figure comes from the roll-up, which comes
 *   from locked assessments, which come from the engine. This module
 *   formats; it does not compute, and it never asks a language model for a
 *   number.
 *
 *   Coverage is on the front page, not in an annex. A total drawn from a
 *   fifth of the book means something different from one drawn from all of
 *   it, and a reader who has to hunt for that has been misled by layout.
 *
 *   Conformance, never endorsement. The statement cites the clauses met and
 *   the tests that prove each one, and the language guard blocks the
 *   document if it ever claims PCAF approval.
 *
 * Layout:
 *   1  Reported position          6  Restatements
 *   2  Scope and boundary         7  Prior year and comparability
 *   3  Coverage                   8  Method
 *   4  Data quality               9  Conformance statement
 *   5  Per-policy detail          Annex A/B/C
 */

'use strict';

const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, HeadingLevel, AlignmentType } = require('docx');

const { N, pdfWriter, _p, _h, _table } = require('./partc-docgen');
const { containsForbiddenLanguage } = require('./pcaf-partc/data-quality');
const { conformanceMatrix, STANDARD } = require('./pcaf-partc/conformance');

const portfolio    = require('./partc-portfolio');
const comparatives = require('./partc-comparatives');
const assessments  = require('./partc-assessments');

const DQ_LABEL = {
  1: 'Option 1a — verified primary data',
  2: 'Option 2a — primary emission factors',
  3: 'Option 2b/3a — regional averages',
  4: 'Option 3a — proxy activity data',
  5: 'Option 3b — estimated from spend or area'
};

const _pct = n => (n === null || n === undefined) ? 'n/a' : `${Number(n).toFixed(1)}%`;

// ---------------------------------------------------------------------------
// The structured disclosure
// ---------------------------------------------------------------------------

/**
 * @param {string} orgId
 * @param {number|string} reportingYear
 * @param {Object}  [opts]
 * @param {boolean} [opts.includeAuditTrail=true]  Annex C — per-assessment provenance
 */
async function buildAnnualDisclosure(orgId, reportingYear, opts = {}) {
  const year = Number(reportingYear);
  const includeAuditTrail = opts.includeAuditTrail !== false;

  const [roll, plan, gaps, comp, locked] = await Promise.all([
    portfolio.rollUp(orgId, year),
    portfolio.improvementPlan(orgId, year),
    portfolio.factorGapPriority(orgId, year),
    comparatives.compare(orgId, year),
    assessments.listAssessments(orgId, { reportingYear: year, status: assessments.STATUS.LOCKED })
  ]);

  if (roll.assessments.locked === 0) {
    const err = new Error(
      `No locked assessment exists for FY${year}, so there is nothing to disclose. ` +
      'An assessment must be locked before it can enter a disclosure.');
    err.statusCode = 409;
    err.code = 'NOTHING_TO_DISCLOSE';
    throw err;
  }

  const conformance = conformanceMatrix();

  // Data quality distributed across the book, so a reader can see whether a
  // middling weighted score is uniform or an average of very good and bad.
  const dqBands = {};
  for (const r of roll.rows) {
    const s = r.dataQualityScore;
    dqBands[s] = dqBands[s] || { score: s, label: DQ_LABEL[s] || `Score ${s}`, assessments: 0, kgCO2e: 0 };
    dqBands[s].assessments += 1;
    dqBands[s].kgCO2e += r.construction_kgCO2e;
  }
  const dqDistribution = Object.values(dqBands)
    .map(b => ({ ...b, kgCO2e: Math.round(b.kgCO2e * 100) / 100,
                 sharePct: roll.construction.total_kgCO2e > 0
                   ? Math.round((b.kgCO2e / roll.construction.total_kgCO2e) * 10000) / 100 : 0 }))
    .sort((a, b) => a.score - b.score);

  // Annex A — every material limitation the engine recorded, attributed to
  // the assessment that raised it. Aggregated so one recurring limitation
  // reads as one issue across N projects rather than N separate surprises.
  const limitationIndex = new Map();
  for (const a of locked) {
    for (const l of (a.limitations || [])) {
      const key = `${l.severity}::${l.message}`;
      if (!limitationIndex.has(key)) {
        limitationIndex.set(key, { severity: l.severity, message: l.message, projects: [] });
      }
      limitationIndex.get(key).projects.push(a.projectName);
    }
  }
  const limitations = [...limitationIndex.values()]
    .map(l => ({ ...l, occurrences: l.projects.length }))
    .sort((a, b) => (a.severity === b.severity ? b.occurrences - a.occurrences
      : a.severity === 'material' ? -1 : b.severity === 'material' ? 1 : 0));

  const disclosure = {
    type: 'pcaf-part-c-annual-disclosure',
    title: 'Insurance-Associated Emissions — Annual Disclosure',
    standard: STANDARD,
    meta: {
      insurer: roll.insurer,
      reportingYear: year,
      currency: roll.currency,
      premiumBasis: roll.premiumBasis,
      reportId: `PARTC-IAE-${year}`,
      generatedAt: roll.generatedAt
    },

    // 1 ─────────────────────────────────────────────────────────────────
    position: {
      construction: roll.construction,
      useStage: roll.useStage,
      scopeNote: roll.scopeNote
    },

    // 2 ─────────────────────────────────────────────────────────────────
    scope: {
      mandatory: 'A4 (transport to site) + A5 (construction) — the PCAF figure',
      optional: 'B1 (refrigerant) + B4 (replacement) + B7 (water) — reported separately, never summed with construction',
      excluded: 'A1–A3 embodied product emissions are outside PCAF Part C for insurance-associated emissions, and the voluntary whole-life annex (B2/B5/B8) is excluded from this disclosure entirely.',
      policyGate: 'Construction-only cover (CAR/EAR) carries no use stage: B1, B4 and B7 are zero by scope rule, not by omission. Cover extending into occupation (IDI/Property) runs the use stage over the cover period.'
    },

    // 3 ─────────────────────────────────────────────────────────────────
    coverage: {
      ...roll.coverage,
      statement: `${roll.coverage.assessedPolicies} of ${roll.coverage.policiesInYear} policies in force for FY${year} carry a locked assessment (${roll.coverage.coveragePct}%). The figures above cover those policies only.`
    },

    // 4 ─────────────────────────────────────────────────────────────────
    dataQuality: {
      ...roll.dataQuality,
      distribution: dqDistribution,
      improvement: {
        achievable: plan.achievable,
        note: plan.achievableNote,
        actions: plan.items.slice(0, 5).map(i => ({
          rank: i.rank, projectName: i.projectName, policyRef: i.policyRef,
          sharePct: i.shareOfConstructionPct,
          currentScore: i.currentScore, achievableScore: i.achievableScore,
          actions: i.actions
        }))
      }
    },

    // 5 ─────────────────────────────────────────────────────────────────
    policies: roll.rows,

    // 6 ─────────────────────────────────────────────────────────────────
    restatements: comp.restatements,

    // 7 ─────────────────────────────────────────────────────────────────
    priorYear: {
      year: comp.priorYear,
      hasPrior: comp.hasPrior,
      construction: comp.construction,
      insurerIAE: comp.insurerIAE,
      intensity: comp.intensity,
      dataQuality: comp.dataQuality,
      composition: comp.composition,
      comparabilityNote: comp.comparabilityNote
    },

    // 8 ─────────────────────────────────────────────────────────────────
    method: {
      attribution: `Attribution follows the ${roll.premiumBasis} premium basis. Each policy is attributed against its own project cost and only the results are summed.`,
      aggregation: roll.aggregationNote,
      dataQualityBasis: roll.dataQuality.basis,
      reportingYearBasis: 'A policy is reported in its inception year.',
      lockBasis: 'Only a locked assessment enters this disclosure. A locked assessment is never edited — it is superseded by a new version, and a version that moves the figure by at least the materiality threshold is a restatement carrying a stated reason.'
    },

    // 9 ─────────────────────────────────────────────────────────────────
    conformance: {
      standard: conformance.standard,
      summary: conformance.summary,
      rules: conformance.rules.map(r => ({
        id: r.id, clause: r.clause, rule: r.rule,
        implementation: r.implementation, provingTest: r.test, status: r.status
      })),
      statement:
        `This disclosure has been prepared in conformance with ${STANDARD}. ` +
        'Conformance is a statement by the preparer about method, not an endorsement, approval or certification by PCAF. ' +
        'Each rule above cites the code that enforces it and the test that proves it; the build fails if either ceases to exist.'
    },

    annexes: {
      A: {
        annex: 'A',
        title: 'Assumptions and Limitations',
        note: 'Recorded by the calculation engine at the time each assessment was run, aggregated across the book. A limitation appearing on several projects is listed once with the projects named.',
        total: limitations.length,
        material: limitations.filter(l => l.severity === 'material').length,
        entries: limitations
      },
      B: {
        annex: 'B',
        title: 'Emission Factor Gaps and Research Priority',
        note: gaps.note,
        entries: gaps.factors
      },
      C: includeAuditTrail ? {
        annex: 'C',
        title: 'Assessment Register',
        note: 'Every figure in section 5 traces to one locked assessment, which binds a policy to a BOQ revision and a reporting year. This register is what lets a reader follow a disclosed number back to the bill of quantities behind it.',
        entries: locked.map(a => ({
          assessmentId: a.assessmentId, version: a.version,
          clientName: a.clientName, projectName: a.projectName,
          policyRef: a.policyRef, lineType: a.lineType,
          boqRevision: a.boqRevisionLabel, boqRevisionId: a.boqRevisionId,
          construction_kgCO2e: a.summary.construction_kgCO2e,
          dataQualityOption: a.dataQuality.option,
          lockedAt: a.lockedAt, lockedBy: a.lockedBy,
          supersedes: a.supersedes
        }))
      } : null
    }
  };

  // Language guard — the disclosure claims conformance and nothing more.
  const prose = [
    disclosure.conformance.statement, disclosure.coverage.statement,
    disclosure.priorYear.comparabilityNote, disclosure.restatements.note,
    disclosure.method.attribution, disclosure.method.lockBasis
  ].filter(Boolean).join('\n');
  const offending = containsForbiddenLanguage(prose);
  if (offending.length > 0) {
    throw new Error(`Disclosure blocked: PCAF endorsement language detected (${offending.join(', ')}). Only conformance language is permitted.`);
  }

  return disclosure;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function buildDisclosurePDF(d) {
  const doc = new PDFDocument({ margin: 56, size: 'A4', compress: true });
  const { H, P, KV, NOTE, WARN } = pdfWriter(doc);

  // Cover
  doc.fontSize(20).fillColor('#0f172a').font('Helvetica-Bold').text(d.title);
  doc.moveDown(0.2);
  doc.fontSize(15).fillColor('#0f172a').font('Helvetica-Bold').text(`${d.meta.insurer} — FY${d.meta.reportingYear}`);
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#64748b').font('Helvetica').text(d.standard);
  doc.moveDown(1);
  KV('Report ID', d.meta.reportId);
  KV('Generated', new Date(d.meta.generatedAt).toISOString().split('T')[0]);
  KV('Premium basis', d.meta.premiumBasis);

  // 1
  H('1. Reported position');
  KV(d.position.construction.label, `${N(d.position.construction.total_kgCO2e)} kgCO2e  (${N(d.position.construction.total_tCO2e)} tCO2e)`);
  KV("Insurer's attributed share", `${d.position.construction.insurerIAE_tCO2e.toFixed(4)} tCO2e`);
  KV(d.position.useStage.label, `${N(d.position.useStage.total_kgCO2e)} kgCO2e`);
  KV("Insurer's use-stage share", `${d.position.useStage.insurerShare_tCO2e.toFixed(4)} tCO2e`);
  doc.moveDown(0.4);
  WARN(d.position.scopeNote);

  // 2
  H('2. Scope and boundary');
  KV('Mandatory', d.scope.mandatory);
  KV('Optional', d.scope.optional);
  doc.moveDown(0.3);
  P(d.scope.excluded);
  P(d.scope.policyGate);

  // 3
  H('3. Coverage');
  P(d.coverage.statement);
  if (d.coverage.unassessed.length) {
    doc.moveDown(0.3);
    doc.fontSize(9.5).fillColor('#0f172a').font('Helvetica-Bold').text('Policies in force with no locked assessment');
    d.coverage.unassessed.forEach(u =>
      P(`${u.reference || u.policyId} · ${u.lineType} · ${u.clientName} — ${u.projectName}`));
  }

  // 4
  H('4. Data quality');
  KV('Emissions-weighted score', `${d.dataQuality.weighted} (1 best, 5 worst)`);
  KV('Simple average', String(d.dataQuality.simpleAverage));
  if (d.dataQuality.note) { doc.moveDown(0.2); NOTE(d.dataQuality.note); }
  doc.moveDown(0.4);
  d.dataQuality.distribution.forEach(b =>
    P(`Score ${b.score} — ${b.label}: ${b.assessments} assessment(s), ${_pct(b.sharePct)} of the figure`));
  if (d.dataQuality.improvement.note) { doc.moveDown(0.3); P(d.dataQuality.improvement.note); }
  d.dataQuality.improvement.actions.forEach(a => {
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold')
       .text(`${a.rank}. ${a.projectName} (${_pct(a.sharePct)} of the figure) — score ${a.currentScore} → ${a.achievableScore}`);
    a.actions.forEach(t => P(`   · ${t}`, 8.5));
  });

  // 5
  doc.addPage();
  doc.fontSize(15).fillColor('#0f172a').font('Helvetica-Bold').text('5. Per-policy detail');
  doc.moveDown(0.5);
  d.policies.forEach(r => {
    doc.fontSize(9.5).fillColor('#0f172a').font('Helvetica-Bold')
       .text(`${r.policyRef || r.assessmentId} · ${r.lineType} — ${r.clientName} / ${r.projectName}`);
    doc.fontSize(8.5).fillColor('#334155').font('Helvetica').text(
      `   Construction ${N(r.construction_kgCO2e)} kgCO2e (${_pct(r.shareOfConstructionPct)})   ` +
      `AF ${r.attributionFactor.toFixed(6)}   IAE ${r.insurerIAE_tCO2e.toFixed(4)} tCO2e   ` +
      `DQ ${r.dataQualityScore} (${r.dataQualityOption})   BOQ ${r.boqRevision}   v${r.version}` +
      (r.isRestatement ? '   [restated]' : ''));
    doc.moveDown(0.25);
  });

  // 6
  H('6. Restatements');
  P(d.restatements.note);
  d.restatements.entries.forEach(e => {
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold')
       .text(`${e.policyRef || e.assessmentId} — ${e.projectName}`);
    P(`   As previously reported ${N(e.asPreviouslyReported_kgCO2e)} kgCO2e → as restated ${N(e.asRestated_kgCO2e)} kgCO2e (${e.movementPct >= 0 ? '+' : ''}${e.movementPct}%)`);
    P(`   Reason: ${e.reason || 'not recorded'}`);
  });

  // 7
  H(`7. FY${d.priorYear.year} comparative`);
  if (!d.priorYear.hasPrior) {
    P(d.priorYear.comparabilityNote);
  } else {
    KV('Construction', `FY${d.priorYear.year} ${N(d.priorYear.construction.prior)} → FY${d.meta.reportingYear} ${N(d.priorYear.construction.current)} kgCO2e (${d.priorYear.construction.pct === null ? 'n/a' : `${d.priorYear.construction.pct >= 0 ? '+' : ''}${d.priorYear.construction.pct}%`})`);
    KV('Insurer IAE', `${d.priorYear.insurerIAE.prior} → ${d.priorYear.insurerIAE.current} tCO2e`);
    KV('Intensity (kgCO2e/m²)', `${d.priorYear.intensity.prior ?? 'n/a'} → ${d.priorYear.intensity.current ?? 'n/a'}`);
    KV('Weighted data quality', `${d.priorYear.dataQuality.prior ?? 'n/a'} → ${d.priorYear.dataQuality.current ?? 'n/a'}`);
    KV('Policies assessed', `${d.priorYear.composition.assessedPolicies.prior} → ${d.priorYear.composition.assessedPolicies.current}`);
    if (d.restatements.count > 0) {
      KV(`FY${d.priorYear.year} as previously reported`, `${N(d.restatements.asPreviouslyReported_kgCO2e)} kgCO2e`);
      KV(`FY${d.priorYear.year} as restated`, `${N(d.restatements.asRestated_kgCO2e)} kgCO2e`);
    }
    doc.moveDown(0.4);
    WARN(d.priorYear.comparabilityNote);
  }

  // 8
  H('8. Method');
  P(d.method.attribution);
  P(d.method.aggregation);
  P(d.method.dataQualityBasis);
  P(d.method.reportingYearBasis);
  P(d.method.lockBasis);

  // 9
  H('9. Conformance statement');
  P(d.conformance.statement);
  doc.moveDown(0.3);
  KV('Rules covered', `${d.conformance.summary.total}`);

  // Annexes
  doc.addPage();
  doc.fontSize(15).fillColor('#0f172a').font('Helvetica-Bold').text(`Annex A — ${d.annexes.A.title}`);
  doc.moveDown(0.3); NOTE(d.annexes.A.note); doc.moveDown(0.5);
  d.annexes.A.entries.forEach((e, i) => {
    doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold').text(`${i + 1}. [${e.severity.toUpperCase()}] ×${e.occurrences}`);
    doc.fontSize(9).fillColor('#334155').font('Helvetica').text(e.message);
    doc.fontSize(8).fillColor('#64748b').text(`   ${[...new Set(e.projects)].join(', ')}`);
    doc.moveDown(0.25);
  });

  doc.addPage();
  doc.fontSize(15).fillColor('#0f172a').font('Helvetica-Bold').text(`Annex B — ${d.annexes.B.title}`);
  doc.moveDown(0.3); NOTE(d.annexes.B.note); doc.moveDown(0.5);
  d.annexes.B.entries.forEach(f =>
    P(`${f.rank}. ${f.factorKey} [${f.tier}] — seen in ${f.occurrences}, average share ${f.avgSharePct.toFixed(1)}%`));

  if (d.annexes.C) {
    doc.addPage();
    doc.fontSize(15).fillColor('#0f172a').font('Helvetica-Bold').text(`Annex C — ${d.annexes.C.title}`);
    doc.moveDown(0.3); NOTE(d.annexes.C.note); doc.moveDown(0.5);
    d.annexes.C.entries.forEach(e => {
      doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold')
         .text(`${e.policyRef || e.assessmentId} — ${e.projectName} (v${e.version})`);
      doc.fontSize(8).fillColor('#475569').font('Helvetica').text(
        `   ${N(e.construction_kgCO2e)} kgCO2e · BOQ ${e.boqRevision} · DQ ${e.dataQualityOption} · locked ${e.lockedAt ? String(e.lockedAt).split('T')[0] : 'n/a'} by ${e.lockedBy || 'n/a'}`);
      doc.moveDown(0.2);
    });
  }

  doc.end();
  return doc;
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------

async function buildDisclosureDOCX(d) {
  const c = [];

  c.push(new Paragraph({ text: d.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.LEFT }));
  c.push(_p(`${d.meta.insurer} — FY${d.meta.reportingYear}`, { bold: true, size: 28 }));
  c.push(_p(d.standard, { italics: true, color: '64748B' }));
  c.push(_table(['Field', 'Value'], [
    ['Insurer', d.meta.insurer],
    ['Reporting year', `FY${d.meta.reportingYear}`],
    ['Report ID', d.meta.reportId],
    ['Premium basis', d.meta.premiumBasis],
    ['Generated', new Date(d.meta.generatedAt).toISOString().split('T')[0]]
  ]));

  c.push(_h('1. Reported position', HeadingLevel.HEADING_1));
  c.push(_table(['Line', 'kgCO2e', 'tCO2e', "Insurer's share (tCO2e)"], [
    [d.position.construction.label, N(d.position.construction.total_kgCO2e),
     N(d.position.construction.total_tCO2e), d.position.construction.insurerIAE_tCO2e.toFixed(4)],
    [d.position.useStage.label, N(d.position.useStage.total_kgCO2e),
     N(d.position.useStage.total_tCO2e), d.position.useStage.insurerShare_tCO2e.toFixed(4)]
  ]));
  c.push(_p(d.position.scopeNote, { italics: true, color: 'B45309' }));

  c.push(_h('2. Scope and boundary', HeadingLevel.HEADING_1));
  c.push(_table(['Tier', 'Modules'], [
    ['Mandatory — the PCAF figure', d.scope.mandatory],
    ['Optional — separate line', d.scope.optional]
  ]));
  c.push(_p(d.scope.excluded));
  c.push(_p(d.scope.policyGate));

  c.push(_h('3. Coverage', HeadingLevel.HEADING_1));
  c.push(_p(d.coverage.statement, { bold: true }));
  if (d.coverage.unassessed.length) {
    c.push(_table(['Policy', 'Line', 'Client', 'Project'],
      d.coverage.unassessed.map(u => [u.reference || u.policyId, u.lineType, u.clientName, u.projectName])));
  }

  c.push(_h('4. Data quality', HeadingLevel.HEADING_1));
  c.push(_table(['Measure', 'Value'], [
    ['Emissions-weighted score', `${d.dataQuality.weighted} (1 best, 5 worst)`],
    ['Simple average', String(d.dataQuality.simpleAverage)],
    ['Basis', d.dataQuality.basis]
  ]));
  if (d.dataQuality.note) c.push(_p(d.dataQuality.note, { italics: true }));
  c.push(_table(['Score', 'Option', 'Assessments', 'Share of figure'],
    d.dataQuality.distribution.map(b => [String(b.score), b.label, String(b.assessments), _pct(b.sharePct)])));
  if (d.dataQuality.improvement.note) c.push(_p(d.dataQuality.improvement.note));
  if (d.dataQuality.improvement.actions.length) {
    c.push(_table(['#', 'Project', 'Share', 'Score', 'Achievable', 'What would move it'],
      d.dataQuality.improvement.actions.map(a =>
        [String(a.rank), a.projectName, _pct(a.sharePct), String(a.currentScore),
         String(a.achievableScore), a.actions.join(' ')])));
  }

  c.push(new Paragraph({ text: '5. Per-policy detail', heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  c.push(_table(['Policy', 'Line', 'Client / Project', 'Construction kgCO2e', 'Share', 'AF', 'IAE tCO2e', 'DQ', 'BOQ'],
    d.policies.map(r => [
      (r.policyRef || r.assessmentId) + (r.isRestatement ? ' (restated)' : ''),
      r.lineType, `${r.clientName} / ${r.projectName}`,
      N(r.construction_kgCO2e), _pct(r.shareOfConstructionPct),
      r.attributionFactor.toFixed(6), r.insurerIAE_tCO2e.toFixed(4),
      String(r.dataQualityScore), r.boqRevision
    ])));

  c.push(_h('6. Restatements', HeadingLevel.HEADING_1));
  c.push(_p(d.restatements.note));
  if (d.restatements.entries.length) {
    c.push(_table(['Policy', 'Project', 'As previously reported', 'As restated', 'Movement', 'Reason'],
      d.restatements.entries.map(e => [
        e.policyRef || e.assessmentId, e.projectName,
        N(e.asPreviouslyReported_kgCO2e), N(e.asRestated_kgCO2e),
        `${e.movementPct >= 0 ? '+' : ''}${e.movementPct}%`, e.reason || 'not recorded'
      ])));
  }

  c.push(_h(`7. FY${d.priorYear.year} comparative`, HeadingLevel.HEADING_1));
  if (!d.priorYear.hasPrior) {
    c.push(_p(d.priorYear.comparabilityNote));
  } else {
    c.push(_table(['Measure', `FY${d.priorYear.year}`, `FY${d.meta.reportingYear}`, 'Movement'], [
      ['Construction kgCO2e', N(d.priorYear.construction.prior), N(d.priorYear.construction.current),
       d.priorYear.construction.pct === null ? 'n/a' : `${d.priorYear.construction.pct >= 0 ? '+' : ''}${d.priorYear.construction.pct}%`],
      ["Insurer's IAE tCO2e", String(d.priorYear.insurerIAE.prior), String(d.priorYear.insurerIAE.current),
       d.priorYear.insurerIAE.pct === null ? 'n/a' : `${d.priorYear.insurerIAE.pct >= 0 ? '+' : ''}${d.priorYear.insurerIAE.pct}%`],
      ['Intensity kgCO2e/m²', String(d.priorYear.intensity.prior ?? 'n/a'), String(d.priorYear.intensity.current ?? 'n/a'),
       d.priorYear.intensity.movementPct === null ? 'n/a' : `${d.priorYear.intensity.movementPct >= 0 ? '+' : ''}${d.priorYear.intensity.movementPct}%`],
      ['Weighted data quality', String(d.priorYear.dataQuality.prior ?? 'n/a'), String(d.priorYear.dataQuality.current ?? 'n/a'),
       d.priorYear.dataQuality.movement === null ? 'n/a' : String(d.priorYear.dataQuality.movement)],
      ['Policies assessed', String(d.priorYear.composition.assessedPolicies.prior), String(d.priorYear.composition.assessedPolicies.current), '—'],
      ['Insured area m²', N(d.priorYear.composition.insuredArea_m2.prior), N(d.priorYear.composition.insuredArea_m2.current), '—']
    ]));
    c.push(_p(d.priorYear.comparabilityNote, { italics: true, color: 'B45309' }));
  }

  c.push(_h('8. Method', HeadingLevel.HEADING_1));
  [d.method.attribution, d.method.aggregation, d.method.dataQualityBasis,
   d.method.reportingYearBasis, d.method.lockBasis].forEach(t => c.push(_p(t)));

  c.push(new Paragraph({ text: '9. Conformance statement', heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  c.push(_p(d.conformance.statement, { bold: true }));
  c.push(_table(['Clause', 'Rule', 'Enforced in', 'Proven by'],
    d.conformance.rules.map(r => [r.clause, r.rule, r.implementation, r.provingTest])));

  const A = d.annexes.A;
  c.push(new Paragraph({ text: `Annex A — ${A.title}`, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  c.push(_p(A.note, { italics: true }));
  c.push(_table(['#', 'Severity', 'Seen on', 'Assumption or limitation', 'Projects'],
    A.entries.map((e, i) => [String(i + 1), e.severity, String(e.occurrences), e.message,
      [...new Set(e.projects)].join(', ')])));

  const B = d.annexes.B;
  c.push(new Paragraph({ text: `Annex B — ${B.title}`, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  c.push(_p(B.note, { italics: true }));
  c.push(B.entries.length
    ? _table(['Rank', 'Factor', 'Tier', 'Seen in', 'Average share'],
        B.entries.map(f => [String(f.rank), f.factorKey, f.tier, String(f.occurrences), `${f.avgSharePct.toFixed(1)}%`]))
    : _p('No factor gaps recorded.'));

  if (d.annexes.C) {
    const C = d.annexes.C;
    c.push(new Paragraph({ text: `Annex C — ${C.title}`, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    c.push(_p(C.note, { italics: true }));
    c.push(_table(['Policy', 'Project', 'v', 'kgCO2e', 'BOQ revision', 'Locked', 'By'],
      C.entries.map(e => [e.policyRef || e.assessmentId, e.projectName, String(e.version),
        N(e.construction_kgCO2e), e.boqRevision,
        e.lockedAt ? String(e.lockedAt).split('T')[0] : 'n/a', e.lockedBy || 'n/a'])));
  }

  return Packer.toBuffer(new Document({ sections: [{ properties: {}, children: c }] }));
}

module.exports = { buildAnnualDisclosure, buildDisclosurePDF, buildDisclosureDOCX };
