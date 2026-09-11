// @ts-check
/**
 * The third verdict.
 *
 * An engine that only refuses is a gate, and a gate on a book of five thousand
 * SME loans is a product nobody finishes onboarding. An engine that never
 * refuses is a calculator, and a calculator will happily print a score of 2 on
 * evidence worth a 5. Both failures are real and they pull in opposite
 * directions, so the line between them has to be stated once, here, rather
 * than decided case by case in twenty route handlers.
 *
 * **The engine never blocks a number. It blocks a claim.**
 *
 * A refusal — a thrown error — is for an input that would make the arithmetic
 * wrong or the figure uncitable: a holding larger than the company, a
 * numerator and denominator on different dates, a factor with no publisher, a
 * score of 1 claimed with no named verifier. There is always a way forward
 * from one, and it is the standard's own: every asset class here has an option
 * that needs nothing but the outstanding amount and a sector factor. A bank
 * can always report. What it cannot do is call that figure something it is not.
 *
 * A **finding** is for an input that yields a correct figure at a correctly
 * lower score, or a disclosure the standard asks for and the data does not yet
 * support. It does not stop the assessment. It travels with the figure into
 * the report, and the same list, sorted by what each fix would move, is the
 * improvement plan. Two severities, and the difference is whether a reader of
 * the disclosure needs to know:
 *
 *   material   a reader of the figure has to be told — it changes how the
 *              number should be read (a balance-sheet fallback denominator, a
 *              year-end balance far below the year's average, an economic
 *              factor seven years old with no deflator)
 *   advisory   worth fixing, changes nothing a reader would act on (minority
 *              interests omitted under the precautionary principle, which
 *              moves the figure the conservative way)
 *
 * A finding that fires on everything is a finding readers learn to skip, which
 * is the same defect as a flag with no floor — recorded here because this
 * codebase has shipped it once already, in the GCF size check.
 */

'use strict';

const SEVERITIES = Object.freeze(['material', 'advisory']);

/**
 * @param {Object} f
 * @param {string} f.code       stable, so a report can group on it
 * @param {'material'|'advisory'} f.severity
 * @param {string} f.field      the input this is about
 * @param {string} f.statement  what is true, in the reader's terms
 * @param {string} f.effect     what it does to the figure or the score
 * @param {string} f.remedy     what evidence would clear it
 * @param {string} f.reference  the clause that makes it a finding
 * @param {Object} [f.observed] the figures behind it, for the trace
 */
function finding(f) {
  if (!SEVERITIES.includes(f.severity)) {
    throw new Error(`Finding ${f.code} has severity "${f.severity}"; use material or advisory. `
      + 'A blocking problem is a thrown refusal, not a finding.');
  }
  for (const k of ['code', 'field', 'statement', 'effect', 'remedy', 'reference']) {
    if (!f[k]) throw new Error(`Finding ${f.code || '(unnamed)'} is missing ${k}. A finding without a remedy `
      + 'is a complaint: the reader is told something is wrong and not what would fix it.');
  }
  return Object.freeze({
    code: f.code, severity: f.severity, field: f.field,
    statement: f.statement, effect: f.effect, remedy: f.remedy,
    reference: f.reference,
    observed: f.observed || null,
  });
}

/** Collects findings for one assessment and states the verdict. */
function register() {
  const found = [];
  return {
    add(f) { if (f) found.push(finding(f)); return this; },
    /** @param {boolean} condition */
    when(condition, f) { if (condition) this.add(f); return this; },
    result() {
      const material = found.filter(f => f.severity === 'material');
      return {
        verdict: found.length === 0 ? 'clean' : 'accepted_with_findings',
        findings: found.slice(),
        counts: { material: material.length, advisory: found.length - material.length },
        note: found.length === 0
          ? 'Every input this class checks was present and internally consistent.'
          : 'The assessment stands. Each finding names what it does to the figure or the score and what '
            + 'evidence would clear it; the material ones belong in the disclosure beside the figure.',
      };
    },
  };
}

module.exports = { finding, register, SEVERITIES };
