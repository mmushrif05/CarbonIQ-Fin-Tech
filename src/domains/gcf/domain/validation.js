// @ts-check
/**
 * The assessor's validation of a GCF project — Phase 1 Stage 4.
 *
 * A different act from recording the project. The bank's analyst enters the
 * figures and runs the intake; the **assessor** — a named person holding the
 * `validate` scope and nothing that writes the book — reads what is recorded,
 * rates each of the six investment criteria in their own words, records a
 * recommendation, and signs the assessment off. Separation of duties is the
 * point: the person who prepares a submission is not the person who validates
 * it, which is why `validate` is a scope of its own and this module never
 * touches a figure.
 *
 * ── The lifecycle ──────────────────────────────────────────────────────────
 *
 *   draft ── start_review ──▶ under_review ── validate ──▶ validated
 *     ▲                            │                           │
 *     └──────── withdraw ──────────┘                           │
 *                    ▲── reopen ───────────────────────────────┘
 *
 * A validated assessment is frozen: its ratings cannot be edited in place,
 * because a signed-off judgement that quietly changes is not a sign-off. To
 * change one, an assessor reopens it (validated → under_review), which is a
 * dated, attributed entry in the history like every other transition.
 *
 * ── The ratings are words, never a number ──────────────────────────────────
 *
 * strong · adequate · weak — deliberately not 1–5 and not the evidence tiers.
 * A number here would be read as a GCF or a PCAF score, the same error the
 * evidence tiers and the option mappings are kept apart to prevent. The
 * engine's own evidence coverage (criteria.js: evidenced / partial / absent)
 * sits beside the assessor's rating on the screen; this is the assessor's
 * judgement, not a recomputation of the engine's.
 *
 * ── Everything is attributed ────────────────────────────────────────────────
 *
 * Every change appends one entry to `history` with who made it and when, so a
 * validated assessment carries the trail that led to the sign-off. The module
 * is pure: it takes the current validation and a change, and returns the next
 * one or throws — the store attributes it and persists it.
 */

'use strict';

const { CRITERIA } = require('./criteria');

const STATES = Object.freeze(['draft', 'under_review', 'validated']);
const RATINGS = Object.freeze(['strong', 'adequate', 'weak']);
const RECOMMENDATIONS = Object.freeze(['recommend', 'recommend_with_conditions', 'not_recommend']);
const CRITERION_IDS = Object.freeze(CRITERIA.map(c => c.id));

/** Legal state transitions. First the machine, then the rules each edge carries. */
const TRANSITIONS = Object.freeze({
  draft: ['under_review'],
  under_review: ['validated', 'draft'],
  validated: ['under_review'],
});

/** @param {string} code @param {string} message @param {string} [remedy] */
function refuse(code, message, remedy) {
  const err = /** @type {any} */ (new Error(message));
  err.statusCode = 400;
  err.code = code;
  if (remedy) err.remedy = remedy;
  return err;
}

/** The validation an unassessed project carries — a draft with nothing rated. */
function blank() {
  return {
    state: 'draft',
    ratings: {},
    recommendation: null,
    recommendationNote: null,
    validatedBy: null,
    validatedAt: null,
    history: [],
    returns: [],
  };
}

/** The project's validation, defaulted so a project recorded before this existed reads as a draft. */
function current(project) {
  const v = project && project.validation;
  return { ...blank(), ...(v && typeof v === 'object' ? v : {}) };
}

/**
 * Apply one assessor change to a project's validation and return the next
 * validation object. Pure: throws a 400-shaped error on an illegal change and
 * mutates nothing.
 *
 * @param {any} project           the recorded project (read for its current validation)
 * @param {object} change         { to?, ratings?, recommendation?, recommendationNote?, note? }
 * @param {{by?: string|null, at?: string}} [ctx]
 */
function apply(project, change = {}, { by = null, at = new Date().toISOString() } = {}) {
  const cur = current(project);
  const to = change.to || cur.state;

  if (!STATES.includes(to)) {
    throw refuse('INVALID_VALIDATION_STATE', `Unknown validation state "${to}". One of: ${STATES.join(', ')}.`);
  }
  if (to !== cur.state && !TRANSITIONS[cur.state].includes(to)) {
    throw refuse('INVALID_VALIDATION_TRANSITION',
      `A validation in "${cur.state}" cannot move to "${to}".`,
      `From "${cur.state}" you may move to: ${TRANSITIONS[cur.state].join(', ') || 'nothing'}.`);
  }

  /* Ratings may not be edited in place on a validated assessment: reopen it
     first. They may be supplied alongside the move into validated, which is an
     assessor finalising their ratings and signing off in one action. */
  const editsRatings = change.ratings && Object.keys(change.ratings).length > 0;
  if (editsRatings && cur.state === 'validated' && to === 'validated') {
    throw refuse('VALIDATION_FROZEN',
      'This assessment is validated, so its ratings cannot be edited in place.',
      'Reopen it first (move to under_review), then rate and validate again.');
  }

  const ratings = { ...cur.ratings };
  const changed = [];
  for (const [cid, r] of Object.entries(change.ratings || {})) {
    if (!CRITERION_IDS.includes(cid)) {
      throw refuse('UNKNOWN_CRITERION', `"${cid}" is not one of the six investment criteria.`,
        `One of: ${CRITERION_IDS.join(', ')}.`);
    }
    if (!r || !RATINGS.includes(r.rating)) {
      throw refuse('INVALID_RATING', `The rating for "${cid}" must be one of: ${RATINGS.join(', ')}.`);
    }
    ratings[cid] = { rating: r.rating, ...(r.note ? { note: String(r.note).slice(0, 1000) } : {}) };
    changed.push(`rating:${cid}`);
  }

  let recommendation = cur.recommendation;
  let recommendationNote = cur.recommendationNote;
  if (change.recommendation !== undefined) {
    if (change.recommendation !== null && !RECOMMENDATIONS.includes(change.recommendation)) {
      throw refuse('INVALID_RECOMMENDATION', `The recommendation must be one of: ${RECOMMENDATIONS.join(', ')}.`);
    }
    recommendation = change.recommendation;
    changed.push('recommendation');
  }
  if (change.recommendationNote !== undefined) {
    recommendationNote = change.recommendationNote ? String(change.recommendationNote).slice(0, 2000) : null;
  }

  /* Signing off asserts a recommendation. A validated assessment with no
     recommendation is a sign-off that says nothing. */
  if (to === 'validated' && !recommendation) {
    throw refuse('RECOMMENDATION_REQUIRED',
      'An assessment cannot be validated without a recommendation.',
      `Set a recommendation (${RECOMMENDATIONS.join(', ')}) before validating.`);
  }

  if (to !== cur.state) changed.unshift(`state:${to}`);

  const entry = {
    from: cur.state,
    to,
    at,
    ...(by ? { by } : {}),
    ...(change.note ? { note: String(change.note).slice(0, 1000) } : {}),
    changed,
  };

  return {
    state: to,
    ratings,
    recommendation: recommendation ?? null,
    recommendationNote: recommendationNote ?? null,
    /* validatedBy/At name the sign-off, so they belong to the validated state
       alone and are cleared the moment it is reopened — a reopened assessment
       has no current sign-off. */
    validatedBy: to === 'validated' ? (by || cur.validatedBy || null) : null,
    validatedAt: to === 'validated' ? at : null,
    history: [...cur.history, entry],
    /* The return-to-sponsor log is carried forward untouched — a lifecycle
       change is not a return, and losing the returns here would move the fixed
       point the resubmission comparison rests on. */
    returns: cur.returns || [],
  };
}

module.exports = {
  STATES, RATINGS, RECOMMENDATIONS, CRITERION_IDS, TRANSITIONS,
  blank, current, apply,
};
