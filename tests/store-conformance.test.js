/**
 * H2 — one contract, four stores.
 *
 * There was no adapter interface. `store.js` was one module repeating
 * `if (_pgLive())` / `if (_blobsLive())` / `if (isDurable())` per verb, and
 * the four backends had quietly drifted apart: memory dropped its oldest
 * record past 500 without a word, `transaction()` became a plain call,
 * `page()` cursors were keyset on one store and offsets on the others, and a
 * write in memory mode also reached Firebase.
 *
 * This suite is the answer. It runs the same tests against every adapter this
 * process can reach, so a difference between them is a failing test rather
 * than something found in production. Where a difference is real and
 * deliberate — only PostgreSQL is transactional; only PostgreSQL sorts
 * numbers numerically — it is stated here rather than hidden.
 */

'use strict';

process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'memory';

const { ADAPTERS } = require('../src/platform/database/adapters');
const memory = require('../src/platform/database/adapters/memory');

/**
 * PostgreSQL joins in when a test database is configured; Firebase and Blobs
 * are not reachable from a test run and are exercised through their unit
 * suites instead. A store that cannot be reached is skipped by name, so the
 * list of what was actually proved is visible in the output.
 */
const reachable = ['memory'];
if (process.env.TEST_DATABASE_URL) reachable.push('postgres');

const ORG = 'org_conformance';
const rec = (id, extra = {}) => ({ id, name: `Record ${id}`, createdAt: new Date().toISOString(), ...extra });

describe.each(reachable)('%s — the contract every store keeps', name => {
  const store = ADAPTERS[name];
  const COLLECTION = 'clients';

  beforeEach(async () => {
    if (name === 'postgres') await store.reset();
    else store.reset();
  });

  test('a record written is the record read back', async () => {
    await store.put(COLLECTION, ORG, 'c1', rec('c1'));
    expect(await store.get(COLLECTION, ORG, 'c1')).toMatchObject({ id: 'c1', name: 'Record c1' });
  });

  test('a record that was never written reads as null, not as an error', async () => {
    expect(await store.get(COLLECTION, ORG, 'absent')).toBeNull();
  });

  test('an organisation reads its own records and no others', async () => {
    await store.put(COLLECTION, ORG, 'mine', rec('mine'));
    await store.put(COLLECTION, 'org_other', 'theirs', rec('theirs'));
    const mine = await store.list(COLLECTION, ORG);
    expect(mine.map(r => r.id)).toEqual(['mine']);
  });

  test('put replaces, patch merges, and neither invents a record', async () => {
    await store.put(COLLECTION, ORG, 'c1', rec('c1', { keep: 'yes', drop: 'yes' }));
    await store.put(COLLECTION, ORG, 'c1', rec('c1', { keep: 'still' }));
    expect(await store.get(COLLECTION, ORG, 'c1')).not.toHaveProperty('drop');

    const patched = await store.patch(COLLECTION, ORG, 'c1', { added: true });
    expect(patched).toMatchObject({ keep: 'still', added: true });
    expect(await store.patch(COLLECTION, ORG, 'nope', { added: true })).toBeNull();
  });

  test('remove takes one record and leaves the rest', async () => {
    await store.put(COLLECTION, ORG, 'a', rec('a'));
    await store.put(COLLECTION, ORG, 'b', rec('b'));
    await store.remove(COLLECTION, ORG, 'a');
    expect(await store.get(COLLECTION, ORG, 'a')).toBeNull();
    expect((await store.list(COLLECTION, ORG)).map(r => r.id)).toEqual(['b']);
  });

  test('query filters on equality, on any-of, and on absence', async () => {
    await store.put(COLLECTION, ORG, 'a', rec('a', { sector: 'construction' }));
    await store.put(COLLECTION, ORG, 'b', rec('b', { sector: 'energy' }));
    await store.put(COLLECTION, ORG, 'c', rec('c'));

    expect((await store.query(COLLECTION, ORG, { where: { sector: 'construction' } })).map(r => r.id)).toEqual(['a']);
    const either = await store.query(COLLECTION, ORG, { where: { sector: ['construction', 'energy'] } });
    expect(either.map(r => r.id).sort()).toEqual(['a', 'b']);
    expect((await store.query(COLLECTION, ORG, { where: { sector: null } })).map(r => r.id)).toEqual(['c']);
  });

  test('count agrees with query', async () => {
    await store.put(COLLECTION, ORG, 'a', rec('a', { sector: 'construction' }));
    await store.put(COLLECTION, ORG, 'b', rec('b', { sector: 'energy' }));
    expect(await store.count(COLLECTION, ORG, {})).toBe(2);
    expect(await store.count(COLLECTION, ORG, { sector: 'energy' })).toBe(1);
  });

  test('a projection returns the named fields and nothing else', async () => {
    await store.put(COLLECTION, ORG, 'a', rec('a', { sector: 'construction', secret: 'not asked for' }));
    const [row] = await store.query(COLLECTION, ORG, { fields: ['id', 'sector'] });
    expect(row).toEqual({ id: 'a', sector: 'construction' });
  });

  test('page walks the whole collection exactly once, and a foreign cursor is refused', async () => {
    for (let i = 0; i < 7; i += 1) await store.put(COLLECTION, ORG, `c${i}`, rec(`c${i}`));

    const seen = [];
    let cursor;
    do {
      const p = await store.page(COLLECTION, ORG, { limit: 3, cursor });
      seen.push(...p.items.map(r => r.id));
      cursor = p.nextCursor;
    } while (cursor);

    expect(seen.sort()).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    expect(new Set(seen).size).toBe(seen.length);

    /* Decoding a cursor this store did not issue to "page one" is how a
       client reads the first page forever and believes it saw the book. */
    await expect(store.page(COLLECTION, ORG, { limit: 3, cursor: '%%%not-a-cursor' }))
      .rejects.toMatchObject({ code: 'BAD_CURSOR', statusCode: 400 });
  });

  test('list caps where a cap is asked for', async () => {
    for (let i = 0; i < 5; i += 1) await store.put(COLLECTION, ORG, `c${i}`, rec(`c${i}`));
    expect((await store.list(COLLECTION, ORG, { limit: 2 })).length).toBe(2);
  });

  test('a transaction runs the work, whatever the store can promise', async () => {
    const out = await store.transaction(async () => {
      await store.put(COLLECTION, ORG, 'in-tx', rec('in-tx'));
      return 'done';
    });
    expect(out).toBe('done');
    expect(await store.get(COLLECTION, ORG, 'in-tx')).toBeTruthy();
  });
});

describe('The differences between the stores are stated, not hidden', () => {
  test('only PostgreSQL can roll a group of writes back', () => {
    const store = require('../src/platform/database/store');
    const cap = store.capability();
    expect(cap.transactional).toBe(cap.mode === 'postgres');
  });

  /* The claim above is about which store was chosen. This one is about what
     the store actually does: a lock-and-supersede or an adopt-to-book that
     fails halfway must leave neither half behind. Without a database there is
     nothing to prove it on, and saying so is the point of the skip. */
  const withPg = process.env.TEST_DATABASE_URL ? test : test.skip;
  withPg('a failed transaction leaves nothing behind on PostgreSQL', async () => {
    const pg = ADAPTERS.postgres;
    await pg.reset();
    const org = 'org_rollback';
    await pg.put('clients', org, 'before', rec('before'));

    await expect(pg.transaction(async () => {
      await pg.put('clients', org, 'half', rec('half'));
      throw new Error('the second write failed');
    })).rejects.toThrow('the second write failed');

    expect(await pg.get('clients', org, 'half')).toBeNull();
    expect(await pg.get('clients', org, 'before')).toBeTruthy();
    await pg.reset();
  });

  test('the in-process store refuses a write rather than forgetting an older record', async () => {
    /* It used to evict silently at 500: write 600, read back 500, and the
       first record gone with nothing anywhere saying so. That is the same
       defect as "a book of 201 projects rolled up as 200 without a word". */
    memory.reset();
    const org = 'org_ceiling';
    for (let i = 0; i < memory.MAX_RECORDS; i += 1) {
      await memory.put('clients', org, `c${i}`, { id: `c${i}` });
    }
    expect(await memory.count('clients', org, {})).toBe(memory.MAX_RECORDS);

    await expect(memory.put('clients', org, 'one-too-many', { id: 'one-too-many' }))
      .rejects.toMatchObject({ code: 'STORE_FULL', statusCode: 507 });

    /* Nothing was discarded to make room. */
    expect(await memory.get('clients', org, 'c0')).toMatchObject({ id: 'c0' });
    expect(await memory.count('clients', org, {})).toBe(memory.MAX_RECORDS);
    memory.reset();
  });

  test('an update to a record that already exists is allowed at the ceiling', async () => {
    memory.reset();
    const org = 'org_ceiling_update';
    for (let i = 0; i < memory.MAX_RECORDS; i += 1) {
      await memory.put('clients', org, `c${i}`, { id: `c${i}` });
    }
    await expect(memory.put('clients', org, 'c0', { id: 'c0', changed: true })).resolves.toBeTruthy();
    memory.reset();
  });

  test('every adapter answers every verb the seam calls', () => {
    const verbs = ['put', 'get', 'list', 'patch', 'remove', 'query', 'page', 'count', 'transaction', 'reset'];
    for (const [name, adapter] of Object.entries(ADAPTERS)) {
      const missing = verbs.filter(v => typeof adapter[v] !== 'function');
      expect({ name, missing }).toEqual({ name, missing: [] });
    }
  });
});
