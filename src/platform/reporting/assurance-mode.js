// @ts-check
/**
 * Which posture this deployment is operated in, and whether it may say so.
 *
 * `src/shared/assurance-mode.js` holds the vocabulary and the rule. This is
 * the part that has to touch the world: read what the provider set, gather the
 * evidence, and hand both to the resolver.
 *
 * **Who sets it.** The tool provider, not the reporting entity. The default
 * comes from `ASSURANCE_MODE` on the deployment; a per-organisation override
 * is written through `PUT /v1/assurance/mode`, which requires the `admin`
 * scope — the operator's, not a client's. A client who could set their own
 * mode to `verified` would be self-declaring by a different name.
 *
 * **The evidence is gathered, never assumed.** `verified` is refused and
 * downgraded when the conditions do not hold, and the reasons travel with the
 * answer so a document can print them.
 *
 * This is `platform/reporting/` rather than a domain because every document
 * this system produces carries the statement, and Part C, Part A, GCF and
 * lending cannot import one another.
 */

'use strict';

const config = require('../config');
const store = require('../database/store');
const { MODES, DEFAULT_MODE, resolve, faceStatement } = require('../../shared/assurance-mode');

/** Beside the entity's own assurance declaration, which is a different fact. */
const COLLECTION = 'assurance';
const DOC = 'mode';

/**
 * What the provider asked for, for this organisation.
 * @param {string} orgId
 * @returns {Promise<{requested: string, source: 'organisation'|'deployment', setBy: string|null, setAt: string|null}>}
 */
async function requestedFor(orgId) {
  let record = null;
  try { record = await store.get(COLLECTION, orgId, DOC); } catch (_) { record = null; }
  if (record && MODES.includes(record.mode)) {
    return { requested: record.mode, source: 'organisation', setBy: record.setBy || null, setAt: record.setAt || null };
  }
  const fromEnv = config.runtime.assuranceMode;
  return {
    requested: MODES.includes(fromEnv) ? fromEnv : DEFAULT_MODE,
    source: 'deployment',
    setBy: null,
    setAt: null,
  };
}

/**
 * Record the provider's choice for one organisation.
 *
 * @param {string} orgId
 * @param {string} mode
 * @param {string|null} actor
 */
async function setFor(orgId, mode, actor) {
  if (!MODES.includes(mode)) {
    const err = /** @type {import('../../shared/types').AppError} */ (
      new Error(`assurance mode must be one of: ${MODES.join(', ')}`));
    err.statusCode = 400;
    err.code = 'INVALID_ASSURANCE_MODE';
    throw err;
  }
  const record = {
    id: DOC, orgId, mode,
    setBy: actor || null,
    setAt: new Date().toISOString(),
  };
  await store.put(COLLECTION, orgId, DOC, record);
  return record;
}

/**
 * The conditions `verified` rests on, established rather than assumed.
 *
 * The two readers are injected because the platform never imports a domain:
 * the caller passes the baseline registry's `effectiveAll` and the entity's
 * assurance declaration, both of which it already holds.
 *
 * @param {object} sources
 * @param {Record<string, any>} [sources.baselines] the output of the baseline registry's effectiveAll()
 * @param {object} [sources.declaration] the output of the assurance declaration read()
 */
function evidenceFrom({ baselines, declaration } = {}) {
  /* A metric still resolving to the shipped seed is provisional by definition,
     and the registry says so on the value itself rather than leaving it to be
     inferred. */
  const provisional = Object.entries(baselines || {})
    .filter(([, v]) => v && (v.provisional === true || v.scope === 'seed'))
    .map(([k]) => k);

  /* "Not declared" is not "not assured", and neither is an assurance
     position. Only a recorded `assured` counts, because the mode is about
     somebody having stood behind the figures. */
  const scopes = (declaration && declaration.scopes) || {};
  const assured = Object.values(scopes).some(s => s && s.status === 'assured');

  return {
    baselinesReleased: Object.keys(baselines || {}).length > 0 && provisional.length === 0,
    provisionalBaselines: provisional,
    assuranceDeclared: assured,
  };
}

/**
 * The whole answer: what was asked for, what may be claimed, and the sentence
 * a document prints.
 *
 * @param {string} orgId
 * @param {{baselines?: Record<string, any>, declaration?: object}} sources
 */
async function positionFor(orgId, sources = {}) {
  const asked = await requestedFor(orgId);
  const evidence = evidenceFrom(sources);
  const resolved = resolve({ requested: asked.requested, evidence });
  return {
    ...resolved,
    statement: faceStatement(resolved),
    setBy: asked.source === 'organisation' ? asked.setBy : null,
    setAt: asked.source === 'organisation' ? asked.setAt : null,
    chosenBy: asked.source,
    evidence,
  };
}

module.exports = { requestedFor, setFor, evidenceFrom, positionFor, COLLECTION, DOC };
