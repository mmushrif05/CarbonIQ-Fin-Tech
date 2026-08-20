/**
 * CarbonIQ FinTech — PCAF Part C: Data Quality and Disclosure
 *
 * PCAF option -> score mapping (spec §5):
 *   1a = 1   1b = 2   2a = 2   2b = 3   3a = 4   3b = 5
 *
 * The MVP produces Option 2b (physical activity data: BOQ quantities × emission
 * factors) = score 3, degrading to 3a when no BOQ is available and the figure
 * rests on a per-m² benchmark instead.
 *
 * Language guard: PCAF conformance is claimed, never endorsement. The phrase
 * "PCAF approved" or "PCAF endorsed" must never appear in any output — a test
 * asserts this.
 */

'use strict';

const { worstTier, collectFactors } = require('./provenance');

const OPTION_SCORES = { '1a': 1, '1b': 2, '2a': 2, '2b': 3, '3a': 4, '3b': 5 };

const OPTION_LABELS = {
  '1a': 'Verified reported emissions (audited / EPD)',
  '1b': 'Unverified reported emissions',
  '2a': 'Physical activity data with primary emission factors',
  '2b': 'Physical activity data with secondary emission factors (BOQ × factor)',
  '3a': 'Economic or benchmark-based estimate with known floor area',
  '3b': 'Sector average with no project-specific data'
};

const FORBIDDEN_PHRASES = ['pcaf approved', 'pcaf endorsed', 'pcaf certified', 'approved by pcaf', 'endorsed by pcaf'];

/**
 * Determine the PCAF data-quality option and score for a run.
 *
 * @param {Object} params
 * @param {boolean} params.hasBoq        - project-specific quantities available
 * @param {boolean} [params.hasEPD]      - verified EPD data for significant items
 * @param {Object|Object[]} params.tree  - the traced-value tree
 */
function assessDataQuality({ hasBoq, hasEPD, tree }) {
  let option;
  if (hasEPD)      option = '1a';
  else if (hasBoq) option = '2b';
  else             option = '3a';

  const score = OPTION_SCORES[option];
  const tier  = worstTier(tree);
  const allFactors = collectFactors(tree);
  const gaps = allFactors.filter(f => f.gap || f.fallback);

  return {
    option,
    optionLabel: OPTION_LABELS[option],
    score,
    scoreBasis: 'PCAF data quality 1 (best) to 5 (worst)',
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

module.exports = { assessDataQuality, disclosureNote, containsForbiddenLanguage, OPTION_SCORES, OPTION_LABELS, FORBIDDEN_PHRASES };
