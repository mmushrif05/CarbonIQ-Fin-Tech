/**
 * The tamper-evident audit trail.
 *
 * Every event's hash covers the previous event's hash and its own canonical
 * content, so the trail can only be verified whole: remove a row, edit a row
 * or reorder two and every hash after the change fails. The table itself
 * refuses UPDATE, DELETE and TRUNCATE by trigger, so this is defence in two
 * layers — the database will not let a row change, and if someone with enough
 * privilege changes one anyway, `verify()` says where.
 *
 * Appends are serialised with a transaction-scoped advisory lock: two
 * requests finishing at once must not both read the same previous hash.
 *
 * The canonical form is the JSON of the event with keys sorted at every level
 * and the timestamp as an ISO-8601 string to the millisecond, which is what
 * `verify()` reconstructs from the row. `src/domains/gcf/application/reporting.js` uses the
 * same discipline for its period package, and for the same reason.
 */

'use strict';

const crypto = require('crypto');
const client = require('./client');
const { translate } = require('./errors');

const GENESIS = '0'.repeat(64);
const LOCK_KEY = 7_364_002;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function hashOf(prevHash, event) {
  const body = canonical({
    orgId: event.orgId ?? null, at: event.at, actor: event.actor ?? null, action: event.action,
    resource: event.resource ?? null, requestId: event.requestId ?? null, detail: event.detail ?? {},
  });
  return crypto.createHash('sha256').update(`${prevHash}\n${body}`, 'utf8').digest('hex');
}

/**
 * @param {{orgId?:string, actor?:string, action:string, resource?:string, requestId?:string, detail?:object}} event
 */
async function append(event) {
  if (!event || !event.action) throw Object.assign(new Error('An audit event needs an action.'), { statusCode: 400, code: 'AUDIT_ACTION_REQUIRED' });
  const at = new Date().toISOString();
  const full = { ...event, at, detail: event.detail && typeof event.detail === 'object' ? event.detail : {} };
  try {
    return await client.withTransaction(async () => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
      const { rows } = await client.query('SELECT hash FROM audit_events ORDER BY seq DESC LIMIT 1');
      const prevHash = rows.length ? rows[0].hash : GENESIS;
      const hash = hashOf(prevHash, full);
      const ins = await client.query(
        `INSERT INTO audit_events (org_id, at, actor, action, resource, request_id, detail, prev_hash, hash)
         VALUES ($1, $2::timestamptz, $3, $4, $5, $6, $7::jsonb, $8, $9) RETURNING seq`,
        [full.orgId ?? null, at, full.actor ?? null, full.action, full.resource ?? null, full.requestId ?? null,
          JSON.stringify(full.detail), prevHash, hash]);
      return { seq: Number(ins.rows[0].seq), hash, prevHash, at };
    });
  } catch (err) {
    throw translate(err);
  }
}

const ISO = `to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * Walk the chain from the start and recompute every hash.
 * @returns {{ok:boolean, checked:number, brokenAt:number|null, reason:string|null}}
 */
async function verify({ batch = 1000 } = {}) {
  let prev = GENESIS, checked = 0, lastSeq = 0;
  try {
    for (;;) {
      const { rows } = await client.query(
        `SELECT seq, org_id, ${ISO} AS at_iso, actor, action, resource, request_id, detail, prev_hash, hash
         FROM audit_events WHERE seq > $1 ORDER BY seq ASC LIMIT $2`, [lastSeq, batch]);
      if (!rows.length) break;
      for (const r of rows) {
        if (r.prev_hash !== prev) {
          return { ok: false, checked, brokenAt: Number(r.seq), reason: 'prev_hash does not match the previous row — a row was removed, inserted or reordered' };
        }
        const expected = hashOf(prev, {
          orgId: r.org_id, at: r.at_iso, actor: r.actor, action: r.action, resource: r.resource, requestId: r.request_id, detail: r.detail,
        });
        if (expected !== r.hash) {
          return { ok: false, checked, brokenAt: Number(r.seq), reason: 'hash does not match the row content — the row was edited' };
        }
        prev = r.hash;
        checked++;
        lastSeq = Number(r.seq);
      }
    }
    return { ok: true, checked, brokenAt: null, reason: null };
  } catch (err) {
    throw translate(err);
  }
}

async function tail({ orgId, limit = 50 } = {}) {
  const params = [Math.min(500, Math.max(1, Number(limit) || 50))];
  let sql = `SELECT seq, org_id, ${ISO} AS at, actor, action, resource, request_id, detail, hash FROM audit_events`;
  if (orgId) { sql += ' WHERE org_id = $2'; params.push(orgId); }
  sql += ' ORDER BY seq DESC LIMIT $1';
  try {
    const { rows } = await client.query(sql, params);
    return rows.map(r => ({ ...r, seq: Number(r.seq) }));
  } catch (err) {
    throw translate(err);
  }
}

module.exports = { append, verify, tail, hashOf, canonical, GENESIS, LOCK_KEY };
