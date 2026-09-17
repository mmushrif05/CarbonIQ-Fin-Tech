// @ts-check
/**
 * The facility behind a loan exposure — read once at origination, and what
 * follows from it at every year-end.
 *
 * A relationship manager brings one question: a client asks for 250 million
 * over five years, so is that the outstanding amount? It is not. The
 * numerator is the debt the borrower owes at the fiscal year-end, disbursed
 * minus repayments, adjusted annually to nought at maturity (§5.2, p.56;
 * p.33). This module holds the facility that produces that balance — the
 * commitment, the drawn amount, the dates and the repayment profile — and
 * answers three things from it, each kept apart from the others:
 *
 *   - the **scheduled balance** at the position date, and the checks that
 *     tell a scheduled numerator from the ledger's (`./checks.js`);
 *   - the **§6.2 undrawn line**, committed minus drawn on the same
 *     denominator, reported apart and never summed (`./undrawn.js`);
 *   - the **life-of-loan projection**, one row per year-end to maturity,
 *     marked as a projection on every row (`./lifetime.js`).
 *
 * It runs over the class's adapted result — the outstanding, the denominator,
 * the attribution factor and the financed lines every class lays out the
 * same way — so the same principle applies to every loan class without any
 * class restating it. It changes no score: Table 5.2-1 is about the emissions
 * data, and the numerator is money.
 */

'use strict';

const schedule = require('./schedule');
const { undrawnLine } = require('./undrawn');
const { projection } = require('./lifetime');
const checks = require('./checks');

/** The register field the block travels under. */
const FIELD = 'facility';

const iso = d => d.toISOString().slice(0, 10);

/** The position date the class attributed on, from the adapted result. */
function positionDateOf(result) {
  const ex = (result && result.exposure) || {};
  const out = ex.outstanding || {};
  if (typeof out.asOf === 'string') return out.asOf;
  if (out.inputs && typeof out.inputs.asOf === 'string') return out.inputs.asOf;
  const y = Number(ex.reportingYear);
  return Number.isFinite(y) ? `${y}-12-31` : null;
}

/**
 * @param {Object} facility     the raw facility block, as recorded
 * @param {Object} result       the class's adapted result
 * @returns {{ terms: Object, scheduled: Object, recorded: Object, undrawn: Object, projection: Object,
 *   validation: Object, summary: Object }}
 */
function analyse(facility, result) {
  const t = schedule.terms(facility);
  const ex = result.exposure || {};
  const out = ex.outstanding || {};
  const recordedOutstanding = Number(out.value);
  if (!Number.isFinite(recordedOutstanding)) {
    const err = /** @type {import('../../../../shared/types').AppError} */ (new Error('The facility can only be read against a recorded outstanding amount.'));
    err.statusCode = 400; err.code = 'OUTSTANDING_REQUIRED';
    throw err;
  }
  const asOf = positionDateOf(result);
  const currency = out.unit || out.currency || null;
  const scheduled = schedule.outstandingAt(facility, /** @type {string} */ (asOf));
  checks.refusals({ terms: t, recordedOutstanding, scheduled, exposureCurrency: currency });
  const validation = checks.findings({ terms: t, recordedOutstanding, scheduled });

  const denominator = result.denominator && Number.isFinite(Number(result.denominator.value)) ? Number(result.denominator.value) : null;
  const attributionFactor = result.attribution && Number.isFinite(Number(result.attribution.value)) ? Number(result.attribution.value) : null;
  const financed = { scope1And2: result.inventory && result.inventory.scope1And2, scope3: result.inventory && result.inventory.scope3 };

  const undrawn = /** @type {any} */ (undrawnLine({ committed: t.committed, disbursed: t.disbursed, denominator, attributionFactor, financed,
    utilisationFactor: t.utilisationFactor, currency }));
  const life = projection({ facility, reportingAsOf: /** @type {string} */ (asOf), recordedOutstanding, denominator, attributionFactor,
    financed, utilisationFactor: t.utilisationFactor, currency });

  const terms = {
    committed: t.committed, disbursed: t.disbursed, undrawnAmount: undrawn.undrawnAmount, currency,
    originationDate: iso(t.origination), maturityDate: iso(t.maturity), tenorMonths: t.tenorMonths,
    repayment: { profile: t.profile, frequency: t.frequency, graceMonths: t.graceMonths,
      firstInstalment: t.firstInstalment ? iso(t.firstInstalment) : null, annualRatePct: t.annualRatePct,
      instalments: (t.profile === 'equal-principal' || t.profile === 'annuity') ? schedule.instalmentDates(t).length : (t.profile === 'schedule' ? t.schedule.length : 1) },
    utilisationFactor: t.utilisationFactor,
    outstandingBasis: t.outstandingBasis,
  };
  const recorded = { outstanding: recordedOutstanding, asOf, basis: t.outstandingBasis, varianceFromSchedulePct: validation.variancePct,
    note: t.outstandingBasis === 'scheduled'
      ? 'Taken from the repayment schedule; the ledger’s balance replaces it before disclosure.'
      : 'The loan account’s balance at the position date — the numerator the standard asks for (§5.2, p.56).' };
  /* What the projection carries, so a position can sum the undrawn line
     apart and count scheduled numerators without reading every record. */
  const summary = {
    committed: t.committed, disbursed: t.disbursed, undrawnAmount: undrawn.undrawnAmount,
    outstandingBasis: t.outstandingBasis,
    undrawnApplicable: Boolean(undrawn.applicable && !undrawn.absent),
    undrawnAbsent: Boolean(undrawn.applicable && undrawn.absent),
    unweightedScope1And2: undrawn.unweighted ? undrawn.unweighted.scope1And2 : null,
    unweightedScope3: undrawn.unweighted ? undrawn.unweighted.scope3 : null,
    weightedScope1And2: undrawn.weighted && !undrawn.weighted.absent ? undrawn.weighted.scope1And2 : null,
    weightedScope3: undrawn.weighted && !undrawn.weighted.absent ? undrawn.weighted.scope3 : null,
    maturityDate: iso(t.maturity),
  };
  const { variancePct, ...validationOut } = validation;
  void variancePct;
  return { terms, scheduled, recorded, undrawn, projection: life, validation: validationOut, summary };
}

/**
 * Two validations as one: the class's own and the facility's. The verdict is
 * restated over the union, so a clean class with a scheduled numerator reads
 * as accepted with findings, and the note names both.
 */
function mergeValidation(a, b) {
  const findings = [...((a && a.findings) || []), ...((b && b.findings) || [])];
  const material = findings.filter(f => f.severity === 'material').length;
  return {
    ...(a || {}),
    verdict: findings.length === 0 ? (a && a.verdict) || 'clean' : 'accepted_with_findings',
    findings,
    counts: { material, advisory: findings.length - material },
    note: findings.length === 0 ? (a && a.note) || 'Every check that could run ran.'
      : (a && a.note && a.findings && a.findings.length ? a.note : 'The assessment stands. Each finding names what it does to the figure or the score and what evidence would clear it; the material ones belong in the disclosure beside the figure.'),
  };
}

module.exports = { FIELD, analyse, mergeValidation, schedule, undrawnLine, projection, checks };
