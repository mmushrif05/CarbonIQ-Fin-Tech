// @ts-check
/**
 * The whole Part A §5.9 document model: cover, the Chapter 6 sections, the
 * annexes (the sovereign dataset with the country rows the book read, the
 * by-sovereign table, the holding register that is the audit trail, the
 * regulatory mapping, the completed checklist). The platform renderer draws
 * it to PDF and to Word.
 */

'use strict';

const { b, keep } = require('../../../../platform/reporting/report-standard/blocks');
const { buildSections, N, score } = require('./sections');
const { completeChecklist } = require('./checklist');
const { registerAnnex, regulatoryAnnex } = require('../common-sections');
const { containsForbiddenLanguage } = require('../../../../shared/report-integrity');

const F6 = n => (n === null || n === undefined) ? '—' : Number(n).toFixed(6);
const fig = x => (x && Number.isFinite(x.value)) ? `${N(x.value)}${x.year ? ` (${x.year})` : ''}` : '—';

/** The annexes, numbered A onwards after the numbered sections. */
function buildAnnexes(f) {
  const annexes = [];
  let letter = 'A';
  const next = () => { const l = letter; letter = String.fromCharCode(letter.charCodeAt(0) + 1); return l; };

  const d = f.dataset;
  annexes.push({
    id: 'annexDataset', annex: next(), title: 'Sovereign dataset',
    blocks: keep([
      b.body('The sovereign dataset every figure rests on: territorial scope 1 on both LULUCF '
        + 'boundaries and PPP-adjusted GDP per country, with the version, the effective date and '
        + 'the whole SHA-256 checksum, so a copy can be verified against it.'),
      d ? b.table({
        head: ['Table', 'Version', 'Effective from', 'Status', 'Countries', 'SHA-256'],
        widths: [1.4, 0.7, 1.1, 0.9, 0.7, 3], align: ['left', 'left', 'left', 'left', 'right', 'left'],
        rows: d.tables.map(t => [t.table, t.version, t.effectiveFrom || '—', t.status || 'released',
          String(t.countryCount || '—'), t.checksum || '—']),
      }) : null,
      f.datasetRows && f.datasetRows.length ? b.h2('The country rows this book read') : null,
      f.datasetRows && f.datasetRows.length ? b.table({
        head: ['Sovereign', 'Scope 1 excl. LULUCF, tCO2e (year)', 'Scope 1 incl. LULUCF, tCO2e (year)', 'PPP-GDP, M int. USD (year)', 'Status'],
        widths: [1.4, 1.6, 1.6, 1.5, 0.9], align: ['left', 'right', 'right', 'right', 'left'], zebra: true,
        rows: f.datasetRows.map(r => [`${r.name || r.code || '—'}${r.code ? ` (${r.code})` : ''}`,
          fig(r.scope1Excl), fig(r.scope1Incl), fig(r.pppGdp), r.provisional ? 'provisional' : 'released']),
      }) : null,
      f.datasetRows && f.datasetRows.some(r => r.provisional)
        ? b.caption('A provisional country carries the gap it stands in for; its figures are order-of-magnitude placeholders pending a released set.') : null,
    ]),
  });

  if (f.kind === 'disclosure') {
    annexes.push({
      id: 'annexTable', annex: next(), title: 'Annex 10.2 — scope 3 Category 15 by sovereign',
      blocks: keep([
        b.body('The template PCAF Annex 10.2 gives (pp.199–200), disaggregated here by sovereign: '
          + 'holdings, outstanding covered and financed scope 1 excluding LULUCF. The including-LULUCF '
          + 'figure is in the register below where held.'),
        f.bySovereign.length ? b.table({
          head: ['Sovereign', 'Holdings', `Outstanding ${f.currency}`, 'Scope 1 excl. LULUCF tCO2e'],
          widths: [2, 1, 1.6, 1.8], align: ['left', 'right', 'right', 'right'], zebra: true,
          rows: f.bySovereign.map(s => [`${s.name || s.country || '—'}${s.country ? ` (${s.country})` : ''}`,
            String(s.exposures), N(s.outstanding), N(s.financedScope1ExclLULUCF)]),
        }) : b.body('No sovereign holdings are recorded for the year.'),
      ]),
    });

    annexes.push(registerAnnex(f, next(), {
      title: 'Holding register — the audit trail',
      intro: 'One row per sovereign holding in the reporting year, from the same stored projection the '
        + 'totals above were rolled up from. A verifier samples from this table; every identifier '
        + 'resolves to the stored holding, which holds the input the entity keyed, the result the '
        + 'engine computed and the provenance trace behind every figure.',
      head: ['Holding', 'Sovereign', `Outstanding ${f.currency}`, 'AF', 'Opt', 'DQ', 'Scope 1 excl.', 'Scope 1 incl.', 'Checks'],
      widths: [1.3, 1.3, 1.2, 0.9, 0.6, 0.4, 1, 1, 0.8],
      align: ['left', 'left', 'right', 'right', 'left', 'right', 'right', 'right', 'left'],
      rows: (f.exposureRegister || []).map(r => [r.exposureId || '—', `${r.sovereign || '—'}${r.provisional ? ' (provisional)' : ''}`,
        N(r.outstanding), F6(r.attributionFactor), r.option || '—', score(r.score), N(r.scope1Excl),
        r.scope1Incl === null ? '—' : N(r.scope1Incl), r.findings ? `${r.findings} finding(s)` : 'clean']),
    }));

    annexes.push(regulatoryAnnex(f, next()));
  }

  annexes.push({
    id: 'annexChecklist', annex: next(),
    title: 'PCAF disclosure checklist — completed',
    blocks: [b.checklist()],
  });

  return annexes;
}

/** Scan the document's own prose for endorsement language. */
function scanLanguage(f) {
  const prose = [f.conformanceStatement, f.coverageStatement, f.scopeStatement, f.assuranceDetail,
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
    insurer: f.insurer, entityLabel: f.entityLabel, title: f.title, reportingYear: f.reportingYear,
    publishedAt: f.publishedAt, reportId: f.reportId, url: f.url,
  });

  return {
    cover: {
      title: f.title, subtitle: f.subtitle,
      entityLabel: f.entityLabel,
      insurer: f.insurer, reportingYear: f.reportingYear, publishedAt: f.publishedAt,
      standard: f.standard, preparedBy: f.preparedBy, reportId: f.reportId,
      responsibleParty: f.responsibleParty || [],
      identity: (f.identity && f.identity.lines) || [],
      assuranceMode: f.assurance.mode, assuranceLabel: f.assurance.label,
      assuranceStatement: f.assurance.statement,
    },
    footerNote: `${f.title} — FY${f.reportingYear}`,
    sections, annexes, checklist, facts: f,
  };
}

module.exports = { buildStandardModel, buildAnnexes };
