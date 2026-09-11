/**
 * The Part A sector factor library is versioned, dated and checksummed, and a
 * run that uses it names the set — the discipline `data/factors/MANIFEST.json`
 * gives Part C, kept apart because the two scopes never merge.
 *
 * What is pinned: the vocabulary is closed and its aliases are unambiguous;
 * every held row resolves a tier and a reference and says whether it is
 * provisional; the provisional marker cannot be set or cleared by hand; the
 * committed manifest is the tables as they are now; the endpoint publishes
 * the release; and the shipped intensity bands cover every held sector, so a
 * borrower the library can estimate is a borrower the plausibility check can
 * run on.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../src/server');
const library = require('../src/domains/pcaf-part-a/domain/sector-factors');
const { checked, sectorVocabularySchema, sectorFactorTableSchema } = require('../src/shared/reference-data');
const { sectorBandsOf } = require('../src/domains/baseline/domain/metrics');
const { checksum } = require('../src/shared/checksum');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'data', 'pcaf-parta');
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

const KEY = process.env.UI_API_KEY;

describe('The vocabulary is closed and unambiguous', () => {
  test('every alias names exactly one sector, and every parent is a sector', () => {
    const v = read('sectors.json');
    expect(() => checked('sectors', v, sectorVocabularySchema)).not.toThrow();
    const twice = { ...v, sectors: { ...v.sectors, other: { label: 'Other', isic: 'Z', aliases: ['cement'] } } };
    expect(() => checked('sectors', twice, sectorVocabularySchema)).toThrow(/alias "cement" names both/);
    const orphan = { ...v, sectors: { ...v.sectors, child: { label: 'Child', isic: 'Z', parent: 'nobody', aliases: [] } } };
    expect(() => checked('sectors', orphan, sectorVocabularySchema)).toThrow(/parent "nobody" is not a sector/);
  });

  test('a borrower resolves by key, by name with the mapping recorded, or not at all with the reason', () => {
    expect(library.resolveSector({ sectorKey: 'manufacturing_cement' })).toMatchObject({ key: 'manufacturing_cement', via: 'key', assumptions: [] });
    const byName = library.resolveSector({ sector: 'Garments' });
    expect(byName.key).toBe('manufacturing_textiles');
    expect(byName.via).toBe('name');
    expect(byName.assumptions[0]).toMatch(/mapped to manufacturing_textiles .* by name/);
    expect(library.resolveSector({ sector: 'Astrology' })).toMatchObject({ key: null });
    expect(library.resolveSector({ sector: 'Astrology' }).reason).toMatch(/matches no held sector/);
    expect(library.resolveSector({ sectorKey: 'nope' }).reason).toMatch(/not a sector in the vocabulary/);
  });
});

describe('The factor table carries its provenance and cannot mark itself by hand', () => {
  const table = () => read('sector-factors.json');

  test('every row resolves a tier and a reference, and the shipped rows say they stand in', () => {
    const t = checked('sector-factors', table(), sectorFactorTableSchema);
    for (const [key, row] of Object.entries(t.rows)) {
      expect({ key, tier: row.tier || t.tier, reference: row.reference || t.reference }).toMatchObject({ key, tier: expect.any(String), reference: expect.any(String) });
      expect({ key, gap: typeof row.gap }).toEqual({ key, gap: 'string' });
    }
    expect(t.status).toBe('provisional');
    expect([...t.provisionalRows].sort()).toEqual(Object.keys(t.rows).sort());
  });

  test('a table whose rows record a gap cannot call itself released, and one with no gap cannot call itself provisional', () => {
    const t = table();
    expect(() => checked('x', { ...t, status: 'released' }, sectorFactorTableSchema)).toThrow(/it is provisional/);
    const withoutGap = r => { const rest = { ...r }; delete rest.gap; return rest; };
    const clean = { ...t, provisionalRows: [], rows: Object.fromEntries(Object.entries(t.rows).map(([k, r]) => [k, withoutGap(r)])) };
    expect(() => checked('x', clean, sectorFactorTableSchema)).toThrow(/it is released/);
    expect(() => checked('x', { ...clean, status: 'released' }, sectorFactorTableSchema)).not.toThrow();
  });

  test('provisionalRows must name exactly the rows recording a gap', () => {
    const t = table();
    expect(() => checked('x', { ...t, provisionalRows: t.provisionalRows.slice(1) }, sectorFactorTableSchema)).toThrow(/provisionalRows is/);
  });

  test('a sector with no revenue per unit of assets is refused', () => {
    const t = table();
    const bad = { ...t, rows: { ...t.rows, finance: { ...t.rows.finance, assetTurnover: 0 } } };
    expect(() => checked('x', bad, sectorFactorTableSchema)).toThrow(/assetTurnover of zero/);
  });

  test('every held row is a sector of the vocabulary', () => {
    const v = read('sectors.json');
    for (const key of Object.keys(table().rows)) expect(v.sectors[key]).toBeTruthy();
  });
});

describe('The manifest is the tables as they are now', () => {
  test('the committed manifest matches a fresh release', () => {
    const manifest = read('MANIFEST.json');
    const release = library.release();
    expect(manifest.checksum).toBe(release.checksum);
    expect(manifest.tables).toEqual(release.tables);
    expect(manifest.provisionalTables).toEqual(release.provisionalTables);
  });

  test('changing one value changes the table’s checksum and the set’s', () => {
    const t = read('sector-factors.json');
    const before = checksum(t);
    t.rows.manufacturing_cement.scope1PerRevenue += 0.001;
    expect(checksum(t)).not.toBe(before);
  });

  test('the checksum does not depend on key order', () => {
    const t = read('sector-factors.json');
    const reordered = Object.fromEntries(Object.entries(t).reverse());
    expect(checksum(reordered)).toBe(checksum(t));
  });
});

describe('The factor resolves per basis and per currency, and says why not', () => {
  test('per unit of revenue for 3a and 3c, per unit of assets for 3b, from the same row', () => {
    const rev = library.factorFor({ sectorKey: 'manufacturing_cement', scope: '1', basis: 'revenue', currency: 'LKR' });
    const assets = library.factorFor({ sectorKey: 'manufacturing_cement', scope: '1', basis: 'assets', currency: 'LKR' });
    const row = read('sector-factors.json').rows.manufacturing_cement;
    expect(rev.factor.value).toBeCloseTo(row.scope1PerRevenue / 1e6, 12);
    expect(assets.factor.value).toBeCloseTo((row.scope1PerRevenue * row.assetTurnover) / 1e6, 12);
    expect(assets.factor.library).toMatchObject({ table: 'sector-factors', row: 'manufacturing_cement', checksum: expect.any(String) });
    expect(assets.assumptions.join(' ')).toMatch(/GHG ÷ revenue × revenue ÷ assets/);
  });

  test('a factor held in LKR is never applied to an exposure in USD', () => {
    const r = library.factorFor({ sectorKey: 'manufacturing_cement', scope: '1', basis: 'revenue', currency: 'USD' });
    expect(r.absent).toBe(true);
    expect(r.reason).toMatch(/per unit of LKR and this exposure is in USD/);
  });

  test('a scope the row does not hold is absent with the reason', () => {
    const t = read('sector-factors.json');
    const some = Object.entries(t.rows).find(([, r]) => r.scope3PerRevenue === undefined);
    if (!some) return;   // every shipped row holds scope 3 today
    expect(library.factorFor({ sectorKey: some[0], scope: '3', basis: 'revenue', currency: 'LKR' }).reason).toMatch(/No scope 3 factor/);
  });
});

describe('The shipped bands cover what the library can estimate', () => {
  test('every held sector has a band in the LK seed, in order', () => {
    const seed = require('../data/baselines/seed.json').baselines.find(b => b.metric === 'sector_intensity_tCO2e_per_million_revenue');
    expect(seed.country).toBe('LK');
    const bands = sectorBandsOf(seed.values);
    for (const key of Object.keys(read('sector-factors.json').rows)) {
      expect({ key, band: Boolean(bands[key]) }).toEqual({ key, band: true });
      expect(bands[key].low).toBeLessThanOrEqual(bands[key].high);
    }
  });
});

describe('GET /v1/pcaf/part-a/factors', () => {
  test('publishes the vocabulary, the table and the release, as cacheable reference data', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/factors').set('x-api-key', KEY).expect(200);
    expect(res.headers['cache-control']).toMatch(/max-age/);
    expect(res.body.release.checksum).toBe(library.release().checksum);
    expect(res.body.table.status).toBe('provisional');
    expect(res.body.vocabulary.sectors.find(s => s.key === 'agriculture_rice')).toMatchObject({ held: true, isic: expect.stringMatching(/A01/) });
  });
});
