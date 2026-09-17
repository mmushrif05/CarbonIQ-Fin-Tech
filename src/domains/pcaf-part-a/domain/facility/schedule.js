// @ts-check
/**
 * The repayment schedule of a facility, and the balance it carries at a date.
 *
 * The outstanding amount PCAF attributes on is the debt the borrower owes at
 * the fiscal year-end — disbursed debt minus any repayments — adjusted
 * annually so the attribution declines to zero when the loan is repaid
 * (§5.2 p.56; §5.3 pp.68–69; §5.4 fn 124; §5.6 p.91). A relationship manager
 * records a facility once, at origination: what was sanctioned, what has been
 * drawn, when it matures and how it is repaid. From those four facts the
 * balance at any later date follows, and that is what this module computes —
 * a schedule, never a ledger. The ledger's balance is the numerator; the
 * scheduled balance is what the ledger is expected to show, and the checks in
 * `./checks.js` say so wherever the two are told apart.
 *
 * Four repayment profiles cover a lending book: a bullet repaid at maturity;
 * equal principal instalments; an annuity (level payments, which needs a rate);
 * and a custom schedule of dated principal repayments. Nothing is defaulted
 * silently — a profile that needs a frequency or a rate is refused without it.
 */

'use strict';

const REF = 'PCAF Part A Third Edition §5.2, p.56 — disbursed debt minus repayments, adjusted annually to zero at maturity';

const PROFILES = Object.freeze(['bullet', 'equal-principal', 'annuity', 'schedule']);
const FREQUENCIES = Object.freeze({ monthly: 1, quarterly: 3, 'semi-annual': 6, annual: 12 });

function refuse(code, message, remedy) {
  const err = /** @type {import('../../../../shared/types').AppError} */ (new Error(message));
  err.statusCode = 400; err.code = code; if (remedy) err.remedy = remedy;
  return err;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = v => (v === undefined || v === null || v === '') ? undefined : Number(v);

/** A calendar date as a UTC instant, refused if it is not one. */
function parse(s, field) {
  if (typeof s !== 'string' || !DATE.test(s)) {
    throw refuse('FACILITY_DATE_REQUIRED', `${field} must be a calendar date, YYYY-MM-DD; got ${JSON.stringify(s)}.`);
  }
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw refuse('FACILITY_DATE_INVALID', `${field} is not a real date: ${s}.`);
  }
  return d;
}

const iso = d => d.toISOString().slice(0, 10);

/** A month added n times, the day clamped to the month's length (the 31st + one month is the 30th, not the 2nd). */
function addMonths(d, n) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const first = new Date(Date.UTC(y, m + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last)));
}

/**
 * The facility's terms, read once and refused where the schedule could not be
 * computed from them. Every refusal names the clause and the way forward.
 *
 * @param {Object} f
 * @returns {{ committed: number, disbursed: number, origination: Date, maturity: Date, tenorMonths: number,
 *   profile: string, frequency: string|null, monthsPerPeriod: number|null, graceMonths: number,
 *   firstInstalment: Date|null, annualRatePct: number|null, schedule: Array<{date: Date, principal: number}>,
 *   utilisationFactor: number|null, outstandingBasis: 'ledger'|'scheduled', currency: string|null }}
 */
function terms(f) {
  if (!f || typeof f !== 'object') throw refuse('FACILITY_REQUIRED', 'A facility block is required to schedule a balance.');
  const committed = num(f.committed), disbursed = num(f.disbursed);
  if (!(Number(committed) > 0)) {
    throw refuse('FACILITY_COMMITMENT_REQUIRED', 'The facility needs its sanctioned amount — the total loan commitment (§6.2, p.173).');
  }
  if (!(Number(disbursed) >= 0)) {
    throw refuse('FACILITY_DISBURSED_REQUIRED', 'State what has been drawn to date, gross; nought where nothing has.');
  }
  if (Number(disbursed) > Number(committed) + 0.005) {
    throw refuse('DISBURSED_EXCEEDS_COMMITMENT',
      `Drawn to date (${disbursed}) exceeds the commitment (${committed}). A borrower cannot draw more than was sanctioned.`,
      'Correct the drawn amount, or the commitment if the facility was increased.');
  }
  const origination = parse(f.originationDate, 'originationDate');
  const maturity = parse(f.maturityDate, 'maturityDate');
  if (maturity.getTime() <= origination.getTime()) {
    throw refuse('FACILITY_DATES_INVALID', `The facility matures (${iso(maturity)}) on or before it was originated (${iso(origination)}).`);
  }
  const r = f.repayment || {};
  const profile = r.profile;
  if (!PROFILES.includes(profile)) {
    throw refuse('REPAYMENT_PROFILE_REQUIRED', `The repayment profile must be one of ${PROFILES.join(', ')}; got ${JSON.stringify(profile)}.`,
      'A term loan repaid in equal instalments is equal-principal; a level-payment loan is an annuity; a loan repaid at maturity is a bullet.');
  }
  const needsFrequency = profile === 'equal-principal' || profile === 'annuity';
  const frequency = r.frequency || null;
  if (needsFrequency && !(frequency in FREQUENCIES)) {
    throw refuse('REPAYMENT_FREQUENCY_REQUIRED', `A ${profile} profile needs its instalment frequency: ${Object.keys(FREQUENCIES).join(', ')}.`);
  }
  const annualRatePct = num(r.annualRatePct);
  if (profile === 'annuity' && !(Number(annualRatePct) >= 0)) {
    throw refuse('ANNUITY_RATE_REQUIRED', 'An annuity splits each level payment between interest and principal, so the balance at a date depends on the rate; state annualRatePct.');
  }
  const schedule = profile === 'schedule'
    ? (Array.isArray(r.schedule) ? r.schedule : []).map((e, i) => ({ date: parse(e && e.date, `repayment.schedule[${i}].date`), principal: Number(e && e.principal) }))
    : [];
  if (profile === 'schedule') {
    if (!schedule.length) throw refuse('REPAYMENT_SCHEDULE_REQUIRED', 'A custom schedule needs at least one dated principal repayment.');
    if (schedule.some(e => !(e.principal > 0))) throw refuse('REPAYMENT_SCHEDULE_INVALID', 'Every scheduled repayment needs a positive principal.');
    const total = schedule.reduce((s, e) => s + e.principal, 0);
    if (total > Number(disbursed) + 0.005) {
      throw refuse('SCHEDULE_EXCEEDS_DISBURSED', `The schedule repays ${total} against ${disbursed} drawn; repayments cannot exceed the debt disbursed (§5.2, p.56).`);
    }
  }
  const graceMonths = num(r.graceMonths) === undefined ? 0 : Number(r.graceMonths);
  if (!(graceMonths >= 0)) throw refuse('GRACE_INVALID', 'graceMonths must be nought or more.');
  const firstInstalment = r.firstInstalment ? parse(r.firstInstalment, 'repayment.firstInstalment') : null;
  const utilisationFactor = num(f.utilisationFactor);
  if (utilisationFactor !== undefined && !(utilisationFactor >= 0 && utilisationFactor <= 1)) {
    throw refuse('UTILISATION_FACTOR_INVALID', 'The utilisation factor is a share of the undrawn commitment expected to be drawn, between 0 and 1 (§6.2, fn 198).');
  }
  const outstandingBasis = f.outstandingBasis || 'ledger';
  if (outstandingBasis !== 'ledger' && outstandingBasis !== 'scheduled') {
    throw refuse('OUTSTANDING_BASIS_INVALID', 'outstandingBasis is "ledger" (the account balance) or "scheduled" (taken from the repayment schedule).');
  }
  const months = (maturity.getUTCFullYear() - origination.getUTCFullYear()) * 12 + (maturity.getUTCMonth() - origination.getUTCMonth());
  return {
    committed: Number(committed), disbursed: Number(disbursed), origination, maturity,
    tenorMonths: months,
    profile, frequency: needsFrequency ? frequency : null,
    monthsPerPeriod: needsFrequency ? FREQUENCIES[frequency] : null,
    graceMonths, firstInstalment, annualRatePct: profile === 'annuity' ? Number(annualRatePct) : null,
    schedule, utilisationFactor: utilisationFactor === undefined ? null : utilisationFactor,
    outstandingBasis: /** @type {'ledger'|'scheduled'} */ (outstandingBasis),
    currency: f.currency || null,
  };
}

/** The instalment dates of a periodic profile: from the first instalment to maturity, maturity always the last. */
function instalmentDates(t) {
  const step = /** @type {number} */ (t.monthsPerPeriod);
  const first = t.firstInstalment || addMonths(t.origination, t.graceMonths + step);
  const out = [];
  for (let k = 0; ; k++) {
    const d = addMonths(first, k * step);
    if (d.getTime() > t.maturity.getTime()) break;
    out.push(d);
    if (out.length > 1200) throw refuse('SCHEDULE_TOO_LONG', 'More than 1,200 instalments; check the frequency and the maturity.');
  }
  if (!out.length || out[out.length - 1].getTime() !== t.maturity.getTime()) out.push(t.maturity);
  return out;
}

/**
 * The principal repaid by a date under the profile — each instalment on or
 * before the date counted, the ordering within a day resolved as repaid.
 */
function principalRepaidBy(t, at) {
  const L = t.disbursed;
  if (at.getTime() < t.origination.getTime()) return 0;
  if (t.profile === 'bullet') return at.getTime() >= t.maturity.getTime() ? L : 0;
  if (t.profile === 'schedule') {
    return Math.min(L, t.schedule.filter(e => e.date.getTime() <= at.getTime()).reduce((s, e) => s + e.principal, 0));
  }
  const dates = instalmentDates(t);
  const n = dates.length;
  const paid = dates.filter(d => d.getTime() <= at.getTime()).length;
  if (t.profile === 'equal-principal') return Math.min(L, (L / n) * paid);
  /* annuity */
  const r = (Number(t.annualRatePct) / 100) * (/** @type {number} */ (t.monthsPerPeriod) / 12);
  if (r === 0) return Math.min(L, (L / n) * paid);
  const payment = (L * r) / (1 - Math.pow(1 + r, -n));
  let balance = L;
  for (let i = 0; i < paid; i++) {
    const interest = balance * r;
    balance -= Math.min(balance, payment - interest);
  }
  return Math.max(0, L - balance);
}

/**
 * The balance the schedule expects at a date: disbursed minus the principal
 * repaid by then, never below nought, nought before origination.
 *
 * @param {Object} facility   the raw facility block
 * @param {string} asOf       YYYY-MM-DD
 */
function outstandingAt(facility, asOf) {
  const t = terms(facility);
  const at = parse(asOf, 'asOf');
  const before = at.getTime() < t.origination.getTime();
  const repaid = principalRepaidBy(t, at);
  const value = before ? 0 : Math.max(0, t.disbursed - repaid);
  const instalments = (t.profile === 'equal-principal' || t.profile === 'annuity')
    ? instalmentDates(t).filter(d => d.getTime() <= at.getTime()).length : null;
  return {
    asOf: iso(at),
    value: +value.toFixed(2),
    repaid: +repaid.toFixed(2),
    instalmentsPaid: instalments,
    matured: at.getTime() >= t.maturity.getTime(),
    beforeOrigination: before,
    equation: before ? 'scheduled outstanding = 0 (before origination)' : 'scheduled outstanding = disbursed − principal repaid by the date, on the recorded repayment profile',
    basis: 'Scheduled from the facility terms, not read from the ledger',
    reference: REF,
  };
}

/**
 * The year-ends a facility lives through: the month-day of the reporting
 * date, in every year from origination to maturity.
 *
 * @param {Object} facility
 * @param {string} reportingAsOf   the reporting year's position date, YYYY-MM-DD
 */
function yearEnds(facility, reportingAsOf) {
  const t = terms(facility);
  parse(reportingAsOf, 'asOf');
  const month = Number(reportingAsOf.slice(5, 7)), day = Number(reportingAsOf.slice(8, 10));
  const out = [];
  for (let y = t.origination.getUTCFullYear(); y <= t.maturity.getUTCFullYear(); y++) {
    /* The day clamped to the month's length, so a 29 February position date
       falls to the 28th in a common year rather than to 1 March. */
    const last = new Date(Date.UTC(y, month, 0)).getUTCDate();
    out.push(iso(new Date(Date.UTC(y, month - 1, Math.min(day, last)))));
  }
  return out;
}

module.exports = { terms, outstandingAt, yearEnds, instalmentDates, principalRepaidBy, addMonths, PROFILES, FREQUENCIES, REF };
