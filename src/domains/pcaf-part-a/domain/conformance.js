// @ts-check
/**
 * CarbonIQ FinTech — PCAF Part A §5.2: Conformance Matrix
 *
 * A machine-readable statement of what the §5.2 engine (business loans and
 * unlisted equity) claims to implement, where each rule lives in code, and
 * which test proves it still holds. This is the model the north star sets:
 * every module carries its own conformance evidence or it is not done.
 *
 * "Conformant" is a claim, and a claim a reviewer cannot check is worth
 * little. Anyone assessing this engine — a bank's auditor, an assurance
 * provider, a standards body — can take any row below, open the named file,
 * run the named test, and see the rule enforced. When a rule stops being
 * enforced, its test fails and the matrix is wrong in a way CI catches; and
 * `scripts/conformance-evidence.js` runs each rule's own test under coverage
 * restricted to the files it cites, so a rule that names code no path reaches
 * is reported unproven rather than passing on a citation that merely resolves.
 *
 * This is the §5.2 asset class, one input to a bank's Chapter 6 disclosure,
 * not the disclosure. It is kept apart from Part C's matrix
 * (`src/domains/pcaf-part-c/domain/conformance.js`) because the two scopes
 * never merge, and the option-to-score mapping is not shared between them: the
 * numerals mean different things and reusing one for the other would be wrong
 * silently.
 *
 * What this is NOT: PCAF does not approve, endorse or certify software, and
 * nothing here should be read as saying otherwise. This is a self-declaration
 * of conformance with the method as published, offered with the evidence
 * needed to check it. The Third Edition's asset-class additions have not been
 * reviewed by the GHG Protocol; this asset class carries the "Built on" mark,
 * and the two are not blurred.
 *
 * `status` values:
 *   implemented — the rule is enforced in code and covered by a test
 *   partial     — enforced for the scope stated in `limitation`
 *   excluded    — deliberately out of scope, with the reason given
 *
 * `evidence` values (VALID_EVIDENCE):
 *   execution — the cited test runs the cited code (the default)
 *   absence   — the rule is that no path exists, so the cited code must *not*
 *               run; the proving test asserts the absence and a coverage
 *               figure would be the wrong evidence
 */

'use strict';

const STANDARD = 'PCAF Global GHG Accounting and Reporting Standard — Part A: Financed Emissions, '
  + 'Third Edition (December 2025), §5.2 (business loans and unlisted equity) and Chapter 6';

const { RULES } = require('./conformance-rules');

/** Summary counts by status. */
function summarise(rules = RULES) {
  return rules.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    acc.total = (acc.total || 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));
}

/** The full matrix, with the standing disclaimer attached. */
function conformanceMatrix() {
  return {
    standard: STANDARD,
    statement: 'Self-declaration of conformance with the published method for the §5.2 asset class, '
      + 'offered with the evidence needed to verify it. Every rule names the code that enforces it '
      + 'and the test that proves it.',
    disclaimer: 'PCAF does not approve, endorse or certify software or service providers. Nothing in '
      + 'this matrix should be read as claiming that it does. The Third Edition’s asset-class '
      + 'additions have not been reviewed by the GHG Protocol.',
    summary: summarise(),
    rules: RULES,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * How a rule is proved. `scripts/conformance-evidence.js` reads this: an
 * `execution` rule whose proving test executes no statement of its
 * implementation is reported unproven; an `absence` rule is not held to a
 * coverage figure it should never produce.
 */
const VALID_EVIDENCE = ['execution', 'absence'];

module.exports = { conformanceMatrix, summarise, RULES, STANDARD, VALID_EVIDENCE };
