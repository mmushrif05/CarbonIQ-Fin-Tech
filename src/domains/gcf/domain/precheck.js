// @ts-check
'use strict';

/**
 * The sponsor pre-check — a plain-language self-screen answered before the
 * full intake, turned into an advisory read.
 *
 * It is the educational moment in the workflow: a sponsor with basic GCF
 * knowledge answers a few questions, and the tool says in plain words whether
 * this looks like a project DFCC can take to the Fund, and what to check. Two
 * answers decide it — the counterfactual (the climate rationale rests on it)
 * and the environmental and social category (DFCC is accredited to B/I-2 under
 * Board decision B.36/10, so a category A project is outside its scope).
 *
 * It never blocks. A `stop` is the strongest thing it says, and it always
 * carries a way forward, because the bank and not the tool decides what it
 * submits. Answers are recorded as given, never believed.
 */

const VERDICTS = Object.freeze(['ok', 'attention', 'stop']);

/**
 * @param {object} answers the recorded preCheck answers
 * @param {{accreditation?: {essCategory?: string, sizeCategory?: string, sizeRange_usd?: number[], grantModality?: boolean}}} [opts]
 */
function precheck(answers = {}, opts = {}) {
  const acc = opts.accreditation || {};
  const essScope = acc.essCategory || 'B/I-2';
  const ceiling = Array.isArray(acc.sizeRange_usd) ? acc.sizeRange_usd[1] : 250e6;
  const items = [];

  const add = (id, question, verdict, note) => items.push({ id, question, verdict, note });

  // 1 — the counterfactual
  if (!answers.counterfactual || !String(answers.counterfactual).trim()) {
    add('counterfactual', 'What happens without the project?', 'attention',
      'Describe the counterfactual. Whether emissions are reduced, avoided or removed is decided by it, and the climate rationale rests on it.');
  } else {
    add('counterfactual', 'What happens without the project?', 'ok',
      'A counterfactual is described; the assessment will test it.');
  }

  // 2 — the environmental and social category (the gate)
  const cat = answers.essCategoryGuess;
  if (cat === 'A') {
    add('essCategory', 'Environmental and social category', 'stop',
      `A category A project is outside DFCC's accreditation (${essScope}) under Board decision B.36/10, so DFCC cannot act as the accredited entity. A smaller, separable component at category B or C may still qualify.`);
  } else if (cat === 'unsure' || !cat) {
    add('essCategory', 'Environmental and social category', 'attention',
      `Confirm the category. DFCC is accredited to ${essScope}; a category A project cannot be carried by DFCC as the accredited entity.`);
  } else {
    add('essCategory', 'Environmental and social category', 'ok',
      `Category ${cat} is within DFCC's accreditation (${essScope}).`);
  }

  // 3 — size against the accreditation ceiling
  const cost = answers.estimatedCost_usd;
  if (cost === null || cost === undefined || cost === '') {
    add('size', 'Approximate total cost', 'attention',
      'Give an approximate total cost so the size can be checked against the accreditation ceiling.');
  } else if (Number(cost) > ceiling) {
    add('size', 'Approximate total cost', 'attention',
      `The estimate is above DFCC's accredited ceiling of USD ${Number(ceiling).toLocaleString('en-US')}; a larger project needs a differently accredited entity.`);
  } else {
    add('size', 'Approximate total cost', 'ok',
      'Within the accredited size range.');
  }

  // 4 — adaptation with no revenue, and grant dependence: the mandate question
  const adaptation = answers.stream === 'adaptation';
  if (answers.dependsOnGrant === true || (adaptation && answers.hasRevenueStream === false)) {
    add('mandate', 'How the benefit is paid for', 'attention',
      'The design appears to depend on a grant or on an outcome no market pays for. The structure that reaches it needs the grant modality DFCC does not currently hold — a mandate question to verify with DFCC or the National Designated Authority, not a reason to stop.');
  } else {
    add('mandate', 'How the benefit is paid for', 'ok',
      'A revenue stream or a non-grant structure is expected.');
  }

  // 5 — land and consent
  const lc = answers.landAndConsent;
  if (lc === 'unclear') {
    add('landConsent', 'Land, resettlement and consent', 'attention',
      'Resolve land tenure and any resettlement or consent question early; it shapes the safeguards category and the timeline.');
  } else if (lc === 'in_progress') {
    add('landConsent', 'Land, resettlement and consent', 'attention',
      'Land and consent work is under way; record its status so the assessment can read it.');
  } else if (lc === 'clear' || lc === 'not_applicable') {
    add('landConsent', 'Land, resettlement and consent', 'ok', 'No outstanding land or consent question.');
  }

  // 6 — the National Designated Authority
  if (answers.ndaInformed === false) {
    add('nda', 'The National Designated Authority', 'attention',
      'Engage the National Designated Authority early. A no-objection letter is required before a funding proposal, and the NDA develops the pipeline with the accredited entity.');
  } else if (answers.ndaInformed === true) {
    add('nda', 'The National Designated Authority', 'ok', 'The NDA has been informed.');
  }

  const worst = items.some(i => i.verdict === 'stop') ? 'stop'
    : items.some(i => i.verdict === 'attention') ? 'attention' : 'ok';
  const summary = worst === 'stop'
    ? 'This may not be a GCF project DFCC can take forward as the accredited entity — see the point marked below, and the way forward it names.'
    : worst === 'attention'
      ? 'Nothing here stops the project; some points need checking or completing before it goes to the Fund.'
      : 'Nothing in the pre-check blocks this project. Record it and run the full assessment.';

  return { verdict: worst, summary, items };
}

module.exports = { precheck, VERDICTS };
