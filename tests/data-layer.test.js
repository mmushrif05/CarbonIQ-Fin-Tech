/**
 * The data layer — what holds without a database attached.
 *
 * The integration half (tests/pg-store.test.js) needs PostgreSQL. This half
 * runs everywhere and pins the things that would rot silently: a collection
 * written but never registered, a second `require('pg')` above the seam, a
 * migration edited after it was applied, a precedence rule that drifted.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const db = require('../platform/database');
const store = require('../services/partc-store');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const ENV = ['DATABASE_URL', 'STORAGE_BACKEND', 'NETLIFY'];
let savedEnv;
beforeEach(() => { savedEnv = ENV.map(k => process.env[k]); });
afterEach(() => ENV.forEach((k, i) => { if (savedEnv[i] === undefined) delete process.env[k]; else process.env[k] = savedEnv[i]; }));

describe('Every collection the services write is registered', () => {
  test('a store call names a collection the registry knows, and the sweep found them', () => {
    /* The two store implementations call their own backends as `store.*`; they are what the seam wraps, not callers of it. */
    const files = [...walk(path.join(ROOT, 'services')), ...walk(path.join(ROOT, 'routes'))]
      .filter(f => !/services[\/\\](blob-store|partc-store)\.js$/.test(f));
    const registered = new Set(db.collections.names());
    const seen = new Set();
    const unresolved = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const consts = new Map([...src.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*'([^']+)'/g)].map(m => [m[1], m[2]]));
      for (const m of src.matchAll(/\bstore\.(?:put|get|list|patch|remove|query|page|count)\(\s*([A-Za-z_][A-Za-z0-9_.]*|'[^']+')/g)) {
        const arg = m[1];
        let name = null;
        if (arg.startsWith("'")) name = arg.slice(1, -1);
        else if (consts.has(arg)) name = consts.get(arg);
        else if (arg.includes('.')) continue; // another module's constant — resolved by its own file
        if (name === null) { unresolved.push(`${path.relative(ROOT, f)}: ${arg}`); continue; }
        seen.add(name);
        expect(registered.has(name) ? null : `${path.relative(ROOT, f)} writes unregistered collection "${name}"`).toBeNull();
      }
    }
    expect(unresolved).toEqual([]);
    expect(seen.size).toBeGreaterThanOrEqual(9);
    for (const name of ['clients', 'projects', 'boqRevisions', 'assessments', 'capital_investments', 'gcf_projects']) {
      expect(seen.has(name)).toBe(true);
    }
  });

  test('an unregistered collection is refused, not created on the fly', () => {
    expect(() => db.collections.tableFor('ledger')).toThrow(/not registered/);
    try { db.collections.tableFor('ledger'); } catch (e) { expect(e.code).toBe('UNKNOWN_COLLECTION'); }
  });

  test('the referential order puts every parent before its children', () => {
    const order = db.collections.inReferentialOrder();
    const { COLLECTIONS } = db.collections;
    expect(order).toHaveLength(Object.keys(COLLECTIONS).length);
    for (const name of order) {
      for (const dep of COLLECTIONS[name].dependsOn) expect(order.indexOf(dep)).toBeLessThan(order.indexOf(name));
    }
  });

  test('every registered key is a generated column in the initial migration', () => {
    const sql = fs.readFileSync(path.join(ROOT, 'migrations', '0001_initial.sql'), 'utf8');
    for (const [name, def] of Object.entries(db.collections.COLLECTIONS)) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE ${def.table} \\(`));
      for (const [field, column] of Object.entries(def.keys)) {
        expect(sql).toMatch(new RegExp(`${column}\\s+(?:text|integer) GENERATED ALWAYS AS \\(\\(?data->>'${field}'`));
      }
      expect(name).toBeTruthy();
    }
  });
});

describe('The boundary — one file knows the driver', () => {
  test("only platform/database/client.js requires 'pg'", () => {
    const offenders = walk(ROOT)
      .filter(f => !f.includes(`${path.sep}tests${path.sep}`))
      .filter(f => /require\(\s*['"]pg['"]\s*\)/.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(ROOT, f));
    expect(offenders).toEqual(['platform/database/client.js']);
  });

  test('no service or route requires platform/database except the seam, the audit middleware, and a declared projection', () => {
    /* partc-portfolio reads the collection registry for the field list of
       its stored projection — a declaration, not a database call. */
    const allowed = new Set(['services/partc-store.js', 'middleware/audit.js', 'server.js', 'services/partc-portfolio.js']);
    const offenders = [...walk(path.join(ROOT, 'services')), ...walk(path.join(ROOT, 'routes')), ...walk(path.join(ROOT, 'middleware'))]
      .filter(f => /require\(['"][./]*platform\/database/.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(ROOT, f))
      .filter(f => !allowed.has(f));
    expect(offenders).toEqual([]);
  });
});

describe('Migrations are numbered, forward-only by default, and checksummed', () => {
  const files = db.migrate.files();

  test('versions run 1, 2, 3 … with no gap and no duplicate', () => {
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.map(f => f.version)).toEqual(files.map((_, i) => i + 1));
  });

  test('each carries a -- down section and a 64-hex checksum of its whole text', () => {
    for (const f of files) {
      expect(f.down).toBeTruthy();
      expect(f.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(f.checksum).toBe(db.migrate.checksum(f.sql));
    }
  });

  test('the checksum moves when the file does', () => {
    expect(db.migrate.checksum('a')).not.toBe(db.migrate.checksum('a '));
  });
});

describe('Precedence — PostgreSQL is chosen by DATABASE_URL, forced by STORAGE_BACKEND', () => {
  test('DATABASE_URL alone selects PostgreSQL, inherited rather than chosen, and says what it displaces', () => {
    delete process.env.STORAGE_BACKEND;
    process.env.DATABASE_URL = 'postgresql://u@h/db';
    const cap = store.capability();
    expect(cap.mode).toBe('postgres');
    expect(cap.chosen).toBe(false);
    expect(cap.transactional).toBe(true);
    expect(cap.durable).toBe(true);
    expect(cap.reason).toMatch(/migrate-to-postgres/);
  });

  test('STORAGE_BACKEND=postgres without a URL refuses, naming the variable', () => {
    process.env.STORAGE_BACKEND = 'postgres';
    delete process.env.DATABASE_URL;
    const cap = store.capability();
    expect(cap.mode).toBe('none');
    expect(cap.writable).toBe(false);
    expect(cap.chosen).toBe(true);
    expect(cap.remedy).toMatch(/DATABASE_URL/);
    expect(() => store.assertWritable()).toThrow(/DATABASE_URL/);
  });

  test('a forced other backend is not overridden by DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgresql://u@h/db';
    process.env.STORAGE_BACKEND = 'memory';
    expect(store.capability().mode).toBe('memory');
    process.env.STORAGE_BACKEND = 'firebase';
    expect(store.capability().mode).not.toBe('postgres');
  });

  test('postgres is a recognised literal for STORAGE_BACKEND', () => {
    expect(store.BACKENDS).toContain('postgres');
    process.env.STORAGE_BACKEND = 'postgres';
    expect(store.requestedBackend()).toBe('postgres');
  });

  test('every capability answer says whether it is transactional', () => {
    for (const backend of ['memory', 'blobs', 'firebase', 'postgres']) {
      process.env.STORAGE_BACKEND = backend;
      delete process.env.DATABASE_URL;
      expect(typeof store.capability().transactional).toBe('boolean');
    }
  });
});

describe('The audit hash', () => {
  const { hashOf, canonical, GENESIS } = db.auditChain;
  const ev = { orgId: 'o', at: '2026-09-09T12:00:00.000Z', actor: 'k', action: 'POST /x', resource: '/v1/x', requestId: 'r', detail: { b: 2, a: [1, { z: 1, y: 2 }] } };

  test('is deterministic and independent of key order', () => {
    const shuffled = { detail: { a: [1, { y: 2, z: 1 }], b: 2 }, requestId: 'r', resource: '/v1/x', action: 'POST /x', actor: 'k', at: ev.at, orgId: 'o' };
    expect(hashOf(GENESIS, ev)).toBe(hashOf(GENESIS, shuffled));
    expect(hashOf(GENESIS, ev)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('moves with any field, and with the previous hash', () => {
    expect(hashOf(GENESIS, { ...ev, actor: 'm' })).not.toBe(hashOf(GENESIS, ev));
    expect(hashOf(GENESIS, { ...ev, detail: { ...ev.detail, b: 3 } })).not.toBe(hashOf(GENESIS, ev));
    expect(hashOf('1'.repeat(64), ev)).not.toBe(hashOf(GENESIS, ev));
  });

  test('canonical form sorts keys at every level', () => {
    expect(canonical({ b: 1, a: { d: 1, c: [2, { f: 1, e: 2 }] } })).toBe('{"a":{"c":[2,{"e":2,"f":1}],"d":1},"b":1}');
    expect(canonical(undefined)).toBe('null');
  });

  test('the genesis hash is sixty-four zeros', () => {
    expect(GENESIS).toBe('0'.repeat(64));
  });
});

describe('PostgreSQL errors reach a route as the shape it already handles', () => {
  const { translate } = db.errors;
  const pgErr = (code, extra) => Object.assign(new Error('db said no'), { code, ...extra });

  test('a delete refused by a foreign key names the dependent record', () => {
    const e = translate(pgErr('23503', { table: 'partc_clients', detail: 'Key (org_id, id)=(o, c1) is still referenced from table "partc_projects".' }));
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe('REFERENCE_VIOLATION');
    expect(e.message).toMatch(/client still has at least one project/);
    expect(e.remedy).toMatch(/project/);
  });

  test('an insert refused by a foreign key names the missing parent', () => {
    const e = translate(pgErr('23503', { table: 'partc_projects', detail: 'Key (org_id, client_id)=(o, nope) is not present in table "partc_clients".' }));
    expect(e.statusCode).toBe(409);
    expect(e.message).toMatch(/project refers to a client that does not exist/);
  });

  test('a unique violation is a 409 DUPLICATE; a lost connection is a 503 with a remedy', () => {
    expect(translate(pgErr('23505', { table: 'partc_assessments' }))).toMatchObject({ statusCode: 409, code: 'DUPLICATE' });
    const c = translate(pgErr('ECONNREFUSED'));
    expect(c.statusCode).toBe(503);
    expect(c.code).toBe('STORAGE_UNREACHABLE');
    expect(c.remedy).toMatch(/DATABASE_URL/);
  });

  test('a missing table says the schema was not migrated', () => {
    expect(translate(pgErr('42P01'))).toMatchObject({ statusCode: 503, code: 'SCHEMA_NOT_MIGRATED' });
  });

  test('an error that already carries a status passes through untouched', () => {
    const mine = Object.assign(new Error('x'), { statusCode: 404, code: 'MINE' });
    expect(translate(mine)).toBe(mine);
  });
});

describe('Query, page and transaction degrade honestly without PostgreSQL', () => {
  const ORG = 'dl-org';
  beforeEach(async () => {
    process.env.STORAGE_BACKEND = 'memory';
    delete process.env.DATABASE_URL;
    await store._resetMemory();
  });

  test('query filters on equality, on any-of, and on null', async () => {
    await store.put('gcf_projects', ORG, 'a', { id: 'a', stream: 'mitigation', sector: null, createdAt: '2026-01-01T00:00:00.000Z' });
    await store.put('gcf_projects', ORG, 'b', { id: 'b', stream: 'adaptation', sector: 'water', createdAt: '2026-01-02T00:00:00.000Z' });
    await store.put('gcf_projects', ORG, 'c', { id: 'c', stream: 'adaptation', sector: 'coast', createdAt: '2026-01-03T00:00:00.000Z' });
    expect((await store.query('gcf_projects', ORG, { where: { stream: 'adaptation' } })).map(r => r.id)).toEqual(['b', 'c']);
    expect((await store.query('gcf_projects', ORG, { where: { sector: ['water', 'coast'] } })).map(r => r.id)).toEqual(['b', 'c']);
    expect((await store.query('gcf_projects', ORG, { where: { sector: null } })).map(r => r.id)).toEqual(['a']);
    expect((await store.query('gcf_projects', ORG, { orderBy: '-created_at', limit: 1 })).map(r => r.id)).toEqual(['c']);
    expect(await store.count('gcf_projects', ORG, { stream: 'adaptation' })).toBe(2);
  });

  test('page walks a collection without overlap or omission, and refuses a foreign cursor', async () => {
    for (let i = 0; i < 7; i++) await store.put('gcf_projects', ORG, `p${i}`, { id: `p${i}`, createdAt: `2026-01-0${i + 1}T00:00:00.000Z` });
    const seen = [];
    let cursor = null;
    do {
      const pg = await store.page('gcf_projects', ORG, { limit: 3, cursor });
      seen.push(...pg.items.map(r => r.id));
      cursor = pg.nextCursor;
    } while (cursor);
    expect(seen).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    await expect(store.page('gcf_projects', ORG, { cursor: 'not-a-cursor' })).rejects.toMatchObject({ statusCode: 400, code: 'BAD_CURSOR' });
  });

  test('a transaction runs the work and says it was not atomic', async () => {
    const r = await store.transaction(async () => { await store.put('gcf_entity', ORG, 'entity', { a: 1 }); return 'done'; });
    expect(r).toBe('done');
    expect(store.capability().transactional).toBe(false);
    expect((await store.get('gcf_entity', ORG, 'entity')).a).toBe(1);
  });

  test('a list is the whole collection, not the first two hundred', async () => {
    for (let i = 0; i < 250; i++) await store.put('gcf_projects', ORG, `r${i}`, { id: `r${i}` });
    expect((await store.list('gcf_projects', ORG)).length).toBe(250);
    expect((await store.list('gcf_projects', ORG, { limit: 10 })).length).toBe(10);
  });
});

describe('The stored roll-up projection', () => {
  test('the migration function names every path the registry declares, and the roll-up asks for exactly that set', () => {
    const sql = fs.readFileSync(path.join(ROOT, 'migrations', '0001_initial.sql'), 'utf8');
    const fn = sql.slice(sql.indexOf('CREATE FUNCTION partc_assessment_rollup'), sql.indexOf('$$;', sql.indexOf('CREATE FUNCTION partc_assessment_rollup')));
    const { fields } = db.collections.COLLECTIONS.assessments.projections.rollup;
    for (const f of fields) {
      if (f.includes('[]')) {
        const leaf = f.split('[].')[1];
        expect(fn).toContain(`'${leaf}', r->'${leaf}'`);
        expect(fn).toContain(`'{${f.split('[]')[0].split('.').join(',')}}'`);
      } else if (f.includes('.')) {
        expect(fn).toContain(`'{${f.split('.').join(',')}}'`);
      } else {
        expect(fn).toContain(`'${f}'`);
      }
    }
    const P = require('../services/partc-portfolio');
    expect([...P.ROLLUP_FIELDS].sort()).toEqual([...fields].sort());
    expect(db.collections.storedProjection('assessments', P.ROLLUP_FIELDS)).toMatchObject({ column: 'rollup' });
    expect(db.collections.storedProjection('assessments', ['summary'])).toBeNull();
  });

  test('the in-memory pick honours dotted paths and rows[] the same way', async () => {
    process.env.STORAGE_BACKEND = 'memory';
    delete process.env.DATABASE_URL;
    await store._resetMemory();
    await store.put('gcf_projects', 'pick-org', 'x', {
      id: 'x', big: { note: 'drop me', rows: [{ a: 1, b: 2, c: 3 }, { a: 4, c: 6 }], keep: { deep: { v: 9, w: 8 } } }, other: 'also dropped',
    });
    const [r] = await store.query('gcf_projects', 'pick-org', { fields: ['id', 'big.rows[].a', 'big.rows[].b', 'big.keep.deep.v', 'missing', 'big.absent.x'] });
    expect(r).toEqual({ id: 'x', big: { rows: [{ a: 1, b: 2 }, { a: 4 }], keep: { deep: { v: 9 } } } });
  });

  test('an array pick without a stored projection is refused by the SQL projection', () => {
    expect(() => db.documents.projection('gcf_projects', ['rows[].a'])).toThrow(/stored projection/);
    expect(db.documents.projection('assessments', db.collections.COLLECTIONS.assessments.projections.rollup.fields)).toBe('rollup AS data');
    expect(db.documents.projection('gcf_projects', ['a', 'b.c'])).toMatch(/jsonb_strip_nulls/);
  });
});

describe('The document store cursor', () => {
  test('round-trips, and a tampered one is refused', () => {
    const { encodeCursor, decodeCursor } = db.documents;
    const c = encodeCursor({ created_at: new Date('2026-09-09T00:00:00.000Z'), id: 'x' });
    expect(decodeCursor(c)).toEqual({ at: '2026-09-09T00:00:00.000Z', id: 'x' });
    expect(() => decodeCursor('zzz')).toThrow(/cursor/);
  });
});
