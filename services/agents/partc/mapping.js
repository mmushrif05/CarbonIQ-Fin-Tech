/**
 * CarbonIQ FinTech — PCAF Part C: Mapping Agent
 *
 * Turns a bill of quantities — any length, any wording — into materials the
 * engine can compute with. This is where the intelligence actually pays.
 *
 * A single BOQ line such as "Providing and laying 1:2:4 cement concrete in
 * foundations, 18.65 m3" needs four independent lookups resolved: the
 * material key, the density, the RICS Table 18 waste category, and the
 * service-life category. Today that is a quantity surveyor with four
 * reference tables open. The agent proposes all four with a confidence and a
 * reason, and every one remains overridable.
 *
 * It also identifies demolition scope, so A5.1 needs no separate question.
 */

'use strict';

const { TOOL_FUNCTIONS, TOOL_DEFINITIONS } = require('./tools');

const SYSTEM_PROMPT = `You are a quantity surveyor mapping a bill of quantities onto emission-factor keys for a PCAF Part C assessment.

STEP 1 — Call list_factor_keys. Map only onto keys that actually exist in that list. Use lookup_factor when choosing between two candidates and the data-quality tier or source matters.

STEP 2 — For every BOQ line, resolve four things:
  1. quantity and unit (m3, m2, m, MT, kg, Nr) — normalise the unit
  2. densityKey (for m3 quantities) OR massFactorKey (for everything else) — never both
  3. wasteCategory — the closest RICS Table 18 name
  4. serviceLifeCategory

STEP 3 — Separate demolition from new work.
Lines describing demolition, removal, dismantling, breaking out or site clearance are DEMOLITION items, not construction materials. Return them in "demolitionItems", mapped the same way. They drive A5.1. If the BOQ contains no demolition scope, return an empty array — do not invent one, and do not use construction quantities as a proxy for demolition.

STEP 4 — Skip lines that carry no material mass: labour, preliminaries, professional fees, testing, provisional sums, day works. List them in "excluded" with a reason.

RULES
- Never invent a factor key. If nothing fits, set the key to null, set confidence to "low", and explain in "reason". The engine will apply a documented fallback and disclose it.
- State a confidence for every line: high (unambiguous), medium (reasonable reading), low (guess — needs a human).
- Where a line is ambiguous, say what the alternative reading would be.
- Prefer specificity: "Concrete blocks (dense/medium density)" beats "Concrete in situ" for blockwork.

OUTPUT — return JSON only:
{
  "materials": [ { "id","name","sourceText","quantity","unit","densityKey","massFactorKey","wasteCategory","serviceLifeCategory","confidence","reason" } ],
  "demolitionItems": [ { "id","name","sourceText","quantity","unit","densityKey","massFactorKey","confidence","reason" } ],
  "excluded": [ { "sourceText","reason" } ],
  "summary": { "materialCount":0,"demolitionCount":0,"excludedCount":0,"lowConfidenceCount":0,
               "needsReview":[ "line text that a human should check" ] }
}`;

function buildUserMessage({ boqContent, boqFormat, projectName }) {
  return [
    'Map the following bill of quantities onto emission-factor keys.',
    '',
    `Project: ${projectName || 'not stated'}`,
    `Format: ${boqFormat || 'text'}`,
    '',
    '--- BILL OF QUANTITIES ---',
    boqContent || '(no content supplied)',
    '--- END ---',
    '',
    'Call list_factor_keys first, then return the JSON mapping. Separate demolition scope from new work.'
  ].join('\n');
}

module.exports = {
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS: TOOL_DEFINITIONS.filter(t =>
    ['list_factor_keys', 'lookup_factor'].includes(t.name)),
  TOOL_FUNCTIONS: {
    list_factor_keys: TOOL_FUNCTIONS.list_factor_keys,
    lookup_factor:    TOOL_FUNCTIONS.lookup_factor
  },
  buildUserMessage
};
