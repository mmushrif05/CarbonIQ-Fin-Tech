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

/**
 * The keys are constants, so they are given rather than fetched.
 *
 * list_factor_keys takes no arguments and returns the same 1,851 bytes every
 * time, and both prompts used to open by ordering the model to call it. That
 * made a round-trip mandatory before any mapping could begin — and on the PDF
 * path the second turn then carried the whole document in history again. Two
 * model calls minimum, for data that never changes, inside a 26-second
 * function. It could not fit, and the platform killed the process rather than
 * returning an error anyone could read.
 *
 * Inlining costs nothing: the system prompt carries a cache breakpoint, so
 * after the first request this text is read from cache.
 */
const FACTOR_CATALOGUE = JSON.stringify(TOOL_FUNCTIONS.list_factor_keys());

const SYSTEM_PROMPT = `You are a quantity surveyor mapping a bill of quantities onto emission-factor keys for a PCAF Part C assessment.

THE ONLY KEYS THAT EXIST — map onto these and nothing else:
${FACTOR_CATALOGUE}

Use lookup_factor only when you are choosing between two candidates from that list and the data-quality tier or named source decides it. It is not needed to discover keys; every key is above.

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
    'Return the JSON mapping. Separate demolition scope from new work.'
  ].join('\n');
}

/**
 * Mapping is classification against a fixed vocabulary, not open reasoning.
 *
 * Adaptive thinking and a 32,000-token ceiling belong to the agents that weigh
 * regulation — underwriting, covenant design. Here they buy nothing and cost
 * the one resource this request has none of: wall clock.
 */
const CALL_PROFILE = { maxTokens: 8000, thinking: null };

module.exports = {
  SYSTEM_PROMPT,
  CALL_PROFILE,
  /* list_factor_keys is deliberately absent: its answer is already in the
     system prompt, so offering it only invites a round-trip to be told what
     the model has already read. */
  TOOL_DEFINITIONS: TOOL_DEFINITIONS.filter(t => t.name === 'lookup_factor'),
  TOOL_FUNCTIONS: {
    lookup_factor: TOOL_FUNCTIONS.lookup_factor
  },
  buildUserMessage
};
