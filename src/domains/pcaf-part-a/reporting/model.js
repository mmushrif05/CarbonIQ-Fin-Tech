// @ts-check
/**
 * The whole Part A §5.2 document model: cover, the Chapter 6 sections, the
 * annexes (factor set with every row, Annex 10.2 table, the exposure register
 * that is the audit trail, the regulatory mapping, the completed checklist).
 * The platform renderer draws it to PDF and to Word.
 */

'use strict';

const { b, keep } = require('../../../platform/reporting/report-standard/blocks');
const { buildSections, T, N, score } = require('./sections');
const { completeChecklist } = require('./checklist');
const { registerAnnex, regulatoryAnnex } = require('./common-sections');
const { containsForbiddenLanguage } = require('../../../shared/report-integrity');

const F4 = n => (n === null || n === undefined) ? '—' : Number(n).toFixed(4);

/** The annexes, numbered A onwards after the numbered sections. */
function buildAnnexes(f) {
  const annexes = [];
  let letter = 'A';
  const next = () => { const l = letter; letter = String.fromCharCode(letter.charCodeAt(0) + 1); return l; };

  const set = f.factorSet;
  annexes.push({
    id: 'annexFactors', annex: next(), title: 'Factor set and governed baselines',
    blocks: keep([
      b.body('The sector factor set an estimated figure rests on, and the governed baseline '
        + 'the plausibility check read. A register of values a reader cannot tie to a released '
        + 'version is a list, not a citation; the checksum is the whole SHA-256, so a copy of the '
        + 'table can be verified against it.'),
      set ? b.table({
        head: ['Table', 'Version', 'Effective from', 'Status', 'Rows', 'SHA-256'],
        widths: [1.5, 0.7, 1.1, 0.9, 0.5, 3], align: ['left', 'left', 'left', 'left', 'right', 'left'],
        rows: set.tables.map(t => [t.table, t.version, t.effectiveFrom || '—', t.status || (t.table === 'sectors' ? 'vocabulary' : '—'),
          String(t.rowCount || '—'), t.checksum || '—'])
      }) : b.body('No sector factor set was used: every figure rested on a reported borrower inventory or a factor supplied per exposure.'),
      f.factorRows && f.factorRows.length ? b.h2('The rows, as released') : null,
      f.factorRows && f.factorRows.length ? b.table({
        head: ['Sector', 'Scope 1 / M revenue', 'Scope 2 / M revenue', 'Scope 3 / M revenue', 'Asset turnover', 'Status'],
        widths: [2, 1.1, 1.1, 1.1, 1, 0.9], align: ['left', 'right', 'right', 'right', 'right', 'left'], zebra: true,
        rows: f.factorRows.map(r => [r.sector, N(r.scope1PerRevenue), N(r.scope2PerRevenue), N(r.scope3PerRevenue),
          N(r.assetTurnover), r.provisional ? 'provisional' : 'released']),
      }) : null,
      f.factorRows && f.factorRows.length ? b.caption(`tCO2e per million ${set && set.tables[0] && set.tables[0].currency ? set.tables[0].currency : f.currency} of revenue; `
        + 'the per-assets factor Option 3b uses is derived from the revenue factor and the asset turnover (Annex Table 10.1-2). '
        + 'A provisional row stands in for a released regional value and says so on the row.') : null,
      f.band ? b.body(`Sector intensity bands: ${f.band.basis}`) : null,
    ])
  });

  if (f.kind === 'disclosure') {
    annexes.push({
      id: 'annexTable', annex: next(), title: 'Annex 10.2 — scope 3 Category 15 by sector',
      blocks: keep([
        b.body('The template PCAF Annex 10.2 gives (pp.199–200): the asset class disaggregated '
          + 'by sector, with outstanding covered, scope 1 and 2, scope 3, the economic intensity and '
          + 'the weighted score per row. Removals and credits are in a separate table by rule.'),
        f.bySector.length ? b.table({
          head: ['Sector', 'Exposures', `Outstanding ${f.currency}`, 'Scope 1+2 tCO2e', 'Scope 3 tCO2e', 'tCO2e / M', 'DQ'],
          widths: [1.7, 0.8, 1.4, 1.2, 1.1, 0.9, 0.5], align: ['left', 'right', 'right', 'right', 'right', 'right', 'right'], zebra: true,
          rows: f.bySector.map(s => [s.sector, String(s.exposures), N(s.outstanding),
            T(s.scope1And2), s.scope3 === null ? '—' : T(s.scope3), s.intensity === null ? '—' : N(s.intensity), score(s.dataQuality)])
        }) : b.body('No exposures are recorded for the year.'),
      ])
    });

    annexes.push(registerAnnex(f, next(), {
      title: 'Exposure register — the audit trail',
      intro: 'One row per exposure in the reporting year, from the same stored projection the totals '
        + 'above were rolled up from. A verifier samples from this table; every identifier resolves '
        + 'to the stored exposure, which holds the input the entity keyed, the result the engine '
        + 'computed and the provenance trace behind every figure.',
      head: ['Exposure', 'Borrower', 'Sector', `Outstanding ${f.currency}`, 'AF', 'Opt', 'DQ', 'Scope 1+2', 'Scope 3', 'Checks'],
      widths: [1.25, 1.5, 1, 1.1, 0.7, 0.5, 0.4, 0.9, 0.8, 0.85],
      align: ['left', 'left', 'left', 'right', 'right', 'left', 'right', 'right', 'right', 'left'],
      rows: (f.exposureRegister || []).map(r => [r.exposureId || '—', r.counterparty || '—', r.sector || '—', N(r.outstanding),
        F4(r.attributionFactor), r.option || '—', score(r.score), T(r.scope1And2), r.scope3 === null ? '—' : T(r.scope3),
        r.findings ? `${r.verdict} (${r.findings})` : r.verdict]),
    }));

    annexes.push(regulatoryAnnex(f, next()));
  }

  annexes.push({
    id: 'annexChecklist', annex: next(),
    title: 'PCAF disclosure checklist — completed',
    blocks: [b.checklist()]
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
    publishedAt: f.publishedAt, reportId: f.reportId, url: f.url
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
    sections, annexes, checklist, facts: f
  };
}

module.exports = { buildStandardModel, buildAnnexes };
