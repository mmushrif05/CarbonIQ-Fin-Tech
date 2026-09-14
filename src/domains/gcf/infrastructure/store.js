// @ts-check
/**
 * CarbonIQ FinTech — the GCF pipeline register
 *
 * Reads and writes project records. The repository seed is the starting
 * position, not the store: `data/gcf/pipeline.seed.json` is the book as
 * shipped, and anything an organisation records of its own lives in the
 * durable store and wins entirely.
 *
 * The two are never merged. A real figure sitting beside an illustrative one
 * with nothing on screen to separate them is a failure this project has
 * already had once, on the portfolio dashboard, where six fields were quietly
 * filled from a demo constant while the headline came from the API. One book
 * or the other, and the payload says which.
 *
 * `sample: true` travels with the seed wherever it goes. The seed data is
 * illustrative — realistic in shape, internally consistent, and not DFCC's
 * book — and a screen that let a reader assume otherwise would be worse than
 * a blank one.
 */

'use strict';

const store = require('../../../platform/database/store');
const { fallback } = require('../../../platform/observability/logger');
const record = require('../domain/record');
const SEED = require('../domain/reference').PIPELINE_SEED;

const COLLECTION = 'gcf_projects';
const SETTINGS_COLLECTION = 'gcf_entity';

/** The shipped pipeline, deep-frozen so nothing downstream can edit the seed. */
function _deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) _deepFreeze(v[k]);
  }
  return v;
}
_deepFreeze(SEED);

/** A mutable copy of the seed, so a caller can filter without touching source. */
function seedProjects() {
  return SEED.projects.map(p => JSON.parse(JSON.stringify(p)));
}

function seedMeta() {
  return JSON.parse(JSON.stringify(SEED._meta));
}

/**
 * Every project, and whether they are recorded or the shipped seed.
 * @returns {Promise<{projects: object[], source: 'recorded'|'seed', sample: boolean, meta: object}>}
 */
async function list(orgId) {
  const recorded = await store.list(COLLECTION, orgId).catch(fallback('gcf.pipeline.list', () => []));
  if (recorded && recorded.length) {
    return { projects: recorded, source: 'recorded', sample: false, meta: seedMeta() };
  }
  return { projects: seedProjects(), source: 'seed', sample: true, meta: seedMeta() };
}

async function get(orgId, id) {
  const recorded = await store.get(COLLECTION, orgId, id).catch(fallback('gcf.pipeline.get', null));
  if (recorded) return { project: recorded, source: 'recorded', sample: false };
  const fromSeed = seedProjects().find(p => p.id === id);
  return fromSeed
    ? { project: fromSeed, source: 'seed', sample: true }
    : { project: null, source: 'none', sample: false };
}

/**
 * Record a project. Validated before it is stored — a figure with no evidence
 * tier is refused at the door rather than discovered in a disclosure.
 *
 * `assertWritable()` runs first, so a deployment that cannot persist refuses
 * rather than accepting something it will lose.
 */
async function put(orgId, project, { by = null } = {}) {
  store.assertWritable();
  const now = new Date().toISOString();
  const existing = await store.get(COLLECTION, orgId, project.id).catch(fallback('gcf.pipeline.get', null));

  const withProvenance = {
    ...project,
    provenance: {
      ...(project.provenance || {}),
      enteredBy: existing ? (existing.provenance || {}).enteredBy || by : by,
      enteredAt: existing ? (existing.provenance || {}).enteredAt || now : now,
      updatedBy: by,
      updatedAt: now,
    },
  };

  const validated = record.validate(withProvenance);
  await store.put(COLLECTION, orgId, validated.id, validated);
  return validated;
}

function refuse(code, message, statusCode, remedy) {
  const err = /** @type {any} */ (new Error(message));
  err.statusCode = statusCode; err.code = code; if (remedy) err.remedy = remedy;
  return err;
}

const isPlain = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isPlain(v) && isPlain(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

/** The recorded project, or the refusal that says the sample must be adopted first. */
async function recordedOrRefuse(orgId, id) {
  const { project, source } = await get(orgId, id);
  if (!project) throw refuse('PROJECT_NOT_FOUND', `No project with id "${id}" in the recorded book or the shipped pipeline.`, 404);
  if (source !== 'recorded') {
    throw refuse('SAMPLE_NOT_EDITABLE',
      'This project is part of the shipped illustrative pipeline, which is read-only. Recording one edited copy of it '
      + 'would replace the whole sample with a single project.', 409,
      'Adopt the shipped pipeline into your organisation first (POST /v1/gcf/pipeline/adopt), or record your own projects.');
  }
  return project;
}

/**
 * A partial change, merged into the recorded project and held to the whole
 * schema — so a patch cannot leave behind a record the schema would refuse.
 * Objects merge a level at a time; arrays replace.
 */
async function patch(orgId, id, changes, { by = null } = {}) {
  store.assertWritable();
  const current = await recordedOrRefuse(orgId, id);
  const { id: _id, provenance: _prov, stageHistory: _hist, ...safe } = changes || {};
  return put(orgId, merge(current, safe), { by });
}

/**
 * Move a project to another stage: the history gains a dated entry, and any
 * milestone dates travelling with the move land on the timeline.
 */
async function moveStage(orgId, id, { stage, at, note, timeline }, { by = null } = {}) {
  store.assertWritable();
  const current = await recordedOrRefuse(orgId, id);
  const when = at || new Date().toISOString().slice(0, 10);
  const history = [...(current.stageHistory || []), { stage, at: when, by: by || undefined, note: note || undefined }];
  return put(orgId, {
    ...current, stage, stageHistory: history,
    timeline: merge(current.timeline || {}, timeline || {}),
  }, { by });
}

async function remove(orgId, id) {
  store.assertWritable();
  await store.remove(COLLECTION, orgId, id);
}

/**
 * Copy the shipped seed into the organisation's own store.
 *
 * Once this has run the records are the organisation's — still illustrative in
 * content, but recorded, editable and no longer `sample: true` by virtue of
 * being the seed. The note travels on each record so the origin is not lost.
 */
async function adoptSeed(orgId, { by = null } = {}) {
  store.assertWritable();
  const written = [];
  for (const p of seedProjects()) {
    written.push(await put(orgId, {
      ...p,
      provenance: { source: `Adopted from the shipped illustrative pipeline (${SEED._meta.title})` },
    }, { by }));
  }
  return written;
}

/* ── Entity-level disclosures ──────────────────────────────────────────────
 *
 * One record per organisation, holding the facts the disclosure cannot compute.
 * Absent until the entity records them, which is what the report says.
 */

/**
 * The accreditation every gate reads: the entity's own where recorded, the
 * shipped one — DFCC's under B.36/10 — where not, and the answer says which.
 */
async function accreditation(orgId) {
  const entity = await entityDisclosures(orgId);
  if (entity && entity.accreditation) return { ...entity.accreditation, recorded: true };
  return { ...seedMeta().accreditation, recorded: false };
}

async function entityDisclosures(orgId) {
  return store.get(SETTINGS_COLLECTION, orgId, 'entity').catch(fallback('gcf.entity.get', null));
}

async function setEntityDisclosures(orgId, body, { by = null } = {}) {
  store.assertWritable();
  const value = record.validateEntity({
    ...(body || {}),
    updatedBy: by || undefined,
    updatedAt: new Date().toISOString(),
  });
  await store.put(SETTINGS_COLLECTION, orgId, 'entity', value);
  return value;
}

module.exports = {
  list, get, put, patch, moveStage, remove, adoptSeed, seedProjects, seedMeta, accreditation,
  entityDisclosures, setEntityDisclosures,
  COLLECTION, SETTINGS_COLLECTION,
};
