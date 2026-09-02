/**
 * A report states what was measured, attributes what the entity declared, and
 * names what is missing. It never invents.
 *
 * Every report builder previously failed that. The scope 1/2/3 split was the
 * financed-emissions total multiplied by 0.08, 0.14 and 0.78 — printed under a
 * cited clause of GRI 305 and IFRS S2 §29. TCFD carried a board that met
 * quarterly, an ESG team of three reporting to the CRO, a $340M pipeline and
 * 12% of the book in flood zones, none of which this system has ever held. The
 * CBSL disclosure asserted 'Compliant' to the regulator that decides
 * compliance. The PCAF checklist hardcoded every item met:true, including the
 * scope breakdown that was only present because it had been invented.
 *
 * These are the assertions that keep it honest.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { generateReport } = require('../services/reports');
const integrity = require('../services/report-integrity');

const TYPES = ['pcaf', 'gri305', 'tcfd', 'ifrs-s2', 'slgft', 'slgft-cbsl'];

const PORTFOLIO = {
  totalProjects: 40,
  coverage_pct: 88,
  totalEmissions_tCO2e: 20000,
  weightedDQ: 2.6,
  totalPortfolioValue_M: 500,
  taxonomyDist: { green: 20, transition: 12, brown: 8 },
  dqDistribution: { '1': 2, '2': 18, '3': 12, '4': 6, '5': 2 },
  assetClasses: [],
  yoy: { prev_tCO2e: 21000 },
};

const build = (type, extra = {}) =>
  generateReport({ type, period: '2025', orgName: 'DFCC Bank PLC', portfolioData: PORTFOLIO, ...extra });

describe('The lender\'s own scope 1 and 2 are never derived from its portfolio', () => {
  test.each(['gri305', 'ifrs-s2'])('%s reports them as absent, not as a fraction of the total', type => {
    const r = build(type);
    const s1 = type === 'gri305' ? r.summary.scope1_tCO2e : r.disclosures.emissionsData.scope1_tCO2e;
    const s2 = type === 'gri305' ? r.summary.scope2_tCO2e : r.disclosures.emissionsData.scope2_tCO2e;

    expect(integrity.isPlaceholder(s1)).toBe(true);
    expect(integrity.isPlaceholder(s2)).toBe(true);
    // The old values were exactly these.
    expect(s1).not.toBe(Math.round(PORTFOLIO.totalEmissions_tCO2e * 0.08));
    expect(s2).not.toBe(Math.round(PORTFOLIO.totalEmissions_tCO2e * 0.14));
  });

  test('an entity that supplies them has them reported', () => {
    const r = build('gri305', { entityDisclosures: { scope1_tCO2e: 410, scope2_tCO2e: 980 } });
    expect(r.summary.scope1_tCO2e).toBe(410);
    expect(r.summary.scope2_tCO2e).toBe(980);
  });

  test('financed emissions are Category 15 in full, not 5% of scope 3', () => {
    const r = build('gri305');
    const cats = r.disclosures['GRI 305-3'].categories;

    expect(cats).toHaveLength(1);
    expect(cats[0].cat).toMatch(/Category 15/);
    expect(cats[0].tCO2e).toBe(PORTFOLIO.totalEmissions_tCO2e);
  });
});

describe('Entity-level narrative is attributed or absent, never written for them', () => {
  test('TCFD governance is not asserted when the entity said nothing', () => {
    const g = build('tcfd').pillars.governance;

    expect(integrity.isPlaceholder(g.boardOversight)).toBe(true);
    expect(integrity.isPlaceholder(g.managementRole)).toBe(true);
    expect(g.boardOversight.standardRef).toBe('TCFD Governance a)');
  });

  test('what the entity does supply is used verbatim', () => {
    const r = build('tcfd', { entityDisclosures: {
      boardOversight: 'The Board Integrated Risk Management Committee reviews climate risk semi-annually.'
    } });

    expect(r.pillars.governance.boardOversight)
      .toBe('The Board Integrated Risk Management Committee reviews climate risk semi-annually.');
  });

  test('a transition plan is never asserted as committed', () => {
    const tp = build('ifrs-s2').disclosures.transitionPlan;
    expect(tp.committed).toBeUndefined();
    expect(integrity.isPlaceholder(tp.plan)).toBe(true);
  });
});

describe('A compliance verdict is not the software\'s to give', () => {
  test('the CBSL disclosure does not tell the regulator it is compliant', () => {
    const d = build('slgft-cbsl').cbslCompliance.directionNo05;

    expect(d.status).not.toBe('Compliant');
    expect(integrity.isPlaceholder(d.status)).toBe(true);
  });

  test('the disagreeing Sri Lankan thresholds are disclosed, not hidden', () => {
    const r = build('slgft-cbsl');
    expect(r.taxonomyAlignment.thresholds.source).toMatch(/600/);
    expect(r.cbslCompliance.directionNo05.thresholdCaveat).toMatch(/CBSL/);
  });

  test('DNSH objectives carry no verdict without an assessment', () => {
    const objectives = build('slgft').dnshCompliance.objectives;
    for (const o of objectives) expect(integrity.isPlaceholder(o.status)).toBe(true);
  });
});

describe('The PCAF checklist can fail', () => {
  test('an item with nothing behind it is not met', () => {
    const list = build('pcaf').complianceChecklist;
    const scope = list.find(i => /scope 1 and 2/i.test(i.item));

    expect(scope.met).toBe(false);
    expect(list.every(i => i.met === true)).toBe(false);
  });

  test('and passes once the entity supplies the figure', () => {
    const list = build('pcaf', { entityDisclosures: { scope1And2_tCO2e: 1200 } }).complianceChecklist;
    expect(list.find(i => /scope 1 and 2/i.test(i.item)).met).toBe(true);
  });
});

describe('Every report carries its own list of what it could not state', () => {
  test.each(TYPES)('%s reports its gaps', type => {
    const r = build(type);
    expect(r.gaps).toBeDefined();
    expect(typeof r.gaps.count).toBe('number');
    expect(Array.isArray(r.gaps.items)).toBe(true);
  });

  test('a report is never called complete while an item is unmet', () => {
    const r = build('pcaf');
    const unmet = r.complianceChecklist.filter(i => !i.met);

    expect(unmet.length).toBeGreaterThan(0);
    expect(r.gaps.complete).toBe(false);
  });
});

describe('Sample figures announce themselves', () => {
  test('a report built with no portfolio says so on its face', () => {
    const r = generateReport({ type: 'pcaf', period: '2025', orgName: 'DFCC Bank PLC' });

    expect(r.dataSource).toMatch(/SAMPLE DATA/);
    expect(r.sampleDataWarning).toMatch(/must not be filed/i);
  });

  test('a report built from a portfolio does not', () => {
    const r = build('pcaf');
    expect(r.dataSource).toBe('Measured portfolio');
    expect(r.sampleDataWarning).toBeUndefined();
  });
});

describe('The invented constants are gone from the source', () => {
  // A sweep, because a feature test only walks the paths it happens to touch.
  const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'reports.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test.each([
    ['scope split', /totalEmissions_tCO2e \* 0\.(08|14|78|22)/],
    ['risk exposure', /totalPortfolioValue_M \|\| 1000\) \* 0\.(34|08)/],
    ['scope 3 category split', /s3 \* 0\.(85|10|05)/],
    ['asserted compliance', /status:\s*'Compliant'/],
    ['invented target progress', /progress_pct:\s*\d/],
  ])('no %s', (_label, pattern) => {
    expect(code).not.toMatch(pattern);
  });

  test('no percentage falls back to a stand-in when data is missing', () => {
    expect(code).not.toMatch(/totalProjects\) \* 100\)\s*:\s*\d/);
  });
});
