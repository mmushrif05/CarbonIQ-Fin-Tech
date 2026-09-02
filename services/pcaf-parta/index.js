/**
 * PCAF Part A — assess one exposure.
 *
 * The result has two containers and they never merge. `inventory` is the Part A
 * financed-emissions figure, scope 3 Category 15 of the reporting institution.
 * `impact` holds reductions, avoided emissions and forward-looking metrics,
 * which rest on optional supplemental guidance rather than on Part A, and which
 * PCAF requires never obfuscate nor replace the inventory.
 *
 * The archetype decides which impact metrics exist. A user cannot pick them
 * freely: an efficiency retrofit reduces against its own base year, a renewable
 * project avoids against a counterfactual, and reporting one as the other is
 * exactly the confusion the separation is here to prevent.
 *
 * Two ways in. Either the caller supplies the project's scope 1 and 2 directly,
 * or — for renewable generation — it supplies what the plant generates and
 * where it stands, and the engine derives them from a named grid factor. The
 * second path is stronger and the reason is not convenience: a typed emissions
 * figure is accountable to nobody, while a derived one carries its factor's
 * publisher, vintage and basis wherever the number travels, and its data
 * quality option is decided by the data consumed rather than chosen from a list.
 */

'use strict';

const archetypes  = require('./archetypes');
const dataQuality = require('./data-quality');
const gridFactors = require('./grid-factors');
const generation  = require('./generation');
const { attributionFactor } = require('./attribution');
const { financedEmissions } = require('./emissions');
const impact = require('./impact');

const STANDARD = 'PCAF (2025). The Global GHG Accounting and Reporting Standard '
  + 'Part A: Financed Emissions. Third Edition.';

/**
 * Which data quality option this run has earned.
 *
 * Where the generation path was used the option is derived from the data
 * actually consumed. A caller may still name a different option — an insurer
 * or lender may hold evidence this system never received — but only with a
 * justification, which is recorded beside the score. Claiming a better option
 * than the evidence supports is precisely the move this refuses to wave through.
 */
function _resolveOption({ assetClass, derived, requested, overrideJustification }) {
  if (!derived) {
    if (!requested) {
      const err = new Error(
        'A data quality option is required. Either supply one, or supply the generation '
        + 'and country of a renewable project so the engine can derive it from the data used.');
      err.statusCode = 400; err.code = 'DQ_OPTION_REQUIRED';
      throw err;
    }
    return { ...dataQuality.score(assetClass, requested), derived: false };
  }

  const differs = requested && String(requested).toLowerCase() !== derived.option;

  if (differs && !overrideJustification) {
    const err = new Error(
      `The data actually used places this run at Option ${derived.option}, but Option `
      + `${requested} was requested. ${derived.reason}`);
    err.statusCode = 400;
    err.code = 'DQ_OPTION_NOT_EARNED';
    err.remedy = 'Use the derived option, or supply a justification stating what evidence '
      + 'supports the option requested. The justification is recorded beside the score.';
    throw err;
  }

  const chosen = differs ? String(requested).toLowerCase() : derived.option;
  const scored = dataQuality.score(assetClass, chosen);

  return {
    ...scored,
    derived: !differs,
    derivedOption: derived.option,
    derivationReason: derived.reason,
    context: derived.wouldReach,
    overrideJustification: differs ? overrideJustification : null,
  };
}

function assessExposure(input) {
  const {
    projectName, counterparty, sector, reportingYear,
    assetClass = 'project-finance', archetype: archetypeId = 'general',
    outstandingAmount, totalProjectEquityPlusDebt, currency, attributionOverrideJustification,
    dataQualityOption, dataQualityOverrideJustification,
    projectScope1_tCO2e, projectScope2_tCO2e, projectScope3_tCO2e, scope3Relevant, removals_tCO2e,
    generation: generationInput,
    reduction, avoided,
  } = input;

  const archetype = archetypes.forId(archetypeId);

  /* The generation path. Available to any archetype that claims avoidance —
     the derivation is a property of the technology, not of the loan. */
  let derivedGeneration = null;
  if (generationInput && archetype.impact === 'avoided') {
    derivedGeneration = generation.deriveFromGeneration(generationInput);
  }

  const af = attributionFactor({
    assetClass,
    outstandingAmount,
    denominator: totalProjectEquityPlusDebt,
    overrideJustification: attributionOverrideJustification,
  });

  const inventory = financedEmissions({
    attributionFactor: af.value,
    projectScope1_tCO2e: derivedGeneration ? derivedGeneration.scope1.value : projectScope1_tCO2e,
    projectScope2_tCO2e: derivedGeneration ? derivedGeneration.scope2.value : projectScope2_tCO2e,
    projectScope3_tCO2e, scope3Relevant, removals_tCO2e,
  });

  const dq = _resolveOption({
    assetClass,
    derived: derivedGeneration ? derivedGeneration.dataQuality : null,
    requested: dataQualityOption,
    overrideJustification: dataQualityOverrideJustification,
  });

  /* Economic intensity — a Part A reporting recommendation (DCL p.127),
     expressed per million of currency lent. */
  const economicIntensity = outstandingAmount > 0
    ? +((inventory.scope1And2.value / (outstandingAmount / 1e6))).toFixed(2)
    : null;

  /* The impact container. Gated: an archetype that makes no reduction or
     avoidance claim gets no metrics, rather than zeros. */
  const impactBlock = { archetype: archetype.label, metrics: [] };

  if (archetype.impact === 'reduction' && reduction) {
    impactBlock.metrics.push(impact.expectedEmissionReductions({
      attributionFactor: af.value, ...reduction,
    }));
  }

  if (archetype.impact === 'avoided') {
    if (derivedGeneration) {
      /* The counterfactual comes out of the factor store rather than a text
         box, so it names a published basis, a publisher and a vintage — and
         cannot be left blank, which is the failure the refusal exists for.

         Metered generation is a measurement of what happened, so it reports
         realised avoided emissions. A projection is forward-looking and
         reports Expected Avoided Emissions, annualised as PCAF requires. */
      const common = {
        attributionFactor: af.value,
        counterfactual: derivedGeneration.counterfactual,
        counterfactualSource: derivedGeneration.counterfactualSource,
        estimationBasis: 'physical-activity',
      };

      impactBlock.metrics.push(generationInput.basis === 'metered'
        ? impact.avoidedEmissions({ ...common, projectAvoided_tCO2e: derivedGeneration.avoided.value })
        : impact.expectedAvoidedEmissions({ ...common, annualAvoided_tCO2e: derivedGeneration.avoided.value }));
    } else if (avoided) {
      if (avoided.projectAvoided_tCO2e !== undefined) {
        impactBlock.metrics.push(impact.avoidedEmissions({ attributionFactor: af.value, ...avoided }));
      }
      if (avoided.annualAvoided_tCO2e !== undefined) {
        impactBlock.metrics.push(impact.expectedAvoidedEmissions({ attributionFactor: af.value, ...avoided }));
      }
    }
  }

  impactBlock.notComparable = impact.NOT_COMPARABLE;

  return {
    standard: STANDARD,
    project: { projectName, counterparty, sector, reportingYear, assetClass, archetype: archetype.id, currency },

    attribution: af,

    /* Present only where the generation path ran. Holds the physical check,
       both factors with their sources, and every assumption the derivation
       made — so the working behind the derived scopes is on the page rather
       than in this file. */
    generation: derivedGeneration ? {
      derived: true,
      basis: generationInput.basis === 'metered' ? 'metered' : 'projected',
      annualGeneration_MWh: generationInput.annualGeneration_MWh,
      installedCapacity_MW: generationInput.installedCapacity_MW ?? null,
      plausibility: derivedGeneration.plausibility,
      factors: derivedGeneration.factors,
      projectScope1: derivedGeneration.scope1,
      projectScope2: derivedGeneration.scope2,
      projectAvoided: derivedGeneration.avoided,
      assumptions: derivedGeneration.assumptions,
    } : null,

    inventory: {
      ...inventory,
      economicIntensity_tCO2e_per_M: economicIntensity,
      economicIntensityNote: 'Economic emission intensity, expressed per million of the '
        + 'stated currency lent (PCAF Disclosure Checklist Part A, p.127).',
      dataQuality: dq,
    },

    impact: impactBlock,
  };
}

module.exports = { assessExposure, archetypes, dataQuality, gridFactors, generation, STANDARD };
