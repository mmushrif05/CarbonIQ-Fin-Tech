// @ts-check
/**
 * Shared constants and helpers of partc-methodology.js.
 */

'use strict';

/**
 * CarbonIQ FinTech — PCAF Part C: the methodology statement
 *
 * What this is for
 * ----------------
 * A disclosure that shows only its results asks to be taken on trust. This
 * module produces the other half: the scope rule applied, every equation
 * executed, every emission factor consulted with its tier and named source,
 * how data quality is scored and aggregated, which rules the engine claims
 * to meet and which test proves each one — and what is deliberately not
 * claimed.
 *
 * Why it is generated rather than written
 * --------------------------------------
 * Every equation, input and factor below is extracted from an actual run of
 * the engine, not transcribed into prose alongside it. A hand-written
 * methodology drifts from the code the moment either changes, and the drift
 * is invisible precisely when it matters — under review. Here the document
 * cannot describe an equation the engine does not execute, because the
 * description is read out of the execution.
 *
 * The reference run is the workbook case, so the worked example reproduces a
 * figure that is independently checked by the acceptance tests.
 */




// The order a reader follows a project through, rather than alphabetical.
const MODULE_ORDER = [
  'gate', 'A4', 'A5.1', 'A5.2', 'A5.3', 'A5',
  'B1', 'B4', 'B7', 'attribution', 'rollup'
];

const MODULE_NARRATIVE = {
  gate:  'Cover type decides whether a use stage exists at all. Construction-only cover carries none, so B1, B4 and B7 are zero by scope rule rather than by omission — a distinction a reviewer cannot make from a zero on its own.',
  A4:    'Transport of materials to site. Each BOQ line is converted to mass, then carried over its own road, sea, rail and air legs. Materials are ranked so the vital few driving most of A4 are visible.',
  'A5.1': 'Demolition and site clearance: the mass removed, over the haul distance to disposal.',
  'A5.2': 'Site energy during construction. Method B uses the contractor\'s own fuel and electricity from a comparable previous project, scaled by floor area. Method A falls back to the RICS default where no such record exists — and says which was used.',
  'A5.3': 'Construction waste: the fraction of each material that becomes waste, carried to disposal.',
  A5:    'The construction total. A5.2 site energy typically dominates it, which is why a change in a bill of quantities moves the disclosed figure far less than a correction to a fuel log.',
  B1:    'Refrigerant leakage over the cover period. Optional under Part C and reported on its own line.',
  B4:    'Replacement of building services over the cover period. Optional, reported separately.',
  B7:    'Operational water over the cover period. Optional, reported separately.',
  attribution: 'The insurer\'s share. Premium over project cost, applied per policy against that policy\'s own project — never pooled across a book before attribution.',
  rollup: 'Construction (A4+A5) is the PCAF figure. Use stage (B1+B4+B7) is a separate line and is never added to it. The voluntary whole-life annex is excluded from both.'
};

function _round(n, dp = 2) {
  const f = Math.pow(10, dp);
  return Math.round((Number(n) || 0) * f) / f;
}

/** Order modules as a reader meets them, unknown ones last but stable. */
function _moduleRank(m) {
  const i = MODULE_ORDER.indexOf(m);
  return i === -1 ? MODULE_ORDER.length : i;
}

module.exports = { MODULE_ORDER, MODULE_NARRATIVE, _round, _moduleRank };
