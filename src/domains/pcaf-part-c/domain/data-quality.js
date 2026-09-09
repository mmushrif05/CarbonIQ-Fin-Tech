/**
 * CarbonIQ FinTech — PCAF Part C: data quality and disclosure language
 *
 * PCAF assigns ONE data-quality score per project, and it is decided by
 * WHICH OPTION was used to estimate the emissions — not by averaging
 * anything. Table 5.3-2 (p.58) is the whole rule for construction emissions
 * on project policies (CAR/EAR and IDI):
 *
 *   1a = 1   1b = 2   2a = 2   2b = 3   3a = 4   3b = 5
 *
 * The scale runs 1 = highest quality to 5 = lowest. It is a category, not a
 * mark out of five, and must never be rendered as "3 / 5" — that reads as a
 * fraction and inverts the meaning for anyone who has not read the standard.
 *
 * A BOQ-driven calculation is declared construction quantities x emission
 * factor, which is Option 2b and therefore score 3 (footnote 54 places
 * materials, energy consumed and floor area built under "quantities").
 *
 * Language guard: PCAF conformance is claimed, never endorsement. "PCAF
 * approved", "PCAF endorsed" and "PCAF certified" must never appear in any
 * output; a test asserts it.
 */

'use strict';

const { worstTier, collectFactors } = require('./provenance');

const OPTION_SCORES = { '1a': 1, '1b': 2, '2a': 2, '2b': 3, '3a': 4, '3b': 5 };

/*
 * Table 5.3-2 as the standard states it. The earlier wording here described
 * options by the *quality of the emission factor* — "primary" against
 * "secondary" — which is a different idea and made 2a unreachable for the
 * data an insurer actually holds. What separates the options is the DATA the
 * estimate is built from: reported emissions, energy consumption, declared
 * quantities, or project cost.
 */
const OPTION_LABELS = {
  '1a': 'Reported emissions — verified (scope 1); market-based verified (scope 2)',
  '1b': 'Reported emissions — unverified; or location-based reported',
  '2a': 'Energy consumption × emission factor (intensity per MWh)',
  '2b': 'Declared construction quantities of the project × emission factor (average sector intensity per unit of quantity)',
  '3a': 'Total project cost × emission factor (construction average intensity per revenue)',
  '3b': "Total project cost × the customer's own emission intensity"
};

/** The scale, stated wherever a score is. */
const SCALE_NOTE = 'PCAF scale 1-5, where 1 is the highest data quality and 5 the lowest.';

/** Where the rule comes from, printed beside it. */
const TABLE_CITATION = 'PCAF Part C (2nd ed., December 2025), Table 5.3-2, p.58.';

/**
 * Every row of Table 5.3-2, in order, for the methodology page and reports.
 * `when` is the data that makes the option available.
 */
const TABLE_5_3_2 = Object.keys(OPTION_SCORES).map(option => ({
  option, score: OPTION_SCORES[option], data: OPTION_LABELS[option]
}));

const FORBIDDEN_PHRASES = ['pcaf approved', 'pcaf endorsed', 'pcaf certified', 'approved by pcaf', 'endorsed by pcaf'];

/**
 * Which option the estimate was actually built from.
 *
 * The option is a property of the calculation, so it is read from the inputs
 * the run consumed rather than asked for. An explicit override is honoured —
 * an insurer holding reported emissions this system did not receive is
 * entitled to say so — and is recorded as an override in the result.
 */
function inferOption({
  hasBoq, reportedEmissions, energyConsumption, projectCost, customerIntensity, override
}) {
  if (override && OPTION_SCORES[override] !== undefined) return override;

  if (reportedEmissions === 'verified')   return '1a';
  if (reportedEmissions === 'unverified') return '1b';
  if (energyConsumption)                  return '2a';
  if (hasBoq)                             return '2b';
  if (customerIntensity && projectCost > 0) return '3b';
  if (projectCost > 0)                    return '3a';

  /* No project-specific calculation was possible. Part C p.59: any other
     methodology is classified as score 4, which is what 3a carries. */
  return '3a';
}

/**
 * Determine the PCAF data-quality option and score for a run.
 *
 * @param {Object} params
 * @param {boolean} params.hasBoq        - project-specific quantities available
 * @param {boolean} [params.hasEPD]      - verified EPD data for significant items
 * @param {Object|Object[]} params.tree  - the traced-value tree
 */
function assessDataQuality({
  hasBoq, hasEPD, tree,
  reportedEmissions = null, energyConsumption = false,
  projectCost = 0, customerIntensity = false,
  annualBasis = false, option: override = null
} = {}) {
  const option = inferOption({
    hasBoq, reportedEmissions, energyConsumption, projectCost, customerIntensity, override
  });

  /*
   * Annual-basis CAR/EAR and IDI are scored against the commercial-lines
   * table in §5.2 rather than this one (Table 5.3-3), and PCAF removed score
   * 5 from that table in this edition. Nothing on that path may therefore
   * report a 5.
   */
  const rawScore = OPTION_SCORES[option];
  const score = annualBasis ? Math.min(rawScore, 4) : rawScore;
  const tier  = worstTier(tree);
  const allFactors = collectFactors(tree);
  const gaps = allFactors.filter(f => f.gap || f.fallback);

  return {
    option,
    optionLabel: OPTION_LABELS[option],
    score,
    scoreBasis: SCALE_NOTE,
    scaleNote: SCALE_NOTE,
    citation: TABLE_CITATION,
    /* An EPD improves the emission factor a quantity is multiplied by. It is
       not a report of the insured's own emissions, so it does not reach
       Option 1 — a distinction the earlier code got wrong. */
    epdNote: hasEPD
      ? 'EPD data was available for significant items. That improves the emission factors used; it does not make this Option 1, which requires emissions reported by the insured.'
      : null,
    annualBasis: !!annualBasis,
    annualBasisNote: annualBasis
      ? 'Written on an annual basis, so scored against the commercial-lines table (§5.2) per Table 5.3-3. PCAF removed score 5 from that table, so the score is capped at 4.'
      : null,
    worstFactorTier: tier,
    factorsUsed: allFactors.length,
    factorsWithGaps: gaps.length,
    tierNote: tier === 'Global'
      ? 'The result rests on at least one Global-tier factor. Localising these to Sri Lankan values would improve the disclosed quality position.'
      : `Weakest factor tier in this assessment: ${tier}.`
  };
}

/**
 * Build the PCAF disclosure note.
 * Conformance language only — never endorsement.
 */
function disclosureNote({ option, score, limitations = [], scopeSummary }) {
  const parts = [
    `Calculated in conformance with the PCAF Global GHG Accounting and Reporting Standard, Part C (insurance-associated emissions), using Option ${option} with a data quality score of ${score}.`
  ];
  if (scopeSummary) parts.push(scopeSummary);
  parts.push(limitations.length > 0
    ? `${limitations.length} limitation${limitations.length === 1 ? '' : 's'} disclosed — see the Assumptions and Limitations Register.`
    : 'No material limitations identified.');
  parts.push('This assessment is calculated in conformance with PCAF methodology; it is not approved, endorsed or certified by PCAF.');
  return parts.join(' ');
}

/** Guard used by tests and by the report builders. */
function containsForbiddenLanguage(text) {
  const lower = String(text || '').toLowerCase();
  return FORBIDDEN_PHRASES.filter(p => {
    const idx = lower.indexOf(p);
    if (idx === -1) return false;
    // "not approved, endorsed or certified by PCAF" is the permitted disclaimer
    const window = lower.slice(Math.max(0, idx - 40), idx + p.length);
    return !/\bnot\b[^.]*$/.test(window);
  });
}

module.exports = {
  assessDataQuality, inferOption, disclosureNote, containsForbiddenLanguage,
  OPTION_SCORES, OPTION_LABELS, TABLE_5_3_2, SCALE_NOTE, TABLE_CITATION, FORBIDDEN_PHRASES
};
