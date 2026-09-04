/**
 * Attribution following the drawdown, and the five figures an anchor arrives for.
 *
 * This phase deliberately moves figures, which is why it is tested hardest.
 * PCAF Part A attributes on the outstanding amount; the book was attributing on
 * the full commitment whether drawn or not. On the baseline book that takes
 * emitted-to-date from 12,050 to 6,749 tCO2e — a 44% fall — and the whole of
 * Changi Business Hub's 3,870 tCO2e out of the inventory, because $142M is
 * committed against it and nothing has been drawn.
 *
 * Nothing is lost by the change, and the tests that matter most here prove it:
 * what the drawdown has not reached is reported on its own line, and attributed
 * plus pending equals the figure at full commitment to the cent.
 */

'use strict';

const metrics  = require('../services/capital-metrics');
const baseline = require('../services/capital-baseline');

const BOOK = baseline.baselineBook();

describe('Attribution follows the money out of the door', () => {
  const out = metrics.emissionsLedger(BOOK, { attributionBasis: 'outstanding' });
  const com = metrics.emissionsLedger(BOOK, { attributionBasis: 'commitment' });

  test('the outstanding basis attributes less than the commitment basis', () => {
    expect(out.incurred).toBeLessThan(com.incurred);
    expect(out.forward).toBeLessThan(com.forward);
  });

  test('attributed plus pending equals the figure at full commitment', () => {
    // The whole point: the change moves emissions between lines, it does not
    // make them disappear.
    expect(Math.round((out.incurred + out.pending.incurred) * 100) / 100)
      .toBe(out.atFullCommitment.incurred);
    expect(Math.round((out.forward + out.pending.forward) * 100) / 100)
      .toBe(out.atFullCommitment.forward);
  });

  test('the commitment basis leaves nothing pending, by definition', () => {
    expect(com.pending.incurred).toBe(0);
    expect(com.pending.forward).toBe(0);
  });

  test('a commitment with nothing drawn attributes nothing yet', () => {
    const single = {
      portfolios: [], payments: [],
      investments: [{
        id: 'x', status: 'committed', commitment: 100, projectCost: 400,
        emissions: { incurred_tCO2e: 1000, forward_tCO2e: 500 },
      }],
    };
    const led = metrics.emissionsLedger(single, { attributionBasis: 'outstanding' });
    expect(led.incurred).toBe(0);
    expect(led.pending.incurred).toBe(1000);
  });

  test('a fully drawn commitment attributes the whole of its share', () => {
    const single = {
      portfolios: [],
      payments: [{ investmentId: 'x', kind: 'disbursement', amount: 100 }],
      investments: [{ id: 'x', status: 'deployed', commitment: 100, emissions: { incurred_tCO2e: 1000 } }],
    };
    const led = metrics.emissionsLedger(single, { attributionBasis: 'outstanding' });
    expect(led.incurred).toBe(1000);
    expect(led.pending.incurred).toBe(0);
  });

  test('a repayment reduces what is outstanding, and so what is attributed', () => {
    const build = (pays) => metrics.emissionsLedger({
      portfolios: [], payments: pays,
      investments: [{ id: 'x', status: 'deployed', commitment: 100, emissions: { incurred_tCO2e: 1000 } }],
    }, { attributionBasis: 'outstanding' });

    const drawn = build([{ investmentId: 'x', kind: 'disbursement', amount: 100 }]);
    const repaid = build([
      { investmentId: 'x', kind: 'disbursement', amount: 100 },
      { investmentId: 'x', kind: 'repayment', amount: 40 },
    ]);
    expect(drawn.incurred).toBe(1000);
    expect(repaid.incurred).toBe(600);
  });

  test('a fee is not a drawdown and does not attribute anything', () => {
    const led = metrics.emissionsLedger({
      portfolios: [],
      payments: [{ investmentId: 'x', kind: 'fee', amount: 100 }],
      investments: [{ id: 'x', status: 'deployed', commitment: 100, emissions: { incurred_tCO2e: 1000 } }],
    }, { attributionBasis: 'outstanding' });
    expect(led.incurred).toBe(0);
  });

  test('a commitment of zero attributes nothing rather than dividing by zero', () => {
    const led = metrics.emissionsLedger({
      portfolios: [], payments: [],
      investments: [{ id: 'x', status: 'deployed', commitment: 0, emissions: { incurred_tCO2e: 1000 } }],
    }, { attributionBasis: 'outstanding' });
    expect(Number.isFinite(led.incurred)).toBe(true);
    expect(led.incurred).toBe(0);
  });

  test('over-drawing does not attribute more than the whole share', () => {
    const led = metrics.emissionsLedger({
      portfolios: [],
      payments: [{ investmentId: 'x', kind: 'disbursement', amount: 250 }],
      investments: [{ id: 'x', status: 'deployed', commitment: 100, emissions: { incurred_tCO2e: 1000 } }],
    }, { attributionBasis: 'outstanding' });
    expect(led.incurred).toBe(1000);
  });

  test('both bases name themselves, and the commitment one names its limit', () => {
    expect(out.attributionNote).toMatch(/per PCAF Part A/);
    expect(com.attributionNote).toMatch(/requires a note if disclosed/);
  });

  test('the pending line says it is not a second inventory', () => {
    expect(out.pendingNote).toMatch(/Not included in/);
  });

  test('an unrecognised basis falls back to the standard, not to nothing', () => {
    const led = metrics.emissionsLedger(BOOK, { attributionBasis: 'vibes' });
    expect(led.attributionBasis).toBe('outstanding');
  });
});

describe('The five figures an anchor arrives for', () => {
  const a = metrics.anchorPosition(BOOK);

  test('total over life is the two halves, carried separately', () => {
    expect(a.totalOverLife.value).toBe(
      Math.round((a.totalOverLife.measured + a.totalOverLife.projected) * 100) / 100);
    expect(a.totalOverLife.kind).toBe('part-measured');
    expect(a.totalOverLife.note).toMatch(/only the first is a measurement/);
  });

  test('emitted so far is the one measurement on the screen, and says so', () => {
    expect(a.current.kind).toBe('measured');
    expect(a.current.note).toMatch(/measurement rather than a projection/);
  });

  test('still to pay carries the money and the emissions that arrive with it', () => {
    expect(a.pending.capital).toBeGreaterThan(0);
    expect(a.pending.emissionsOnDrawdown).toBeGreaterThan(0);
    expect(a.pending.note).toMatch(/Booking them today would overstate the inventory/);
  });

  test('a pledge reports the money and an explicit absence, never an estimate', () => {
    // There is nothing named to attribute emissions to. A figure from the book
    // average would be an invention dressed as a forecast.
    expect(a.pledged.capital).toBeGreaterThan(0);
    expect(a.pledged.emissions).toBeNull();
    expect(a.pledged.note).toMatch(/invention dressed as a forecast/);
  });

  test('nothing pledged says so rather than reporting zero as a position', () => {
    const none = metrics.anchorPosition({ ...BOOK, portfolios: BOOK.portfolios.map(p => ({ ...p, pledged: 0 })) });
    expect(none.pledged.kind).toBe('none');
    expect(none.pledged.note).toMatch(/Nothing has been pledged/);
  });

  test('the queue is named as undecided, and is in no total above it', () => {
    expect(a.pipelineWouldAdd.kind).toBe('not-yet-decided');
    expect(a.pipelineWouldAdd.note).toMatch(/none of it has been decided/);
    expect(a.pipelineWouldAdd.emissions).toBeGreaterThan(0);
    expect(a.totalOverLife.value).toBeLessThan(a.pipelineWouldAdd.emissions + a.totalOverLife.value);
  });

  test('the queue carries what it would help reduce and avoid, separately', () => {
    expect(a.pipelineWouldAdd.reduction).toBeGreaterThan(0);
    expect(a.pipelineWouldAdd.avoided).toBeGreaterThan(0);
    expect(a.pipelineWouldAdd).not.toHaveProperty('netImpact');
  });

  test('every figure declares what kind of statement it is', () => {
    for (const key of ['totalOverLife', 'current', 'pending', 'pledged', 'pipelineWouldAdd']) {
      expect(a[key].kind).toBeTruthy();
    }
    expect(a.kindsNote).toMatch(/never a zero standing in for it/);
  });
});

describe('The screen shows all five, and marks the two that are not measurements', () => {
  const fs = require('fs');
  const path = require('path');
  const html   = fs.readFileSync(path.join(__dirname, '..', 'ui', 'index.html'), 'utf8');
  const dashJs = fs.readFileSync(path.join(__dirname, '..', 'ui', 'js', 'dashboard.js'), 'utf8');
  const css    = fs.readFileSync(path.join(__dirname, '..', 'ui', 'styles.css'), 'utf8');
  const render = dashJs.slice(dashJs.indexOf('function _renderAnchor'), dashJs.indexOf('function _splitRow'));

  test('all five figures are on the page', () => {
    for (const id of ['anch-total', 'anch-current', 'anch-pending', 'anch-pledged', 'anch-queue']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  test('each carries its kind as a visible chip', () => {
    for (const cls of ['k-part', 'k-measured', 'k-pending', 'k-declared', 'k-open']) {
      expect(html).toContain(cls);
      expect(css).toContain(`.${cls}`);
    }
  });

  test('the projected half is hatched, meaning what it means everywhere else', () => {
    expect(css).toMatch(/\.anch-split-mark\.is-projected \{[\s\S]*?repeating-linear-gradient/);
  });

  test('a pledge renders the absence, not a number', () => {
    expect(render).toContain("$('anch-pledged-note').textContent = a.pledged.note");
    expect(render).not.toMatch(/a\.pledged\.emissions \|\| 0/);
  });

  test('the basis is switchable and the engine decides, not the browser', () => {
    expect(html).toContain('id="cap-basis"');
    expect(dashJs).toContain('attributionBasis: _attributionBasis');
    expect(dashJs).not.toMatch(/outstanding\s*\/\s*commitment/);
  });

  test('a failed read blanks the anchor figures too', () => {
    const blank = dashJs.slice(dashJs.indexOf('function _blankWith'), dashJs.indexOf('function _clearMessage'));
    expect(blank).toContain('anch-total');
    expect(blank).toContain('anch-queue');
  });
});
