// @ts-check
/**
 * The whole consolidated Part A document model: cover, the Chapter 6
 * sections, the annexes (every release the classes rest on, Annex 10.2 by
 * class, the register across classes that is the audit trail, the regulatory
 * mapping, the completed checklist). The platform renderer draws it to PDF
 * and to Word — the same renderer every other document uses.
 */

'use strict';

const { b, keep } = require('../../../../platform/reporting/report-standard/blocks');
const { buildSections, N, T, score } = require('./sections');
const { completeChecklist } = require('./checklist');
const { registerAnnex, regulatoryAnnex } = require('../common-sections');
const { s2IndexAnnex } = require('./s2-sections');
const { proseOf } = require('./s2-facts');
const { containsForbiddenLanguage } = require('../../../../shared/report-integrity');

const F4 = n => (n === null || n === undefined) ? '—' : Number(n).toFixed(4);

function buildAnnexes(f) {
  const annexes = [];
  let letter = 'A';
  const next = () => { const l = letter; letter = String.fromCharCode(letter.charCodeAt(0) + 1); return l; };

  annexes.push({
    id: 'annexFactors', annex: next(), title: 'Factor sets, datasets and governed baselines',
    blocks: keep([
      b.body('Every factor set or dataset a class’s figures rest on, with its version, effective date and '
        + 'the whole SHA-256 checksum, so a copy can be verified against it. The per-class documents print '
        + 'each set’s rows.'),
      ...f.releases.map(r => b.table({
        head: [r.name[0].toUpperCase() + r.name.slice(1), 'Version', 'Effective from', 'Status', 'Rows', 'SHA-256'],
        widths: [1.5, 0.7, 1.1, 0.9, 0.5, 3], align: ['left', 'left', 'left', 'left', 'right', 'left'],
        rows: r.tables.map(t => [t.table, t.version, t.effectiveFrom || '—', t.status || (t.table === 'sectors' ? 'vocabulary' : 'released'),
          String(t.rowCount || t.countryCount || '—'), t.checksum || '—']),
      })),
      f.band ? b.body(`Sector intensity bands: ${f.band.basis}`) : null,
    ]),
  });

  annexes.push({
    id: 'annexTable', annex: next(), title: 'Annex 10.2 — scope 3 Category 15 by asset class',
    blocks: keep([
      b.body('The template PCAF Annex 10.2 gives (pp.199–200): each asset class disaggregated — by sector '
        + 'for business loans, by sovereign for sovereign debt — with outstanding covered, the headline, '
        + 'scope 3 where the class reports it, and the weighted score per row.'),
      f.bySector.length ? b.h2('Business loans and unlisted equity (§5.2), by sector') : null,
      f.bySector.length ? b.table({
        head: ['Sector', 'Exposures', 'Outstanding', 'Scope 1+2 tCO2e', 'Scope 3 tCO2e', 'DQ'],
        widths: [1.9, 0.9, 1.5, 1.4, 1.3, 0.6], align: ['left', 'right', 'right', 'right', 'right', 'right'], zebra: true,
        rows: f.bySector.map(s => [s.sector, String(s.exposures), N(s.outstanding), T(s.headline), s.scope3 === null ? '—' : T(s.scope3), score(s.dataQuality)]),
      }) : null,
      f.bySovereign.length ? b.h2('Sovereign debt (§5.9), by sovereign') : null,
      f.bySovereign.length ? b.table({
        head: ['Sovereign', 'Holdings', 'Outstanding USD', 'Scope 1 excl. LULUCF tCO2e'],
        widths: [2, 1, 1.6, 1.8], align: ['left', 'right', 'right', 'right'], zebra: true,
        rows: f.bySovereign.map(s => [`${s.name || s.country || '—'}${s.country ? ` (${s.country})` : ''}`, String(s.exposures), N(s.outstanding), N(s.financedScope1ExclLULUCF)]),
      }) : null,
      !f.bySector.length && !f.bySovereign.length ? b.body('No asset class holds exposures for the year.') : null,
    ]),
  });

  annexes.push(registerAnnex(f, next(), {
    title: 'Exposure register across classes — the audit trail',
    intro: 'One row per exposure of every class reported, from the same stored projections the totals '
      + 'were rolled up from. A verifier samples from this table; every identifier resolves to the stored '
      + 'record, which holds the input the entity keyed, the result the engine computed and the '
      + 'provenance trace behind every figure.',
    head: ['Class', 'Exposure', 'Counterparty', 'Sector / country', 'Outstanding', 'Ccy', 'AF', 'Opt', 'DQ', 'Headline', 'Scope 3', 'Checks'],
    widths: [0.55, 1.2, 1.3, 0.95, 1, 0.45, 0.65, 0.45, 0.4, 0.85, 0.75, 0.75],
    align: ['left', 'left', 'left', 'left', 'right', 'left', 'right', 'left', 'right', 'right', 'right', 'left'],
    rows: (f.exposureRegister || []).map(r => [r.section, r.exposureId || '—', r.counterparty || '—', r.sector || '—', N(r.outstanding), r.currency || '—',
      F4(r.attributionFactor), r.option || '—', score(r.score), T(r.headline), r.scope3 === null ? '—' : T(r.scope3),
      r.findings ? `${r.verdict} (${r.findings})` : r.verdict]),
  }));

  annexes.push(regulatoryAnnex(f, next()));
  annexes.push(s2IndexAnnex(f, next()));

  annexes.push({ id: 'annexChecklist', annex: next(), title: 'PCAF disclosure checklist — completed', blocks: [b.checklist()] });
  return annexes;
}

/**
 * The endorsement-language guard, over this document's own prose and over the
 * reporting entity's statements alike.
 *
 * The entity's words are included deliberately. A governance paragraph typed
 * into a form reaches the same page as a sentence written here, and "PCAF
 * approved" is as false in one as in the other; a guard that only read our own
 * prose would leave the form as the route by which the claim returns. The
 * refusal names the offending phrases, so whoever recorded one can find it.
 */
function scanLanguage(f) {
  const prose = [f.conformanceStatement, f.coverageStatement, f.scopeStatement, f.assuranceDetail,
    f.s2 ? proseOf(f.s2) : null,
    ...(f.KYOTO_GASES || []).map(g => g.arises)].filter(Boolean).join('\n');
  return containsForbiddenLanguage(prose);
}

function buildStandardModel(f) {
  const offending = scanLanguage(f);
  if (offending.length > 0) {
    throw new Error(`Report blocked: PCAF endorsement language detected (${offending.join(', ')}). Only conformance language is permitted.`);
  }
  const sections = buildSections(f);
  /* Sections are numbered as they are written, so the S2 index can name the
     number a reader will actually see. Computed here rather than in the index
     itself: one list, built once, and a cross-reference that cannot point at a
     section the model did not build. */
  f.sectionTitles = sections.map((s, i) => ({ id: s.id, number: i + 1, title: s.title }));
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
