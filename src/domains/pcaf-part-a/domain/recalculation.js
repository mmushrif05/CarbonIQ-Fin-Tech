// @ts-check
/**
 * PCAF Part A §5.2 — the recalculation protocol, as a domain fact.
 *
 * Chapter 6 makes a stated recalculation protocol and a stated significance
 * threshold a "shall": a disclosure has to say what would force it to restate
 * a base-year figure, and how large a movement is significant enough to force
 * it. The triggers below are the GHG Protocol Corporate Value Chain (Scope 3)
 * Standard's, phrased for a lending book, plus the two that are Part A's own —
 * a released sector-factor set and a released intensity band both move figures
 * the entity did not re-key.
 *
 * This is a domain fact: the settings record defaults to it and the disclosure
 * prints it, but neither owns it. It is Part A's, not shared with Part C —
 * the two scopes never merge, and the triggers a lending book recalculates on
 * are not the triggers an insurance book does.
 */

'use strict';

/**
 * The default recalculation triggers. An entity may extend them, but a §5.2
 * disclosure that carried none would be claiming a base year it never has to
 * revisit, which is the opposite of what Chapter 6 asks.
 */
const RECALCULATION_TRIGGERS = [
  'Structural change to the book — an acquisition, disposal or merger that moves exposures into or out of the inventory.',
  'A change of calculation methodology, or of the emission factors relied on, that materially changes reported emissions.',
  'A change in the boundary of what is measured — an asset class or a business line entering or leaving the inventory.',
  'Discovery of a material error, or of several errors that are material in aggregate.',
  'A released sector-factor set or a released sector intensity band that moves a reported figure by at least the significance threshold.',
];

const DEFAULT_SIGNIFICANCE_THRESHOLD_PCT = 5;

/**
 * Is a movement significant against the entity's threshold? A movement is
 * significant when its magnitude reaches the threshold; a null movement (a
 * figure that was zero, or is newly present) is never silently called
 * insignificant — it is returned as unknown so a reader is not told a change
 * they cannot see the size of is too small to matter.
 *
 * @param {number|null|undefined} movementPct  signed percentage movement
 * @param {number} [thresholdPct]
 * @returns {{ significant: boolean|null, thresholdPct: number }}
 */
function significanceOf(movementPct, thresholdPct = DEFAULT_SIGNIFICANCE_THRESHOLD_PCT) {
  const t = Number.isFinite(Number(thresholdPct)) ? Number(thresholdPct) : DEFAULT_SIGNIFICANCE_THRESHOLD_PCT;
  if (movementPct === null || movementPct === undefined || !Number.isFinite(Number(movementPct))) {
    return { significant: null, thresholdPct: t };
  }
  return { significant: Math.abs(Number(movementPct)) >= t, thresholdPct: t };
}

/**
 * The significance verdict a recomputation carries: whether the movement
 * reaches the entity's threshold, and what that means. The largest line
 * movement is judged as well as the headline, because a change reaching only
 * scope 3 can be significant while scope 1 and 2 did not move.
 *
 * @param {{ moved: boolean, headlinePct: number|null, largestLinePct: number|null }} m
 * @param {number} [thresholdPct]
 */
function movementSignificance(m, thresholdPct) {
  const headline = significanceOf(m.headlinePct, thresholdPct);
  const largest = significanceOf(m.moved ? m.largestLinePct : 0, thresholdPct);
  const significant = headline.significant === true || largest.significant === true;
  return {
    thresholdPct: headline.thresholdPct,
    significant,
    note: !m.moved
      ? 'No figure moved, so no recalculation is triggered.'
      : significant
        ? `A movement of at least ${headline.thresholdPct}% is significant under the entity's recalculation protocol. `
          + 'Once the lock-and-supersede lifecycle is built this would require restating the figure with a recorded reason; '
          + 'for now it is reported rather than silently absorbed.'
        : `The movement is below the entity's ${headline.thresholdPct}% significance threshold, so it is reported but is not a recalculation trigger.`,
  };
}

module.exports = { RECALCULATION_TRIGGERS, DEFAULT_SIGNIFICANCE_THRESHOLD_PCT, significanceOf, movementSignificance };
