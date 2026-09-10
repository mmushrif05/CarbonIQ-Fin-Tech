// @ts-check
/**
 * What every report carries: the gaps list, and the rule that a report is never called complete while an item is unmet.
 */

'use strict';

const integrity = require('../../../../shared/report-integrity');

/**
 * Attach the report's own list of what it could not state.
 *
 * A reader should not have to hunt through the body to discover which
 * disclosures are missing — and an assurance provider will ask for exactly
 * this list first. It is derived from the built report, so it cannot claim
 * completeness the sections do not have.
 */
function _withGaps(report) {
  const gaps = integrity.collectGaps(report);

  /* A checklist item that is not met is a gap too. Without this the summary
     could report "complete" while the body of the same report carried a
     failing item — which is the defect this whole module exists to stop. */
  for (const c of report.complianceChecklist || []) {
    if (!c.met) {
      gaps.push({
        path: 'complianceChecklist',
        status: integrity.NOT_PROVIDED,
        what: c.item,
        standardRef: c.standardRef || null,
      });
    }
  }

  report.gaps = {
    count: gaps.length,
    complete: gaps.length === 0,
    note: gaps.length === 0
      ? 'Every disclosure in this report is either measured from portfolio data or '
        + 'supplied by the reporting entity.'
      : 'The following disclosures are required by the cited standard and are not '
        + 'present. They are entity-level statements or figures this system does '
        + 'not measure, and are reported as absent rather than estimated.',
    items: gaps,
  };
  return report;
}

module.exports = { _withGaps };
