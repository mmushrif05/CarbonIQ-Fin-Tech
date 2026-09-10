// @ts-check
/**
 * The master baseline table — the operations an administrator performs on it,
 * and the one resolution everything else in the product reads.
 *
 * The rule that makes this worth having: **nothing computes a band, a factor
 * or a threshold for itself.** Every figure that a baseline governs comes from
 * `effective()` and carries the provenance it came back with, so two screens
 * cannot disagree and a disclosure can be traced to the exact version that
 * produced it. A second resolver would be a second answer.
 */

'use strict';

const baseline = require('../domain/baseline');
const pledge = require('../domain/pledge');
const { resolve } = require('../domain/resolve');
const { METRICS, KEYS } = require('../domain/metrics');
const repo = require('../infrastructure/store');
const store = require('../../../platform/database/store');
const Joi = require('joi');
const { checked, strictNumber } = require('../../../shared/reference-data');

/**
 * The shipped seed, checked at load.
 *
 * These figures are **regional judgement**, not a published threshold: the
 * SLGFT sets no absolute kgCO2e/m2 figure anywhere, which is precisely why the
 * bands have to be governed rather than hardcoded. The schema insists on the
 * two things that make the seed safe to ship — that every entry is marked
 * provisional, and that its bands are in order, because a green band above a
 * transition band would classify every building on the wrong side of both.
 */
const seedSchema = Joi.object({
  _meta: Joi.object().unknown(true).required(),
  baselines: Joi.array().items(Joi.object({
    metric: Joi.string().max(80).required(),
    scope: Joi.string().valid('global', 'country', 'organisation').required(),
    country: Joi.string().length(2).optional(),
    values: Joi.object().pattern(Joi.string().max(40), strictNumber).min(1).required(),
    source: Joi.string().max(4000).required(),
  }).unknown(true)).min(1).required(),
}).unknown(false).custom((doc, helpers) => {
  for (const entry of doc.baselines) {
    const { green, transition } = entry.values;
    if (green !== undefined && transition !== undefined && green >= transition) {
      return helpers.error('any.custom', {
        error: new Error(`${entry.metric}: green ${green} must sit below transition ${transition}`),
      });
    }
  }
  return doc;
});

const seedFile = checked('data/baselines/seed.json',
  require('../../../../data/baselines/seed.json'), seedSchema);

/** @typedef {import('../../../shared/types').AppError} AppError */

/** @type {any[]} */
const SEED = seedFile.baselines.map(b => Object.freeze({ ...b }));

const fail = (statusCode, code, message, remedy) => {
  const err = /** @type {AppError} */ (new Error(message));
  err.statusCode = statusCode; err.code = code;
  if (remedy) err.remedy = remedy;
  return err;
};

/* ── Reading ─────────────────────────────────────────────────────────────── */

/** The vocabulary, so an administrator can see what may be governed. */
function metrics() {
  return {
    metrics: Object.values(METRICS),
    note: 'A metric marked wired: false is provisioned — the registry will hold and '
      + 'release a baseline for it, and nothing in the product reads it yet.',
  };
}

/**
 * The master table as an administrator reads it: every baseline visible to
 * this organisation, newest version of each key first.
 * @param {string|null} orgId
 * @param {{metric?: string, scope?: string, country?: string, status?: string}} [filter]
 */
async function list(orgId, filter = {}) {
  let rows = await repo.visible(orgId);
  if (filter.metric) rows = rows.filter(r => r.metric === filter.metric);
  if (filter.scope) rows = rows.filter(r => r.scope === filter.scope);
  if (filter.country) rows = rows.filter(r => r.country === String(filter.country).toUpperCase());
  if (filter.status) rows = rows.filter(r => r.status === filter.status);

  rows.sort((a, b) => a.key.localeCompare(b.key) || b.version - a.version);
  return {
    baselines: rows.map(publicBaseline),
    total: rows.length,
    seed: SEED.map(s => ({ ...s, provisional: true })),
    seedNote: seedFile._meta.rule,
  };
}

/**
 * What is in force for a metric, and why that one. This is the function the
 * rest of the product calls; everything else here is administration.
 *
 * @param {string} metricKey
 * @param {{country?: string|null, orgId?: string|null}} ctx
 */
async function effective(metricKey, ctx = {}) {
  const released = await repo.released(ctx.orgId || null);
  return resolve(metricKey, ctx, released, SEED);
}

/** Every metric at once, for a screen that shows the position. */
async function effectiveAll(ctx = {}) {
  const released = await repo.released(ctx.orgId || null);
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of KEYS) out[k] = resolve(k, ctx, released, SEED);
  return out;
}

/* ── Administration ──────────────────────────────────────────────────────── */

/**
 * Record a draft. A draft is not in force: `effective()` will not return it
 * until it is released, which is what lets a figure be prepared and reviewed
 * before the market sees it.
 */
async function createDraft(input, ctx = {}) {
  assertScopeAllowed(input, ctx);
  const record = baseline.create(input, ctx);

  const existing = await repo.releasedFor(record.key, ctx.orgId || null);
  if (existing) {
    throw fail(409, 'ALREADY_RELEASED',
      `A released baseline already governs ${record.key} at version ${existing.version}.`,
      `Supersede it instead: POST /v1/baselines/${existing.baselineId}/supersede, with the reason for the change.`);
  }
  await repo.save(record);
  return publicBaseline(record);
}

/**
 * Put a draft in force. Where it supersedes a released version, the two moves
 * commit together: a moment in which a baseline had two released versions, or
 * none, is a moment nobody can reconcile a quoted figure against.
 */
async function releaseDraft(baselineId, ctx = {}) {
  return store.transaction(async () => {
    const draft = await repo.get(baselineId, ctx.orgId || null);
    if (!draft) throw fail(404, 'BASELINE_NOT_FOUND', `No baseline ${baselineId}.`);
    assertScopeAllowed(draft, ctx);

    const live = await repo.releasedFor(draft.key, ctx.orgId || null);
    if (live && live.baselineId !== draft.baselineId) {
      if (draft.supersedes !== live.baselineId) {
        throw fail(409, 'STALE_DRAFT',
          `This draft supersedes version ${draft.restatement ? draft.restatement.previousVersion : '—'}, but version ${live.version} is in force.`,
          'Supersede the version that is actually released, so the movement is measured against what the market was told.');
      }
      await repo.save({ ...live, status: baseline.STATUS.SUPERSEDED, supersededBy: draft.baselineId });
    }
    const out = baseline.release(draft, ctx);
    await repo.save(out);
    return publicBaseline(out);
  }, { name: 'baseline.release', required: true });
}

/** A new version of what is in force, with the reason a restatement requires. */
async function supersede(baselineId, change, ctx = {}) {
  const current = await repo.get(baselineId, ctx.orgId || null);
  if (!current) throw fail(404, 'BASELINE_NOT_FOUND', `No baseline ${baselineId}.`);
  assertScopeAllowed(current, ctx);

  const next = baseline.supersede(current, change, {
    actor: ctx.actor,
    thresholdPct: ctx.thresholdPct,
  });
  await repo.save(next);
  return publicBaseline(next);
}

/**
 * The organisation's own pledge, held on its organisation-scoped baseline for
 * the metric — a pledge is a commitment *against a baseline*, so it belongs
 * with the baseline it is measured against rather than floating beside it.
 */
async function setPledge(metricKey, input, ctx = {}) {
  if (!ctx.orgId) throw fail(400, 'ORG_REQUIRED', 'A pledge belongs to an organisation.');
  const recorded = pledge.record(input, ctx);

  const rows = (await repo.visible(ctx.orgId))
    .filter(b => b.metric === metricKey && b.scope === 'organisation' && b.orgId === ctx.orgId);
  const target = rows.sort((a, b) => b.version - a.version)[0];

  if (!target) {
    throw fail(409, 'NO_ORGANISATION_BASELINE',
      `This organisation has no baseline of its own for ${metricKey}, so there is nothing for a pledge to be measured against.`,
      'Create and release an organisation-scoped baseline first. A pledge against the country figure would move whenever the country figure did.');
  }
  const out = { ...target, pledge: recorded };
  await repo.save(out);
  return publicBaseline(out);
}

/**
 * Where the organisation stands against its pledge.
 * `currentValue` is supplied by the caller — the position comes from the book,
 * and this module does not read the book.
 */
async function pledgeProgress(metricKey, ctx = {}, position = {}) {
  const rows = (await repo.visible(ctx.orgId || null))
    .filter(b => b.metric === metricKey && b.scope === 'organisation' && b.orgId === ctx.orgId && b.pledge);
  const held = rows.sort((a, b) => b.version - a.version)[0];
  const eff = await effective(metricKey, ctx);
  const baseValue = position.baselineValue !== undefined
    ? position.baselineValue
    : firstNumber(eff.values);
  return {
    ...pledge.progress(held ? held.pledge : null, { ...position, baselineValue: baseValue }),
    baseline: { basis: eff.basis, scope: eff.scope, version: eff.version, provisional: eff.provisional },
  };
}

/* ── Internals ───────────────────────────────────────────────────────────── */

/** The first numeric value of a band set — the one a reduction is read against. */
function firstNumber(values) {
  if (!values) return null;
  const n = Object.values(values).find(v => typeof v === 'number');
  return n === undefined ? null : n;
}

/**
 * An organisation may govern its own baseline and nobody else's.
 *
 * A country or global baseline is the market's figure: releasing one is a
 * deployment-operator act, not a tenant act, and a bank able to move the
 * country band for every other bank on the deployment would make the figure
 * worth nothing. The route requires the `admin` scope for those.
 */
function assertScopeAllowed(record, ctx) {
  if (record.scope === 'organisation') {
    if (!ctx.orgId || record.orgId !== ctx.orgId) {
      throw fail(403, 'NOT_YOUR_BASELINE', 'An organisation-scoped baseline belongs to the organisation that owns it.');
    }
    return;
  }
  if (!ctx.mayGovernMarket) {
    throw fail(403, 'MARKET_SCOPE_REFUSED',
      `A ${record.scope} baseline is the market's figure, not one organisation's.`,
      'This needs the admin scope. A tenant moving a country band would move it for every institution on the deployment.');
  }
}

/** The record as anyone outside this module may see it. */
function publicBaseline(record) {
  if (!record) return null;
  const { auditHash, ...rest } = record;
  return { ...rest, auditHash, verified: baseline.verify(record).valid };
}

module.exports = {
  SEED, metrics, list, effective, effectiveAll,
  createDraft, releaseDraft, supersede, setPledge, pledgeProgress,
  publicBaseline,
};
