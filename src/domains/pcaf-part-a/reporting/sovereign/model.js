// @ts-check
/**
 * The whole Part A §5.9 sovereign document model: cover, the Chapter 6
 * sections, the annexes (sovereign dataset, Annex 10.2 by sovereign, completed
 * checklist). The platform renderer draws it to PDF and to Word — the same
 * renderer §5.2 and Part C use, so the scopes stay apart while sharing one
 * document engine.
 */

'use strict';

const { b, keep } = require('../../../../platform/reporting/report-standard/blocks');
const { buildSections, N } = require('./sections');
const { completeChecklist } = require('./checklist');
const { containsForbiddenLanguage } = require('../../../../shared/report-integrity');

/** The annexes, numbered A onwards after the numbered sections. */
function buildAnnexes(f) {
  const annexes = [];

  const d = f.dataset;
  annexes.push({
    id: 'annexDataset', annex: 'A', title: 'Sovereign dataset and governed baselines',
    blocks: keep([
      b.body('The sovereign dataset the figures rest on. A register of values a reader cannot '
        + 'tie to a released version is a list, not a citation.'),
      d ? b.table({
        head: ['Table', 'Version', 'Effective from', 'Status', 'Rows', 'Checksum'],
        widths: [1.9, 0.8, 1.2, 1, 0.6, 2.2], align: ['left', 'left', 'left', 'left', 'right', 'left'],
        rows: d.tables.map(t => [t.table, t.version, t.effectiveFrom || '—', t.status || '—',
          String(t.rowCount || '—'), String(t.checksum || '').slice(0, 16)]),
      }) : b.body('No sovereign dataset was named.'),
    ]),
  });

  if (f.kind === 'disclosure') {
    annexes.push({
      id: 'annexTable', annex: 'B', title: 'Annex 10.2 — scope 3 Category 15 by sovereign',
      blocks: keep([
        b.body('The template PCAF Annex 10.2 gives (pp.199–200), for sovereign debt: the class '
          + 'disaggregated by sovereign, with outstanding covered and the financed scope 1 '
          + '(excluding LULUCF) headline per row. Scope 1 on the two LULUCF boundaries is never '
          + 'summed, so only the headline boundary is aggregated here.'),
        f.bySovereign.length ? b.table({
          head: ['Sovereign', 'Holdings', `Outstanding ${f.currency}`, 'Scope 1 excl. LULUCF tCO2e'],
          widths: [2.4, 1, 1.6, 2], align: ['left', 'right', 'right', 'right'], zebra: true,
          rows: f.bySovereign.map(s => [s.name || s.country || 'unknown', String(s.exposures),
            N(s.outstanding), N(s.financedScope1ExclLULUCF)]),
        }) : b.body('No sovereign holdings are recorded for the year.'),
      ]),
    });
  }

  annexes.push({
    id: 'annexChecklist', annex: f.kind === 'disclosure' ? 'C' : 'B',
    title: 'PCAF disclosure checklist — completed',
    blocks: [b.checklist()],
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
    publishedAt: f.publishedAt, reportId: f.reportId, url: f.url,
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
    sections, annexes, checklist, facts: f,
  };
}

module.exports = { buildStandardModel, buildAnnexes };
