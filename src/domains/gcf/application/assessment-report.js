// @ts-check
/**
 * The signable GCF assessment report — Phase 1 Stage 5.
 *
 * The document the assessor's validation produces: the appraisal a credit
 * committee reads and the assessor signs. It is built from what is already
 * recorded — the project, the validation (Stage 4), the engine's own evidence
 * coverage of the six criteria and the results logframe — and rendered through
 * the platform report standard, the one renderer Part A and Part C also use,
 * so this document shares their furniture without either scope importing the
 * other.
 *
 * ── What it is, and what it is not ──────────────────────────────────────────
 *
 * It is DFCC's own appraisal of a candidate, signed off by a named assessor.
 * It is **not** a GCF decision, an endorsement or a disclosure: the Fund
 * appraises a proposal, and nothing here speaks for it. So the report carries
 * no PCAF conformance language and makes no GCF endorsement claim; the sign-off
 * block names the assessor and states plainly that this is the bank's own view.
 *
 * ── The ratings are the assessor's words, beside the engine's evidence ──────
 *
 * Each of the six investment criteria carries two things that are never
 * conflated: the engine's **evidence coverage** (what the record holds —
 * evidenced / partial / absent, from `criteria.js`) and the assessor's
 * **rating** (their judgement — strong / adequate / weak, from the validation).
 * Neither is a number, for the reason the whole GCF module keeps numbers off
 * appraisal: a figure here would be read as a GCF or a PCAF score.
 *
 * ── A draft is told apart from a sign-off ───────────────────────────────────
 *
 * The report can be produced at any point in the lifecycle. Where the
 * assessment is not validated the sign-off block says so — "not yet validated"
 * with the current state — rather than printing an empty signature, which a
 * reader would take for a completed one. Nothing is invented to fill a gap.
 */

'use strict';

const crypto = require('crypto');
const { b, keep } = require('../../../platform/reporting/report-standard/blocks');
const { renderStandardPDF } = require('../../../platform/reporting/report-standard/render-pdf');
const { renderStandardDOCX } = require('../../../platform/reporting/report-standard/render-docx');
const { canonical } = require('../../../shared/checksum');
const config = require('../../../platform/config');
const criteria = require('../domain/criteria');
const validation = require('../domain/validation');

const STATE_LABEL = { draft: 'Draft', under_review: 'Under review', validated: 'Validated' };
const RATING_LABEL = { strong: 'Strong', adequate: 'Adequate', weak: 'Weak' };
const REC_LABEL = {
  recommend: 'Recommend',
  recommend_with_conditions: 'Recommend with conditions',
  not_recommend: 'Do not recommend',
};
const COVERAGE_LABEL = { evidenced: 'Evidenced', partial: 'Partial', absent: 'Absent' };

const day = s => (s ? String(s).slice(0, 10) : null);

/**
 * The facts the document rests on, drawn from what is already recorded — the
 * project, its validation, the engine's evidence coverage and the logframe.
 * @param {any} project  the recorded project
 * @param {object} [ctx] { logframe }  the logframe rows, if the caller has them
 */
function assessmentFacts(project, { logframe = null } = {}) {
  const val = validation.current(project);
  const crit = criteria.assess(project);
  const publishedAt = new Date().toISOString();

  const ratedCriteria = crit.criteria.map(c => ({
    id: c.id,
    label: c.label,
    scoredByEngine: c.scoredByEngine,
    coverage: c.status,
    coverageLabel: COVERAGE_LABEL[c.status] || c.status,
    rating: (val.ratings[c.id] && val.ratings[c.id].rating) || null,
    ratingLabel: (val.ratings[c.id] && RATING_LABEL[val.ratings[c.id].rating]) || 'Not rated',
    ratingNote: (val.ratings[c.id] && val.ratings[c.id].note) || null,
  }));

  /* The report reference is deterministic over the canonical facts, the build
     commit and the validation — so one assessment rendered twice is one
     reference, and a filed copy can be matched to what produced it. The
     publication instant is outside the hash, so two renders of one position
     carry one reference. */
  const commit = (config.runtime.build && config.runtime.build.commit) ? String(config.runtime.build.commit).slice(0, 12) : null;
  const content = canonical({
    id: project.id, code: project.code, name: project.name,
    validation: { state: val.state, ratings: val.ratings, recommendation: val.recommendation },
    commit,
  });
  const reportId = 'GCF-ASSESS-' + crypto.createHash('sha256').update(content).digest('hex').slice(0, 12).toUpperCase();

  return {
    project,
    validation: val,
    ratedCriteria,
    logframe: (logframe && logframe.rows) || null,
    stateLabel: STATE_LABEL[val.state] || val.state,
    validated: val.state === 'validated',
    recommendationLabel: val.recommendation ? (REC_LABEL[val.recommendation] || val.recommendation) : null,
    publishedAt,
    reportId,
    commit,
    safeName: `gcf-assessment-${String(project.code || project.id).replace(/[^A-Za-z0-9_-]/g, '')}`,
  };
}

function summarySection(f) {
  const p = f.project;
  const money = p.financing || {};
  const usd = n => (Number.isFinite(Number(n)) ? `USD ${Number(n).toLocaleString('en-US')}` : '—');
  return {
    id: 'summary',
    title: 'Project and appraisal summary',
    blocks: keep([
      b.body(`This is DFCC Bank’s own appraisal of ${p.name} (${p.code}), a ${p.stream} candidate `
        + `for the Green Climate Fund. It records what the bank holds on the project and the assessor’s `
        + `judgement of it. It is not a decision of the Fund and makes no claim on the Fund’s behalf.`),
      b.table({
        head: ['Field', 'Value'], widths: [1.8, 4.2],
        rows: [
          ['Project', `${p.name} (${p.code})`],
          ['Stream', p.stream],
          ['Sector', p.sector || '—'],
          ['Results area', p.resultsArea || '—'],
          ['Stage', p.stage || '—'],
          ['Environmental and social category', p.essCategory || '—'],
          ['Total cost', usd(money.totalCost)],
          ['GCF ask', usd(money.gcfAsk)],
          ['Validation state', f.stateLabel],
        ],
      }),
    ]),
  };
}

function criteriaSection(f) {
  return {
    id: 'criteria',
    title: 'The six investment criteria',
    blocks: keep([
      b.body('For each criterion, two things kept apart: the evidence the record holds, and the '
        + 'assessor’s rating of it. The rating is a judgement in words, never a number, and it is '
        + 'the assessor’s — not a recomputation of the evidence coverage beside it. Three criteria '
        + 'the screening engine can score from data; the other three rest on judgement the engine does not hold.'),
      b.table({
        head: ['Criterion', 'Evidence on the record', 'Assessor rating', 'Note'],
        widths: [1.9, 1.3, 1.1, 1.7], align: ['left', 'left', 'left', 'left'], zebra: true,
        rows: f.ratedCriteria.map(c => [
          `${c.label}${c.scoredByEngine ? '' : ' (judgement)'}`,
          c.coverageLabel,
          c.ratingLabel,
          c.ratingNote || '',
        ]),
      }),
    ]),
  };
}

function resultsSection(f) {
  const rows = (f.logframe || []).filter(r => r.present);
  const val = t => (t && typeof t === 'object' && Number.isFinite(t.value) ? `${Number(t.value).toLocaleString('en-US')} (${t.tier})` : '—');
  return {
    id: 'results',
    title: 'Results — IRMF core indicators',
    blocks: keep([
      b.body('Each core indicator from its baseline to its target by a year. Direct and indirect '
        + 'beneficiaries are two indicators and are never summed; every figure carries its evidence tier.'),
      rows.length ? b.table({
        head: ['Indicator', 'Baseline', 'Current', 'Target', 'By'],
        widths: [2.2, 1, 1, 1, 0.8], align: ['left', 'right', 'right', 'right', 'right'], zebra: true,
        rows: rows.map(r => [
          `${r.name}${r.unit ? ` (${r.unit})` : ''}`,
          val(r.baseline), val(r.current), val(r.target),
          r.targetYear ? String(r.targetYear) : '—',
        ]),
      }) : b.body('No baseline or target has been recorded for any core indicator yet.'),
    ]),
  };
}

function recommendationSection(f) {
  const val = f.validation;
  const blocks = [];
  if (f.validated) {
    blocks.push(b.callout(
      `${f.recommendationLabel}. Signed off by ${val.validatedBy || 'the assessor'} on ${day(val.validatedAt) || '—'}.`,
      'Assessor recommendation'));
    if (val.recommendationNote) blocks.push(b.body(val.recommendationNote));
    blocks.push(b.body('This recommendation is DFCC Bank’s own view on whether to carry the project '
      + 'forward as the accredited entity. It is not a decision of the Green Climate Fund.'));
  } else {
    blocks.push(b.callout(
      `This assessment is ${f.stateLabel.toLowerCase()} and has not been validated. No sign-off has been recorded, `
      + `so no recommendation stands${f.recommendationLabel ? ` (a draft recommendation of “${f.recommendationLabel}” is noted but not signed off)` : ''}.`,
      'Not yet validated'));
    blocks.push(b.body('A recommendation stands only once an assessor has validated the assessment.'));
  }
  return { id: 'recommendation', title: 'Recommendation and sign-off', blocks: keep(blocks) };
}

function historySection(f) {
  const hist = (f.validation.history || []);
  return {
    id: 'history',
    title: 'Validation audit trail',
    blocks: keep([
      b.body('Every change to the assessment, in order, with who made it and when — so the sign-off '
        + 'carries the trail that led to it.'),
      hist.length ? b.table({
        head: ['When', 'From', 'To', 'By', 'Note'],
        widths: [1.2, 1, 1, 1.3, 1.5], align: ['left', 'left', 'left', 'left', 'left'], zebra: true,
        rows: hist.map(h => [
          day(h.at) || String(h.at),
          STATE_LABEL[h.from] || h.from,
          STATE_LABEL[h.to] || h.to,
          h.by || '—',
          h.note || '',
        ]),
      }) : b.body('No validation activity has been recorded yet.'),
    ]),
  };
}

/** The whole document model — cover and sections, no annexes and no checklist. */
function buildModel(f) {
  return {
    cover: {
      title: 'GCF Assessment Report',
      subtitle: `${f.project.name} (${f.project.code})`,
      entityLabel: 'Reporting entity',
      insurer: 'DFCC Bank PLC',
      publishedAt: f.publishedAt,
      standard: 'GCF Investment Framework — six investment criteria (IRMF)',
      preparedBy: f.validated ? (f.validation.validatedBy || null) : null,
      reportId: f.reportId,
      responsibleParty: [],
      identity: keep([
        `Report reference: ${f.reportId}`,
        f.commit ? `Build: ${f.commit}` : null,
        `Validation state: ${f.stateLabel}`,
      ]),
      assuranceMode: null,
      assuranceLabel: null,
      assuranceStatement: null,
    },
    footerNote: `GCF Assessment — ${f.project.code}`,
    sections: [
      summarySection(f),
      criteriaSection(f),
      resultsSection(f),
      recommendationSection(f),
      historySection(f),
    ],
    annexes: [],
    facts: f,
  };
}

function assessmentModel(project, ctx) { return buildModel(assessmentFacts(project, ctx)); }
function assessmentJSON(project, ctx) {
  const model = assessmentModel(project, ctx);
  const f = model.facts;
  return {
    reportId: f.reportId,
    publishedAt: f.publishedAt,
    project: { id: f.project.id, code: f.project.code, name: f.project.name, stream: f.project.stream, stage: f.project.stage },
    validationState: f.validation.state,
    validated: f.validated,
    recommendation: f.validation.recommendation,
    recommendationLabel: f.recommendationLabel,
    signedOffBy: f.validated ? f.validation.validatedBy : null,
    signedOffAt: f.validated ? f.validation.validatedAt : null,
    criteria: f.ratedCriteria,
    history: f.validation.history,
  };
}
function assessmentPDF(project, ctx) { return renderStandardPDF(assessmentModel(project, ctx)); }
function assessmentDOCX(project, ctx) { return renderStandardDOCX(assessmentModel(project, ctx)); }

module.exports = {
  assessmentFacts, buildModel, assessmentModel, assessmentJSON, assessmentPDF, assessmentDOCX,
};
