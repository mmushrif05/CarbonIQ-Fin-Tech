// @ts-check
/**
 * CarbonIQ FinTech — the standard Part C disclosure document
 *
 * One content model, in the order PCAF's Part C disclosure checklist reads,
 * rendered to PDF and to Word by one renderer. Two documents are built from
 * it: the per-assessment report, which explains one project, and the annual
 * disclosure, which explains a position. They share this model rather than
 * two templates, so a requirement satisfied in one cannot quietly go missing
 * from the other.
 *
 * The order is the checklist's, not ours:
 *
 *   1  Cover                        7  Recalculation and significance
 *   2  Scope and coverage           8  Emission intensity
 *   3  Gases and units              9  Limitations and assumptions
 *   4  Absolute emissions          10  Conformance statement
 *   5  Methodology                 11  Annexes, including the completed
 *   6  Data quality                    disclosure checklist
 *
 * Nothing here computes an emission. Every figure arrives from an engine
 * execution and every factor from the audit trail that execution produced;
 * this module arranges them and says where each came from.
 */

'use strict';

const { assessmentFacts, annualFacts } = require('./report-standard/facts');
const { buildSections } = require('./report-standard/sections');
const { buildAnnexes, buildStandardModel } = require('./report-standard/model');
const { renderStandardPDF } = require('./report-standard/render-pdf');
const { renderStandardDOCX } = require('./report-standard/render-docx');
const { KYOTO_GASES, UNITS_STATEMENT, FINANCED_EMISSIONS_STATEMENT } = require('./report-standard/common');

module.exports = {
  KYOTO_GASES, UNITS_STATEMENT, FINANCED_EMISSIONS_STATEMENT,
  assessmentFacts, annualFacts, buildSections, buildAnnexes,
  buildStandardModel, renderStandardPDF, renderStandardDOCX
};
