/**
 * The GCF emissions model — Lot 1 Milestone 4's carbon accounting half.
 *
 * What is pinned here is not that the arithmetic is right (it is arithmetic);
 * it is that the three boundaries cannot merge, that adaptation never enters
 * the carbon headline, that reduction and removal stay apart against NDC 3.0,
 * and that a figure with no way to be checked says so instead of passing.
 *
 * The never-merge rule is asserted structurally — by sweeping the returned
 * object for any key holding a combination — rather than by walking one happy
 * path, for the same reason tests/dq-rendering.test.js sweeps the source tree:
 * a rule that only holds where a test happens to look does not hold.
 */

'use strict';

process.env.STORAGE_BACKEND = 'memory';
process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app = require('../server');
const partcStore = require('../services/partc-store');
const emissions = require('../services/gcf/emissions');
const ndc = require('../services/gcf/ndc-contribution');
const NDC3 = require('../data/gcf/ndc3.json');
const SEED = require('../data/gcf/pipeline.seed.json');

const KEY = process.env.UI_API_KEY;
const auth = r => r.set('x-api-key', KEY);
const api = () => request(app);
const P = SEED.projects;
const byId = id => P.find(p => p.id === id);

beforeEach(() => partcStore._resetMemory());

describe('Three boundaries, and nothing can merge them', () => {
  const roll = emissions.portfolioEmissions(P);

  test('mitigation, embodied and financed are three separate keys', () => {
    expect(roll.headline.annual_tCO2e).toBe(65800);
    expect(roll.embodiedCarbon.a1a5_tCO2e).toBe(44900);
    expect(roll.financedEmissions.available).toBe(false);
  });

  test('the headline is not reduced by embodied carbon', () => {
    /* The tempting "net benefit" figure. It is defined by no standard, is not
       comparable to anything, and cannot be produced from this shape. */
    const perProject = P
      .filter(p => p.stream === 'mitigation')
      .reduce((a, p) => a + p.mitigation.annual_tCO2e.value, 0);
    expect(roll.headline.annual_tCO2e).toBe(perProject);
    expect(roll.headline.annual_tCO2e).not.toBe(perProject - roll.embodiedCarbon.a1a5_tCO2e);
  });

  test('no number anywhere in the roll-up equals mitigation minus embodied', () => {
    const forbidden = [
      roll.headline.annual_tCO2e - roll.embodiedCarbon.a1a5_tCO2e,
      roll.headline.lifetime_tCO2e - roll.embodiedCarbon.a1a5_tCO2e,
      roll.headline.annual_tCO2e + roll.adaptationCoBenefit.annual_tCO2e,
      roll.headline.lifetime_tCO2e + roll.adaptationCoBenefit.lifetime_tCO2e,
    ];
    const numbers = [];
    const walk = (n) => {
      if (typeof n === 'number') { numbers.push(n); return; }
      if (n && typeof n === 'object') Object.values(n).forEach(walk);
    };
    walk(roll);
    for (const f of forbidden) expect(numbers).not.toContain(f);
  });

  test('financed emissions are named as belonging elsewhere, not silently missing', () => {
    const one = emissions.projectEmissions(byId('gcf_p1_jaffna_solar'));
    expect(one.financedEmissions.available).toBe(false);
    expect(one.financedEmissions.reason).toMatch(/capital book/);
    expect(one.financedEmissions.where).toMatch(/capital/);
  });

  test('embodied carbon that is not held is absent, not benchmarked', () => {
    const p1 = emissions.projectEmissions(byId('gcf_p1_jaffna_solar'));
    expect(p1.embodiedCarbon.a1a5_tCO2e).toBeNull();
    expect(p1.embodiedCarbon.present).toBe(false);
    expect(p1.embodiedCarbon.reason).toMatch(/absent rather than/i);
    expect(roll.embodiedCarbon.notHeld).toContain('GCF-P1');
  });

  test('embodied carbon is a payback period, never a deduction', () => {
    const p3 = emissions.projectEmissions(byId('gcf_p3_colombo_cooling'));
    expect(p3.embodiedCarbon.a1a5_tCO2e).toBe(44900);
    expect(p3.embodiedCarbon.paybackYears).toBeGreaterThan(0);
    expect(p3.embodiedCarbon.basis).toMatch(/never a deduction/);
    expect(p3.mitigation.annual_tCO2e).toBe(26400);
  });
});

describe('Adaptation never enters the carbon headline', () => {
  const roll = emissions.portfolioEmissions(P);

  test('the headline counts the three mitigation projects only', () => {
    expect(roll.headline.projects).toBe(3);
    expect(roll.adaptationCoBenefit.projects).toBe(2);
    expect(roll.projects).toBe(5);
  });

  test('the co-benefit is real, reported, and on its own line', () => {
    expect(roll.adaptationCoBenefit.annual_tCO2e).toBe(9000);
    expect(roll.adaptationCoBenefit.lifetime_tCO2e).toBe(180000);
    expect(roll.headline.annual_tCO2e).not.toBe(65800 + 9000);
  });

  test('the rule is decided once, on the row, with its reason', () => {
    const mangrove = emissions.projectEmissions(byId('gcf_p4_mangrove_coast'));
    expect(mangrove.mitigation.countsInHeadline).toBe(false);
    expect(mangrove.mitigation.countsInHeadlineReason).toMatch(/defunds adaptation/);
  });

  test('an adaptation project is excluded even if nobody set isCoBenefit', () => {
    /* The flag is the record's claim; the stream is the fact. Trusting only
       the flag would let one un-ticked box put a mangrove project into a
       carbon-per-dollar ranking. */
    const p = JSON.parse(JSON.stringify(byId('gcf_p4_mangrove_coast')));
    delete p.mitigation.isCoBenefit;
    expect(emissions.projectEmissions(p).mitigation.countsInHeadline).toBe(false);
  });
});

describe('A figure that cannot be checked says so', () => {
  test('the solar annual figure is recomputed from generation and factor', () => {
    const c = emissions.checkMitigation(byId('gcf_p1_jaffna_solar'));
    const annual = c.checks.find(x => x.figure === 'mitigation.annual_tCO2e');
    expect(annual.recomputed).toBe(20537.5);
    expect(annual.recorded).toBe(20500);
    expect(annual.agrees).toBe(true);
    expect(c.agrees).toBe(true);
  });

  test('a wrong emission factor is caught rather than carried', () => {
    const p = JSON.parse(JSON.stringify(byId('gcf_p1_jaffna_solar')));
    p.mitigation.baseline.gridEF_tCO2e_per_mwh.value = 0.95;   // a plausible typo
    const c = emissions.checkMitigation(p);
    expect(c.agrees).toBe(false);
    expect(c.divergences).toHaveLength(1);
    expect(c.divergences[0].divergencePct).toBeGreaterThan(40);
  });

  test('the engine reports the divergence and never overwrites the record', () => {
    const p = JSON.parse(JSON.stringify(byId('gcf_p1_jaffna_solar')));
    p.mitigation.baseline.gridEF_tCO2e_per_mwh.value = 0.95;
    expect(emissions.projectEmissions(p).mitigation.annual_tCO2e).toBe(20500);
  });

  test('a figure with no independent path is unverifiable, not passing', () => {
    const c = emissions.checkMitigation(byId('gcf_p3_colombo_cooling'));
    const annual = c.checks.find(x => x.figure === 'mitigation.annual_tCO2e');
    expect(annual.verifiable).toBe(false);
    expect(annual.recomputed).toBeNull();
    expect(annual.reason).toMatch(/No independent path/);
  });

  test('a missing asset life shows the implied one rather than assuming twenty', () => {
    const c = emissions.checkMitigation(byId('gcf_p2_dryzone_irrigation'));
    const life = c.checks.find(x => x.figure === 'mitigation.lifetime_tCO2e');
    expect(life.verifiable).toBe(false);
    expect(life.impliedLifetimeYears).toBe(20);
    expect(life.reason).toMatch(/cannot be confirmed/);
  });

  test('the roll-up counts what could be checked and names what diverged', () => {
    const roll = emissions.portfolioEmissions(P);
    expect(roll.coverage.projects).toBe(5);
    expect(roll.coverage.verifiable).toBe(3);
    expect(roll.coverage.diverging).toEqual([]);
  });
});

describe('Reduced, avoided and removed', () => {
  const roll = emissions.portfolioEmissions(P);

  test("GCF's own indicator combines the three, and the roll-up says where it does", () => {
    expect(roll.headline.indicator).toMatch(/reduced, avoided or removed/);
    expect(roll.headline.note).toMatch(/never summed/);
  });

  test('the split is carried beside the total so NDC can read the parts', () => {
    expect(roll.headline.byBaselineType.reduced.annual_tCO2e).toBe(26400);
    expect(roll.headline.byBaselineType.avoided.annual_tCO2e).toBe(39400);
    expect(roll.headline.byBaselineType.removal.annual_tCO2e).toBe(0);
  });
});

describe('A pipeline movement is not a performance movement', () => {
  test('the difference is decomposed into what entered, left and changed', () => {
    const previous = P.filter(p => p.id !== 'gcf_p5_ebus_western');
    const m = emissions.movement(previous, P);
    expect(m.movement_tCO2e).toBe(18900);
    expect(m.decomposition.entered.projects).toEqual(['GCF-P5']);
    expect(m.decomposition.entered.annual_tCO2e).toBe(18900);
    expect(m.decomposition.exited.projects).toEqual([]);
    expect(m.decomposition.restated.projects).toEqual([]);
  });

  test('a project leaving reduces the total, and is reported as a departure', () => {
    const current = P.filter(p => p.id !== 'gcf_p1_jaffna_solar');
    const m = emissions.movement(P, current);
    expect(m.decomposition.exited.projects).toEqual(['GCF-P1']);
    expect(m.decomposition.exited.annual_tCO2e).toBe(-20500);
  });

  test('the movement carries the note that it is not a change in performance', () => {
    const m = emissions.movement(P, P);
    expect(m.movement_tCO2e).toBe(0);
    expect(m.note).toMatch(/not a change in performance/);
  });
});

describe('NDC 3.0 — two commitments, never one', () => {
  const c = ndc.portfolioContribution(P);

  test('reduction and removal are separate ledgers', () => {
    expect(c.reduction.pipelineCumulative_tCO2e).toBe(658000);
    expect(c.removal.pipelineCumulative_tCO2e).toBe(0);
    expect(c.reduction.commitment.totalPct).toBe(20.09);
    expect(c.removal.commitment.totalPct).toBe(4.49);
  });

  test('nothing in the output holds their sum', () => {
    /* The combined percentage is the figure nobody has committed to. It is
       built here rather than written, so this file does not itself become the
       place it appears — tests/ndc3-currency.test.js sweeps for the literal. */
    const forbiddenPct = (NDC3.reduction.totalPct + NDC3.removal.totalPct).toFixed(2);
    expect(JSON.stringify(c)).not.toContain(forbiddenPct);
    const combined = c.reduction.pipelineCumulative_tCO2e + c.removal.pipelineCumulative_tCO2e;
    const numbers = [];
    const walk = (n) => {
      if (typeof n === 'number') { numbers.push(n); return; }
      if (n && typeof n === 'object') Object.values(n).forEach(walk);
    };
    walk({ r: c.reduction, m: c.removal, cb: c.adaptationCoBenefit });
    /* Zero removals make the tonnage sum equal the reduction here, so the guard
       that matters is on the percentages — that is where the uncommitted
       combined figure would actually appear. */
    expect(numbers).not.toContain(Number(forbiddenPct));
    expect(combined).toBe(658000);
  });

  test('a removal is booked as a removal, never as a reduction', () => {
    const mangrove = ndc.projectContribution(byId('gcf_p4_mangrove_coast'));
    expect(mangrove.removal.applies).toBe(true);
    expect(mangrove.removal.cumulative_tCO2e).toBe(58000);
    expect(mangrove.reduction.applies).toBe(false);
    expect(mangrove.reduction.cumulative_tCO2e).toBeNull();
  });

  test('only the years inside 2026-2035 count against a 2026-2035 commitment', () => {
    /* The twenty-year solar asset contributes ten years to a ten-year window.
       Counting its whole life would double the claim. */
    const w = ndc.withinPeriod(byId('gcf_p1_jaffna_solar'));
    expect(w.yearsInPeriod).toBe(10);
    expect(w.cumulative_tCO2e).toBe(205000);
    expect(w.cumulative_tCO2e).not.toBe(410000);
  });

  test('a short-lived asset entering late contributes only its overlap', () => {
    const w = ndc.withinPeriod(byId('gcf_p5_ebus_western'), { operatingFrom: 2030 });
    expect(w.yearsInPeriod).toBe(6);
    expect(w.assumption).toMatch(/2030/);
  });

  test('the share of the national target is absent, with what it needs', () => {
    expect(c.reduction.share.available).toBe(false);
    expect(c.reduction.share.reason).toMatch(/business-as-usual/);
    expect(c.reduction.share.needs).toMatch(/bauCumulative_tCO2e/);
  });

  test('supplied a BAU tonnage it computes the share, at the tier of that input', () => {
    const withBau = ndc.portfolioContribution(P, { bauCumulative_tCO2e: 1200000000 });
    expect(withBau.reduction.share.available).toBe(true);
    expect(withBau.reduction.share.tier).toBe('declared');
    expect(withBau.reduction.share.target_tCO2e).toBe(241080000);
    expect(withBau.reduction.share.sharePct).toBeCloseTo(0.273, 3);
    expect(withBau.reduction.share.caveat).toMatch(/declared input, not a\s+measured one/);
  });

  test('a zero or nonsense BAU does not become a division', () => {
    for (const bau of [0, -5, 'lots', null]) {
      expect(ndc.shareOfCommitment(1000, NDC3.reduction, bau).available).toBe(false);
    }
  });

  test('projects map to the sector targets they cite, and a typo is reported', () => {
    const p1 = ndc.projectContribution(byId('gcf_p1_jaffna_solar'));
    expect(p1.sectorTargets.map(t => t.id)).toEqual(['power', 'coal']);
    const bad = JSON.parse(JSON.stringify(byId('gcf_p1_jaffna_solar')));
    bad.ndcSectorTargets = ['powr'];
    expect(ndc.projectContribution(bad).unmatchedSectorTargets).toEqual(['powr']);
  });

  test('adaptation co-benefits stay out of the national mitigation contribution', () => {
    expect(c.adaptationCoBenefit.projects).toEqual(['GCF-P2', 'GCF-P4']);
    expect(c.reduction.projects).toEqual(['GCF-P1', 'GCF-P3', 'GCF-P5']);
    expect(c.reduction.pipelineCumulative_tCO2e).toBe(658000);
  });

  test('no net-zero year is asserted, because NDC 3.0 states none', () => {
    /* The phrase appears twice and both are legitimate: once marking the 2021
       commitment superseded, once saying none is asserted. Any third occurrence
       would be the superseded 2050 target creeping back in. */
    const strings = [];
    const walk = (n) => {
      if (typeof n === 'string') { strings.push(n); return; }
      if (n && typeof n === 'object') Object.values(n).forEach(walk);
    };
    walk(c);
    const mentions = strings.filter(s => /net.?zero/i.test(s));
    expect(mentions).toHaveLength(2);
    /* The only two places it may appear: the field naming what NDC 3.0
       replaced, and the note saying none is asserted. */
    expect(new Set(mentions)).toEqual(new Set([c.ndc.supersedes, c.note]));
    expect(c.ndc.supersedes).toMatch(/net zero 2050/);
    expect(c.note).toMatch(/states no net-zero year/);
  });

  test('the co-benefit line splits reduction from removal too', () => {
    /* A single co-benefit total would add P2's avoided diesel to P4's
       sequestration. The rule holds on the footnote line as well as the
       headline, which is where it is easiest to lose. */
    expect(c.adaptationCoBenefit.reduction_tCO2e).toBe(32000);
    expect(c.adaptationCoBenefit.removal_tCO2e).toBe(58000);
    expect(Object.values(c.adaptationCoBenefit)).not.toContain(90000);
  });
});

describe('Over HTTP', () => {
  test('the emissions endpoint returns the three boundaries and says it is a sample', async () => {
    const res = await auth(api().get('/v1/gcf/emissions')).expect(200);
    expect(res.body.emissions.headline.annual_tCO2e).toBe(65800);
    expect(res.body.emissions.embodiedCarbon.a1a5_tCO2e).toBe(44900);
    expect(res.body.emissions.financedEmissions.available).toBe(false);
    expect(res.body.sample).toBe(true);
    expect(res.body.sampleNote).toMatch(/not DFCC's book/);
  });

  test('one project comes back with its arithmetic checked', async () => {
    const res = await auth(api().get('/v1/gcf/emissions/gcf_p1_jaffna_solar')).expect(200);
    expect(res.body.emissions.check.agrees).toBe(true);
    expect(res.body.emissions.mitigation.countsInHeadline).toBe(true);
  });

  test('an unknown project is a 404, not an empty roll-up', async () => {
    const res = await auth(api().get('/v1/gcf/emissions/nope')).expect(404);
    expect(res.body.error).toBe('PROJECT_NOT_FOUND');
  });

  test('the NDC endpoint reports the share absent until a BAU is given', async () => {
    const a = await auth(api().get('/v1/gcf/ndc')).expect(200);
    expect(a.body.ndc.reduction.share.available).toBe(false);
    const b = await auth(api().get('/v1/gcf/ndc?bau=1200000000')).expect(200);
    expect(b.body.ndc.reduction.share.available).toBe(true);
  });

  test('a BAU that is not a number is refused rather than coerced', async () => {
    const res = await auth(api().get('/v1/gcf/ndc?bau=lots')).expect(400);
    expect(res.body.error).toBe('INVALID_BAU');
  });

  test('the emissions roll-up follows the recorded book once there is one', async () => {
    const only = JSON.parse(JSON.stringify(byId('gcf_p3_colombo_cooling')));
    await auth(api().post('/v1/gcf/pipeline').send(only)).expect(201);
    const res = await auth(api().get('/v1/gcf/emissions')).expect(200);
    expect(res.body.source).toBe('recorded');
    expect(res.body.sample).toBe(false);
    expect(res.body.emissions.headline.annual_tCO2e).toBe(26400);
  });

  test('both endpoints need a key, like everything else that reads the book', async () => {
    await api().get('/v1/gcf/emissions').expect(401);
    await api().get('/v1/gcf/ndc').expect(401);
  });
});
