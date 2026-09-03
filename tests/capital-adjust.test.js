/**
 * Adjusting the book without recording it.
 *
 * The dashboard could already be asked different *questions*. It could not be
 * asked a different *book* — and on a serverless runtime with no Firebase there
 * was nowhere for a changed figure to go, because the store refuses the write
 * with a 503. An adjustment is therefore a third thing, neither a question nor
 * a record: values held by one reader, applied over the book on the way into
 * the engine, never written down.
 *
 * What is pinned here is what keeps that honest:
 *
 *   The engine still does every calculation. The overlay changes inputs and
 *   nothing else, and the unadjusted result is byte-identical to the ordinary
 *   dashboard — if it were not, the adjust path would be a second
 *   implementation of the screen.
 *
 *   An adjusted figure is never presented as a recorded one. The response is
 *   marked, the count travels with it, and an unadjusted screen carries no
 *   mark at all — a badge that is always on is a badge nobody reads.
 *
 *   An overlay can only change what exists. It cannot invent a portfolio or an
 *   investment, and an id matching nothing comes back named.
 *
 *   Nothing is stored. Computing twice changes neither the book nor the
 *   recorded dashboard.
 */

'use strict';

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../server');
const store = require('../services/partc-store');
const { applyOverlay, ADJUSTED_NOTE } = require('../services/capital-adjust');
const { baselineBook } = require('../services/capital-baseline');
const { capitalPosition } = require('../services/capital-metrics');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const KEY = process.env.UI_API_KEY;
const api = () => request(app);
const auth = (r) => r.set('x-api-key', KEY);

beforeEach(() => store._resetMemory());

const book = () => baselineBook();
const firstPipeline = (b) => b.investments.find(i => i.status === 'pipeline');

describe('An overlay changes inputs and nothing else', () => {
  test('an empty overlay returns the book unchanged', () => {
    const b = book();
    const r = applyOverlay(b, {});
    expect(r.changed).toBe(0);
    expect(r.book.portfolios).toEqual(b.portfolios);
    expect(r.book.investments.map(i => i.id)).toEqual(b.investments.map(i => i.id));
    expect(r.book.payments).toHaveLength(b.payments.length);
  });

  test('the source book is never mutated', () => {
    const b = book();
    const before = JSON.stringify(b);
    applyOverlay(b, {
      portfolios: { [b.portfolios[0].id]: { allocatedBudget: 1 } },
      investments: { [b.investments[0].id]: { commitment: 2, emissions: { avoided_tCO2e: 3 } } },
      payments: [{ investmentId: b.investments[0].id, amount: 4 }],
    });
    expect(JSON.stringify(b)).toBe(before);
  });

  test('a portfolio allocation moves, and the count is the number of values changed', () => {
    const b = book();
    const r = applyOverlay(b, { portfolios: { [b.portfolios[0].id]: { allocatedBudget: 900e6 } } });
    expect(r.changed).toBe(1);
    expect(r.book.portfolios[0].allocatedBudget).toBe(900e6);
  });

  test('the four emission lines are adjustable', () => {
    const b = book();
    const id = b.investments[0].id;
    const r = applyOverlay(b, {
      investments: { [id]: { emissions: { forward_tCO2e: 11, avoided_tCO2e: 22 } } },
    });
    expect(r.changed).toBe(2);
    const inv = r.book.investments.find(i => i.id === id);
    expect(inv.emissions.forward_tCO2e).toBe(11);
    expect(inv.emissions.avoided_tCO2e).toBe(22);
  });

  test('a field the overlay does not name is left alone', () => {
    const b = book();
    const id = b.investments[0].id;
    const r = applyOverlay(b, { investments: { [id]: { commitment: 1 } } });
    const inv = r.book.investments.find(i => i.id === id);
    expect(inv.name).toBe(b.investments[0].name);
    expect(inv.emissions).toEqual(b.investments[0].emissions);
  });

  test('a field outside the allowed set is ignored rather than written', () => {
    const b = book();
    const id = b.investments[0].id;
    const r = applyOverlay(b, { investments: { [id]: { id: 'hijacked', portfolioId: 'elsewhere' } } });
    expect(r.changed).toBe(0);
    expect(r.book.investments.find(i => i.id === id).portfolioId)
      .toBe(b.investments[0].portfolioId);
  });
});

describe('Absence is checked before the number is', () => {
  test('an emptied field leaves the book’s own value rather than becoming zero', () => {
    /* `Number('')` is 0 and 0 is a perfectly plausible allocation, so the two
       must never be conflated. This is the fourth place in this book where
       that distinction has mattered. */
    const b = book();
    const id = b.portfolios[0].id;
    for (const blank of ['', null, undefined, 'abc']) {
      const r = applyOverlay(b, { portfolios: { [id]: { allocatedBudget: blank } } });
      expect(r.book.portfolios[0].allocatedBudget).toBe(b.portfolios[0].allocatedBudget);
    }
  });

  test('an explicit zero is honoured, because zero is a real answer', () => {
    const b = book();
    const r = applyOverlay(b, { portfolios: { [b.portfolios[0].id]: { allocatedBudget: 0 } } });
    expect(r.book.portfolios[0].allocatedBudget).toBe(0);
  });
});

describe('An overlay can only change what already exists', () => {
  test('an unknown portfolio id is reported rather than created', () => {
    const b = book();
    const before = b.portfolios.length;
    const r = applyOverlay(b, { portfolios: { pf_invented: { allocatedBudget: 1e9 } } });
    expect(r.book.portfolios).toHaveLength(before);
    expect(r.unknownIds).toContain('pf_invented');
  });

  test('an unknown investment id is reported rather than created', () => {
    const b = book();
    const r = applyOverlay(b, { investments: { inv_invented: { commitment: 1 } } });
    expect(r.book.investments).toHaveLength(b.investments.length);
    expect(r.unknownIds).toContain('inv_invented');
  });

  test('a payment against nothing is dropped and named', () => {
    const b = book();
    const r = applyOverlay(b, { payments: [{ investmentId: 'inv_invented', amount: 1e6 }] });
    expect(r.book.payments).toHaveLength(b.payments.length);
    expect(r.unknownIds).toContain('inv_invented');
  });
});

describe('A payment is added as an event, not edited', () => {
  test('it lands against its investment and moves the paid position', () => {
    const b = book();
    const id = b.investments[0].id;
    const before = capitalPosition(b).paid;
    const r = applyOverlay(b, [] && {} || {});
    expect(r.book.payments).toHaveLength(b.payments.length);

    const added = applyOverlay(b, {
      payments: [{ investmentId: id, amount: 10e6, kind: 'disbursement' }],
    });
    expect(added.addedPayments).toBe(1);
    expect(capitalPosition(added.book).paid).toBe(before + 10e6);
  });

  test('added payments are marked, so they can be told from recorded ones', () => {
    const b = book();
    const r = applyOverlay(b, { payments: [{ investmentId: b.investments[0].id, amount: 1e6 }] });
    const extra = r.book.payments.filter(p => p.adjusted);
    expect(extra).toHaveLength(1);
    expect(extra[0].portfolioId).toBe(b.investments[0].portfolioId);
  });

  test('an unrecognised kind falls back to a disbursement rather than being dropped', () => {
    const b = book();
    const r = applyOverlay(b, {
      payments: [{ investmentId: b.investments[0].id, amount: 1e6, kind: 'nonsense' }],
    });
    expect(r.book.payments.find(p => p.adjusted).kind).toBe('disbursement');
  });
});

describe('Moving a project into the book changes the whole screen', () => {
  test('committing a pipeline project shortens the pipeline and lengthens the position', () => {
    const b = book();
    const target = firstPipeline(b);
    const r = applyOverlay(b, { investments: { [target.id]: { status: 'committed' } } });
    const before = capitalPosition(b);
    const after = capitalPosition(r.book);
    expect(after.committed).toBe(before.committed + target.commitment);
    expect(r.book.investments.filter(i => i.status === 'pipeline'))
      .toHaveLength(b.investments.filter(i => i.status === 'pipeline').length - 1);
  });
});

describe('POST /v1/capital/compute', () => {
  test('an unadjusted compute is the ordinary dashboard, figure for figure', async () => {
    const g = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    const p = (await auth(api().post('/v1/capital/compute')).send({ overlay: {} }).expect(200))
      .body.dashboard;
    expect(p.capital).toEqual(g.capital);
    expect(p.anchor).toEqual(g.anchor);
    expect(p.emissions).toEqual(g.emissions);
    expect(p.pipeline).toEqual(g.pipeline);
  });

  test('an unadjusted screen carries no mark — a badge always on is a badge nobody reads', async () => {
    const p = (await auth(api().post('/v1/capital/compute')).send({ overlay: {} }).expect(200))
      .body.dashboard;
    expect(p.adjusted).toBe(false);
    expect(p.adjustedCount).toBe(0);
    expect(p.adjustedNote).toBeNull();
  });

  test('an adjusted screen is marked, counted, and says what the mark means', async () => {
    const b = (await auth(api().get('/v1/capital/book')).expect(200)).body.book;
    const p = (await auth(api().post('/v1/capital/compute')).send({
      overlay: { portfolios: { [b.portfolios[0].id]: { allocatedBudget: 900e6 } } },
    }).expect(200)).body.dashboard;
    expect(p.adjusted).toBe(true);
    expect(p.adjustedCount).toBe(1);
    expect(p.adjustedNote).toBe(ADJUSTED_NOTE);
    expect(p.adjustedNote).toMatch(/held in\s+this browser only/);
    expect(p.adjustedNote).toMatch(/computed by the engine/);
  });

  test('the adjusted figures actually move', async () => {
    const b = (await auth(api().get('/v1/capital/book')).expect(200)).body.book;
    const before = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    const p = (await auth(api().post('/v1/capital/compute')).send({
      overlay: { portfolios: { [b.portfolios[0].id]: { allocatedBudget: 900e6 } } },
    }).expect(200)).body.dashboard;
    expect(p.capital.allocated)
      .toBe(before.capital.allocated - b.portfolios[0].allocatedBudget + 900e6);
  });

  test('it answers the basket against the same adjusted book', async () => {
    const b = (await auth(api().get('/v1/capital/book')).expect(200)).body.book;
    const target = b.investments.find(i => i.status === 'pipeline');
    const res = await auth(api().post('/v1/capital/compute')).send({
      overlay: { investments: { [target.id]: { commitment: 99e6 } } },
      select: [target.id],
    }).expect(200);
    expect(res.body.basket.funding.needed).toBe(99e6);
  });

  test('nothing is stored — computing twice leaves the recorded dashboard untouched', async () => {
    const b = (await auth(api().get('/v1/capital/book')).expect(200)).body.book;
    const overlay = { portfolios: { [b.portfolios[0].id]: { allocatedBudget: 1 } } };
    const before = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    await auth(api().post('/v1/capital/compute')).send({ overlay }).expect(200);
    await auth(api().post('/v1/capital/compute')).send({ overlay }).expect(200);
    const after = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    expect(after.capital).toEqual(before.capital);
  });

  test('an id matching nothing comes back named', async () => {
    const p = (await auth(api().post('/v1/capital/compute')).send({
      overlay: { investments: { inv_invented: { commitment: 1 } } },
    }).expect(200)).body.dashboard;
    expect(p.unknownIds).toContain('inv_invented');
  });

  test('the questions are validated exactly as the GET validates them', async () => {
    await auth(api().post('/v1/capital/compute'))
      .send({ attributionBasis: 'vibes' }).expect(400);
    await auth(api().post('/v1/capital/compute'))
      .send({ horizonYears: 999 }).expect(400);
    await auth(api().post('/v1/capital/compute'))
      .send({ carbonWeight: 'lots' }).expect(400);
  });

  test('an unbounded overlay is refused rather than run', async () => {
    const investments = {};
    for (let i = 0; i < 501; i += 1) investments[`inv_${i}`] = { commitment: 1 };
    const r = await auth(api().post('/v1/capital/compute')).send({ overlay: { investments } })
      .expect(400);
    expect(r.body.error).toBe('OVERLAY_TOO_LARGE');
  });

  test('it needs a key, like everything else that reads the book', async () => {
    await api().post('/v1/capital/compute').send({ overlay: {} }).expect(401);
  });
});

describe('GET /v1/capital/book', () => {
  test('it returns the same book the dashboard derives from, and says which', async () => {
    const r = (await auth(api().get('/v1/capital/book')).expect(200)).body;
    expect(r.source).toBe('baseline');
    expect(r.sample).toBe(true);
    expect(r.book.portfolios.length).toBeGreaterThan(0);
    expect(r.book.investments.length).toBeGreaterThan(0);
  });

  test('it needs a key', async () => {
    await api().get('/v1/capital/book').expect(401);
  });
});

describe('The drawer holds an adjustment, and never records one', () => {
  const adjJs = read('ui', 'js', 'capital-adjust.js');
  const dashJs = read('ui', 'js', 'dashboard.js');
  const html = read('ui', 'index.html');
  const css = read('ui', 'styles.css');

  test('nothing in the drawer computes a figure', () => {
    expect(adjJs).toMatch(/Nothing here computes/);
    expect(adjJs).not.toMatch(/\.reduce\(\(t, [a-z]\) => t \+ [a-z]\.(amount|commitment)/);
  });

  test('the overlay is held in the browser and cleared rather than defaulted back', () => {
    expect(adjJs).toMatch(/const KEY = 'carboniq_capital_overlay'/);
    expect(adjJs).toMatch(/window\.localStorage\.removeItem\(KEY\)/);
    expect(adjJs).toMatch(/a reset that wrote defaults back/);
  });

  test('storage that throws leaves the book unadjusted rather than the screen broken', () => {
    expect(adjJs).toMatch(/Storage can throw outright in a private window/);
  });

  test('a value returned to the book’s own figure stops being an adjustment', () => {
    expect(adjJs).toMatch(/Back to the book's own value is not an adjustment/);
    expect(adjJs).toMatch(/value = \(n === null \|\| n === base\) \? null : n/);
  });

  test('the drawer is hidden by an attribute the display rule cannot beat', () => {
    /* `[hidden]` is `display: none` from the user-agent sheet, and any class
       rule setting `display` wins. Without this the drawer covered the page
       from load — found by driving it, not by reading it. */
    expect(css).toMatch(/\.adj-backdrop\[hidden\]\s*\{\s*display:\s*none/);
  });

  test('an edited input is marked, and the mark has a rule to draw it', () => {
    expect(adjJs).toMatch(/is-edited/);
    expect(css).toMatch(/\.adj-input\.is-edited/);
  });

  test('the overlay is loaded before the first request, not after it', () => {
    const init = dashJs.slice(dashJs.indexOf('async function init()'), dashJs.indexOf('async function refresh()'));
    expect(init.indexOf('CapitalAdjust.init')).toBeGreaterThan(-1);
    expect(init.indexOf('CapitalAdjust.init')).toBeLessThan(init.indexOf('_fetchCapital()'));
    expect(init).toMatch(/Anything that changes what the\s+first request says has to be loaded before it is sent/);
  });

  test('an adjusted book routes through compute, and takes the basket with it', () => {
    expect(dashJs).toMatch(/\/v1\/capital\/compute/);
    expect(dashJs).toMatch(/if \(typeof CapitalAdjust !== 'undefined' && !CapitalAdjust\.isEmpty\(\)\) return _fetchAdjusted/);
    const fb = dashJs.slice(dashJs.indexOf('async function _fetchBasket'), dashJs.indexOf('function _renderDashboard'));
    expect(fb).toMatch(/would be a reading of a different book from the solid/);
  });

  test('the banner appears only when something has been adjusted', () => {
    const banner = dashJs.slice(dashJs.indexOf('function _renderAdjustedBanner'), dashJs.indexOf('function _wireAssumptions'));
    expect(banner).toMatch(/el\.hidden = !on/);
    /* The reasoning lives in the doc comment above the function. */
    expect(dashJs).toMatch(/train a reader to ignore the one/);
    expect(html).toContain('id="cap-adjusted-banner"');
  });

  test('the reset is reachable from the banner as well as the drawer', () => {
    expect(dashJs).toMatch(/cap-adjusted-reset/);
    expect(html).toContain('id="adj-reset"');
  });
});
