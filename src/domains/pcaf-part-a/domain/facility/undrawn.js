// @ts-check
/**
 * §6.2 — financed emissions from the undrawn loan commitment, reported apart.
 *
 * The Third Edition's optional methodology for IFRS S2 (pp.169–173): the
 * undrawn commitment is the total loan commitment minus the drawn amount at
 * the same point in time; it is attributed on the same denominator as the
 * drawn part (EVIC, or total equity plus debt, or the class's own); the
 * unweighted figure on the whole undrawn amount **shall** be reported by an
 * institution that reports undrawn at all, and a weighted figure — a
 * utilisation factor the institution sets and discloses — **may** be reported
 * beside it, never instead (p.172). It is a condition of a loan, not an asset
 * class, and it is never aggregated with the drawn figure (p.170): nothing
 * here returns a sum of the two, and the position that reads this line keeps
 * it on its own.
 *
 * The borrower's own figure is recovered from the class's financed line and
 * its attribution factor — the one the drawn part was attributed on — so the
 * undrawn line rests on exactly the emissions the drawn line rests on. Where
 * the class earned no attribution factor (Option 3b prices the outstanding
 * directly on a per-asset factor, fn 73) there is no company figure to
 * attribute and the line is absent with that reason, never invented.
 */

'use strict';

const REF = 'PCAF Part A Third Edition §6.2, pp.169–173 (optional reporting on undrawn loan commitments, IFRS S2)';

const r3 = n => +Number(n).toFixed(3);
const held = x => x && !x.absent && Number.isFinite(x.value);

/**
 * @param {Object} o
 * @param {number} o.committed
 * @param {number} o.disbursed
 * @param {number|null} o.denominator        the class's denominator value, or null where none
 * @param {number|null} o.attributionFactor  the drawn part's factor, or null (Option 3b/3c)
 * @param {{scope1And2: any, scope3: any}} o.financed   the class's financed lines, as traced values
 * @param {number|null} o.utilisationFactor
 * @param {string|null} o.currency
 */
function undrawnLine(o) {
  const undrawn = +Math.max(0, o.committed - o.disbursed).toFixed(2);
  const base = {
    undrawnAmount: undrawn, currency: o.currency || null,
    equation: 'undrawn loan commitment = total loan commitment − drawn amount, at the position date',
    reference: REF,
    separate: true,
    note: 'Reported apart from the drawn figure and never aggregated with it (§6.2, p.170); a condition of a loan, not an asset class.',
  };
  if (undrawn === 0) {
    return { ...base, applicable: false, reason: 'The facility is fully drawn; there is no undrawn commitment to report.', unweighted: null, weighted: null };
  }
  const af = o.attributionFactor;
  if (!(Number(o.denominator) > 0) || !(Number(af) > 0)) {
    return {
      ...base, applicable: true, absent: true, unweighted: null, weighted: null,
      reason: !(Number(o.denominator) > 0)
        ? 'No denominator is held for this exposure, so the undrawn commitment cannot be attributed (§6.2 builds on the attribution factor, p.171).'
        : 'The drawn part earned no attribution factor — Option 3b prices the outstanding directly on a per-asset factor (fn 73) — so there is no company figure to attribute the undrawn commitment to.',
    };
  }
  const afU = Number(o.denominator) > 0 ? undrawn / Number(o.denominator) : 0;
  const borrower = k => (held(o.financed[k]) ? Number(o.financed[k].value) / Number(af) : null);
  const b12 = borrower('scope1And2'), b3 = borrower('scope3');
  const line = (mult, label) => ({
    scope1And2: b12 === null ? null : r3(afU * b12 * mult),
    scope3: b3 === null ? null : r3(afU * b3 * mult),
    unit: 'tCO2e',
    equation: `${label} = (undrawn commitment ÷ denominator) × borrower emissions${mult === 1 ? '' : ' × utilisation factor'}`,
  });
  const u = o.utilisationFactor;
  return {
    ...base,
    applicable: true,
    attributionFactor: +afU.toFixed(6),
    borrowerEmissions: { scope1And2: b12 === null ? null : r3(b12), scope3: b3 === null ? null : r3(b3),
      basis: 'The class’s financed line divided by the attribution factor the drawn part was attributed on.' },
    unweighted: { ...line(1, 'unweighted'), duty: 'shall', basis: 'The theoretical maximum: the whole undrawn commitment assumed drawn (§6.2, p.172).' },
    weighted: u === null || u === undefined
      ? { absent: true, duty: 'may', reason: 'No utilisation factor is recorded; a weighted figure is optional and is reported only beside the unweighted one (§6.2, p.172).' }
      : { ...line(Number(u), 'weighted'), duty: 'may', utilisationFactor: Number(u),
        basis: 'The institution’s own expectation of drawdown; its method shall be disclosed beside the figure (§6.2, fn 198).' },
  };
}

module.exports = { undrawnLine, REF };
