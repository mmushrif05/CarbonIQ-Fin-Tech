// @ts-check
/**
 * The Baseline Register — the document and its machine-readable half held to
 * one another.
 *
 * `docs/BASELINE-REGISTER.md` is where a finding is recorded with its source;
 * `data/baselines/baseline-register.json` is what Part 2 seeds the governed
 * registry from. Two copies of a register drift, and the one that drifts is
 * the one nobody opened this month — so:
 *
 *   • every baseline key in the JSON is named in the document, and every
 *     metric key the document's matrix lists is in the JSON;
 *   • every asset class a baseline applies to is a declared class, and the
 *     built Part A classes carry the same ids the engine registers;
 *   • every candidate names its publisher, its source URL and a verification
 *     level from the declared vocabulary — a figure with no URL is one nobody
 *     can go and check;
 *   • the adopted candidate exists, and is never one that was `not_found`;
 *   • a `secondary_reported` or `not_found` candidate is marked provisional,
 *     because a disclosure may not rest on it until it is re-read;
 *   • the corrections the document records are the ones the JSON records.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOC = fs.readFileSync(path.join(ROOT, 'docs/BASELINE-REGISTER.md'), 'utf8');
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/baselines/baseline-register.json'), 'utf8'));
const dataQuality = require('../src/domains/pcaf-part-a/domain/data-quality');

const LEVELS = Object.keys(REG._meta.verificationLevels);
const CLASS_IDS = REG.assetClasses.map(c => c.id);

describe('the baseline register — document and data agree', () => {
  test('the vocabulary of verification levels is the three the document declares', () => {
    expect(LEVELS.sort()).toEqual(['not_found', 'primary', 'secondary_reported']);
    for (const level of LEVELS) expect(DOC).toContain('`' + level + '`');
  });

  test('every baseline in the JSON is named in the document, by metric key', () => {
    for (const b of REG.baselines) {
      expect(DOC).toContain('`' + b.metricKey + '`');
    }
  });

  test('every metric key in the document\'s matrix is a baseline in the JSON', () => {
    /* The matrix in §2 lists each registry key in backticks in its second column. */
    const matrix = DOC.split('## 2. The baseline × asset-class matrix')[1].split('## 3.')[0];
    const keys = [...matrix.matchAll(/\| `([A-Za-z0-9_]+)` \|/g)].map(m => m[1]);
    expect(keys.length).toBeGreaterThan(10);
    const inJson = new Set(REG.baselines.map(b => b.metricKey));
    /* The sovereign dataset is declared in the matrix without a backticked key. */
    for (const k of keys) expect(inJson.has(k)).toBe(true);
  });

  test('the built Part A classes carry the ids the engine registers', () => {
    for (const id of ['listed-equity-corporate-bonds', 'business-loans-unlisted-equity',
      'project-finance', 'commercial-real-estate', 'mortgages', 'sovereign-debt']) {
      expect(CLASS_IDS).toContain(id);
      expect(dataQuality.tableFor(id)).toBeTruthy();
    }
  });

  test('every class a baseline applies to is a declared class, and every class has at least one baseline', () => {
    const touched = new Set();
    for (const b of REG.baselines) {
      expect(b.appliesTo.length).toBeGreaterThan(0);
      for (const a of b.appliesTo) {
        expect(CLASS_IDS).toContain(a.assetClass);
        expect(Array.isArray(a.options) && a.options.length > 0).toBe(true);
        touched.add(a.assetClass);
      }
    }
    for (const id of CLASS_IDS) expect(touched.has(id)).toBe(true);
  });

  test('every candidate names its publisher, a source URL and a declared verification level', () => {
    for (const b of REG.baselines) {
      expect(b.candidates.length).toBeGreaterThan(0);
      for (const c of b.candidates) {
        expect(typeof c.publisher).toBe('string');
        expect(c.publisher.length).toBeGreaterThan(0);
        expect(c.url).toMatch(/^https?:\/\//);
        expect(LEVELS).toContain(c.verification);
        expect(typeof c.title).toBe('string');
      }
    }
  });

  test('the adopted candidate exists and was never not_found — or nothing is adopted and the reason is stated', () => {
    for (const b of REG.baselines) {
      if (b.adopted === null) {
        expect(typeof b.absentReason).toBe('string');
        expect(b.absentReason.length).toBeGreaterThan(20);
        continue;
      }
      const adopted = b.candidates.find(c => c.id === b.adopted);
      expect(adopted).toBeTruthy();
      expect(adopted.verification).not.toBe('not_found');
    }
  });

  test('the loader validates the file and answers which baselines a class reads', () => {
    const reg = require('../src/domains/baseline/domain/register');
    expect(reg.register().baselines.length).toBe(REG.baselines.length);
    const forMortgages = reg.baselinesFor('mortgages');
    expect(forMortgages.map(b => b.key)).toEqual(expect.arrayContaining(
      ['grid_emission_factor_average', 'building_energy_intensity', 'building_energy_per_dwelling']));
    const perDwelling = forMortgages.find(b => b.key === 'building_energy_per_dwelling') || { adopted: 'missing', absentReason: '' };
    expect(perDwelling.adopted).toBeNull();
    expect(perDwelling.absentReason).toMatch(/CEB/);
    expect(reg.isAssetClass('motor-vehicle-loans')).toBe(true);
    expect(reg.isAssetClass('loans')).toBe(false);
    /* A candidate nobody can check is refused by the schema, not by convention. */
    const bent = JSON.parse(JSON.stringify(REG));
    delete bent.baselines[0].candidates[0].url;
    expect(reg.registerSchema.validate(bent, { convert: false }).error).toBeTruthy();
    const unread = JSON.parse(JSON.stringify(REG));
    const sec = unread.baselines.flatMap(b => b.candidates).find(c => c.verification === 'secondary_reported') || {};
    sec.provisional = false;
    expect(reg.registerSchema.validate(unread, { convert: false }).error.message).toMatch(/provisional/);
  });

  test('a candidate that was not read from its source is provisional', () => {
    for (const b of REG.baselines) {
      for (const c of b.candidates) {
        if (c.verification !== 'primary') expect(c.provisional).toBe(true);
      }
    }
  });

  test('every candidate that carries a figure carries a vintage or says why not', () => {
    for (const b of REG.baselines) {
      for (const c of b.candidates) {
        if (c.value !== null && c.value !== undefined) {
          expect(c.vintage === null || Number.isInteger(c.vintage)).toBe(true);
        }
      }
    }
  });

  test('the corrections the JSON records are the ones the document records', () => {
    const corrections = DOC.split('## 4. Corrections')[1].split('## 5.')[0];
    for (const b of REG.baselines) {
      for (const file of b.correctsRepo) {
        const basename = file.split(' ')[0].split('/').pop();
        expect(corrections).toContain(basename);
      }
    }
  });

  test('the grid margins are never presented as an average — basis is declared on both grid baselines', () => {
    const avg = REG.baselines.find(b => b.key === 'grid_emission_factor_average');
    const disp = REG.baselines.find(b => b.key === 'grid_displacement_factor');
    expect(avg.basis).toBe('average');
    expect(disp.basis).toMatch(/operating_margin/);
    for (const c of disp.candidates) {
      if (c.value) expect(Object.keys(c.value)).toEqual(expect.arrayContaining(['operating_margin', 'build_margin', 'combined_margin']));
    }
  });

  test('the Islamic-instrument mapping states its basis and maps only onto declared classes', () => {
    expect(REG.islamicInstrumentMapping.basis).toMatch(/inference/i);
    for (const target of Object.values(REG.islamicInstrumentMapping.map)) {
      expect(CLASS_IDS).toContain(target);
    }
  });
});
