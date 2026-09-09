/**
 * Which data-quality option each scope has earned.
 *
 * PCAF scores by the option used to estimate the emissions, and p.47 is
 * specific about the trap: a figure from a data provider is Option 1 only if
 * the provider is relaying what the company reported. Where the provider
 * estimated it, the calculation "would be in line with Options 2 or 3". So the
 * option is read from the BASIS of the emissions figure — what was done to get
 * the number — and never chosen from a list. A caller may claim a different
 * option only with a justification, which is recorded beside the score.
 *
 * Two options per exposure, not one. Option 2a covers scope 1 and 2 only
 * (footnote 53); scope 3 must come from another option, and Chapter 6 reports
 * the scope 3 score separately in any case (p.167). Scope 1 and scope 2 may
 * themselves rest on different bases — reported scope 1, estimated scope 2 —
 * and the pair is scored on the weaker of the two, with both recorded.
 */

'use strict';

const table = require('../../../../../data/pcaf-parta/dq-listed-equity-corporate-bonds.json');

const REF = 'PCAF Part A Third Edition §5.1, Table 5.1-2 (p.46) and p.47 (data providers)';

function refuse(code, message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

const BY_BASIS = {};
for (const row of table.options) for (const b of row.emissionsBasis) BY_BASIS[b] = row;

const ESTIMATED_BASES = new Set(['energy-activity', 'production-activity', 'revenue-sector', 'assets-sector', 'turnover-sector']);

/**
 * The option one scope figure rests on.
 *
 * @param {Object} s   { value, basis, source, verifier, provider, providerMethod, justification }
 * @param {'1'|'2'|'3'} scope
 */
function optionForScope(s, scope) {
  if (!s || s.basis === undefined) return null;
  let basis = String(s.basis).toLowerCase();

  /* p.47: a provider figure must say what the provider did. */
  if (basis === 'provider') {
    const m = String(s.providerMethod || '').toLowerCase();
    if (m === 'relayed' || m === 'reported') basis = 'provider-relayed';
    else if (m === 'estimated-physical' || m === 'estimated-production') basis = 'production-activity';
    else if (m === 'estimated-energy') basis = 'energy-activity';
    else if (m === 'estimated-economic' || m === 'estimated-revenue') basis = 'revenue-sector';
    else {
      throw refuse('PROVIDER_METHOD_REQUIRED',
        `Scope ${scope} comes from a data provider${s.provider ? ` (${s.provider})` : ''} but the provider's `
        + 'method is not stated. PCAF (p.47): a provider figure is Option 1 only where it relays what the '
        + 'company reported; a provider estimate is Option 2 or 3 by its method. State providerMethod as '
        + 'relayed, estimated-energy, estimated-production or estimated-economic.');
    }
  }

  const row = BY_BASIS[basis];
  if (!row) {
    throw refuse('EMISSIONS_BASIS_UNKNOWN',
      `Scope ${scope} basis "${s.basis}" is not one Table 5.1-2 scores. Use one of: `
      + `${Object.keys(BY_BASIS).join(', ')}.`);
  }

  /* fn 53 — energy-based estimation cannot reach scope 3. */
  if (!row.scopes.includes(scope)) {
    throw refuse('OPTION_NOT_APPLICABLE_TO_SCOPE',
      `Option ${row.option} cannot estimate scope ${scope} (footnote 53: quality scoring for Option 2a is `
      + 'applicable to scope 1 and 2 only). Supply scope 3 on another basis, or leave it absent with the '
      + 'reason, which the report will carry.');
  }

  /* 1a is a claim about a third-party auditor; it needs a name. */
  if (row.option === '1a' && !s.verifier) {
    throw refuse('VERIFIER_REQUIRED',
      `Scope ${scope} is entered as verified reported emissions (Option 1a, score 1). Verified means calculated `
      + 'in line with the GHG Protocol and verified by a third-party auditor (footnote 49). Name the verifier, '
      + 'or enter the figure as reported-unverified (Option 1b).');
  }

  /* p.48 — an alternative method is allowed only with an explanation. */
  if (row.option === 'alt' && !s.justification) {
    throw refuse('ALTERNATIVE_JUSTIFICATION_REQUIRED',
      'An alternative calculation option may be used only where none of Options 1–3 applies, and any '
      + 'deviation shall be accompanied by an explanation (p.48). Supply a justification.');
  }

  return {
    option: row.option,
    score: row.score,
    family: row.family,
    basis,
    attributionFactor: row.attributionFactor,
    estimated: ESTIMATED_BASES.has(basis),
    source: s.source || null,
    provider: s.provider || null,
    verifier: s.verifier || null,
    period: s.period || null,
    justification: s.justification || null,
    reference: REF,
  };
}

/**
 * The two options an exposure carries: scope 1+2 together, scope 3 apart.
 *
 * @param {Object} em  { scope1, scope2, scope3 }
 */
function deriveOptions(em = {}) {
  const o1 = optionForScope(em.scope1, '1');
  const o2 = optionForScope(em.scope2, '2');
  const o3 = optionForScope(em.scope3, '3');

  if (!o1 || !o2) {
    throw refuse('SCOPE_1_2_REQUIRED',
      'Scope 1 and scope 2 of the investee are required: a financial institution shall report the absolute '
      + 'scope 1, 2 and 3 emissions of borrowers and investees (§5.1, p.40). Each needs a figure and the '
      + 'basis it rests on.');
  }

  /* The pair is scored on the weaker basis; a strong scope 1 does not lift
     an estimated scope 2. */
  const worse = o1.score >= o2.score ? o1 : o2;
  const scope12 = {
    option: worse.option, score: worse.score, family: worse.family,
    attributionFactor: o1.attributionFactor && o2.attributionFactor,
    scope1: o1, scope2: o2,
    note: o1.option !== o2.option
      ? `Scope 1 rests on Option ${o1.option} and scope 2 on Option ${o2.option}; the combined score takes the weaker.`
      : null,
  };

  const scope3 = o3
    ? { option: o3.option, score: o3.score, family: o3.family, attributionFactor: o3.attributionFactor, scope3: o3 }
    : null;

  /* fn 41 — no factor for 3b/3c. If any scope needs a factor and another
     does not, both paths run; the roll-up reads each line's own flag. */
  return { scope12, scope3, reference: REF };
}

/**
 * A claimed option that differs from the derived one is accepted only with
 * a justification — an institution may hold evidence this system never saw,
 * but it must say so, and the claim is printed beside the score.
 */
function reconcileClaim(derived, claimed, justification) {
  if (!claimed) return { ...derived, claimed: null };
  const c = String(claimed).toLowerCase();
  if (c === derived.option) return { ...derived, claimed: c };
  if (!justification) {
    throw refuse('DQ_OPTION_NOT_EARNED',
      `The emissions basis places this scope at Option ${derived.option}, but Option ${c} was claimed. `
      + 'Supply a justification stating what evidence supports the claim; it is recorded beside the score.');
  }
  const row = table.options.find(o => o.option === c);
  if (!row) throw refuse('UNKNOWN_DQ_OPTION', `Option "${claimed}" is not in ${table.table}.`);
  return {
    ...derived,
    option: row.option, score: row.score, family: row.family, attributionFactor: row.attributionFactor,
    claimed: c, derivedOption: derived.option, overrideJustification: justification,
  };
}

module.exports = { optionForScope, deriveOptions, reconcileClaim, TABLE: table };
