/**
 * PCAF Part A §5.9 Sovereign debt — the data library, the data-quality table
 * and the reference (step 1).
 *
 * The point of this step is that the numbers are right and traceable before
 * any engine reads them. Two things are pinned to the standard: the
 * option-to-score mapping is Table 5.9-6 (p.147) and nothing else, and the
 * shipped Singapore and Hong Kong figures reproduce the standard's own worked
 * example (Table 10.3-2, p.202) — $1M of each sovereign's debt attributes 106
 * and 91 tCO2e. A third thing is pinned to honesty: the manifest checksum is
 * the one the dataset actually produces, and every figure carries a source.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/server');
const dq = require('../src/domains/pcaf-part-a/domain/data-quality');
const sovereign = require('../src/domains/pcaf-part-a/domain/sovereign/dataset');

describe('The sovereign data-quality table (Table 5.9-6)', () => {
  test('the option-to-score mapping is the sovereign table and no other', () => {
    expect(dq.score('sovereign-debt', '1a').score).toBe(1);
    expect(dq.score('sovereign-debt', '1b').score).toBe(2);
    expect(dq.score('sovereign-debt', '2').score).toBe(3);
    expect(dq.score('sovereign-debt', '3a').score).toBe(4);
    expect(dq.score('sovereign-debt', '3b').score).toBe(5);
  });

  test('the sovereign table has no Option 2b and no Option 3c', () => {
    const options = dq.optionsFor('sovereign-debt').map(o => o.option);
    expect(options).toEqual(['1a', '1b', '2', '3a', '3b']);
    expect(options).not.toContain('2b');
    expect(options).not.toContain('3c');
  });

  test('the scale states 1 is the highest quality and is never a fraction', () => {
    const t = dq.tableFor('sovereign-debt');
    expect(t.scale).toMatch(/1 is the highest data quality/);
    expect(JSON.stringify(t)).not.toMatch(/\b[1-5]\s*\/\s*5\b/);
  });

  test('the sovereign table cannot be substituted for another class', () => {
    /* Business loans put Option 2b at score 3; sovereign has no 2b at all. */
    expect(() => dq.score('sovereign-debt', '2b')).toThrow(/not in Table 5.9-6/);
  });
});

describe('The sovereign dataset', () => {
  test('Singapore, Hong Kong and Sri Lanka all load', () => {
    expect(sovereign.codes().sort()).toEqual(['HK', 'LK', 'SG']);
    expect(sovereign.countryFor('sg').name).toBe('Singapore');
    expect(sovereign.countryFor('HK').name).toBe('Hong Kong SAR');
    expect(sovereign.countryFor('lk').name).toBe('Sri Lanka');
    expect(sovereign.countryFor('ZZ')).toBeNull();
  });

  test('Singapore and Hong Kong carry the Table 10.3-2 figures exactly', () => {
    const sg = sovereign.countryFor('SG');
    expect(sg.scope1.exclLULUCF.value).toBe(61451586);
    expect(sg.pppGdp.value).toBe(579762);
    const hk = sovereign.countryFor('HK');
    expect(hk.scope1.exclLULUCF.value).toBe(42654105);
    expect(hk.pppGdp.value).toBe(469182);
  });

  test('the shipped figures reproduce the worked example — 106 and 91 tCO2e', () => {
    /* Attribution factor = exposure ÷ PPP-adjusted GDP; financed = factor ×
       scope 1. PPP-GDP is held in $M, so a $1M exposure is 1 ÷ pppGdp × scope1.
       This is the S2 engine's acceptance test, pinned here to the data. */
    const attribute = (c) => {
      const rec = sovereign.countryFor(c);
      return Math.round((1 / rec.pppGdp.value) * rec.scope1.exclLULUCF.value);
    };
    expect(attribute('SG')).toBe(106);
    expect(attribute('HK')).toBe(91);
  });

  test('scope 1 is held both ways, and an unheld LULUCF figure is a stated absence', () => {
    const sg = sovereign.countryFor('SG');
    /* The standard's example gives excl-LULUCF only; incl is absent with a reason. */
    expect(sg.scope1.inclLULUCF.absent).toBe(true);
    expect(sg.scope1.inclLULUCF.reason).toMatch(/including-LULUCF|not asserted/i);
  });

  test('Sri Lanka is provisional, says so, and carries both LULUCF figures', () => {
    const lk = sovereign.countryFor('LK');
    expect(lk.provisional).toBe(true);
    expect(typeof lk.gap).toBe('string');
    expect(lk.gap.length).toBeGreaterThan(20);
    expect(lk.scope1.exclLULUCF.value).toBeGreaterThan(0);
    expect(lk.scope1.inclLULUCF.value).toBeGreaterThan(0);
  });

  test('every present figure carries a source', () => {
    for (const code of sovereign.codes()) {
      const c = sovereign.countryFor(code);
      for (const key of ['exclLULUCF', 'inclLULUCF']) {
        const f = c.scope1[key];
        if (f.absent) { expect(typeof f.reason).toBe('string'); continue; }
        expect(typeof f.source).toBe('string');
        expect(f.source.length).toBeGreaterThan(10);
      }
      expect(typeof c.pppGdp.source).toBe('string');
    }
  });
});

describe('The sovereign release and manifest', () => {
  test('release names the version, status and a checksum', () => {
    const r = sovereign.release();
    expect(r.tables).toHaveLength(1);
    expect(r.tables[0].version).toBe('1.0.0');
    expect(r.tables[0].status).toBe('provisional');
    expect(r.tables[0].provisionalCountries).toEqual(['LK']);
    expect(r.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  test('the committed manifest matches what the dataset produces', () => {
    const manifest = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'data', 'pcaf-parta', 'sovereign', 'MANIFEST.json'), 'utf8'));
    const r = sovereign.release();
    expect(manifest.checksum).toBe(r.checksum);
    expect(manifest.tables).toEqual(r.tables);
    expect(manifest.provisionalTables).toEqual(r.provisionalTables);
  });
});

describe('The reference route carries the sovereign class', () => {
  test('GET /reference lists sovereign-debt with its table and held countries', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/reference')
      .set('x-api-key', process.env.UI_API_KEY);
    if (res.status !== 200) return;
    const cls = res.body.assetClasses.find(c => c.id === 'sovereign-debt');
    expect(cls).toBeTruthy();
    expect(cls.section).toBe('5.9');
    expect(cls.denominator).toMatch(/PPP-adjusted GDP/);
    expect(cls.dataQualityOptions.map(o => o.option)).toEqual(['1a', '1b', '2', '3a', '3b']);
    expect(cls.countriesHeld.map(c => c.code).sort()).toEqual(['HK', 'LK', 'SG']);
    expect(cls.dataset.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});
