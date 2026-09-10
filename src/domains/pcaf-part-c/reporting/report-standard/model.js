// @ts-check
/**
 * The annexes, and the content model that both renderers read.
 */

'use strict';

const { completeChecklist } = require('../../application/partc-checklist');
const { _scanLanguage, b, keep } = require('./facts');
const { buildSections } = require('./sections');
const { N } = require('./common');

/** The annexes, numbered A onwards after the numbered sections. */
function buildAnnexes(f) {
  const annexes = [];

  annexes.push({
    id: 'annexFactors', annex: 'A', title: 'Factor register',
    blocks: keep([
      b.body('Every emission factor the reported figures rest on, with its value, unit, data-quality tier and named source. Local means a Sri Lankan value, Regional a South Asian or comparable one, Global an international default.'),
      f.factorRegister.length ? b.table({
        head: ['Factor', 'Value', 'Unit', 'Tier', 'Source'],
        widths: [1.9, 0.9, 0.9, 0.8, 3.2],
        align: ['left', 'right', 'left', 'left', 'left'],
        zebra: true,
        rows: f.factorRegister.map(r => [
          r.key, N(r.value), r.unit || '—', r.tier || 'n/a', r.source || r.reference || 'not stated'
        ])
      }) : b.body('No factor register is available for this document.')
    ])
  });

  if (f.auditTrail.length) {
    annexes.push({
      id: 'annexTrace', annex: 'B', title: 'Calculation trace',
      blocks: keep([
        b.body('Every step the engine executed, in order, with the equation it applied and the value it produced. This is what lets a reader follow any disclosed number back to the bill of quantities behind it.'),
        b.table({
          head: ['#', 'Module', 'Step', 'Equation', 'kgCO2e'],
          widths: [0.4, 0.7, 1.9, 3.4, 1],
          align: ['right', 'left', 'left', 'left', 'right'],
          rows: f.auditTrail.map((e, i) => [
            String(i + 1), e.module || '—', e.label || '—', e.equation || '—',
            e.value === undefined ? '—' : N(e.value)
          ])
        })
      ])
    });
  }

  if (f.assessmentRegister && f.assessmentRegister.length) {
    annexes.push({
      id: 'annexTrace', annex: 'B', title: 'Assessment register',
      blocks: [
        b.body('Every figure in the per-policy table traces to one locked assessment, which binds a policy to a bill-of-quantities revision and a reporting year.'),
        b.table({
          head: ['Project', 'Policy', 'BOQ revision', 'Version', 'Construction kgCO2e', 'Locked'],
          widths: [2.2, 1.2, 1.1, 0.7, 1.5, 1.3],
          align: ['left', 'left', 'left', 'right', 'right', 'left'],
          zebra: true,
          rows: f.assessmentRegister.map(a => [
            a.projectName, a.lineType, a.boqRevision, String(a.version),
            N(a.construction_kgCO2e), (a.lockedAt || '').split('T')[0] || '—'
          ])
        })
      ]
    });
  }

  annexes.push({
    id: 'annexChecklist', annex: f.auditTrail.length || (f.assessmentRegister || []).length ? 'C' : 'B',
    title: 'PCAF disclosure checklist — completed',
    blocks: [b.checklist()]
  });

  return annexes;
}

/**
 * The whole document model: cover, numbered sections, annexes, checklist.
 *
 * The checklist is completed from the same facts the sections render, so it
 * cannot answer Yes to something the document does not contain.
 */
function buildStandardModel(facts) {
  const sections = buildSections(facts);
  const annexes = buildAnnexes(facts);

  const offending = _scanLanguage(facts);
  facts.endorsementLanguageFound = offending.length > 0;

  if (offending.length > 0) {
    throw new Error(
      `Report blocked: PCAF endorsement language detected (${offending.join(', ')}). ` +
      'Only conformance language is permitted.');
  }

  const checklist = completeChecklist(facts, {
    insurer: facts.insurer, title: facts.title, reportingYear: facts.reportingYear,
    publishedAt: facts.publishedAt, reportId: facts.reportId, url: facts.url
  });

  return {
    cover: {
      title: facts.title, subtitle: facts.subtitle,
      insurer: facts.insurer || facts.insured || 'Re/insurer not stated',
      reportingYear: facts.reportingYear, publishedAt: facts.publishedAt,
      standard: facts.standard, preparedBy: facts.preparedBy, reportId: facts.reportId
    },
    footerNote: `${facts.title} — FY${facts.reportingYear}`,
    sections, annexes, checklist, facts
  };
}

module.exports = { buildAnnexes, buildStandardModel };
