// @ts-check
/**
 * The whole Part A §5.2 document model: cover, the Chapter 6 sections, the
 * annexes (factor set, Annex 10.2 table, completed checklist). The platform
 * renderer draws it to PDF and to Word.
 */

'use strict';

const { b, keep } = require('../../../platform/reporting/report-standard/blocks');
const { buildSections, T, N, score } = require('./sections');
const { completeChecklist } = require('./checklist');
const { containsForbiddenLanguage } = require('../../../shared/report-integrity');

/** The annexes, numbered A onwards after the numbered sections. */
function buildAnnexes(f) {
  const annexes = [];

  const set = f.factorSet;
  annexes.push({
    id: 'annexFactors', annex: 'A', title: 'Factor set and governed baselines',
    blocks: keep([
      b.body('The sector factor set an estimated figure rests on, and the governed baseline '
        + 'the plausibility check read. A register of values a reader cannot tie to a released '
        + 'version is a list, not a citation.'),
      set ? b.table({
        head: ['Table', 'Version', 'Effective from', 'Status', 'Rows', 'Checksum'],
        widths: [1.9, 0.8, 1.2, 1, 0.6, 2.2], align: ['left', 'left', 'left', 'left', 'right', 'left'],
        rows: set.tables.map(t => [t.table, t.version, t.effectiveFrom || '—', t.status || '—',
          String(t.rowCount || '—'), (t.checksum || '').slice(0, 16)])
      }) : b.body('No sector factor set was used: every figure rested on a reported borrower inventory or a factor supplied per exposure.'),
      f.band ? b.body(`Sector intensity bands: ${f.band.basis}`) : null,
    ])
  });

  if (f.kind === 'disclosure') {
    annexes.push({
      id: 'annexTable', annex: 'B', title: 'Annex 10.2 — scope 3 Category 15 by sector',
      blocks: keep([
        b.body('The template PCAF Annex 10.2 gives (pp.199–200): the asset class disaggregated '
          + 'by sector, with outstanding covered, scope 1 and 2, scope 3 and the weighted score '
          + 'per row. Removals and credits are in a separate table by rule.'),
        f.bySector.length ? b.table({
          head: ['Sector', 'Exposures', `Outstanding ${f.currency}`, 'Scope 1+2 tCO2e', 'Scope 3 tCO2e', 'DQ'],
          widths: [1.9, 0.9, 1.5, 1.4, 1.3, 0.6], align: ['left', 'right', 'right', 'right', 'right', 'right'], zebra: true,
          rows: f.bySector.map(s => [s.sector, String(s.exposures), N(s.outstanding),
            T(s.scope1And2), s.scope3 === null ? '—' : T(s.scope3), score(s.dataQuality)])
        }) : b.body('No exposures are recorded for the year.'),
      ])
    });
  }

  annexes.push({
    id: 'annexChecklist', annex: f.kind === 'disclosure' ? 'C' : 'B',
    title: 'PCAF disclosure checklist — completed',
    blocks: [b.checklist()]
  });

  return annexes;
}

/** Scan the document's own prose for endorsement language. */
function scanLanguage(f) {
  const prose = [f.conformanceStatement, f.coverageStatement, f.scopeStatement,
    ...(f.KYOTO_GASES || []).map(g => g.arises)].filter(Boolean).join('\n');
  return containsForbiddenLanguage(prose);
}

function buildStandardModel(f) {
  const offending = scanLanguage(f);
  if (offending.length > 0) {
    throw new Error(`Report blocked: PCAF endorsement language detected (${offending.join(', ')}). `
      + 'Only conformance language is permitted.');
  }

  const sections = buildSections(f);
  const annexes = buildAnnexes(f);
  const checklist = completeChecklist(f, {
    insurer: f.insurer, title: f.title, reportingYear: f.reportingYear,
    publishedAt: f.publishedAt, reportId: f.reportId, url: f.url
  });

  return {
    cover: {
      title: f.title, subtitle: f.subtitle,
      insurer: f.insurer, reportingYear: f.reportingYear, publishedAt: f.publishedAt,
      standard: f.standard, preparedBy: f.preparedBy, reportId: f.reportId,
      assuranceMode: f.assurance.mode, assuranceLabel: f.assurance.label,
      assuranceStatement: f.assurance.statement,
    },
    footerNote: `${f.title} — FY${f.reportingYear}`,
    sections, annexes, checklist, facts: f
  };
}

module.exports = { buildStandardModel, buildAnnexes };
