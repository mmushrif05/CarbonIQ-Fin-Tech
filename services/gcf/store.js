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

const store = require('../partc-store');
const record = require('./record');
const SEED = require('../../data/gcf/pipeline.seed.json');

const COLLECTION = 'gcf_projects';

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
 * @returns {{projects: object[], source: 'recorded'|'seed', sample: boolean, meta: object}}
 */
async function list(orgId) {
  const recorded = await store.list(COLLECTION, orgId, { limit: 200 }).catch(() => []);
  if (recorded && recorded.length) {
    return { projects: recorded, source: 'recorded', sample: false, meta: seedMeta() };
  }
  return { projects: seedProjects(), source: 'seed', sample: true, meta: seedMeta() };
}

async function get(orgId, id) {
  const recorded = await store.get(COLLECTION, orgId, id).catch(() => null);
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
  const existing = await store.get(COLLECTION, orgId, project.id).catch(() => null);

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

module.exports = { list, get, put, remove, adoptSeed, seedProjects, seedMeta, COLLECTION };
