/**
 * Durable storage on Netlify Blobs.
 *
 * The application had one honest answer about persistence and one unusable
 * one: Firebase was the real store, and without it a serverless runtime
 * refused every write with a 503 rather than accepting something it would
 * lose. The refusal was right. It also left the deployment this product is
 * demonstrated on unable to store anything at all.
 *
 * What is pinned here:
 *
 *   The adapter's own logic — key shaping, prefix listing across pages,
 *   patch-merge, and tolerance of a single corrupt record.
 *
 *   Precedence. Firebase still wins where configured, so an existing
 *   deployment's records do not move because a new option appeared. Blobs is
 *   never written alongside Firebase — two durable stores diverge, and nothing
 *   would say which one a figure came from.
 *
 *   **R12 survives.** A write that cannot persist is still refused. Gaining a
 *   real store must not weaken the rule that made the old behaviour honest;
 *   "saved" followed by "gone" remains the worst available outcome.
 *
 * The live round trip against Netlify's API is verified on the deployment, not
 * here — this suite proves the code this repository owns.
 */

'use strict';

/* An in-memory stand-in with the shape of a Netlify Blobs store, including the
   cursor pagination the real one does. Its page size is deliberately tiny so
   the multi-page path is exercised by a handful of records rather than a
   hundred. Names are `mock`-prefixed because Jest hoists the mock factory
   above everything else in the file and refuses out-of-scope references. */
const mockPage = 2;
const mockData = new Map();
let mockStore = null;

function mockMakeStore() {
  if (mockStore) return mockStore;
  mockStore = {
    async setJSON(key, value) { mockData.set(key, JSON.stringify(value)); },
    async get(key) {
      if (!mockData.has(key)) return null;
      const raw = mockData.get(key);
      if (raw === '<<corrupt>>') throw new SyntaxError('Unexpected token');
      return JSON.parse(raw);
    },
    async list({ prefix, cursor } = {}) {
      const keys = [...mockData.keys()].filter(k => k.startsWith(prefix || '')).sort();
      const start = cursor ? Number(cursor) : 0;
      const slice = keys.slice(start, start + mockPage);
      const next = start + mockPage;
      return {
        blobs: slice.map(key => ({ key })),
        cursor: next < keys.length ? String(next) : undefined,
      };
    },
    async delete(key) { mockData.delete(key); },
  };
  return mockStore;
}

jest.mock('@netlify/blobs', () => ({
  getStore: jest.fn(() => mockMakeStore()),
}));

const blobs = require('../services/blob-store');

beforeEach(() => { mockData.clear(); blobs._reset(); });

describe('Keys cannot collide across collections or organisations', () => {
  test('a separator inside a segment is encoded, not passed through', () => {
    /* An organisation id containing a slash would otherwise write into another
       collection's namespace — a fault that reads as data loss and is really a
       key collision. */
    expect(blobs._key('projects', 'org/evil', 'p1')).toBe('projects/org%2Fevil/p1');
    expect(blobs._key('projects', 'org', 'a/b')).toBe('projects/org/a%2Fb');
  });

  test('two organisations never share a prefix', () => {
    expect(blobs._prefix('projects', 'a')).not.toBe(blobs._prefix('projects', 'b'));
    expect(blobs._prefix('projects', 'a')).toBe('projects/a/');
  });

  test('an id that would escape its prefix is contained', () => {
    const key = blobs._key('projects', 'org', '../../other/thing');
    expect(key.startsWith(blobs._prefix('projects', 'org'))).toBe(true);
  });
});

describe('The round trip', () => {
  test('a record written comes back identical', async () => {
    const rec = { id: 'p1', name: 'Jaffna solar', commitment: 12_000_000 };
    await blobs.put('projects', 'org', 'p1', rec);
    expect(await blobs.get('projects', 'org', 'p1')).toEqual(rec);
  });

  test('a missing record is null, not a throw', async () => {
    expect(await blobs.get('projects', 'org', 'nope')).toBeNull();
  });

  test('a record removed is gone', async () => {
    await blobs.put('projects', 'org', 'p1', { id: 'p1' });
    await blobs.remove('projects', 'org', 'p1');
    expect(await blobs.get('projects', 'org', 'p1')).toBeNull();
  });

  test('patch merges and stamps, and refuses to create', async () => {
    await blobs.put('projects', 'org', 'p1', { id: 'p1', name: 'A', commitment: 1 });
    const merged = await blobs.patch('projects', 'org', 'p1', { name: 'B' });
    expect(merged.name).toBe('B');
    expect(merged.commitment).toBe(1);
    expect(merged.updatedAt).toBeTruthy();
    expect(await blobs.patch('projects', 'org', 'ghost', { name: 'X' })).toBeNull();
  });
});

describe('Listing', () => {
  test('it returns only the asked-for collection and organisation', async () => {
    await blobs.put('projects', 'a', 'p1', { id: 'p1' });
    await blobs.put('projects', 'b', 'p2', { id: 'p2' });
    await blobs.put('payments', 'a', 'x1', { id: 'x1' });
    const rows = await blobs.list('projects', 'a');
    expect(rows.map(r => r.id)).toEqual(['p1']);
  });

  test('it walks past the first page rather than stopping at it', async () => {
    /* The store pages at two. A caller asking for five must not silently get
       two because that is what one page happened to hold. */
    for (let i = 1; i <= 5; i += 1) {
      await blobs.put('projects', 'a', `p${i}`, { id: `p${i}` });
    }
    const rows = await blobs.list('projects', 'a', { limit: 5 });
    expect(rows).toHaveLength(5);
  });

  test('it honours a limit smaller than the collection', async () => {
    for (let i = 1; i <= 5; i += 1) {
      await blobs.put('projects', 'a', `p${i}`, { id: `p${i}` });
    }
    expect(await blobs.list('projects', 'a', { limit: 3 })).toHaveLength(3);
  });

  test('one corrupt record does not take down the listing around it', async () => {
    await blobs.put('projects', 'a', 'p1', { id: 'p1' });
    await blobs.put('projects', 'a', 'p2', { id: 'p2' });
    mockData.set(blobs._key('projects', 'a', 'p2'), '<<corrupt>>');
    const rows = await blobs.list('projects', 'a');
    expect(rows.map(r => r.id)).toEqual(['p1']);
  });

  test('an empty collection lists empty rather than throwing', async () => {
    expect(await blobs.list('projects', 'nobody')).toEqual([]);
  });
});

describe('Availability is probed, not assumed', () => {
  test('it reports available when a store can be constructed', () => {
    expect(blobs.isAvailable()).toBe(true);
  });

  test('an unreachable store fails the write loudly rather than quietly', async () => {
    const mod = require('@netlify/blobs');
    mod.getStore.mockImplementationOnce(() => { throw new Error('no context'); });
    blobs._reset();
    expect(blobs.isAvailable()).toBe(false);
    await expect(blobs.put('projects', 'a', 'p1', {})).rejects.toThrow(/not available/i);
  });

  test('the refusal carries a 503 and a code, so a route can answer properly', async () => {
    const mod = require('@netlify/blobs');
    mod.getStore.mockImplementationOnce(() => { throw new Error('no context'); });
    blobs._reset();
    await blobs.put('projects', 'a', 'p1', {}).catch((err) => {
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe('BLOB_STORE_UNAVAILABLE');
    });
    expect.assertions(2);
  });
});

describe('The store layer above it — precedence and the refusal rule', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'services', 'partc-store.js'), 'utf8');

  test('Firebase still wins where it is configured', () => {
    /* An existing deployment's records must not move because a new option
       appeared. */
    expect(src).toMatch(/const _blobsLive = \(\) => !isDurable\(\) && blobs\.isAvailable\(\)/);
    expect(src).toMatch(/Firebase still wins where it is configured/);
  });

  test('the two durable stores are never written together', () => {
    expect(src).toMatch(/never both/);
    expect(src).toMatch(/Writing to\s+two durable stores would leave them to diverge/);
  });

  test('a Blobs failure is not swallowed the way a Firebase failure is', () => {
    /* capability() has just promised durability. A silent catch there would be
       exactly the "saved then gone" this whole layer exists to prevent. */
    expect(src).toMatch(/await blobs\.put\(collection, orgId, id, record\);/);
    expect(src).not.toMatch(/blobs\.put\([^)]*\)\.catch/);
    expect(src).toMatch(/is a broken promise/);
  });

  test('R12 survives — every write still asserts it can persist first', () => {
    for (const fn of ['put', 'patch', 'remove']) {
      const body = src.slice(src.indexOf(`async function ${fn}(`));
      expect(body.slice(0, 200)).toMatch(/assertWritable\(\)/);
    }
  });

  test('capability reports four modes, and blobs is one of them', () => {
    expect(src).toMatch(/mode: 'firebase'/);
    expect(src).toMatch(/mode: 'blobs', durable: true, writable: true/);
    expect(src).toMatch(/mode: 'memory'/);
    expect(src).toMatch(/mode: 'none', durable: false, writable: false/);
  });

  test('the unreachable-store remedy no longer tells the reader to set up Firebase first', () => {
    expect(src).toMatch(/Netlify Blobs needs no configuration and is the expected store here/);
  });
});

describe('The deployment says what it can persist, without a key', () => {
  /* "The data did not save" and "this deployment cannot save" look identical
     from a browser, and a deploy can silently cause the second. /health is the
     one endpoint that needs no credential, which is what makes it the right
     place — the same reason it already reports the running commit. */
  const request = require('supertest');
  const app = require('../server');

  test('/health reports the storage mode', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.storage).toBeDefined();
    expect(['firebase', 'blobs', 'memory', 'none']).toContain(res.body.storage.mode);
    expect(typeof res.body.storage.durable).toBe('boolean');
    expect(typeof res.body.storage.writable).toBe('boolean');
  });

  test('it leaks no credential, only the mode and two booleans', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(Object.keys(res.body.storage).sort()).toEqual(['durable', 'mode', 'writable']);
    const wire = JSON.stringify(res.body);
    expect(wire).not.toMatch(/token|secret|serviceAccount|private_key|siteID/i);
  });
});
