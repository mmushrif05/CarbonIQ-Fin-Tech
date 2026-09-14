/**
 * CarbonIQ FinTech — the Concept Note package
 *
 * What this is: every input this system holds, laid out in the order a GCF
 * Concept Note reads, so an author opens one document instead of nine screens.
 *
 * What this is NOT, and the distinction is the whole point: it does not write
 * the Concept Note. A GCF submission is an argument made by people who know
 * the sector and carry the institutional commitments behind it. Software that
 * drafted one would produce something fluent and unsupported, and the author
 * would not know which sentences were theirs.
 *
 * ── Three states per input, and the third is the useful one ────────────────
 *
 *   HELD      this system has it, and it traces to a project record.
 *   PARTIAL   some of it is here and the rest is not — named, so a half-filled
 *             field is not mistaken for a finished one.
 *   EXTERNAL  it cannot come from here at all. An ESIA, a gender assessment,
 *             an NDA no-objection letter, a feasibility study, a signed
 *             co-financing commitment. These are documents and legal
 *             instruments, not fields, and no amount of modelling produces one.
 *
 * The external list is the deliverable most people actually need: it is the
 * worklist that stands between a pipeline entry and a submission, and until
 * somebody writes it down it is carried in one person's head.
 *
 * A package is never called complete while an external input is outstanding.
 */

'use strict';

const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, HeadingLevel } = require('docx');

const { N, pdfWriter, winAnsiSafe } = require('../../pcaf-part-c/reporting/partc-docgen');
/* The Word primitives are platform, not Part C: this used to import them by
   their private names across the boundary between two of the three scopes that
   must never merge. */
const { para: _p, heading: _h, table: _table } = require('../../../platform/reporting/docx');

const emissions = require('../domain/emissions');
const ndc = require('../domain/ndc-contribution');
const screening = require('../domain/screening');
const instruments = require('../domain/instruments');
const record = require('../domain/record');

const HELD = 'held';
const PARTIAL = 'partial';
const EXTERNAL = 'external';

const _v = (t) => {
  if (t === null || t === undefined) return null;
  if (typeof t === 'object' && 'value' in t) return t.value;
  return t;
};
const money = (n) => (n === null || n === undefined ? null : `USD ${Number(n).toLocaleString('en-US')}`);

/** One input line. `needs` is what to go and get, and only an external has one. */
const held = (label, value, source) => ({ label, status: HELD, value, source: source || 'Project record' });
const partial = (label, value, missing) => ({ label, status: PARTIAL, value, missing });
const external = (label, needs, who) => ({ label, status: EXTERNAL, value: null, needs, from: who });

/* An external input that the bank has since recorded as obtained — a document
   reference, a safeguards status, a letter — is held, with its reference as
   the source. The worklist shrinks as the bank works, which is the only way a
   readiness figure can move. */
const document = (project, kind) => (project.documents || []).find(d => d && d.kind === kind) || null;
const docLine = (project, kind, label, needs, who) => {
  const d = document(project, kind);
  return d ? held(label, `${d.title}${d.version ? ` (${d.version})` : ''}${d.date ? ` — ${d.date}` : ''}`,
    d.reference || 'Recorded on the project') : external(label, needs, who);
};
const safeguardLine = (project, key, label, needs, who) => {
  const st = (project.safeguards || {})[key];
  if (st && st.status === 'complete') return held(label, `Complete${st.date ? ` — ${st.date}` : ''}`, st.reference || 'Recorded on the project');
  if (st && st.status === 'in_progress') return partial(label, `In progress${st.date ? ` — ${st.date}` : ''}`, needs);
  return external(label, needs, who);
};
const stageLabel = (stage) => (require('../domain/cycle').STAGE_INFO[stage] || { label: stage }).label;

const fpicRequired = (project) => Boolean((project.safeguards && project.safeguards.fpic && project.safeguards.fpic.required)
  || (project.essFlags || []).includes('fpic_required'));

function fpicLine(project) {
  const f = (project.safeguards || {}).fpic || {};
  const label = 'Free, Prior and Informed Consent (FPIC) process record';
  const needs = 'Indigenous Peoples policy applies. FPIC is a process with affected communities, '
    + 'evidenced by its record — it is not a document that can be drafted for them.';
  if (f.status === 'obtained') return held(label, `Obtained${f.communities ? ` — ${f.communities}` : ''}`, f.note || 'Recorded on the project');
  if (f.status === 'in_progress') return partial(label, `In progress${f.communities ? ` with ${f.communities}` : ''}`, needs);
  return external(label, needs, 'Affected communities, facilitated independently');
}

function genderLine(project) {
  const s = project.safeguards || {};
  const a = s.genderAssessment && s.genderAssessment.status === 'complete';
  const b = s.genderActionPlan && s.genderActionPlan.status === 'complete';
  const label = 'Gender assessment and gender action plan';
  const needs = 'Mandatory for every GCF funding proposal. GESI applies across all NDC 3.0 actions.';
  if (a && b) return held(label, 'Assessment and action plan complete', (s.genderActionPlan.reference || s.genderAssessment.reference) || 'Recorded on the project');
  if (a || b) return partial(label, a ? 'Assessment complete; action plan outstanding' : 'Action plan complete; assessment outstanding', needs);
  return external(label, needs, 'Gender specialist');
}

function ndaLine(project) {
  const n = project.nda || {};
  const label = 'NDA no-objection letter';
  const needs = 'Written no-objection from Sri Lanka\'s National Designated Authority. A legal '
    + 'instrument; no analysis substitutes for it.';
  if (n.status === 'issued') return held(label, `Issued${n.issuedAt ? ` ${n.issuedAt}` : ''}${n.reference ? ` — ${n.reference}` : ''}`, 'National Designated Authority');
  if (n.status === 'requested') return partial(label, `Requested${n.requestedAt ? ` ${n.requestedAt}` : ''}`, needs);
  return external(label, needs, 'National Designated Authority');
}

function cofinancingLine(project) {
  const c = Array.isArray(project.coFinancing) ? project.coFinancing : [];
  const label = 'Signed co-financing commitments';
  const needs = 'Letters of commitment from each co-financier. GCF sets no minimum co-financing '
    + 'requirement, but a co-financing figure stated without a commitment behind it is not '
    + 'evidence.';
  if (!c.length) return external(label, needs, 'Co-financiers');
  const evidenced = c.filter(x => x.status === 'letter_received');
  const summary = c.map(x => `${x.name} ${money(x.amount)} — ${x.status.replace(/_/g, ' ')}`).join('; ');
  if (evidenced.length === c.length) return held(label, summary, 'Co-financing letters recorded on the project');
  return partial(label, summary, `${c.length - evidenced.length} of ${c.length} co-financier(s) without a letter on record.`);
}

/**
 * The package for one project.
 */
function buildPackage(project, { accreditation = {}, sample = false, sampleNote = null } = {}) {
  const e = emissions.projectEmissions(project);
  const contribution = ndc.projectContribution(project);
  const gate = screening.screenOne(project, { accreditation });
  const structuring = instruments.structureFor(project, { accreditation });
  const f = project.financing || {};

  const sections = [
    {
      id: 'A',
      title: 'Project / Programme Summary',
      fields: [
        held('Project title', project.name),
        held('Accredited entity', 'DFCC Bank PLC — Direct Access Entity'),
        held('Accreditation decision', accreditation.decision || null),
        held('Country', 'Sri Lanka'),
        held('Location', [project.location?.province, ...(project.location?.districts || [])]
          .filter(Boolean).join(' — ')),
        held('GCF results area', `${project.resultsArea} (${project.stream})`),
        held('Project size', `${money(f.totalCost)} — within DFCC's ${accreditation.sizeCategory} accreditation`),
        held('Environmental and social category', project.essCategory),
        held('Stage', stageLabel(project.stage)),
        project.executingEntity && project.executingEntity.name
          ? (project.executingEntity.trackRecord
            ? held('Executing entity and its track record', `${project.executingEntity.name} — ${project.executingEntity.trackRecord}`)
            : partial('Executing entity and its track record', project.executingEntity.name, 'The entity is named; its delivery record is not.'))
          : external('Executing entity and its track record',
            'The entity that will implement the project, its legal status and its delivery record.',
            'DFCC origination'),
      ],
    },
    {
      id: 'B',
      title: 'Project / Programme Details',
      fields: [
        held('Sector', project.sector),
        held('Barriers this project addresses',
          structuring.barriers.map(b => b.label).join('; ') || null),
        held('Baseline and counterfactual',
          `${e.mitigation.baseline.description} — ${e.mitigation.baseline.counterfactual}`),
        held('Baseline type', e.mitigation.baseline.type),
        project.narrative && project.narrative.theoryOfChange
          ? held('Theory of change', project.narrative.theoryOfChange)
          : external('Theory of change',
            'The causal chain from activities to the result, and why it holds here. GCF reads this '
            + 'as the core of the argument; it is a sector judgement, not a computation.',
            'Project developer with DFCC'),
        external('Detailed activity description and implementation timetable',
          'Work packages, sequencing, procurement approach and delivery milestones.',
          'Feasibility study'),
        docLine(project, 'feasibility_study', 'Feasibility study or pre-feasibility assessment',
          'Technical and economic feasibility at the depth GCF requires for the project stage.',
          'Project developer'),
      ],
    },
    {
      id: 'C',
      title: 'Financing Information',
      fields: [
        held('Total project cost', money(f.totalCost)),
        held('GCF funding requested', money(f.gcfAsk)),
        held('DFCC contribution', money(f.dfcc)),
        held('Other co-financing', `${money(f.other)}${f.otherLabel ? ` — ${f.otherLabel}` : ''}`),
        held('Financial instrument', f.instrument),
        f.grantEquivalentPct
          ? held('Grant-equivalent subsidy', `${_v(f.grantEquivalentPct)}% (${f.grantEquivalentPct.tier})`)
          : partial('Grant-equivalent subsidy', null,
            'Not recorded. GCF asks for it first when testing minimum concessionality.'),
        held('Viability without GCF support',
          `${f.viabilityWithoutGcf?.viable ? 'Viable' : 'Not viable'} — ${f.viabilityWithoutGcf?.reason}`),
        held('Minimum concessionality',
          structuring.concessionality.minimumConcessionality || structuring.concessionality.finding || null),
        held('Recommended structure',
          structuring.recommended
            ? `${structuring.recommended.name} — ${structuring.recommended.basis}`
            : structuring.recommendedNote),
        cofinancingLine(project),
        docLine(project, 'financial_model', 'Financial model',
          'Cash-flow model with the assumptions behind the viability statement above.',
          'Project developer'),
      ],
    },
    {
      id: 'D',
      title: 'Expected Performance against the Investment Criteria',
      fields: [
        held('Impact potential — mitigation',
          e.mitigation.countsInHeadline
            ? `${N(e.mitigation.annual_tCO2e)} tCO2e/yr; ${N(e.mitigation.lifetime_tCO2e)} tCO2e lifetime`
            : `${N(e.mitigation.annual_tCO2e)} tCO2e/yr as an adaptation co-benefit — not a `
              + 'mitigation claim and not ranked as one'),
        held('Impact potential — beneficiaries',
          `${N(_v(project.beneficiaries?.direct))} direct; ${N(_v(project.beneficiaries?.indirect))} indirect `
          + '(separate GCF core indicators, never added)'),
        held('Country ownership — NDC 3.0 alignment',
          contribution.sectorTargets.map(t => `${t.id}: ${t.sector}`).join('; ') || 'No sector target cited'),
        held('Efficiency and effectiveness — mobilisation',
          f.gcfAsk ? `${(f.totalCost / f.gcfAsk).toFixed(2)}x total cost per USD of GCF ask` : null),
        ...screening.GCF_CRITERIA.filter(c => !c.scored).map(c =>
          external(`${c.name}`, c.reason, 'Sector and country specialists')),
        ndaLine(project),
      ],
    },
    {
      id: 'E',
      title: 'Logical Framework — GCF core indicators',
      fields: [
        held('Mitigation Core Indicator 1 (tCO2eq reduced, avoided or removed)',
          `${N(e.mitigation.lifetime_tCO2e)} tCO2e over the asset life — evidence tier `
          + `${e.mitigation.tier}`),
        held('Contribution within the NDC period (2026-2035)',
          contribution.reduction.applies
            ? `${N(contribution.reduction.cumulative_tCO2e)} tCO2e reduction`
            : `${N(contribution.removal.cumulative_tCO2e)} tCO2e removal — reported separately from `
              + 'reduction, never summed with it'),
        held('Adaptation Core Indicator 1 — direct beneficiaries',
          `${N(_v(project.beneficiaries?.direct))} (${project.beneficiaries?.direct?.tier})`),
        held('Adaptation Core Indicator 2 — indirect beneficiaries',
          `${N(_v(project.beneficiaries?.indirect))} (${project.beneficiaries?.indirect?.tier})`),
        held('Assumption behind the period figure', contribution.basis.assumption),
        partial('Disaggregation of beneficiaries by sex',
          project.beneficiaries?.womenPct ? `${_v(project.beneficiaries.womenPct)}% women `
            + `(${project.beneficiaries.womenPct.tier})` : null,
          'A district population share is not a project beneficiary disaggregation. GCF requires '
          + 'it disaggregated at source.'),
        docLine(project, 'me_plan', 'Monitoring and evaluation arrangements',
          'Who measures each indicator, how often, and against what verification protocol.',
          'DFCC with the executing entity'),
      ],
    },
    {
      id: 'F',
      title: 'Risk Assessment and Management',
      fields: [
        held('Environmental and social category', `${project.essCategory} — within DFCC's `
          + `${accreditation.essCategory} accreditation`),
        held('Screening outcome', `${gate.status}${gate.flags.length
          ? ` — ${gate.flags.length} item(s) to resolve` : ''}`),
        ...(gate.flags.length
          ? [held('Items to resolve', gate.flags.map(fl => fl.detail).join(' | '))]
          : []),
        held('Barriers left standing by the recommended structure',
          structuring.barriersLeftStanding.length
            ? structuring.barriersLeftStanding.map(b => b.label).join('; ')
            : 'None recorded'),
        ...(structuring.structuralGap
          ? [held('Deliverability finding', structuring.structuralGap.note)]
          : []),
        held('Structuring watch-out', structuring.recommended?.watchOut || null),
        docLine(project, 'risk_register', 'Full risk register',
          'Technical, financial, political, social and environmental risks with likelihood, impact '
          + 'and mitigation, at the depth GCF requires.',
          'Project developer with DFCC risk'),
      ],
    },
    {
      id: 'G',
      title: 'GCF Policies and Standards',
      fields: [
        held('Safeguards framework applied',
          'IFC Performance Standards 1-8, applied on a scaled risk basis as GCF\'s interim '
          + 'environmental and social safeguards.'),
        held('Accreditation modalities held',
          (accreditation.modalities || []).join(', ')),
        held('Grant modality', accreditation.grantModality === false
          ? `Not held. ${accreditation.grantNote || ''}`.trim()
          : 'Held'),
        safeguardLine(project, ['C', 'I-3'].includes(project.essCategory) ? 'esap' : 'esmp',
          'Environmental and social impact assessment (ESIA) or ESMP',
          'Scaled to the category. A category B project requires an ESMP at minimum.',
          'Qualified E&S consultant'),
        genderLine(project),
        ...(fpicRequired(project)
          ? [fpicLine(project)]
          : []),
        safeguardLine(project, 'grm', 'Grievance redress mechanism',
          'One of DFCC\'s three open accreditation conditions. Its report is due to the GCF '
          + 'Secretariat.',
          'DFCC compliance'),
        external('Anti-money-laundering and counter-terrorist-financing screening',
          'On the executing entity and material counterparties.',
          'DFCC compliance'),
      ],
    },
    {
      id: 'H',
      title: 'Annexes',
      fields: [
        held('Evidence register',
          `${record.tracedFigures(project).length} traced figures, weakest tier `
          + `${record.weakestTier(project)}`),
        held('Emission factor provenance',
          e.mitigation.baseline.gridEF_tCO2e_per_mwh !== null
            ? `Grid factor ${e.mitigation.baseline.gridEF_tCO2e_per_mwh} tCO2e/MWh `
              + `(${e.mitigation.baseline.gridEFTier})`
            : 'No grid emission factor applies to this project'),
        held('Arithmetic check', e.check.verifiable
          ? `Recomputed and ${e.check.agrees ? 'agrees' : 'DIVERGES'} — see the emissions model`
          : 'No independent recomputation path from the data held'),
        docLine(project, 'map', 'Maps and site information', 'Project location maps and site descriptions.', 'Project developer'),
        docLine(project, 'procurement_plan', 'Procurement plan',
          'Procurement disclosure is one of DFCC\'s three open accreditation conditions.',
          'DFCC procurement'),
      ],
    },
  ];

  const all = sections.flatMap(s => s.fields);
  const externals = all.filter(x => x.status === EXTERNAL);
  const partials = all.filter(x => x.status === PARTIAL);
  const helds = all.filter(x => x.status === HELD);

  return {
    meta: {
      code: project.code,
      id: project.id,
      name: project.name,
      stream: project.stream,
      resultsArea: project.resultsArea,
      accreditedEntity: 'DFCC Bank PLC',
      generatedAt: new Date().toISOString(),
      sample,
      sampleNote: sample ? sampleNote : null,
    },
    readiness: {
      total: all.length,
      held: helds.length,
      partial: partials.length,
      external: externals.length,
      pctHeld: Math.round((helds.length / all.length) * 1000) / 10,
      complete: externals.length === 0 && partials.length === 0,
      note: 'A Concept Note is not complete while an external input is outstanding. The count '
        + 'below is what this system holds, not how close the submission is — the external '
        + 'inputs are documents and legal instruments, and several of them take months.',
    },
    sections,
    /* The worklist. Until somebody writes this down it lives in one person's
       head, and that is where submissions are lost. */
    externalInputs: externals.map(x => ({ input: x.label, needs: x.needs, from: x.from })),
    partialInputs: partials.map(x => ({ input: x.label, held: x.value, missing: x.missing })),
    limits: 'This package assembles the inputs this system holds, in GCF Concept Note order. It '
      + 'does not write the Concept Note, score a proposal on GCF\'s behalf, substitute for an '
      + 'ESIA or an FPIC consultation, produce the NDA no-objection letter, or confirm '
      + 'co-financing. Those are judgements, processes and legal instruments.',
  };
}

/* ── Renderers ─────────────────────────────────────────────────────────── */

const STATUS_LABEL = { held: 'HELD', partial: 'PARTIAL', external: 'EXTERNAL' };

function buildPackagePDF(pkg) {
  const doc = new PDFDocument({ margin: 56, size: 'A4', compress: true, pdfVersion: '1.4' });
  winAnsiSafe(doc);
  const { H, P, KV, NOTE, WARN } = pdfWriter(doc);

  doc.fontSize(19).fillColor('#0f172a').font('Helvetica-Bold')
    .text('GCF Concept Note — input package');
  doc.moveDown(0.2);
  doc.fontSize(12).fillColor('#334155').font('Helvetica').text(`${pkg.meta.code} — ${pkg.meta.name}`);
  doc.moveDown(0.5);
  KV('Accredited entity', pkg.meta.accreditedEntity);
  KV('Results area', `${pkg.meta.resultsArea} (${pkg.meta.stream})`);
  KV('Generated', pkg.meta.generatedAt.split('T')[0]);
  KV('Inputs held', `${pkg.readiness.held} of ${pkg.readiness.total} (${pkg.readiness.pctHeld}%)`);
  KV('Outstanding', `${pkg.readiness.external} external, ${pkg.readiness.partial} partial`);

  if (pkg.meta.sample) {
    doc.moveDown(0.4);
    WARN('SAMPLE DATA — the figures in this package are illustrative and are not DFCC\'s book.');
  }

  doc.moveDown(0.4);
  NOTE(pkg.limits);

  for (const s of pkg.sections) {
    H(`Section ${s.id} — ${s.title}`);
    for (const fld of s.fields) {
      doc.moveDown(0.25);
      doc.fontSize(9).fillColor(fld.status === EXTERNAL ? '#b45309' : '#64748b')
        .font('Helvetica-Bold').text(`[${STATUS_LABEL[fld.status]}] `, { continued: true });
      doc.fillColor('#0f172a').text(fld.label);
      if (fld.value) P(String(fld.value));
      if (fld.needs) WARN(`Needs: ${fld.needs}${fld.from ? `  (from: ${fld.from})` : ''}`);
      if (fld.missing) WARN(`Missing: ${fld.missing}`);
    }
  }

  H('Outstanding external inputs');
  P('These cannot come from this system. They are the worklist between a pipeline entry and a '
    + 'submission.');
  pkg.externalInputs.forEach((x, i) => {
    doc.moveDown(0.25);
    doc.fontSize(9.5).fillColor('#0f172a').font('Helvetica-Bold').text(`${i + 1}. ${x.input}`);
    P(x.needs);
    NOTE(`From: ${x.from}`);
  });

  doc.end();
  return doc;
}

async function buildPackageDOCX(pkg) {
  const children = [
    new Paragraph({ text: 'GCF Concept Note — input package', heading: HeadingLevel.TITLE }),
    _p(`${pkg.meta.code} — ${pkg.meta.name}`, { bold: true, size: 26 }),
    _p(`Accredited entity: ${pkg.meta.accreditedEntity}`),
    _p(`Results area: ${pkg.meta.resultsArea} (${pkg.meta.stream})`),
    _p(`Inputs held: ${pkg.readiness.held} of ${pkg.readiness.total} (${pkg.readiness.pctHeld}%) — `
      + `${pkg.readiness.external} external and ${pkg.readiness.partial} partial outstanding`),
  ];

  if (pkg.meta.sample) {
    children.push(_p('SAMPLE DATA — the figures in this package are illustrative and are not '
      + "DFCC's book.", { bold: true }));
  }
  children.push(_p(pkg.limits, { italics: true }));

  for (const s of pkg.sections) {
    children.push(_h(`Section ${s.id} — ${s.title}`, HeadingLevel.HEADING_1));
    children.push(_table(
      ['Status', 'Input', 'Value / what is needed'],
      s.fields.map(f => [
        STATUS_LABEL[f.status],
        f.label,
        f.value ? String(f.value) : (f.needs || f.missing || ''),
      ]),
    ));
  }

  children.push(_h('Outstanding external inputs', HeadingLevel.HEADING_1));
  children.push(_p('These cannot come from this system.'));
  children.push(_table(
    ['#', 'Input', 'What is needed', 'From'],
    pkg.externalInputs.map((x, i) => [String(i + 1), x.input, x.needs, x.from || '']),
  ));

  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

module.exports = {
  buildPackage, buildPackagePDF, buildPackageDOCX,
  HELD, PARTIAL, EXTERNAL,
};
