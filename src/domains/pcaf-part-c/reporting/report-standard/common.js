// @ts-check
/**
 * Shared constants and helpers of partc-report-standard.js.
 */

'use strict';

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

const content = require('../../../../shared/content');

const N  = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const T  = (kg, dp = 3) => (Number(kg || 0) / 1000).toFixed(dp);
const F4 = n => Number(n || 0).toFixed(4);
const pct = n => (n === null || n === undefined) ? 'not stated' : `${Number(n).toFixed(1)}%`;
/*
 * A PCAF data-quality score is a category on a 1-5 scale where 1 is best. It
 * is never written "3 / 5": that reads as a mark out of five and inverts the
 * meaning for anyone who has not read the standard. A weighted score across
 * a book is an average of those categories and is written to two decimals.
 */
const score  = n => (n === null || n === undefined) ? 'not scored' : String(n);
const wscore = n => (n === null || n === undefined) ? 'not scored' : Number(n).toFixed(2);
/* Four statements a deployment may reword, resolved through the content
   layer. Everything else in this file states what the standard requires and
   stays here, where the tests that hold it can reach it: a sentence a
   compliance officer can edit out of a disclosure is a rule they can edit out
   of a disclosure.

   Resolved once at load: the override file is a deployment's setting, not a
   per-request one, so a change to it takes effect on the next boot. */
const SCALE_QUALIFIER = content.text('report.scaleQualifier');

const PREPARED_BY = content.text('report.preparedBy');

/* The seven gases the Kyoto Protocol covers, and where each can arise in a
   construction insurance value chain. Named individually because the
   checklist asks for the seven, not for "greenhouse gases". */
const KYOTO_GASES = [
  { gas: 'Carbon dioxide', formula: 'CO2',  arises: 'Fuel combustion in freight and site plant; grid electricity; cement and steel production upstream.' },
  { gas: 'Methane',        formula: 'CH4',  arises: 'Fuel supply chains and the decomposition of construction waste sent to landfill.' },
  { gas: 'Nitrous oxide',  formula: 'N2O',  arises: 'Combustion in freight and site plant; wastewater treatment.' },
  { gas: 'Hydrofluorocarbons', formula: 'HFCs', arises: 'Refrigerant leakage from installed cooling plant, and release at replacement (B1 and B4).' },
  { gas: 'Perfluorocarbons',   formula: 'PFCs', arises: 'Primary aluminium production upstream of the bill of quantities.' },
  { gas: 'Sulphur hexafluoride', formula: 'SF6', arises: 'Electrical switchgear on larger sites.' },
  { gas: 'Nitrogen trifluoride', formula: 'NF3', arises: 'Not expected in a construction value chain; accounted for where it arises.' }
];

const UNITS_STATEMENT = content.text('report.unitsStatement');

const FINANCED_EMISSIONS_STATEMENT = content.text('report.financedEmissionsStatement');

module.exports = { N, T, F4, pct, score, wscore, SCALE_QUALIFIER, PREPARED_BY, KYOTO_GASES, UNITS_STATEMENT, FINANCED_EMISSIONS_STATEMENT };
