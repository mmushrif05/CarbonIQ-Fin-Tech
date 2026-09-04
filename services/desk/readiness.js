/**
 * CarbonIQ FinTech — year-end readiness, on the desk
 *
 * The two questions a compliance officer arrives with in the last month of a
 * reporting year: **what can this disclosure not state**, and **how far is
 * each candidate from a submission**. Both are already answered in full on the
 * GCF Pipeline tab; neither is answered anywhere a desk can see at a glance.
 *
 * Nothing is moved off the research screen to build this. The Reporting and
 * Concept Note sub-tabs stay exactly where they are, with the full workings.
 * This is the same data read once more, compressed to the two counts that
 * decide whether anybody needs to act this month — the same relationship the
 * Fund Desk has to the pipeline screen.
 *
 * ── What it must not do ────────────────────────────────────────────────────
 *
 * **Never report a gap as closed because it is inconvenient.** The gaps come
 * from `report-integrity.collectGaps`, which answers from the report rather
 * than asserting, so the list can be long and that is the point.
 *
 * **Never let readiness read as nearness to submission.** `pctHeld` measures
 * what this system holds, not how close a Concept Note is: 19 external inputs
 * outstanding on a project that is 68% held is a worklist, not a countdown.
 * The wording travels with the figure.
 */

'use strict';

const reporting = require('../gcf/reporting');
const cnPackage = require('../gcf/cn-package');

/**
 * @param {object[]} projects
 * @param {object} opts  accreditation, entityDisclosures, reportingYear, sample
 */
function readiness(projects = [], {
  accreditation = {}, entityDisclosures = null, reportingYear, sample = false, sampleNote = null,
} = {}) {
  const report = reporting.buildDisclosure(projects, {
    reportingYear,
    entityDisclosures,
    sample,
    sampleNote,
  });

  /* The entity facts nobody but the entity can state. Absent until recorded,
     and reported absent with the clause that requires them — the failure
     `services/report-integrity.js` exists to prevent. */
  const ENTITY_FACTS = [
    ['climateGovernance', 'Board oversight of climate matters'],
    ['managementRole', "Management's role in assessing and managing climate risk"],
    ['strategyNarrative', 'Strategy and decision-making narrative'],
    ['riskManagementProcess', 'Risk identification and management process'],
    ['climateTargets', "The entity's own climate targets"],
  ];
  const entity = ENTITY_FACTS.map(([key, label]) => {
    const v = entityDisclosures ? entityDisclosures[key] : null;
    const held = Array.isArray(v) ? v.length > 0 : Boolean(v && String(v).trim());
    return { key, label, held };
  });

  const packages = projects.map((p) => {
    const pkg = cnPackage.buildPackage(p, { accreditation, sample, sampleNote });
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      stream: p.stream,
      total: pkg.readiness.total,
      held: pkg.readiness.held,
      partial: pkg.readiness.partial,
      external: pkg.readiness.external,
      pctHeld: pkg.readiness.pctHeld,
      /* A package is never complete while an external input is outstanding.
         The flag is derived rather than asserted, so it cannot say otherwise. */
      complete: pkg.readiness.external === 0 && pkg.readiness.partial === 0,
    };
  }).sort((a, b) => a.external - b.external || String(a.code).localeCompare(String(b.code)));

  const gaps = report.gaps || [];

  return {
    reportingYear: report.basis.reportingYear ?? reportingYear ?? null,

    disclosure: {
      gaps: gaps.length,
      checklistMet: (report.checklist || []).filter(c => c.met).length,
      checklistTotal: (report.checklist || []).length,
      complete: report.complete === true,
      completenessNote: report.completenessNote || null,
      /* The whole list would not fit on a desk and does not need to: the top
         few are what somebody acts on this month, and the count says how many
         more there are. The full list is on the reporting screen. */
      top: gaps.slice(0, 5).map(g => (typeof g === 'string' ? g : (g.what || g.item || g.clause || ''))),
      more: Math.max(0, gaps.length - 5),
      note: 'Items required by SLFRS S1 / S2 that cannot be stated from the data held. '
        + 'This report is one input to a disclosure, not the disclosure itself.',
    },

    entity: {
      recorded: entity.filter(e => e.held).length,
      total: entity.length,
      facts: entity,
      note: 'Governance, strategy, risk-process and target disclosures recorded by the '
        + 'reporting entity. Reported as unavailable until recorded.',
    },

    conceptNotes: {
      projects: packages,
      outstanding: packages.reduce((t, p) => t + p.external + p.partial, 0),
      readyCount: packages.filter(p => p.complete).length,
      note: 'Counts inputs held in this system. External inputs must be obtained from the '
        + 'project sponsor or a third party before submission.',
    },

    sample,
    sampleNote,
  };
}

module.exports = { readiness };
