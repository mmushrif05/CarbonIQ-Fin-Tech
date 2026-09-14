// @ts-check
/**
 * The sections and annexes every Part A document carries in the same words —
 * the reporting entity and its boundary, the uncertainty statement and the
 * list of what the document does not contain, the regulatory mapping, and
 * the audit-trail annex that ties every disclosed figure to the exposure
 * behind it.
 *
 * They are shared by the §5.2, §5.9 and consolidated documents on purpose:
 * three documents from one book must describe one entity, list their gaps the
 * same way and be traceable the same way, or a verifier reconciling them
 * meets three vocabularies for one fact.
 *
 * Every block reads facts and computes nothing.
 */

'use strict';

const { b, keep } = require('../../../platform/reporting/report-standard/blocks');
const { stated } = require('./entity');

/* What each data-quality score means for the uncertainty of the figure,
   in PCAF's own terms (Part A Table 5.2-1, p.58; Table 5.9-6, p.147). No
   numeric range is invented: the standard publishes none, and a percentage
   printed here would be quoted as one. */
const UNCERTAINTY_BY_SCORE = Object.freeze({
  1: 'Reported and verified by a third party. The uncertainty is bounded by the verifier’s own materiality; the residual belongs to the verified inventory, not to this attribution.',
  2: 'Reported by the counterparty, unverified. The uncertainty is that of the counterparty’s own measurement and boundary choices, which this document does not see.',
  3: 'Estimated from physical activity data and an emission factor. The uncertainty is the factor’s and the activity data’s; the figure is specific to the counterparty but not measured by it.',
  4: 'Estimated from the counterparty’s revenue and a sector-average factor. An order-of-magnitude figure: it says which sectors carry the emissions, not what any one counterparty emits.',
  5: 'Estimated from the outstanding amount and a sector-average factor, with no counterparty data at all. The lowest quality the scale holds; it should be read as a placeholder the improvement plan exists to replace.',
});

/**
 * Section 1 — the reporting entity and its boundary. Every row is a declared
 * fact or "Not stated"; nothing is defaulted.
 */
function entitySection(f) {
  const e = f.entity || {};
  const period = e.period;
  return {
    id: 'entity', title: 'Reporting entity and boundary',
    blocks: keep([
      b.body('The facts in this section are the reporting entity’s own statements about itself. '
        + 'None of them can be derived from a lending book, so where the entity has not stated one '
        + 'the table says so and the checklist answers No — a default printed in its place would be '
        + 'a claim the entity never made.'),
      b.table({
        head: ['Fact', 'As stated by the reporting entity'],
        widths: [2.4, 3.6], align: ['left', 'left'],
        rows: [
          ['Reporting entity', stated(e.name)],
          ['Consolidation approach', e.consolidationApproach ? e.consolidationApproach.label : 'Not stated'],
          ['Organisational boundary', e.boundaryNote || 'Not stated'],
          ['Reporting year', stated(f.reportingYear)],
          ['Reporting period', period ? `${period.start} to ${period.end}` : 'Not stated — no fiscal year-end recorded'],
          ['Position taken at', period ? period.positionDate : 'Fiscal year-end (date not stated)'],
          ['Global warming potentials', e.gwpBasis || 'Not stated — the IPCC assessment report is not recorded'],
          ['Currency of the book', stated(f.currency)],
          ['Prepared by', e.preparedBy ? `${e.preparedBy.name}${e.preparedBy.role ? `, ${e.preparedBy.role}` : ''}` : 'Not stated'],
          ['Approved by', e.approvedBy ? `${e.approvedBy.name}${e.approvedBy.role ? `, ${e.approvedBy.role}` : ''}${e.approvedBy.date ? `, ${e.approvedBy.date}` : ''}` : 'Not stated'],
        ],
      }),
      e.assetClassesNotReported && e.assetClassesNotReported.length
        ? b.table({
          head: ['Asset class not reported', 'Section', 'Reason stated by the entity'],
          widths: [2.2, 0.8, 3], align: ['left', 'left', 'left'], zebra: true,
          rows: e.assetClassesNotReported.map(c => [c.label, c.section, c.reason]),
        })
        : b.body('The entity has not stated which Part A asset classes it does not report, or why. '
          + 'Chapter 6 asks for each with its reason — data, size or no methodology (p.162).'),
      f.assuranceDetail
        ? b.callout(f.assuranceDetail, 'Independent assurance recorded')
        : null,
    ]),
  };
}

/**
 * The uncertainty statement and the list of what the document does not
 * contain — one place, so a reader does not have to collect the absences
 * from figure notes across nine sections.
 */
function uncertaintySection(f) {
  const dist = f.optionDistribution || [];
  const gaps = f.gaps || [];
  return {
    id: 'uncertainty', title: 'Uncertainty, and what this document does not contain',
    blocks: keep([
      b.body('The uncertainty of a financed-emissions figure follows the option that produced it, '
        + 'which the data-quality score records. The statement below is qualitative on purpose: '
        + 'PCAF publishes no numeric uncertainty range per score, and a percentage invented here '
        + 'would be quoted as one.'),
      dist.length ? b.table({
        head: ['Score', 'Share of assessed outstanding', 'What the figure’s uncertainty rests on'],
        widths: [0.7, 1.5, 3.8], align: ['left', 'right', 'left'], zebra: true,
        rows: dist.map(d => [String(d.score), d.shareOfBook === null ? '—' : `${(d.shareOfBook * 100).toFixed(1)}%`,
          UNCERTAINTY_BY_SCORE[d.score] || 'Not scored.']),
      }) : b.body('No scored exposure is in the book, so no uncertainty statement can be made by score.'),
      b.h2('Not contained in this document'),
      gaps.length ? b.table({
        head: ['What', 'Why it is absent', 'Clause'],
        widths: [2.2, 2.6, 1.2], align: ['left', 'left', 'left'], zebra: true,
        rows: gaps.map(g => [g.what, g.why || 'Not stated by the reporting entity.', g.clause || '—']),
      }) : b.body('Every item the standard asks for is present in this document.'),
      b.caption('An absent item is reported absent rather than filled: a figure invented to close a gap '
        + 'reads as a measurement to anyone who did not watch it being invented.'),
    ]),
  };
}

/**
 * The audit-trail annex: one row per exposure, in the columns the caller
 * names, so every disclosed total can be followed back to the register.
 */
function registerAnnex(f, letter, { title, intro, head, widths, align, rows }) {
  return {
    id: 'annexRegister', annex: letter, title,
    blocks: keep([
      b.body(intro),
      rows.length ? b.table({ head, widths, align, zebra: true, rows }) : b.body('No exposures are recorded for the year.'),
      b.caption(`${rows.length} row(s). Each identifier resolves to the stored exposure, which holds the input the entity keyed, the result the engine computed and the provenance trace behind every figure.`),
    ]),
  };
}

/**
 * Where each line a Sri Lankan bank has to file comes from in this document,
 * and where it does not come from. SLFRS S2 is IFRS S2 as adopted in Sri
 * Lanka; the financed-emissions paragraphs are §29(a)(vi) and B58–B63.
 */
function regulatoryAnnex(f, letter) {
  const m = f.regulatoryMapping || [];
  return {
    id: 'annexRegulatory', annex: letter, title: 'Where the regulatory lines come from',
    blocks: keep([
      b.body('Each requirement a Sri Lankan bank files financed emissions against, and the section '
        + 'of this document that answers it — or the reason it does not. A document that maps every '
        + 'line to itself is claiming to be the whole disclosure; this one is the PCAF Part A input to it.'),
      m.length ? b.table({
        head: ['Requirement', 'Clause', 'Answered', 'Where'],
        widths: [2.6, 1.3, 0.9, 1.6], align: ['left', 'left', 'left', 'left'], zebra: true,
        rows: m.map(x => [x.requirement, x.clause, x.status, x.where]),
      }) : null,
    ]),
  };
}

module.exports = { entitySection, uncertaintySection, registerAnnex, regulatoryAnnex, UNCERTAINTY_BY_SCORE };
