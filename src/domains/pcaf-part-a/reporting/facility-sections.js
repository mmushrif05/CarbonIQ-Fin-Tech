// @ts-check
/**
 * The facility on the page: the numerator's basis, the §6.2 undrawn line
 * apart, and the life of the loan marked as the projection it is.
 *
 * Three sections from one set of facts. On the per-exposure report the
 * facility as recorded, the scheduled balance beside the recorded one, the
 * undrawn commitment with its duty, and the projection table with the
 * assumptions printed under it, because a table of future balances without
 * them reads as a forecast. On the §5.2 disclosure and in the consolidated
 * file's financed annex the §6.2 line for the book: the definition the
 * standard asks to be disclosed (p.171), the unweighted figure that shall be
 * reported, the weighted one only where every exposure carries a factor, and
 * the sentence that it is never aggregated with the financed figure (p.170).
 * Every block reads facts and computes nothing.
 */

'use strict';

const { b, keep } = require('../../../platform/reporting/report-standard/blocks');
const { fixed, moneyAnnotated } = require('../../../shared/money');

const N = n => (n === null || n === undefined) ? '—'
  : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const T = n => (n === null || n === undefined ? '—' : fixed(n, 3));
const AF = n => (n === null || n === undefined ? '—' : Number(n).toFixed(4));

const PROFILE = { bullet: 'Bullet — repaid at maturity', 'equal-principal': 'Equal principal instalments', annuity: 'Annuity — level payments', schedule: 'Custom schedule' };

/** The per-exposure report: the facility, the numerator's basis, the §6.2 line, the projection. */
function facilitySection(f) {
  const x = f.facility;
  const ccy = f.currency;
  if (!x) {
    return {
      id: 'facility', title: 'Facility, undrawn commitment and the life of the loan',
      blocks: keep([
        b.body('No facility is recorded for this exposure. The outstanding amount was keyed as the balance owed at '
          + 'the fiscal year-end (§5.2, p.56), and no undrawn commitment is reported under §6.2 — an optional '
          + 'methodology that needs the total loan commitment beside the drawn amount (p.173).'),
      ]),
    };
  }
  const t = x.terms, s = x.scheduled, rec = x.recorded, u = x.undrawn, p = x.projection;
  const rep = t.repayment || {};
  return {
    id: 'facility', title: 'Facility, undrawn commitment and the life of the loan',
    blocks: keep([
      b.body('The outstanding amount is the debt the borrower owes at the fiscal year-end — disbursed debt minus '
        + 'any repayments, adjusted annually so the attribution declines to nought when the loan is repaid '
        + '(§5.2, p.56; the position taken at one fixed point in time, p.33). The sanctioned amount is the '
        + 'numerator only where it is fully drawn and nothing has been repaid. The facility below is what the '
        + 'year-end balance follows from.'),
      b.table({
        head: ['Facility', ''], widths: [2.6, 3.4], align: ['left', 'left'],
        rows: [
          ['Total loan commitment (sanctioned)', moneyAnnotated(t.committed, ccy)],
          ['Drawn to date', moneyAnnotated(t.disbursed, ccy)],
          ['Undrawn commitment', moneyAnnotated(t.undrawnAmount, ccy)],
          ['Originated · matures', `${t.originationDate} · ${t.maturityDate} (${t.tenorMonths} months)`],
          ['Repayment', `${PROFILE[rep.profile] || rep.profile}${rep.frequency ? `, ${rep.frequency}` : ''}${rep.instalments ? `, ${rep.instalments} instalment(s)` : ''}${rep.annualRatePct !== null && rep.annualRatePct !== undefined ? `, ${rep.annualRatePct}% p.a.` : ''}`],
        ],
      }),
      b.h2('The numerator, and where it was read from'),
      b.table({
        head: ['Balance at the position date', ccy, 'Basis'], widths: [2.4, 1.6, 2], align: ['left', 'right', 'left'],
        rows: [
          ['Recorded outstanding — the numerator', N(rec.outstanding), rec.basis === 'scheduled' ? 'Taken from the repayment schedule' : 'Read from the loan account'],
          ['Scheduled balance at the same date', N(s.value), `${s.instalmentsPaid !== null && s.instalmentsPaid !== undefined ? `${s.instalmentsPaid} instalment(s) repaid; ` : ''}${s.basis}`],
        ],
      }),
      b.body(rec.note + (rec.varianceFromSchedulePct ? ` The recorded balance differs from the scheduled one by ${rec.varianceFromSchedulePct}%.` : '')),
      b.h2('Undrawn loan commitment (§6.2, optional)'),
      ...undrawnLineBlocks(u, ccy),
      b.h2('The life of the loan — a projection'),
      b.body(p.basis),
      b.table({
        head: ['Year-end', `Scheduled balance, ${ccy}`, 'Attribution factor', 'Financed scope 1 and 2, tCO2e', `Undrawn, ${ccy}`],
        widths: [1, 1.6, 1.2, 1.6, 1.2], align: ['left', 'right', 'right', 'right', 'right'], zebra: true,
        rows: p.rows.map(r => [`${r.asOf}${r.isReportingYear ? ' (reporting year)' : ''}`, N(r.scheduledOutstanding), AF(r.attributionFactor), T(r.financedScope1And2), N(r.undrawnAmount)]),
      }),
      b.caption('Projection — every row. ' + (p.declinesToZero ? 'The attribution declines to nought at maturity, as the standard requires of the numerator. ' : '')
        + 'Nothing in this table is a disclosed figure.'),
      b.bullets(p.assumptions || []),
    ]),
  };
}

/** The §6.2 line for one exposure, with its duty and its reason where absent. */
function undrawnLineBlocks(u, ccy) {
  if (!u || !u.applicable) {
    return [b.body('The facility is fully drawn: there is no undrawn commitment to report.')];
  }
  if (u.absent) {
    return [b.body(`Undrawn commitment ${moneyAnnotated(u.undrawnAmount, ccy)}. ${u.reason} Reported absent rather than estimated.`)];
  }
  return [
    b.table({
      head: ['§6.2 line', 'Duty', 'Scope 1 and 2, tCO2e', 'Scope 3, tCO2e', 'Basis'],
      widths: [1.4, 0.6, 1.3, 1.1, 2.4], align: ['left', 'left', 'right', 'right', 'left'],
      rows: [
        ['Unweighted — the whole undrawn commitment', 'shall', T(u.unweighted.scope1And2), T(u.unweighted.scope3), u.unweighted.basis],
        u.weighted && !u.weighted.absent
          ? [`Weighted — utilisation factor ${u.weighted.utilisationFactor}`, 'may', T(u.weighted.scope1And2), T(u.weighted.scope3), u.weighted.basis]
          : ['Weighted', 'may', '—', '—', (u.weighted && u.weighted.reason) || 'No utilisation factor recorded.'],
      ],
    }),
    b.body(`Undrawn commitment ${moneyAnnotated(u.undrawnAmount, ccy)}, attribution factor ${AF(u.attributionFactor)} on the same denominator as the drawn part. ${u.note}`),
  ];
}

/** The §5.2 disclosure and the consolidated annex: the §6.2 line for the book. */
function undrawnBlocks(f) {
  const u = f.undrawnCommitments;
  const nb = f.numeratorBasis;
  const ccy = f.currency;
  if (!u || !(u.exposuresWithFacility > 0 || (u.classes && u.classes.length))) {
    return keep([
      b.body('No facility commitment is recorded on the register, so no undrawn loan commitment is reported. '
        + 'Reporting on undrawn commitments is optional under §6.2 (pp.169–173) and needs the total loan '
        + 'commitment recorded beside the drawn amount.'),
      nb ? b.body(`${nb.ledger} of ${nb.exposures} outstanding amount(s) read from the loan account; ${nb.scheduled} taken from a repayment schedule.`) : null,
    ]);
  }
  return keep([
    b.body(`Definition applied: ${u.definition}`),
    b.table({
      head: ['§6.2 line', 'Duty', 'Exposures', `Undrawn, ${ccy}`, 'Scope 1 and 2, tCO2e', 'Scope 3, tCO2e'],
      widths: [1.5, 0.6, 0.9, 1.4, 1.4, 1.2], align: ['left', 'left', 'right', 'right', 'right', 'right'],
      rows: [
        ['Unweighted — the whole undrawn commitment', 'shall', String(u.exposures), N(u.undrawnAmount), T(u.unweighted.scope1And2), T(u.unweighted.scope3)],
        u.weighted && !u.weighted.absent
          ? ['Weighted — by each exposure’s utilisation factor', 'may', String(u.exposures), N(u.undrawnAmount), T(u.weighted.scope1And2), T(u.weighted.scope3)]
          : ['Weighted', 'may', '—', '—', '—', '—'],
      ],
    }),
    u.weighted && u.weighted.absent ? b.caption(u.weighted.reason) : null,
    u.classes && u.classes.length ? b.table({
      head: ['Asset class', 'Section', 'Exposures', `Undrawn, ${ccy}`, 'Unweighted scope 1 and 2, tCO2e'],
      widths: [2, 0.7, 0.9, 1.4, 1.6], align: ['left', 'left', 'right', 'right', 'right'], zebra: true,
      rows: u.classes.map(c => [c.label, c.section, String(c.exposures), N(c.undrawnAmount), T(c.unweightedScope1And2)]),
    }) : null,
    b.body(`${u.note}${u.notAttributable ? ` ${u.notAttributable} exposure(s) carry an undrawn commitment that is not attributable and are counted as such rather than as nought.` : ''}`),
    nb ? b.body(`Numerator basis: ${nb.ledger} of ${nb.exposures} outstanding amount(s) read from the loan account; ${nb.scheduled} taken from a repayment schedule${nb.scheduled ? ' and carrying the finding that the ledger’s balance must replace it' : ''}. ${nb.note}`) : null,
  ]);
}

/** The §5.2 disclosure's section. */
function undrawnSection(f) {
  return { id: 'undrawn', title: 'Undrawn loan commitments (§6.2, optional)', blocks: undrawnBlocks(f) };
}

module.exports = { facilitySection, undrawnSection, undrawnBlocks };
