// @ts-check
/**
 * The closed lists the SLFRS S2 climate facts are chosen from.
 *
 * S2 asks the reporting entity a series of questions whose answers fall into
 * fixed sets — which category a risk belongs to, whether a target is absolute
 * or an intensity, whether a scope 2 figure is location-based or
 * market-based. Those are declared once here and read by the form, by the
 * normaliser that records an answer and by the document that prints it, so a
 * screen can never offer an answer the record would refuse and the document
 * can never print a label the form did not use.
 *
 * Free text stays free text. A board's oversight of climate risk is the
 * entity's own sentence and no list could hold it; what is bounded here is
 * only what the standard itself bounds.
 *
 * Time horizons are the one deliberate absence from this file. S2 §10(b)
 * requires the entity to define short, medium and long term *itself*, and how
 * those definitions relate to its planning horizons — so the horizon labels
 * are a closed list and the years behind each are the entity's to state.
 */

'use strict';

/** S2 §10(a): every risk is physical or transition, and each has its kinds. */
const RISK_KINDS = Object.freeze([
  { id: 'physical_acute', group: 'physical', label: 'Physical — acute', note: 'Event-driven: flood, cyclone, landslide, extreme heat.' },
  { id: 'physical_chronic', group: 'physical', label: 'Physical — chronic', note: 'Longer-term shifts: sea level, rainfall pattern, mean temperature.' },
  { id: 'transition_policy', group: 'transition', label: 'Transition — policy and legal', note: 'Regulation, carbon pricing, disclosure mandates, litigation.' },
  { id: 'transition_technology', group: 'transition', label: 'Transition — technology', note: 'Substitution of existing products and processes with lower-emission options.' },
  { id: 'transition_market', group: 'transition', label: 'Transition — market', note: 'Shifts in supply, demand and the cost of inputs.' },
  { id: 'transition_reputation', group: 'transition', label: 'Transition — reputation', note: 'Changing customer, investor or community perception.' },
]);

/** An entry on the strategy table is a risk or an opportunity (S2 §10). */
const EXPOSURE_NATURES = Object.freeze([
  { id: 'risk', label: 'Risk' },
  { id: 'opportunity', label: 'Opportunity' },
]);

/** S2 §10(b): the labels are fixed; the years behind them are the entity's. */
const HORIZONS = Object.freeze([
  { id: 'short', label: 'Short term' },
  { id: 'medium', label: 'Medium term' },
  { id: 'long', label: 'Long term' },
]);

/** How often the governing body is informed (S2 §6(a)(ii)). */
const OVERSIGHT_FREQUENCIES = Object.freeze([
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'half_yearly', label: 'Half-yearly' },
  { id: 'annually', label: 'Annually' },
  { id: 'as_required', label: 'As required' },
]);

/**
 * S2 §29(a)(ii) requires scope 2 location-based; a market-based figure is
 * additional information the entity may also give, so the two are separate
 * fields rather than one field with a method attached.
 */
const SCOPE2_METHODS = Object.freeze([
  { id: 'location_based', label: 'Location-based' },
  { id: 'market_based', label: 'Market-based' },
]);

/** How an emissions figure was arrived at, printed beside it. */
const INVENTORY_BASES = Object.freeze([
  { id: 'measured', label: 'Measured', note: 'Metered or invoiced consumption.' },
  { id: 'calculated', label: 'Calculated', note: 'Activity data multiplied by a published factor.' },
  { id: 'estimated', label: 'Estimated', note: 'Extrapolated from a sample or a proxy.' },
  { id: 'third_party_verified', label: 'Third-party verified', note: 'Assured by a named external body.' },
]);

/** S2 §33: a target is absolute or an intensity, and never both. */
const TARGET_KINDS = Object.freeze([
  { id: 'absolute', label: 'Absolute' },
  { id: 'intensity', label: 'Intensity' },
]);

/** What a target covers. Financed emissions are kept apart from scope 3 as a
    whole, because a bank sets a target on its book rather than on its whole
    upstream inventory and the two read very differently. */
const TARGET_SCOPES = Object.freeze([
  { id: 'scope1', label: 'Scope 1' },
  { id: 'scope2', label: 'Scope 2' },
  { id: 'scope1_2', label: 'Scope 1 and 2' },
  { id: 'scope3', label: 'Scope 3' },
  { id: 'financed_emissions', label: 'Financed emissions (scope 3 category 15)' },
  { id: 'portfolio_share', label: 'Share of the portfolio' },
]);

/** S2 §33(c): whether the target was set by the entity or required of it. */
const TARGET_SOURCES = Object.freeze([
  { id: 'entity_set', label: 'Set by the entity' },
  { id: 'required_by_regulation', label: 'Required by law or regulation' },
  { id: 'international_agreement', label: 'Aligned with an international agreement' },
]);

/** S2 §33(f): whether the target has been validated by a third party. */
const TARGET_VALIDATIONS = Object.freeze([
  { id: 'none', label: 'Not validated' },
  { id: 'third_party', label: 'Validated by a third party' },
]);

/** S2 §29(f): where an internal carbon price is applied, or that it is not. */
const CARBON_PRICE_USES = Object.freeze([
  { id: 'not_applied', label: 'Not applied' },
  { id: 'lending_decisions', label: 'Lending and investment decisions' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'internal_budgeting', label: 'Internal budgeting and capital allocation' },
  { id: 'scenario_testing', label: 'Scenario and stress testing' },
]);

/**
 * The climate classification a loan carries, used by §29(b)–(d).
 *
 * *Not assessed* is a first-class answer rather than a missing value, and the
 * roll-up reports its share beside the others: a book nobody has classified
 * must read as unclassified, never as safe.
 */
const CLIMATE_VERDICTS = Object.freeze([
  { id: 'vulnerable', label: 'Vulnerable' },
  { id: 'not_vulnerable', label: 'Not vulnerable' },
  { id: 'not_assessed', label: 'Not assessed' },
]);

/** The same three answers for opportunity alignment (S2 §29(d)). */
const ALIGNMENT_VERDICTS = Object.freeze([
  { id: 'aligned', label: 'Aligned' },
  { id: 'not_aligned', label: 'Not aligned' },
  { id: 'not_assessed', label: 'Not assessed' },
]);

/** Every list, in one shape, for the reference route and the form. */
const VOCABULARY = Object.freeze({
  riskKinds: RISK_KINDS,
  exposureNatures: EXPOSURE_NATURES,
  horizons: HORIZONS,
  oversightFrequencies: OVERSIGHT_FREQUENCIES,
  scope2Methods: SCOPE2_METHODS,
  inventoryBases: INVENTORY_BASES,
  targetKinds: TARGET_KINDS,
  targetScopes: TARGET_SCOPES,
  targetSources: TARGET_SOURCES,
  targetValidations: TARGET_VALIDATIONS,
  carbonPriceUses: CARBON_PRICE_USES,
  climateVerdicts: CLIMATE_VERDICTS,
  alignmentVerdicts: ALIGNMENT_VERDICTS,
});

/** The ids of one list, for a schema or a membership test. */
const idsOf = list => list.map(x => x.id);

/** The label for an id, or the id itself where the list does not hold it. */
function labelOf(list, id) {
  const row = list.find(x => x.id === id);
  return row ? row.label : (id === null || id === undefined ? null : String(id));
}

module.exports = {
  RISK_KINDS, EXPOSURE_NATURES, HORIZONS, OVERSIGHT_FREQUENCIES, SCOPE2_METHODS,
  INVENTORY_BASES, TARGET_KINDS, TARGET_SCOPES, TARGET_SOURCES, TARGET_VALIDATIONS,
  CARBON_PRICE_USES, CLIMATE_VERDICTS, ALIGNMENT_VERDICTS,
  VOCABULARY, idsOf, labelOf,
};
