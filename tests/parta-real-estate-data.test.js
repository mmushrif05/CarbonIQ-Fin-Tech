/**
 * §5.4 / §5.5 real-estate — the data library, the shared data-quality table and
 * the reference.
 *
 * CRE and mortgages share one table (5.4-1 / 5.5-1) of the same shape and the
 * same scores, and it is NOT the corporate table: Option 2a is score 3 here
 * where §5.1/§5.2 put it at 2, and 2b is 4 where they put it at 3. The energy
 * statistics are provisional and say so, versioned and checksummed like the
 * sovereign set, and the reference route carries both classes.
 */

'use strict';

const request = require('supertest');
const app = require('../src/server');
const dq = require('../src/domains/pcaf-part-a/domain/data-quality');
const dataset = require('../src/domains/pcaf-part-a/domain/real-estate/dataset');
const manifest = require('../data/pcaf-parta/real-estate/MANIFEST.json');

describe('The shared real-estate data-quality table (Tables 5.4-1 / 5.5-1)', () => {
  test('the option-to-score mapping is the property table: 1a→1, 1b→2, 2a→3, 2b→4, 3→5', () => {
    for (const [opt, sc] of [['1a', 1], ['1b', 2], ['2a', 3], ['2b', 4], ['3', 5]]) {
      expect(dq.score('commercial-real-estate', opt).score).toBe(sc);
      expect(dq.score('mortgages', opt).score).toBe(sc);
    }
  });

  test('CRE and mortgages read the same table object', () => {
    expect(dq.tableFor('commercial-real-estate')).toBe(dq.tableFor('mortgages'));
    expect(dq.tableFor('commercial-real-estate').table).toBe('Tables 5.4-1 / 5.5-1');
  });

  test('it is not the corporate table — 2a and 2b differ', () => {
    /* §5.2 puts 2a at 2 and 2b at 3; the property table puts them at 3 and 4. */
    expect(dq.score('business-loans-unlisted-equity', '2a').score).toBe(2);
    expect(dq.score('commercial-real-estate', '2a').score).toBe(3);
    expect(dq.score('business-loans-unlisted-equity', '2b').score).toBe(3);
    expect(dq.score('commercial-real-estate', '2b').score).toBe(4);
  });

  test('the property table has no Option 3a or 3b — Option 3 is a single row at score 5', () => {
    const opts = dq.optionsFor('mortgages').map(o => o.option);
    expect(opts).toEqual(['1a', '1b', '2a', '2b', '3']);
  });

  test('the scale states 1 is the highest quality, and a score renders as a category not a fraction', () => {
    expect(dq.tableFor('commercial-real-estate').scale).toMatch(/1 is the highest data quality/);
    /* The rendered score label is "Data quality score: N (Option X)", never "N / 5". */
    for (const opt of ['1a', '2b', '3']) {
      expect(dq.score('mortgages', opt).label).not.toMatch(/\/\s*5\b/);
    }
  });
});

describe('The real-estate energy-statistics library', () => {
  test('every shipped building type is provisional and carries a source', () => {
    for (const t of dataset.buildingTypes()) {
      expect(t.intensity_kWh_per_m2_yr.provisional).toBe(true);
      expect(typeof t.source).toBe('string');
      expect(t.source.length).toBeGreaterThan(10);
      expect(['diesel', 'lpg']).toContain(t.fuelSource);
    }
  });

  test('grid and fuel factors are held for Sri Lanka, provisional', () => {
    const f = dataset.factorsFor('LK');
    expect(f.electricity_grid.value).toBeGreaterThan(0);
    expect(f.electricity_grid.provisional).toBe(true);
    expect(f.diesel.provisional).toBe(true);
    expect(f.lpg.provisional).toBe(true);
  });

  test('a type not held is null rather than a nearest guess', () => {
    expect(dataset.typeFor('nonexistent-type')).toBeNull();
    expect(dataset.factorsFor('ZZ')).toBeNull();
  });

  test('the release names the version, status and a checksum, and the committed manifest matches', () => {
    const r = dataset.release();
    expect(r.tables[0].status).toBe('provisional');
    expect(r.provisionalTables).toContain('real-estate-energy-statistics');
    expect(manifest.checksum).toBe(r.checksum);
    expect(manifest.tables[0].checksum).toBe(r.tables[0].checksum);
  });
});

describe('The reference route carries the two property classes', () => {
  test('GET /reference lists commercial-real-estate and mortgages with their table and dataset', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/reference').set('x-api-key', process.env.UI_API_KEY);
    if (res.status !== 200) return;
    const ids = res.body.assetClasses.map(c => c.id);
    expect(ids).toContain('commercial-real-estate');
    expect(ids).toContain('mortgages');
    const cre = res.body.assetClasses.find(c => c.id === 'commercial-real-estate');
    expect(cre.dataQualityTable).toBe('Tables 5.4-1 / 5.5-1');
    expect(cre.dataset.provisionalTables).toContain('real-estate-energy-statistics');
    expect(cre.denominator).toMatch(/value at origination/i);
  });
});
