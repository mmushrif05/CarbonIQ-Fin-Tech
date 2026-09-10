// @ts-check
/**
 * What a taxonomy screen answers with.
 *
 * This file was a `module.exports = {}` placeholder citing "Step 6" of a build
 * plan finished long ago, which is worse than an absent file: it reads as a
 * declaration to a developer looking for one, and there is nothing in it.
 *
 * There is a real shape here and it is worth writing down, because the five
 * frameworks do **not** answer alike and the difference is the point. ASEAN
 * and Sri Lanka screen on a carbon intensity and return a **tier**. The EU
 * asks a pass/fail question about whole-life carbon and DNSH and returns an
 * **alignment**. Hong Kong and Singapore return a **score** against a
 * certification scheme. Flattening those into one "aligned: true/false" would
 * lose the fact that a project can be Green in one framework and simply
 * unassessed in another, which is the ordinary case, not an edge one.
 *
 * These are declarations, not validators: nothing here converts or coerces.
 * The engines in `src/domains/taxonomy/domain/` produce these shapes and the
 * routes serialise them unchanged.
 */

'use strict';

/**
 * The measurements a screen is run against. `buildingArea_m2` of zero or less
 * makes every intensity absent rather than infinite — an unmeasured building
 * is not a perfectly clean one.
 *
 * @typedef {object} ProjectMetrics
 * @property {number} totalEmission_tCO2e
 * @property {number} buildingArea_m2
 * @property {number} [reductionPct]  reduction against the project's own baseline
 * @property {boolean} [hasLCA]
 * @property {boolean} [hasEPD]
 */

/**
 * The bands a screen resolved from the baseline registry, and how much weight
 * they carry. `isTaxonomyThreshold` is `false` on purpose and is never `true`
 * for Sri Lanka: the SLGFT sets **no** absolute kgCO2e/m² figure anywhere, so
 * these bands are regional judgement under governance, not a published
 * threshold, and a reader must be able to tell the two apart.
 *
 * @typedef {object} IntensityScreen
 * @property {number} green       at or below this is Green
 * @property {number} transition  at or below this is Transition
 * @property {string} basis       where the figures came from, in words
 * @property {boolean} provisional true until an administrator has released a baseline
 * @property {false} isTaxonomyThreshold
 * @property {string} [baselineVersion]
 */

/**
 * A framework that answers with a tier, screened on intensity.
 * @typedef {object} TieredResult
 * @property {'green'|'transition'|'not_aligned'} tier
 * @property {string} label
 * @property {number|null} intensity_kgCO2e_m2  absent where the floor area is not known
 */

/**
 * Sri Lanka answers with the same tier under the key `classification`, plus
 * the framework it screened under and the bands it used.
 * @typedef {object} SriLankaResult
 * @property {'green'|'transition'|'not_aligned'} classification
 * @property {string} label
 * @property {number|null} intensity_kgCO2e_m2
 * @property {string} framework
 * @property {IntensityScreen} screen
 */

/**
 * The EU asks a different question, so it answers a different shape. `aligned`
 * is a claim about this project against the criteria; every DNSH criterion is
 * carried with its own status rather than collapsed, because "not yet
 * assessed" is not "passed".
 *
 * @typedef {object} EuResult
 * @property {boolean} aligned
 * @property {boolean} requiresWholeLifeCarbon
 * @property {{criterion: string, status: 'pending_assessment'|'pass'|'fail'}[]} dnshChecks
 */

/**
 * Hong Kong and Singapore score against a certification scheme.
 * @typedef {object} ScoredResult
 * @property {string} classification
 * @property {string} label
 * @property {number} score
 * @property {string} [beamPlus]
 * @property {string} [greenMark]
 */

/**
 * Every framework, screened at once. A caller reads the one it needs; nothing
 * here is summed, averaged or reduced to a single verdict, because the
 * frameworks are answering different questions and a combined figure would
 * belong to none of them.
 *
 * @typedef {object} TaxonomyResult
 * @property {TieredResult} asean
 * @property {EuResult} eu
 * @property {ScoredResult} hongKong
 * @property {ScoredResult} singapore
 * @property {SriLankaResult} sriLanka
 * @property {string} assessedAt  ISO 8601
 */

/** The frameworks screened, in the order they are reported. */
const TAXONOMY_FRAMEWORKS = Object.freeze(
  /** @type {const} */ (['asean', 'eu', 'hongKong', 'singapore', 'sriLanka']));

/** The three tiers an intensity screen can return. */
const TAXONOMY_TIERS = Object.freeze(
  /** @type {const} */ (['green', 'transition', 'not_aligned']));

module.exports = { TAXONOMY_FRAMEWORKS, TAXONOMY_TIERS };
