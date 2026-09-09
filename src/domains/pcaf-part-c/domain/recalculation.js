/**
 * The GHG Protocol Scope 3 recalculation triggers, as Part C's checklist
 * expects them to be declared. A domain fact: the schema defaults to it and
 * the settings record prints it, but neither owns it.
 */

'use strict';

/*
 * The default recalculation triggers, taken from the GHG Protocol Corporate
 * Value Chain (Scope 3) Standard and phrased for an insurance book. An entity
 * may extend them, but it may not publish a disclosure carrying none: a
 * recalculation protocol is a "shall" in the Part C checklist.
 */
const RECALCULATION_TRIGGERS = [
  'Structural change to the book — an acquisition, disposal or merger that moves policies into or out of the inventory.',
  'A change of calculation methodology, or of the emission factors relied on, that materially changes reported emissions.',
  'A change in the boundary of what is measured — a line of business, module or policy type entering or leaving the inventory.',
  'Discovery of a material error, or of several errors that are material in aggregate.',
  'A bill of quantities revision that moves a locked assessment by at least the restatement threshold.'
];

module.exports = { RECALCULATION_TRIGGERS };
