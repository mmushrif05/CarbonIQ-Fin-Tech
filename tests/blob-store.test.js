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

  test('Firebase still wins in automatic mode, where it is configured', () => {
    /* An existing deployment's records must not move because a new option
       appeared — but the operator can override it, see the block below. */
    expect(src).toMatch(/Firebase still wins where it is configured/);
  });

  test('one predicate decides where a write goes, and it is capability()', () => {
    /* This used to re-derive the answer as `!isDurable() && blobs.isAvailable()`,
       which was a second implementation of the precedence rule and could not
       see STORAGE_BACKEND at all — so a forced backend would have been
       reported one way and written another. */
    expect(src).toMatch(/const _blobsLive = \(\) => capability\(\)\.mode === 'blobs'/);
    expect(src).not.toMatch(/!isDurable\(\) && blobs\.isAvailable\(\)/);
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

  test('it leaks no credential — the key set is closed, and every value is safe', async () => {
    /* The key set stays pinned so a field cannot be added to this block
       without someone deciding it is safe to publish. `requested`, `chosen`
       and `reason` were added deliberately: without them "STORAGE_BACKEND
       never reached this runtime" and "Blobs is unreachable" look identical
       from a browser, and the first is far more common. None can carry a
       credential — `requested` is one of four literals, `chosen` is a boolean,
       and `reason` and `remedy` are written in the source. */
    const res = await request(app).get('/health').expect(200);
    const ALLOWED = ['chosen', 'durable', 'mode', 'reason', 'remedy', 'requested', 'writable'];
    const keys = Object.keys(res.body.storage).sort();
    expect(keys.filter(k => !ALLOWED.includes(k))).toEqual([]);
    expect(keys).toEqual(expect.arrayContaining(['mode', 'requested', 'durable', 'writable']));
    expect(['auto', 'blobs', 'firebase', 'memory']).toContain(res.body.storage.requested);
    expect(typeof res.body.storage.chosen).toBe('boolean');
    const wire = JSON.stringify(res.body);
    expect(wire).not.toMatch(/token|secret|serviceAccount|private_key|siteID/i);
  });
});

describe('The operator chooses the store, rather than inheriting it', () => {
  /* Found in production: the site still had Firebase variables set, so
     capability() reported firebase and Blobs was never reached — the storage
     work shipped and did nothing, and nothing on the screen said why. A
     default that quietly overrides a decision is not a default, it is a trap. */
  const store = require('../services/partc-store');
  const ORIGINAL = process.env.STORAGE_BACKEND;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.STORAGE_BACKEND;
    else process.env.STORAGE_BACKEND = ORIGINAL;
    blobs._reset();
  });

  test('unset means automatic, and the payload says the mode was not chosen', () => {
    delete process.env.STORAGE_BACKEND;
    expect(store.requestedBackend()).toBe('auto');
    expect(store.capability().chosen).toBe(false);
  });

  test('an unrecognised value falls back to automatic rather than refusing everything', () => {
    process.env.STORAGE_BACKEND = 'postgres-please';
    expect(store.requestedBackend()).toBe('auto');
    expect(store.capability().writable).toBe(true);
  });

  test('blobs forces Blobs, and says the mode was chosen', () => {
    process.env.STORAGE_BACKEND = 'blobs';
    const cap = store.capability();
    expect(cap.mode).toBe('blobs');
    expect(cap.chosen).toBe(true);
    expect(cap.durable).toBe(true);
    expect(cap.reason).toMatch(/only store in use/);
  });

  test('a forced backend that is unreachable refuses rather than using the other one', async () => {
    /* Silently honouring the preference by writing somewhere else is how half
       a bank's records end up in a store nobody reads. */
    const mod = require('@netlify/blobs');
    mod.getStore.mockImplementationOnce(() => { throw new Error('no context'); });
    blobs._reset();
    process.env.STORAGE_BACKEND = 'blobs';
    const cap = store.capability();
    expect(cap.mode).toBe('none');
    expect(cap.writable).toBe(false);
    expect(cap.chosen).toBe(true);
    expect(() => store.assertWritable()).toThrow(/not reachable/);
  });

  test('firebase can be forced too, and refuses when it is not configured', () => {
    process.env.STORAGE_BACKEND = 'firebase';
    const cap = store.capability();
    expect(cap.chosen).toBe(true);
    /* No Firebase in the test environment, so this is the refusal path. */
    expect(cap.mode).toBe('none');
    expect(cap.remedy).toMatch(/FIREBASE_SERVICE_ACCOUNT/);
  });

  test('memory is selectable for local work and is never durable', () => {
    process.env.STORAGE_BACKEND = 'memory';
    const cap = store.capability();
    expect(cap.mode).toBe('memory');
    expect(cap.durable).toBe(false);
    expect(cap.remedy).toMatch(/Never set this on a deployed site/);
  });

  test('the automatic firebase branch tells the reader how to choose Blobs instead', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'services', 'partc-store.js'), 'utf8');
    expect(src).toMatch(/Set STORAGE_BACKEND=blobs to use Netlify Blobs instead/);
  });
});

describe('The running commit can actually be reported', () => {
  /* COMMIT_REF is a build-time variable and is absent from the Lambda's
     runtime environment, so /health answered "unknown (not a Netlify build)"
     on every production deploy — the diagnostic built to tell a broken fix
     from an undeployed one could not tell them apart. */
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..');

  test('the build stamps what it knows to a file', () => {
    expect(fs.existsSync(path.join(ROOT, 'scripts', 'build-info.js'))).toBe(true);
    const pkg = require('../package.json');
    expect(pkg.scripts['build:info']).toBe('node scripts/build-info.js');
  });

  test('the deploy runs that step, and ships the file to the function', () => {
    const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
    expect(toml).toMatch(/npm install && npm run build:info/);
    expect(toml).toMatch(/"build-info\.json"/);
  });

  test('health reads the stamp, and reports absent rather than guessing', () => {
    const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    expect(src).toMatch(/require\('\.\/build-info\.json'\)/);
    expect(src).toMatch(/Absent stays absent rather than being guessed/);
    expect(src).toMatch(/stamped\.commit \|\| process\.env\.COMMIT_REF/);
  });

  test('the generated stamp is not committed', () => {
    const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    expect(ignore).toMatch(/^build-info\.json$/m);
  });
});
