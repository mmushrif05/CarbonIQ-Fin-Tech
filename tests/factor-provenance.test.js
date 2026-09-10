/**
 * The factor set, and whether a disclosure can say which one produced it.
 *
 * The strategy this product is built to commits to a locked, traceable
 * regional baseline: a bank should not have to re-measure a figure it already
 * holds, and an auditor should be able to tie a number to the factors behind
 * it. The tables shipped without a version, an effective date or a checksum,
 * which is the opposite of that — a value could be corrected and no document
 * would say so, and the constant that drives about 97% of the figure on the
 * default path is a placeholder.
 *
 * These hold all of it: the provenance is required, the provisional marker is
 * derived from the rows rather than declared, the manifest is the tables, and
 * the checksum moves when a value does.
 */

'use strict';

process.env.STORAGE_BACKEND = 'memory';
process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../src/server');
const factors = require('../src/domains/pcaf-part-c/domain/factors');
const { factorTableSchema, checked } = require('../src/shared/reference-data');
const { checksum } = require('../src/shared/checksum');

const DIR = path.join(__dirname, '..', 'data', 'factors');
const MANIFEST = path.join(DIR, 'MANIFEST.json');
const auth = r => r.set('x-api-key', process.env.UI_API_KEY);

const tableFiles = () => fs.readdirSync(DIR)
  .filter(f => f.endsWith('.json') && f !== 'MANIFEST.json')
  .map(f => f.replace(/\.json$/, ''));

describe('Every table declares where it came from', () => {
  test('every table on disk is one the engine loads', () => {
    /* A table added to the directory and not to the loader is a factor set
       nobody is using and nobody knows is unused. */
    expect(tableFiles().sort()).toEqual([...factors.TABLE_FILES].sort());
  });

  test('each carries a version, an effective date and a status', () => {
    for (const t of Object.values(factors.allTables())) {
      expect(t.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(t.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['provisional', 'released']).toContain(t.status);
    }
  });

  test('the schema refuses a table without them', () => {
    const bare = { table: 'x', rows: { a: { value: 1, tier: 'Global', reference: 'r' } } };
    expect(() => checked('test', bare, factorTableSchema)).toThrow(/version/i);
  });
});

describe('The provisional marker is derived, not declared', () => {
  const good = () => ({
    table: 'x', version: '1.0.0', effectiveFrom: '2026-01-01', status: 'released',
    rows: { a: { value: 1, tier: 'Global', reference: 'r' } }
  });

  test('a table whose row records a gap cannot call itself released', () => {
    const t = good();
    t.rows.a.gap = 'the local value is not known';
    expect(() => checked('test', t, factorTableSchema)).toThrow(/it is provisional/);
  });

  test('a table with no gap cannot call itself provisional', () => {
    const t = good();
    t.status = 'provisional';
    expect(() => checked('test', t, factorTableSchema)).toThrow(/it is released/);
  });

  test('provisionalRows must name exactly the rows recording a gap', () => {
    const t = good();
    t.rows.a.gap = 'not known';
    t.status = 'provisional';
    t.provisionalRows = ['b'];
    expect(() => checked('test', t, factorTableSchema)).toThrow(/provisionalRows/);
  });

  test('the shipped tables that stand in for a regional value say so', () => {
    const release = factors.factorRelease();
    expect(release.provisionalTables).toContain('a5-defaults');
    const a5 = release.tables.find(t => t.table === 'a5-defaults');
    expect(a5.provisionalRows).toEqual(expect.arrayContaining(['gridEF', 'ricsSiteEnergy_kgCO2e_m2']));
  });

  test('the constant that drives the figure records what it is standing in for', () => {
    /* About 97% of the construction figure on the default path rests on this
       one number, and it is a RICS global allowance rather than a Sri Lankan
       measurement. A reader has to be able to see that from the document. */
    const row = factors.allTables()['a5-defaults'].rows.ricsSiteEnergy_kgCO2e_m2;
    expect(row.gap).toMatch(/Sri Lankan/);
    expect(row.gap).toMatch(/97%/);
    expect(row.tier).toBe('Global');
  });
});

describe('The checksum identifies the set, and moves when it does', () => {
  test('the committed manifest is the tables as they are now', () => {
    /* Drift here means a disclosure cites a factor set the repository no
       longer holds. Regenerate with: npm run docs:factor-manifest */
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const release = factors.factorRelease();
    expect(manifest.checksum).toBe(release.checksum);
    expect(manifest.tables).toEqual(release.tables);
    expect(manifest.provisionalTables).toEqual(release.provisionalTables);
  });

  test('changing one value changes that table’s checksum and the set’s', () => {
    const before = factors.factorRelease();
    const table = factors.allTables()['densities'];
    const original = table.rows.granite.value;
    try {
      table.rows.granite.value = original + 1;
      const after = factors.factorRelease();
      const b = before.tables.find(t => t.table === 'densities').checksum;
      const a = after.tables.find(t => t.table === 'densities').checksum;
      expect(a).not.toBe(b);
      expect(after.checksum).not.toBe(before.checksum);
    } finally {
      table.rows.granite.value = original;
    }
    expect(factors.factorRelease().checksum).toBe(before.checksum);
  });

  test('the checksum does not depend on key order', () => {
    /* The property the canonical form exists for: two encodings of the same
       content must hash the same, or the checksum is a fact about the
       serialiser rather than about the factors. */
    expect(checksum({ a: 1, b: { c: 2, d: 3 } })).toBe(checksum({ b: { d: 3, c: 2 }, a: 1 }));
  });
});

describe('It reaches the reader', () => {
  test('the factors endpoint publishes the release', async () => {
    const res = await auth(request(app).get('/v1/pcaf/part-c/factors')).expect(200);
    expect(res.body.release.checksum).toBe(factors.factorRelease().checksum);
    expect(res.body.release.tables.length).toBe(factors.TABLE_FILES.length);
    expect(res.body.release.algorithm).toMatch(/SHA-256/);
  });

  test('one table by name carries its own release row', async () => {
    const res = await auth(request(app).get('/v1/pcaf/part-c/factors?table=a5-defaults')).expect(200);
    expect(res.body.release.version).toBe('1.0.0');
    expect(res.body.release.status).toBe('provisional');
  });

  test('the report’s factor annex cites the set the figures rest on', () => {
    const golden = fs.readFileSync(path.join(__dirname, 'golden', 'partc-assessment-report.txt'), 'utf8');
    expect(golden).toMatch(/Factor set: \d+ tables, checksum [0-9a-f]{16}/);
    expect(golden).toMatch(/head: Table \| Version \| Effective from \| Status/);
  });
});
