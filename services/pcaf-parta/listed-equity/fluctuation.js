/**
 * Fluctuation analysis: why the financed-emissions figure moved between two
 * reporting periods (Chapter 6, pp.164–165).
 *
 * For this asset class the figure is outstanding ÷ EVIC × emissions, so a
 * change decomposes into exactly three effects plus entries and exits. PCAF
 * leaves the method to the institution and requires that, where an analysis
 * is disclosed, its calculation basis, assumptions and limitations are
 * disclosed with it. This is a sequential substitution: outstanding first,
 * then company value, then emissions, each holding the others at the earlier
 * state. The order is an assumption and is printed; a different order gives a
 * different split of the same total, which is the limitation of every
 * decomposition of a product and is printed too.
 *
 * Matching is by identifier (LEI, ISIN) rather than name, because names
 * change on merger faster than a data provider updates (p.53).
 */

'use strict';

const REF = 'PCAF Part A Third Edition Chapter 6, Fluctuation analysis (pp.164–165)';

const key = r => (r.exposure.identifiers && (r.exposure.identifiers.lei || r.exposure.identifiers.isin))
  || r.exposure.counterparty.name;

function fe(r) {
  const s = r.inventory.scope1And2;
  return s && Number.isFinite(s.value) ? s.value : 0;
}

function parts(r) {
  return {
    outstanding: r.exposure.outstanding.effective,
    value: r.denominator ? r.denominator.value : null,
    emissions: r.attribution && r.attribution.value > 0 ? fe(r) / r.attribution.value : null,
  };
}

/**
 * @param {Object[]} previous  results for period t0
 * @param {Object[]} current   results for period t1
 */
function fluctuation(previous, current) {
  const prev = new Map(previous.map(r => [key(r), r]));
  const curr = new Map(current.map(r => [key(r), r]));

  const rows = [];
  let dOut = 0, dVal = 0, dEm = 0, entered = 0, left = 0, unattributable = 0;

  for (const [k, c] of curr) {
    const p = prev.get(k);
    if (!p) { entered += fe(c); rows.push({ id: k, kind: 'entered', change: fe(c) }); continue; }
    const a = parts(p), b = parts(c);
    if (a.value === null || b.value === null || a.emissions === null || b.emissions === null) {
      /* A 3b/3c exposure has no factor to decompose. */
      const ch = fe(c) - fe(p);
      unattributable += ch;
      rows.push({ id: k, kind: 'no-factor', change: +ch.toFixed(2) });
      continue;
    }
    const f0 = (a.outstanding / a.value) * a.emissions;
    const f1 = (b.outstanding / a.value) * a.emissions;   // outstanding moved
    const f2 = (b.outstanding / b.value) * a.emissions;   // then company value
    const f3 = (b.outstanding / b.value) * b.emissions;   // then emissions
    const eo = f1 - f0, ev = f2 - f1, ee = f3 - f2;
    dOut += eo; dVal += ev; dEm += ee;
    rows.push({ id: k, kind: 'held', outstandingEffect: +eo.toFixed(2), valueEffect: +ev.toFixed(2), emissionsEffect: +ee.toFixed(2), change: +(f3 - f0).toFixed(2) });
  }
  for (const [k, p] of prev) {
    if (!curr.has(k)) { left -= fe(p); rows.push({ id: k, kind: 'left', change: -fe(p) }); }
  }

  const t0 = previous.reduce((s, r) => s + fe(r), 0);
  const t1 = current.reduce((s, r) => s + fe(r), 0);

  return {
    previousTotal: +t0.toFixed(2),
    currentTotal: +t1.toFixed(2),
    change: +(t1 - t0).toFixed(2),
    effects: {
      outstandingAmount: +dOut.toFixed(2),
      companyValue: +dVal.toFixed(2),
      emissions: +dEm.toFixed(2),
      entered: +entered.toFixed(2),
      left: +left.toFixed(2),
      withoutFactor: +unattributable.toFixed(2),
    },
    rows,
    basis: 'Sequential substitution on financed scope 1 and 2: outstanding amount first, then company value (EVIC or equity plus debt), then investee emissions; entries and exits shown apart. Exposures estimated without an attribution factor (Options 3b, 3c) are shown as a single change.',
    limitations: 'The split between the three effects depends on the order of substitution; a different order allocates the same total differently. The company-value effect includes market-price movement unrelated to any change in activity (§5.1, p.50).',
    requirement: 'Where a fluctuation analysis is disclosed, the calculation basis including assumptions and limitations shall be disclosed (p.164).',
    reference: REF,
  };
}

module.exports = { fluctuation };
