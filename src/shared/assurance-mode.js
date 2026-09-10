// @ts-check
/**
 * The two ways this tool may be operated, and what each one lets a document
 * claim.
 *
 * A bank or an insurer can use these engines in one of two postures, and the
 * difference is not a feature flag — it is what the resulting document is
 * entitled to say:
 *
 *   **self-declared** — the entity supplies its own baseline and its own
 *   values. The engine still does every arithmetic operation and every figure
 *   is still traced, so the *method* is unchanged; what is absent is any
 *   confirmation of the *inputs* from the tool provider or from Datum
 *   Solutions. A reader who is not told that will assume otherwise, because a
 *   document that cites a standard and prints a conformance statement looks
 *   like one somebody stood behind.
 *
 *   **verified** — the governed path. The figures rest on baselines that have
 *   been released rather than on the provisional set the tool ships with, and
 *   the entity has recorded who assured them, to what standard and at what
 *   level.
 *
 * **The mode is the tool provider's to set, never the reporting entity's.** A
 * client who could choose "verified" for themselves would be self-declaring by
 * a different name, and the word would stop meaning anything the first time it
 * was used.
 *
 * **And asking for `verified` is not the same as being in it.** `resolve()`
 * checks the conditions and **downgrades**, naming what is missing. That is
 * the whole point: a mode that could be asserted would be one more unverified
 * claim on a page full of verified ones, which is worse than not offering it —
 * the good claim is discredited the moment it sits beside an implied one
 * (`docs/adr/0008-conformance-language.md`).
 *
 * What neither mode touches: the arithmetic, the factor provenance, the
 * conformance matrix, or the data-quality score. Those are properties of the
 * calculation and are the same either way. This is about who stands behind the
 * inputs.
 */

'use strict';

/** The provider's choice. */
const MODES = Object.freeze(['self_declared', 'verified']);

/** The default, and the honest one: claim nothing nobody has checked. */
const DEFAULT_MODE = 'self_declared';

/**
 * What each mode is, and the sentence every document it produces must carry
 * on its face.
 *
 * The statements are deliberately plain and deliberately not reassuring. A
 * caveat written to be skipped is a caveat that has done nothing.
 */
const MODE_DETAIL = Object.freeze({
  self_declared: Object.freeze({
    id: 'self_declared',
    label: 'Self-declared',
    recommended: false,
    /** Printed on the cover of every document, and carried in every payload. */
    statement:
      'Self-declared. The figures in this document rest on the reporting entity’s own '
      + 'baseline and its own values. Neither the tool provider nor Datum Solutions has '
      + 'confirmed those inputs, and nothing here should be read as their opinion on them. '
      + 'The method is as stated and every figure is traced to what it was computed from; '
      + 'what has not been established is whether those inputs are right.',
    /** Why it is not the recommended posture. */
    caution:
      'Not recommended for a filed disclosure. An assurance provider reading this will '
      + 'have to establish the inputs themselves, which is the work the verified mode '
      + 'exists to have already done.',
  }),
  verified: Object.freeze({
    id: 'verified',
    label: 'Verified',
    recommended: true,
    statement:
      'Verified. The figures in this document rest on released baselines rather than on '
      + 'provisional values, and the reporting entity has recorded who assured them, to '
      + 'what standard and at what level. That recorded declaration is the entity’s and '
      + 'is reproduced in this document; it is not a statement by the tool provider about '
      + 'this particular figure.',
    caution: null,
  }),
});

/**
 * What `verified` rests on. Each is checkable, and each is checked.
 *
 * These are conditions about *governance*, not about how local every factor
 * is. A provisional emission factor is disclosed as provisional and travels
 * with its manifest; it is not a bar to the mode, because the whole point of a
 * governed regional baseline is that it is released over time. What is a bar
 * is claiming a governed position nobody has taken.
 */
const VERIFIED_REQUIRES = Object.freeze([
  Object.freeze({
    id: 'baselines_released',
    requirement: 'Every governed value this report reads resolves to a released baseline.',
    unmet: 'a governed value is still the provisional set this tool ships with',
  }),
  Object.freeze({
    id: 'assurance_declared',
    requirement: 'The reporting entity has recorded an external assurance position — a provider, a standard and a level.',
    unmet: 'the reporting entity has not recorded who assured these figures',
  }),
]);

/**
 * Resolve the mode a document may actually claim.
 *
 * @param {object} input
 * @param {string} [input.requested] what the provider set for this deployment
 * @param {object} [input.evidence]
 * @param {boolean} [input.evidence.baselinesReleased]
 * @param {string[]} [input.evidence.provisionalBaselines] which values are still provisional
 * @param {boolean} [input.evidence.assuranceDeclared]
 * @returns {{mode: string, label: string, requested: string, downgraded: boolean,
 *   statement: string, caution: string|null, recommended: boolean,
 *   unmet: Array<{id: string, requirement: string, because: string}>}}
 */
function resolve({ requested, evidence } = {}) {
  const asked = MODES.includes(String(requested)) ? String(requested) : DEFAULT_MODE;
  const e = evidence || {};

  const unmet = [];
  if (asked === 'verified') {
    if (!e.baselinesReleased) {
      const which = (e.provisionalBaselines || []).length
        ? `: ${(e.provisionalBaselines || []).join(', ')}`
        : '';
      unmet.push({
        id: 'baselines_released',
        requirement: VERIFIED_REQUIRES[0].requirement,
        because: `${VERIFIED_REQUIRES[0].unmet}${which}`,
      });
    }
    if (!e.assuranceDeclared) {
      unmet.push({
        id: 'assurance_declared',
        requirement: VERIFIED_REQUIRES[1].requirement,
        because: VERIFIED_REQUIRES[1].unmet,
      });
    }
  }

  const mode = unmet.length ? DEFAULT_MODE : asked;
  const detail = MODE_DETAIL[mode];

  return {
    mode,
    label: detail.label,
    requested: asked,
    downgraded: mode !== asked,
    statement: detail.statement,
    caution: detail.caution,
    recommended: detail.recommended,
    unmet,
  };
}

/**
 * The sentence a document prints, including the reason where a request was
 * downgraded — because "self-declared" on a deployment that asked to be
 * verified is a fact the reader is entitled to the cause of.
 *
 * @param {ReturnType<typeof resolve>} resolved
 * @returns {string}
 */
function faceStatement(resolved) {
  if (!resolved.downgraded) return resolved.statement;
  const because = resolved.unmet.map(u => u.because).join('; ');
  return `${resolved.statement} This deployment is configured as verified; it is reported `
    + `self-declared because ${because}.`;
}

module.exports = { MODES, DEFAULT_MODE, MODE_DETAIL, VERIFIED_REQUIRES, resolve, faceStatement };
