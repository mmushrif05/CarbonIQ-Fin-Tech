// @ts-check
/**
 * What a reporting-year position reads off the facilities behind its rows.
 *
 * Two things, and both are read from the projection's facility summary
 * (migration 0013) rather than from the records: the §6.2 undrawn loan
 * commitments, summed on their own and never into the headline — a
 * condition of a loan, not an asset class (p.170) — and the basis of every
 * numerator, so a position can say how many of its balances were taken from
 * a schedule rather than a ledger before the disclosure is filed.
 *
 * Kept beside `register.js` rather than inside it because the register's
 * writes and its reads are already two jobs there, and this is a third.
 */

'use strict';

const r3 = n => +Number(n).toFixed(3);
const r2 = n => +Number(n).toFixed(2);
const num = v => typeof v === 'number' && Number.isFinite(v);

const REF = 'PCAF Part A Third Edition §6.2, pp.169–173';

/** The §6.2 line for a class's rows, summed apart. Rows are inflated projections. */
function undrawnOf(rows) {
  const withFacility = rows.filter(r => r.facility && r.facility.summary);
  const summaries = withFacility.map(r => r.facility.summary);
  const applicable = summaries.filter(s => s.undrawnApplicable);
  const absent = summaries.filter(s => s.undrawnAbsent);
  const sum = k => (applicable.some(s => num(s[k])) ? r3(applicable.reduce((t, s) => t + (num(s[k]) ? s[k] : 0), 0)) : null);
  const weightedHeld = applicable.filter(s => num(s.weightedScope1And2));
  return {
    exposuresWithFacility: withFacility.length,
    exposures: applicable.length,
    notAttributable: absent.length,
    undrawnAmount: r2(summaries.reduce((t, s) => t + (num(s.undrawnAmount) ? s.undrawnAmount : 0), 0)),
    unweighted: { scope1And2: sum('unweightedScope1And2'), scope3: sum('unweightedScope3'), duty: 'shall' },
    /* A weighted total is stated only where every applicable exposure carries
       one: a sum over some rows read as the book's figure understates it. */
    weighted: weightedHeld.length === applicable.length && applicable.length > 0
      ? { scope1And2: sum('weightedScope1And2'), scope3: sum('weightedScope3'), duty: 'may' }
      : { absent: true, reason: applicable.length === 0 ? 'No undrawn commitment is attributable in this class.'
        : `${applicable.length - weightedHeld.length} of ${applicable.length} exposure(s) carry no utilisation factor, so no weighted total is stated.` },
    separate: true,
    definition: 'Committed on-balance-sheet facilities recorded on the register with a total loan commitment above the drawn amount at the position date; undrawn = total loan commitment − drawn amount (§6.2, p.173).',
    note: 'Reported apart from the financed figure and never aggregated with it (§6.2, p.170). Where the drawn part earned no attribution factor the undrawn commitment is not attributable and is counted as such rather than as nought.',
    reference: REF,
  };
}

/** How many numerators were read from a ledger and how many taken from a schedule. */
function numeratorBasisOf(rows) {
  const scheduled = rows.filter(r => r.facility && r.facility.summary && r.facility.summary.outstandingBasis === 'scheduled');
  return {
    exposures: rows.length,
    ledger: rows.length - scheduled.length,
    scheduled: scheduled.length,
    scheduledExposures: scheduled.map(r => (r.exposure && r.exposure.identifiers && r.exposure.identifiers.id) || null).filter(Boolean),
    note: 'The outstanding amount is the debt owed at the fiscal year-end, read from the loan account (§5.2, p.56). A balance taken from the repayment schedule carries a material finding until the ledger’s replaces it.',
  };
}

/**
 * The §6.2 line across the consolidated classes, summed apart from every
 * headline; and the numerator basis across them. Only classes in the book's
 * currency are summed, on the same rule coverage follows.
 */
function undrawnAcross(classRows) {
  const held = classRows.filter(c => c.undrawnCommitments);
  const u = held.map(c => c.undrawnCommitments);
  const total = (k, sub) => (u.some(x => x[sub] && num(x[sub][k])) ? r3(u.reduce((t, x) => t + (x[sub] && num(x[sub][k]) ? x[sub][k] : 0), 0)) : null);
  const allWeighted = u.length > 0 && u.every(x => x.exposures === 0 || (x.weighted && !x.weighted.absent));
  return {
    classes: held.filter(c => c.undrawnCommitments.exposuresWithFacility > 0).map(c => ({ assetClass: c.assetClass, section: c.section, label: c.label,
      exposures: c.undrawnCommitments.exposures, undrawnAmount: c.undrawnCommitments.undrawnAmount,
      unweightedScope1And2: c.undrawnCommitments.unweighted.scope1And2, unweightedScope3: c.undrawnCommitments.unweighted.scope3 })),
    exposures: u.reduce((t, x) => t + x.exposures, 0),
    notAttributable: u.reduce((t, x) => t + x.notAttributable, 0),
    undrawnAmount: r2(u.reduce((t, x) => t + (num(x.undrawnAmount) ? x.undrawnAmount : 0), 0)),
    unweighted: { scope1And2: total('scope1And2', 'unweighted'), scope3: total('scope3', 'unweighted'), duty: 'shall' },
    weighted: allWeighted && u.some(x => x.exposures > 0)
      ? { scope1And2: total('scope1And2', 'weighted'), scope3: total('scope3', 'weighted'), duty: 'may' }
      : { absent: true, reason: 'Not every attributable exposure carries a utilisation factor; the weighted figure is optional and is stated only whole.' },
    separate: true,
    definition: 'Committed on-balance-sheet facilities recorded on the register with a total loan commitment above the drawn amount at the position date; undrawn = total loan commitment − drawn amount (§6.2, p.173). Facilities recorded without their commitment are not included.',
    note: 'Optional under §6.2 and reported apart from the financed figure; never aggregated with it (p.170).',
    reference: REF,
  };
}

function numeratorBasisAcross(classRows) {
  const held = classRows.filter(c => c.numeratorBasis);
  const scheduled = held.reduce((t, c) => t + c.numeratorBasis.scheduled, 0);
  const exposures = held.reduce((t, c) => t + c.numeratorBasis.exposures, 0);
  return { exposures, ledger: exposures - scheduled, scheduled,
    byClass: held.filter(c => c.numeratorBasis.scheduled > 0).map(c => ({ assetClass: c.assetClass, label: c.label, scheduled: c.numeratorBasis.scheduled })),
    note: 'The outstanding amount is the debt owed at the fiscal year-end, read from the loan account (§5.2, p.56).' };
}

module.exports = { undrawnOf, numeratorBasisOf, undrawnAcross, numeratorBasisAcross };
