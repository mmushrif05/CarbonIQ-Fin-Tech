// @ts-check
/**
 * A baseline, and the rules that make one worth quoting.
 *
 * PCAF sets the *method*. It does not set Sri Lanka's *baseline* — and a
 * baseline anybody can change without a recorded reason is worth nothing,
 * because if one institution can move its number quietly then every number in
 * the market becomes negotiable. So four rules live in the record rather than
 * in anyone's discipline:
 *
 * **A baseline is scoped, and the scopes nest.** `global` is the fallback,
 * `country` is where regional judgement lives, `organisation` is where an
 * institution's own pledge lives. The most specific released baseline wins,
 * and the answer always says which one it was.
 *
 * **A baseline says whether it is real.** A shipped figure is `provisional` —
 * enough to run a demonstration, marked on its face so nobody quotes it.
 * A figure an operator has released is not, and the two are never merged.
 *
 * **A released baseline is immutable.** Editing one in place would rewrite
 * what somebody was told without leaving a trace. A change is a **new
 * version** that supersedes the old one, carrying a reason; where it moves the
 * figure by at least the stated threshold it is a **restatement** and the
 * reason is required rather than optional. That is the discipline the Part C
 * locked-assessment path already follows, applied where a baseline is set.
 *
 * **The record carries its own hash.** Not to prove the operator honest to
 * themselves, but so a figure quoted in a disclosure can be traced back to the
 * exact baseline version that produced it, and shown not to have moved since.
 */

'use strict';

const crypto = require('crypto');
const { validateValues, metric } = require('./metrics');

/** @typedef {import('../../../shared/types').AppError} AppError */

const SCOPES = Object.freeze(['global', 'country', 'organisation']);
const STATUS = Object.freeze({ DRAFT: 'draft', RELEASED: 'released', SUPERSEDED: 'superseded' });

/** How specific each scope is. A higher number wins a resolution. */
const SPECIFICITY = Object.freeze({ global: 0, country: 1, organisation: 2 });

/** A movement of at least this much makes a new version a restatement. */
const DEFAULT_RESTATEMENT_THRESHOLD_PCT = 5;

const fail = (statusCode, code, message, remedy) => {
  const err = /** @type {AppError} */ (new Error(message));
  err.statusCode = statusCode; err.code = code;
  if (remedy) err.remedy = remedy;
  return err;
};

/**
 * The fields that identify *which* baseline this is. Two baselines with the
 * same key are the same baseline at different versions.
 * @param {{metric: string, scope: string, country?: string|null, orgId?: string|null}} b
 */
function keyOf(b) {
  return [b.metric, b.scope, b.country || '-', b.orgId || '-'].join('::');
}

/**
 * Check a proposed baseline before it becomes a record.
 * @param {any} input
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
function validate(input) {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'A baseline is required.' };
  if (!SCOPES.includes(input.scope)) {
    return { ok: false, reason: `Scope must be one of: ${SCOPES.join(', ')}.` };
  }
  /* A country baseline with no country, or an organisation baseline with no
     organisation, cannot be resolved for anybody — it would sit in the table
     looking authoritative and never apply to a single request. */
  if (input.scope !== 'global' && !input.country) {
    return { ok: false, reason: 'A country is required for a country or organisation baseline.' };
  }
  if (input.scope === 'organisation' && !input.orgId) {
    return { ok: false, reason: 'An organisation is required for an organisation-scoped baseline.' };
  }
  if (input.scope !== 'organisation' && input.orgId) {
    return { ok: false, reason: 'Only an organisation-scoped baseline carries an organisation.' };
  }
  if (!input.source || String(input.source).trim().length < 3) {
    return { ok: false, reason: 'A source is required: a baseline nobody can trace to a document is not a baseline.' };
  }
  return validateValues(input.metric, input.values);
}

/** ISO-8601 in UTC, which sorts the same way it reads. */
const now = () => new Date().toISOString();

/**
 * Build the first version of a baseline. It starts as a draft: a figure is not
 * in force until somebody with the authority to release it says so.
 *
 * @param {any} input
 * @param {{actor?: string, orgId?: string}} [ctx]
 */
function create(input, ctx = {}) {
  const v = validate(input);
  if (!v.ok) throw fail(400, 'INVALID_BASELINE', v.reason);

  const at = now();
  const record = {
    baselineId: `bl_${crypto.randomUUID()}`,
    key: keyOf(input),
    metric: input.metric,
    scope: input.scope,
    country: input.scope === 'global' ? null : String(input.country).toUpperCase(),
    orgId: input.scope === 'organisation' ? String(input.orgId) : null,
    values: { ...input.values },
    unit: (metric(input.metric) || {}).unit || null,

    version: 1,
    status: STATUS.DRAFT,
    /* An operator-entered figure is not provisional. The shipped seed is, and
       says so wherever it is read. */
    provisional: false,

    effectiveFrom: input.effectiveFrom || at.slice(0, 10),
    source: String(input.source).trim(),
    authority: input.authority ? String(input.authority).trim() : null,
    note: input.note ? String(input.note).trim() : null,

    supersedes: null,
    restatement: null,
    pledge: null,

    createdAt: at,
    createdBy: ctx.actor || null,
    releasedAt: null,
    releasedBy: null,
  };
  record.auditHash = hash(record);
  return record;
}

/**
 * The next version of a released baseline.
 *
 * The previous values travel with it, so a reader can see the movement without
 * fetching the record it superseded — the same reason a Part C restatement
 * carries "as previously reported" beside "as restated".
 *
 * @param {any} current the released record being replaced
 * @param {{values: Record<string, number>, reason?: string, source?: string,
 *          authority?: string, note?: string, effectiveFrom?: string}} change
 * @param {{actor?: string, thresholdPct?: number}} [ctx]
 */
function supersede(current, change, ctx = {}) {
  if (current.status !== STATUS.RELEASED) {
    throw fail(409, 'NOT_RELEASED',
      `Only a released baseline is superseded; this one is ${current.status}.`,
      current.status === STATUS.DRAFT ? 'Edit the draft, or release it first.' : 'This version has already been superseded.');
  }
  const proposed = { ...current, values: change.values, source: change.source || current.source };
  const v = validate(proposed);
  if (!v.ok) throw fail(400, 'INVALID_BASELINE', v.reason);

  const threshold = Number.isFinite(ctx.thresholdPct) ? Number(ctx.thresholdPct) : DEFAULT_RESTATEMENT_THRESHOLD_PCT;
  const movement = movementOf(current.values, change.values);
  const isRestatement = movement.maxPct >= threshold;

  if (isRestatement && !String(change.reason || '').trim()) {
    throw fail(400, 'REASON_REQUIRED',
      `This moves ${movement.driver} by ${movement.maxPct.toFixed(2)}%, at or above the ${threshold}% threshold, so it restates a released baseline.`,
      'Supply a reason. A figure the market quotes does not move without one on the record.');
  }

  const at = now();
  const next = {
    ...current,
    baselineId: `bl_${crypto.randomUUID()}`,
    values: { ...change.values },
    version: current.version + 1,
    status: STATUS.DRAFT,
    provisional: false,
    effectiveFrom: change.effectiveFrom || at.slice(0, 10),
    source: change.source ? String(change.source).trim() : current.source,
    authority: change.authority ? String(change.authority).trim() : current.authority,
    note: change.note ? String(change.note).trim() : null,
    supersedes: current.baselineId,
    restatement: {
      isRestatement,
      thresholdPct: threshold,
      reason: String(change.reason || '').trim() || null,
      previousValues: { ...current.values },
      previousVersion: current.version,
      movementPct: movement.maxPct,
      movedBy: movement.byField,
    },
    pledge: current.pledge,
    createdAt: at,
    createdBy: ctx.actor || null,
    releasedAt: null,
    releasedBy: null,
  };
  next.auditHash = hash(next);
  return next;
}

/**
 * Put a draft in force.
 * @param {any} record
 * @param {{actor?: string}} [ctx]
 */
function release(record, ctx = {}) {
  if (record.status !== STATUS.DRAFT) {
    throw fail(409, 'NOT_A_DRAFT', `Only a draft is released; this one is ${record.status}.`);
  }
  const at = now();
  const out = { ...record, status: STATUS.RELEASED, releasedAt: at, releasedBy: ctx.actor || null };
  out.auditHash = hash(out);
  return out;
}

/**
 * How far each field moved, as a percentage of where it was, and which field
 * moved most. A move from zero is reported as a move rather than as infinity.
 *
 * @param {Record<string, number>} from
 * @param {Record<string, number>} to
 */
function movementOf(from = {}, to = {}) {
  /** @type {Record<string, number>} */
  const byField = {};
  let maxPct = 0, driver = null;
  for (const f of Object.keys(to)) {
    const a = Number(from[f]);
    const b = Number(to[f]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const pct = a === 0 ? (b === 0 ? 0 : 100) : Math.abs((b - a) / a) * 100;
    byField[f] = Math.round(pct * 100) / 100;
    if (pct > maxPct) { maxPct = pct; driver = f; }
  }
  return { byField, maxPct: Math.round(maxPct * 100) / 100, driver: driver || 'the values' };
}

/** The fields a hash is taken over: what the baseline says, not when it was read. */
function hash(record) {
  const rec = {
    key: record.key, version: record.version, values: record.values,
    scope: record.scope, country: record.country, orgId: record.orgId,
    status: record.status, effectiveFrom: record.effectiveFrom,
    source: record.source, supersedes: record.supersedes,
  };
  return crypto.createHash('sha256').update(JSON.stringify(rec)).digest('hex');
}

/** Whether the record still hashes to what it carries. */
function verify(record) {
  const computed = hash(record);
  return { valid: computed === record.auditHash, computed, stored: record.auditHash || null };
}

module.exports = {
  SCOPES, STATUS, SPECIFICITY, DEFAULT_RESTATEMENT_THRESHOLD_PCT,
  keyOf, validate, create, supersede, release, movementOf, hash, verify,
};
