// @ts-check
/**
 * The life of the loan — what it will carry at each year-end as it is repaid.
 *
 * This is the question a credit committee asks at origination and the one the
 * standard does not answer, because the standard measures one year at a time:
 * each reporting year is that year's balance against that year's denominator
 * and that year's borrower emissions (§5.2, p.56). So the table here is a
 * **projection** and says so on every row — the balance is scheduled, not
 * actual; the denominator and the borrower's emissions are held at the
 * recorded year's figures — and it never enters the position. It answers the
 * shape of the attribution: declining to nought at maturity, as p.56 says it
 * must.
 *
 * Every figure scales the recorded year's financed line by the ratio of the
 * scheduled balance to the recorded balance. That holds for every class,
 * because every Part A numerator enters the financed figure linearly —
 * through an attribution factor, or directly on a per-asset factor — so no
 * borrower figure has to be recovered and no class's arithmetic is restated.
 */

'use strict';

const schedule = require('./schedule');
const { undrawnLine } = require('./undrawn');

const r3 = n => +Number(n).toFixed(3);
const r6 = n => +Number(n).toFixed(6);
const held = x => x && !x.absent && Number.isFinite(x.value);

/**
 * @param {Object} o
 * @param {Object} o.facility
 * @param {string} o.reportingAsOf        the recorded position date
 * @param {number} o.recordedOutstanding  the numerator the reporting year was attributed on
 * @param {number|null} o.denominator
 * @param {number|null} o.attributionFactor
 * @param {{scope1And2: any, scope3: any}} o.financed
 * @param {number|null} o.utilisationFactor
 * @param {string|null} o.currency
 */
function projection(o) {
  const t = schedule.terms(o.facility);
  const ends = schedule.yearEnds(o.facility, o.reportingAsOf);
  const ratioAt = v => (Number(o.recordedOutstanding) > 0 ? v / Number(o.recordedOutstanding) : null);
  const rows = ends.map(asOf => {
    const s = schedule.outstandingAt(o.facility, asOf);
    const ratio = ratioAt(s.value);
    const scale = k => (ratio !== null && held(o.financed[k]) ? r3(Number(o.financed[k].value) * ratio) : null);
    const drawnAt = s.beforeOrigination ? 0 : t.disbursed;
    const u = undrawnLine({ committed: t.committed, disbursed: drawnAt, denominator: o.denominator, attributionFactor: o.attributionFactor,
      financed: o.financed, utilisationFactor: o.utilisationFactor, currency: o.currency });
    return {
      year: Number(asOf.slice(0, 4)),
      asOf,
      scheduledOutstanding: s.value,
      instalmentsPaid: s.instalmentsPaid,
      attributionFactor: ratio !== null && Number(o.attributionFactor) > 0 ? r6(Number(o.attributionFactor) * ratio) : null,
      financedScope1And2: scale('scope1And2'),
      financedScope3: scale('scope3'),
      undrawnAmount: u.undrawnAmount,
      undrawnUnweightedScope1And2: u.unweighted ? u.unweighted.scope1And2 : null,
      isReportingYear: asOf === o.reportingAsOf,
      matured: s.matured,
      projection: true,
    };
  });
  const last = rows[rows.length - 1];
  return {
    projection: true,
    basis: 'Each row scales the recorded year’s financed line by the scheduled balance over the recorded balance. '
      + 'The balance is scheduled, not read from the ledger; the denominator and the borrower’s emissions are held at the recorded year’s figures.',
    assumptions: [
      'Balances follow the recorded repayment profile; a prepayment, an arrear or a restructure moves them.',
      'The denominator is held at the recorded year’s value; a company grows or shrinks and the factor with it.',
      'The borrower’s emissions are held at the recorded year’s figure; each reporting year re-measures them.',
      'The undrawn commitment is held at the recorded drawn amount; later drawdowns move it into the drawn figure.',
      'Nothing here is a disclosed figure: the position is the reporting year’s actual balance and nothing else.',
    ],
    declinesToZero: Boolean(last && last.scheduledOutstanding === 0),
    reference: 'PCAF Part A Third Edition §5.2, p.56 — adjusted annually, the attribution declining to 0 when the loan is fully repaid',
    rows,
  };
}

module.exports = { projection };
