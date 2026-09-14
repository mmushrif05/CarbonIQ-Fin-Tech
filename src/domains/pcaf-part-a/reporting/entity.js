// @ts-check
/**
 * The reporting entity, as a Part A document states it.
 *
 * Everything here is a declared fact — a name, a boundary, a date, a person —
 * that only the entity can supply and that a verifier under ISO 14064-3 /
 * ISAE 3000 has to see before anything else: who is reporting, on which
 * organisational boundary, for which period, on which GWP basis, and who
 * stands behind the document. None of it is computed. Where the entity has
 * not stated a fact, the block says "not stated" and the checklist answers No,
 * because a default printed in its place would be a claim the entity never
 * made.
 *
 * Shared by the §5.2, §5.9 and consolidated documents so that three documents
 * from one book cannot describe three different entities.
 */

'use strict';

const { CONSOLIDATION_APPROACHES, ASSET_CLASSES } = require('../application/parta-settings');

const NOT_STATED = 'Not stated';

/** The reporting period a fiscal year-end implies for a reporting year. */
function periodOf(reportingYear, fiscalYearEnd) {
  const y = Number(reportingYear);
  if (!Number.isFinite(y) || !/^\d{2}-\d{2}$/.test(String(fiscalYearEnd || ''))) return null;
  const [mm, dd] = String(fiscalYearEnd).split('-').map(Number);
  const end = new Date(Date.UTC(y, mm - 1, dd));
  if (Number.isNaN(end.getTime()) || end.getUTCMonth() !== mm - 1) return null;
  const start = new Date(Date.UTC(y - 1, mm - 1, dd + 1));
  const iso = d => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), positionDate: iso(end) };
}

const personLine = (p, verb) => {
  if (!p || !p.name) return null;
  const role = p.role ? `, ${p.role}` : '';
  const date = p.date ? ` on ${p.date}` : '';
  return `${verb} by ${p.name}${role}${date}`;
};

/**
 * The entity block for a document, from the settings record.
 *
 * @param {any} settings   the org-wide Part A settings (parta-settings)
 * @param {string|number|null} reportingYear
 * @param {string} [fallbackName]  a name a caller supplied on the request, honoured where the entity has stated none
 */
function entityOf(settings, reportingYear, fallbackName) {
  const s = settings || {};
  const name = s.reportingEntity || fallbackName || null;
  const approach = s.consolidationApproach && CONSOLIDATION_APPROACHES[s.consolidationApproach]
    ? { key: s.consolidationApproach, label: CONSOLIDATION_APPROACHES[s.consolidationApproach] }
    : null;
  const period = periodOf(reportingYear, s.fiscalYearEnd);
  const preparedBy = s.preparedBy && s.preparedBy.name ? s.preparedBy : null;
  const approvedBy = s.approvedBy && s.approvedBy.name ? s.approvedBy : null;

  const byClass = new Map(ASSET_CLASSES.map(c => [c.assetClass, c]));
  const notReported = (Array.isArray(s.assetClassesNotReported) ? s.assetClassesNotReported : [])
    .filter(x => x && byClass.has(x.assetClass))
    .map(x => ({ ...byClass.get(x.assetClass), reason: x.reason }));

  return {
    name,
    nameStated: Boolean(s.reportingEntity),
    consolidationApproach: approach,
    boundaryNote: s.boundaryNote || '',
    fiscalYearEnd: s.fiscalYearEnd || null,
    period,
    gwpBasis: s.gwpBasis || null,
    preparedBy,
    approvedBy,
    assetClassesNotReported: notReported,
    /* The lines the cover prints. Empty where nothing is stated, so a cover
       never carries "Prepared by Not stated". */
    responsibleParty: [personLine(preparedBy, 'Prepared'), personLine(approvedBy, 'Approved')].filter(Boolean),
    /* What the entity has not stated, each with the clause that asks for it —
       the limitations section lists these and the checklist answers from them. */
    gaps: [
      !s.reportingEntity ? { what: 'The reporting entity’s legal name', clause: 'Part A ch.6 (p.161)' } : null,
      !approach ? { what: 'The consolidation approach (operational control, financial control or equity share)', clause: 'Part A ch.6 (p.161); GHG Protocol Corporate Standard ch.3' } : null,
      !period ? { what: 'The fiscal year-end the position is taken at', clause: 'Part A ch.4; ch.6 (p.161)' } : null,
      !s.gwpBasis ? { what: 'The IPCC assessment report the CO2e global warming potentials come from', clause: 'Part A ch.6 (p.163)' } : null,
      !preparedBy ? { what: 'Who prepared the disclosure', clause: 'ISAE 3000 §12(a) — the responsible party' } : null,
      !approvedBy ? { what: 'Who approved the disclosure, and when', clause: 'ISAE 3000 §12(a) — the responsible party' } : null,
    ].filter(Boolean),
  };
}

/** The word a table prints for an unstated fact. */
function stated(v) { return (v === null || v === undefined || v === '') ? NOT_STATED : String(v); }

module.exports = { entityOf, periodOf, stated, NOT_STATED };
