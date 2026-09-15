// @ts-check
/**
 * The return-to-sponsor letter — Phase 1 Stage 6.
 *
 * When an assessor signs an assessment off with conditions, or against it, the
 * sponsor receives this: the decision, what to address, and what happens next.
 * It is built from the gap list (`return-loop.js`) and rendered through the
 * platform report standard, the same renderer the assessment report uses.
 *
 * It is a working document between DFCC and the sponsor, not a GCF decision and
 * not a disclosure: no PCAF conformance language, no endorsement claim. The gap
 * list is the deliverable — the worklist between a returned assessment and a
 * resubmission — and every line of it is a gap the assessment already
 * established, with the remedy that clears it.
 */

'use strict';

const { b, keep } = require('../../../platform/reporting/report-standard/blocks');
const { renderStandardPDF } = require('../../../platform/reporting/report-standard/render-pdf');
const { renderStandardDOCX } = require('../../../platform/reporting/report-standard/render-docx');
const returnLoop = require('../domain/return-loop');
const validation = require('../domain/validation');

const REC_LABEL = {
  recommend: 'Recommend',
  recommend_with_conditions: 'Recommend with conditions',
  not_recommend: 'Do not recommend',
};
const day = s => (s ? String(s).slice(0, 10) : null);

function letterFacts(project) {
  const val = validation.current(project);
  const g = returnLoop.gaps(project);
  const returns = val.returns || [];
  const last = returns.length ? returns[returns.length - 1] : null;
  return {
    project,
    validation: val,
    gaps: g,
    recommendationLabel: val.recommendation ? (REC_LABEL[val.recommendation] || val.recommendation) : null,
    lastReturnAt: last ? last.at : null,
    publishedAt: new Date().toISOString(),
    safeName: `gcf-return-letter-${String(project.code || project.id).replace(/[^A-Za-z0-9_-]/g, '')}`,
  };
}

function decisionSection(f) {
  const val = f.validation;
  return {
    id: 'decision',
    title: 'The assessor’s decision',
    blocks: keep([
      b.body(`Following DFCC Bank’s appraisal of ${f.project.name} (${f.project.code}), the assessor’s `
        + `recommendation is: ${f.recommendationLabel || 'not recorded'}.`),
      val.recommendationNote ? b.body(val.recommendationNote) : null,
      val.validatedBy ? b.caption(`Signed off by ${val.validatedBy}${val.validatedAt ? ` on ${day(val.validatedAt)}` : ''}.`) : null,
      b.body('This is DFCC Bank’s own view as the accredited entity. It is not a decision of the Green '
        + 'Climate Fund. The project can be brought forward once the points below are addressed.'),
    ]),
  };
}

function gapsSection(f) {
  const items = f.gaps.items;
  /* Grouped by criterion so the sponsor reads one theme at a time. */
  const byCriterion = new Map();
  for (const g of items) {
    if (!byCriterion.has(g.criterion)) byCriterion.set(g.criterion, []);
    byCriterion.get(g.criterion).push(g);
  }
  const blocks = /** @type {any[]} */ ([
    b.body('What to address before resubmitting. Each point is drawn from the assessment — either a piece '
      + 'of evidence the record does not yet hold, or a criterion the assessor rated weak — with the step '
      + 'that would clear it.'),
  ]);
  if (!items.length) {
    blocks.push(b.body('No specific gaps were recorded. The conditions are set out in the decision above.'));
  } else {
    for (const [criterion, gs] of byCriterion) {
      blocks.push(b.h2(criterion));
      gs.forEach(g => blocks.push(b.bullets([g.remedy])));
    }
  }
  return { id: 'gaps', title: 'What to address', blocks: keep(blocks) };
}

function nextSection() {
  return {
    id: 'next',
    title: 'What happens next',
    blocks: keep([
      b.bullets([
        'Address the points above and update the project record.',
        'Resubmit for assessment. The assessor reopens the assessment and re-reviews it against the same six criteria.',
        'The resubmission is compared against this returned version, so it is clear what changed.',
      ]),
    ]),
  };
}

function buildModel(f) {
  return {
    cover: {
      title: 'GCF Assessment — Return to Sponsor',
      subtitle: `${f.project.name} (${f.project.code})`,
      entityLabel: 'Reporting entity',
      insurer: 'DFCC Bank PLC',
      publishedAt: f.publishedAt,
      standard: 'GCF Investment Framework — six investment criteria (IRMF)',
      preparedBy: f.validation.validatedBy || null,
      reportId: null,
      responsibleParty: [],
      identity: keep([
        `Recommendation: ${f.recommendationLabel || 'not recorded'}`,
        `Gaps to address: ${f.gaps.count}`,
      ]),
      assuranceMode: null, assuranceLabel: null, assuranceStatement: null,
    },
    footerNote: `GCF Return — ${f.project.code}`,
    sections: [decisionSection(f), gapsSection(f), nextSection()],
    annexes: [],
    facts: f,
  };
}

function letterModel(project) { return buildModel(letterFacts(project)); }
function letterJSON(project) {
  const f = letterFacts(project);
  return {
    project: { id: f.project.id, code: f.project.code, name: f.project.name },
    recommendation: f.validation.recommendation,
    recommendationLabel: f.recommendationLabel,
    signedOffBy: f.validation.validatedBy || null,
    gaps: f.gaps.items,
    gapCount: f.gaps.count,
    returnable: f.gaps.returnable,
    publishedAt: f.publishedAt,
  };
}
function letterPDF(project) { return renderStandardPDF(letterModel(project)); }
function letterDOCX(project) { return renderStandardDOCX(letterModel(project)); }

module.exports = { letterFacts, buildModel, letterModel, letterJSON, letterPDF, letterDOCX };
