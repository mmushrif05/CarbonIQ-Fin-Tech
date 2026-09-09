/**
 * The document store over PostgreSQL — the implementation behind the seam.
 *
 * It presents the same five operations `src/platform/database/store.js` has always
 * offered (put, get, list, patch, remove), so nothing above it changes, and
 * adds the three the key-value stores could not: `query` on indexed fields,
 * `page` by keyset cursor, and `transaction`. A record is stored whole as
 * JSONB; the fields a query needs are generated columns on the table, so the
 * record is the source of truth and the columns cannot drift from it.
 *
 * Every error leaving this module has passed through `errors.translate`, so a
 * route sees a 409 that names the dependent record, not a constraint name.
 */

'use strict';

const client = require('./client');
const { definition, storedProjection } = require('./collections');
const { translate } = require('./errors');

const COLUMNS = 'data, version, created_at, updated_at';

const run = async (fn) => {
  try { return await fn(); }
  catch (err) { throw translate(err); }
};

/** The record, plus the row's own metadata under a non-enumerable key. */
function rowToRecord(row) {
  if (!row) return null;
  const rec = row.data;
  Object.defineProperty(rec, '_row', {
    value: { version: row.version, createdAt: row.created_at, updatedAt: row.updated_at },
    enumerable: false, writable: false,
  });
  return rec;
}

/** created_at is taken from the record's own createdAt when it carries one, so a backfilled record keeps its history. */
function createdAtOf(record) {
  const v = record && record.createdAt;
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

async function put(collection, orgId, id, record) {
  const { table } = definition(collection);
  return run(async () => {
    const { rows } = await client.query(
      `INSERT INTO ${table} (org_id, id, data, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, COALESCE($4::timestamptz, now()), now())
       ON CONFLICT (org_id, id) DO UPDATE
         SET data = EXCLUDED.data, updated_at = now(), version = ${table}.version + 1
       RETURNING ${COLUMNS}`,
      [orgId, id, JSON.stringify(record), createdAtOf(record)]);
    return rowToRecord(rows[0]);
  });
}

async function get(collection, orgId, id, { forUpdate = false } = {}) {
  const { table } = definition(collection);
  return run(async () => {
    const { rows } = await client.query(
      `SELECT ${COLUMNS} FROM ${table} WHERE org_id = $1 AND id = $2${forUpdate && client.inTransaction() ? ' FOR UPDATE' : ''}`,
      [orgId, id]);
    return rowToRecord(rows[0]);
  });
}

/**
 * Filter on registered keys (indexed columns) or on any top-level JSON field.
 * `where` values may be a scalar or an array (→ IN). Null matches IS NULL.
 */
function whereClause(collection, orgId, where = {}, startAt = 2) {
  const { keys } = definition(collection);
  const clauses = ['org_id = $1'];
  const params = [orgId];
  let n = startAt;
  for (const [field, value] of Object.entries(where)) {
    if (value === undefined) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) throw Object.assign(new Error(`Bad query field "${field}".`), { statusCode: 400, code: 'BAD_QUERY_FIELD' });
    const col = keys[field] ? keys[field] : null;
    const expr = col ? col : `data->>'${field}'`;
    if (value === null) { clauses.push(`${expr} IS NULL`); continue; }
    if (Array.isArray(value)) {
      clauses.push(`${col ? col : expr} = ANY($${n}${col && typeof value[0] === 'number' ? '::integer[]' : '::text[]'})`);
      params.push(value.map(v => (col && typeof v === 'number') ? v : String(v)));
      n++;
      continue;
    }
    /* A JSON text comparison against a number needs the text form; a typed
       column compares natively. */
    clauses.push(`${expr} = $${n}${col && typeof value === 'number' ? '::integer' : ''}`);
    params.push(col && typeof value === 'number' ? value : String(value));
    n++;
  }
  return { sql: clauses.join(' AND '), params, next: n };
}

/* `null` means the caller will order the rows itself; sorting ten thousand
   two-kilobyte rows in the database spills to disk for nothing. */
function orderClause(orderBy) {
  if (orderBy === null) return '';
  const dir = orderBy && orderBy.startsWith('-') ? 'DESC' : 'ASC';
  const field = orderBy ? orderBy.replace(/^-/, '') : 'created_at';
  if (field === 'created_at' || field === 'updated_at') return `${field} ${dir}, id ${dir}`;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) throw Object.assign(new Error(`Bad order field "${field}".`), { statusCode: 400, code: 'BAD_ORDER_FIELD' });
  return `data->>'${field}' ${dir}, id ${dir}`;
}

/**
 * A projection: only the named top-level keys, or dotted paths into them,
 * come back. A path absent on a record is absent on the result, never null
 * in its place.
 *
 * Every touch of a ten-kilobyte JSONB value detoasts it again, so the
 * top-level keys are taken in one pass over `jsonb_each`, and nested paths
 * are taken from the small values that pass produced rather than from the
 * record. Where the collection declares a stored projection with exactly
 * this field set, the column is read and the record is not touched at all —
 * that is the difference between a second and a tenth of one on a book of
 * ten thousand.
 */
function projection(collection, fields) {
  if (!Array.isArray(fields) || !fields.length) return 'data';
  const stored = storedProjection(collection, fields);
  if (stored) return `${stored.column} AS data`;
  const top = new Set();
  const nested = {};
  for (const f of fields) {
    if (f.includes('[]')) {
      throw Object.assign(new Error(`"${f}" picks inside an array, which only a stored projection can do; declare one in src/platform/database/collections.js.`), { statusCode: 400, code: 'PROJECTION_NOT_STORED' });
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(f)) {
      throw Object.assign(new Error(`Bad projection field "${f}".`), { statusCode: 400, code: 'BAD_FIELD' });
    }
    const [head, ...rest] = f.split('.');
    if (!rest.length) { top.add(head); delete nested[head]; continue; }
    if (top.has(head)) continue;
    (nested[head] = nested[head] || []).push(rest.join(','));
  }
  const lit = s => `'${s.replace(/'/g, "''")}'`;
  const heads = Object.keys(nested).map(lit).join(',');
  if (!heads) return `COALESCE(pass.j, '{}'::jsonb) AS data`;
  const nestedObj = Object.entries(nested).map(([head, paths]) =>
    `${lit(head)}, jsonb_strip_nulls(jsonb_build_object(${paths.map(p => `${lit(p.split(',').slice(-1)[0])}, (pass.j -> ${lit(head)}) #> '{${p}}'`).join(', ')}))`).join(', ');
  return `(COALESCE(pass.j - ARRAY[${heads}]::text[], '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(${nestedObj}))) AS data`;
}

function projectionFrom(collection, fields) {
  if (!Array.isArray(fields) || !fields.length || storedProjection(collection, fields)) return '';
  const heads = [...new Set(fields.map(f => f.split('.')[0]))].map(s => `'${s.replace(/'/g, "''")}'`).join(',');
  return `, LATERAL (SELECT jsonb_object_agg(key, value) AS j FROM jsonb_each(data) WHERE key = ANY (ARRAY[${heads}]::text[])) pass`;
}

async function query(collection, orgId, { where = {}, limit = null, orderBy = 'created_at', forUpdate = false, fields = null } = {}) {
  const { table } = definition(collection);
  const w = whereClause(collection, orgId, where);
  const capped = limit !== null && limit !== undefined && Number(limit) > 0;
  const cols = fields ? `${projection(collection, fields)}, version, created_at, updated_at` : COLUMNS;
  const from = fields ? `${table}${projectionFrom(collection, fields)}` : table;
  return run(async () => {
    const { rows } = await client.query(
      `SELECT ${cols} FROM ${from} WHERE ${w.sql}${orderBy === null ? '' : ` ORDER BY ${orderClause(orderBy)}`}${capped ? ` LIMIT $${w.next}` : ''}${forUpdate && client.inTransaction() ? ' FOR UPDATE' : ''}`,
      capped ? [...w.params, Number(limit)] : w.params);
    return rows.map(rowToRecord);
  });
}

async function list(collection, orgId, { limit = null, orderBy = 'created_at' } = {}) {
  return query(collection, orgId, { limit, orderBy });
}

async function count(collection, orgId, where = {}) {
  const { table } = definition(collection);
  const w = whereClause(collection, orgId, where);
  return run(async () => {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${w.sql}`, w.params);
    return rows[0].n;
  });
}

/* Keyset pagination on (created_at, id): stable under inserts, no offset
   drift, and the cursor is opaque to the caller. */
const encodeCursor = row => Buffer.from(JSON.stringify([row.created_at.toISOString(), row.id])).toString('base64url');
function decodeCursor(cursor) {
  try {
    const [at, id] = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!at || !id) throw new Error();
    return { at, id };
  } catch (_) {
    throw Object.assign(new Error('The cursor is not one this store issued.'), { statusCode: 400, code: 'BAD_CURSOR' });
  }
}

async function page(collection, orgId, { limit = 50, cursor, where = {} } = {}) {
  const { table } = definition(collection);
  const size = Math.min(500, Math.max(1, Number(limit) || 50));
  const w = whereClause(collection, orgId, where);
  const params = [...w.params];
  let sql = `SELECT id, ${COLUMNS} FROM ${table} WHERE ${w.sql}`;
  let n = w.next;
  if (cursor) {
    const c = decodeCursor(cursor);
    sql += ` AND (created_at, id) > ($${n}::timestamptz, $${n + 1})`;
    params.push(c.at, c.id);
    n += 2;
  }
  sql += ` ORDER BY created_at ASC, id ASC LIMIT $${n}`;
  params.push(size + 1);
  return run(async () => {
    const { rows } = await client.query(sql, params);
    const more = rows.length > size;
    const slice = more ? rows.slice(0, size) : rows;
    return {
      items: slice.map(rowToRecord),
      nextCursor: more ? encodeCursor(slice[slice.length - 1]) : null,
      limit: size,
    };
  });
}

/** Shallow merge, as the memory and Blobs stores have always done. */
async function patch(collection, orgId, id, updates) {
  const { table } = definition(collection);
  const merged = { ...updates, updatedAt: new Date().toISOString() };
  return run(async () => {
    const { rows } = await client.query(
      `UPDATE ${table} SET data = data || $3::jsonb, updated_at = now(), version = version + 1
       WHERE org_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
      [orgId, id, JSON.stringify(merged)]);
    return rows.length ? rowToRecord(rows[0]) : null;
  });
}

async function remove(collection, orgId, id) {
  const { table } = definition(collection);
  return run(async () => {
    const { rowCount } = await client.query(`DELETE FROM ${table} WHERE org_id = $1 AND id = $2`, [orgId, id]);
    return rowCount > 0;
  });
}

const transaction = fn => run(() => client.withTransaction(fn));

/**
 * Test helper: empty every registered table in this schema. Refuses outside
 * NODE_ENV=test, because there is no production reason to do this.
 */
async function truncateAll() {
  if (!require('../config').runtime.isTest) throw new Error('truncateAll() is a test helper and refuses to run outside NODE_ENV=test.');
  const { COLLECTIONS } = require('./collections');
  const tables = [...new Set(Object.values(COLLECTIONS).map(c => c.table))];
  const { LOCK_KEY } = require('./audit-chain');
  await run(() => client.withTransaction(async () => {
    /* The audit chain's own lock, taken first: a request that finished a
       moment ago may still be appending its event, and an ALTER TABLE
       arriving while it holds the table deadlocks with it. Same lock, same
       order, so the reset simply waits its turn. */
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
    await client.query(`TRUNCATE ${tables.join(', ')} CASCADE`);
    /* The audit table refuses TRUNCATE by trigger; a test database is the one
       place that rule yields, and only by naming the trigger. One transaction,
       so two resets cannot interleave the toggle. */
    await client.query('ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_truncate');
    await client.query('TRUNCATE audit_events');
    await client.query('ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_truncate');
  }));
}

module.exports = { put, get, list, query, count, page, patch, remove, transaction, truncateAll, encodeCursor, decodeCursor, projection };
