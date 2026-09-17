'use strict';
/**
 * The facility behind a loan, and the numerator it produces.
 *
 * A client asks for 250 million over five years. The standard attributes on
 * the debt owed at the fiscal year-end — disbursed minus repayments, adjusted
 * annually to nought at maturity (§5.2 p.56; p.33) — so the sanctioned amount
 * is the numerator only on the day it is fully drawn and nothing repaid. The
 * register records the facility, schedules the balance, tells a scheduled
 * numerator from a ledger's, reports the §6.2 undrawn commitment apart, and
 * projects the life of the loan without ever putting the projection in the
 * position. This suite holds all of it, on both stores.
 */

const request = require('supertest');
const store = require('../src/platform/database/store');
const app = require('../src/server');
const register = require('../src/domains/pcaf-part-a/application/register');
const consolidated = require('../src/domains/pcaf-part-a/application/parta-consolidated');
const repo = require('../src/domains/pcaf-part-a/infrastructure/store');
const facility = require('../src/domains/pcaf-part-a/domain/facility');
const { issueKey } = require('./helpers/key');

let ORG = 'org-parta-facility';
let KEY;
const YEAR = 2025;
const asOf = `${YEAR}-12-31`;

const TERM = Object.freeze({
  committed: 250e6, disbursed: 250e6, originationDate: '2025-03-15', maturityDate: '2030-03-15',
  repayment: { profile: 'equal-principal', frequency: 'quarterly' },
});

const loan = (over = {}) => ({
  reportingYear: YEAR, instrument: 'business-loan', borrowerListed: false,
  counterparty: { name: 'Lanka Textiles (Pvt) Ltd', sector: 'Textiles' },
  outstanding: { amount: 212.5e6, asOf, currency: 'LKR' },
  denominator: { totalEquity: 900e6, totalDebt: 600e6, asOf, currency: 'LKR' },
  emissions: {
    scope1: { value: 1840, basis: 'reported-unverified', period: String(YEAR) },
    scope2: { value: 1260, basis: 'reported-unverified', period: String(YEAR) },
    scope3AbsentReason: 'not measured',
  },
  ...over,
});

async function clear(org) {
  for (const e of await store.list(repo.EXPOSURES, org)) await store.remove(repo.EXPOSURES, org, e.exposureId || e.id);
}

beforeAll(async () => {
  const issued = await issueKey({ orgId: ORG, keyName: 'facility' });
  ORG = issued.orgId; KEY = issued.key;
});
beforeEach(() => clear(ORG));
afterAll(() => clear(ORG));

describe('the schedule — disbursed minus repayments, to nought at maturity (§5.2, p.56)', () => {
  test('a 250 million facility drawn in March and repaid quarterly carries 212.5 million at the first year-end, 20 instalments to maturity, nought at maturity', () => {
    const s = facility.schedule;
    expect(s.outstandingAt(TERM, '2025-12-31')).toMatchObject({ value: 212.5e6, repaid: 37.5e6, instalmentsPaid: 3, matured: false });
    expect(s.instalmentDates(s.terms(TERM))).toHaveLength(20);
    expect(s.outstandingAt(TERM, '2030-03-15').value).toBe(0);
    expect(s.outstandingAt(TERM, '2025-01-01')).toMatchObject({ value: 0, beforeOrigination: true });
    expect(s.yearEnds(TERM, asOf)).toEqual(['2025-12-31', '2026-12-31', '2027-12-31', '2028-12-31', '2029-12-31', '2030-12-31']);
  });
  test('a bullet is owed whole until maturity; an annuity amortises slower than equal principal; a custom schedule is summed to the date', () => {
    const s = facility.schedule;
    expect(s.outstandingAt({ ...TERM, repayment: { profile: 'bullet' } }, '2029-12-31').value).toBe(250e6);
    expect(s.outstandingAt({ ...TERM, repayment: { profile: 'bullet' } }, '2030-03-15').value).toBe(0);
    const annuity = s.outstandingAt({ ...TERM, repayment: { profile: 'annuity', frequency: 'quarterly', annualRatePct: 12 } }, '2025-12-31').value;
    expect(annuity).toBeGreaterThan(212.5e6);
    expect(annuity).toBeLessThan(250e6);
    expect(s.outstandingAt({ ...TERM, repayment: { profile: 'annuity', frequency: 'quarterly', annualRatePct: 12 } }, '2030-03-15').value).toBe(0);
    const custom = { ...TERM, repayment: { profile: 'schedule', schedule: [{ date: '2025-06-30', principal: 50e6 }, { date: '2026-06-30', principal: 200e6 }] } };
    expect(s.outstandingAt(custom, '2025-12-31').value).toBe(200e6);
    expect(s.outstandingAt(custom, '2026-12-31').value).toBe(0);
  });
  test('what cannot be scheduled is refused by name', () => {
    const s = facility.schedule;
    const code = f => { try { s.terms(f); return null; } catch (e) { return e.code; } };
    expect(code({ ...TERM, disbursed: 300e6 })).toBe('DISBURSED_EXCEEDS_COMMITMENT');
    expect(code({ ...TERM, maturityDate: '2025-03-15' })).toBe('FACILITY_DATES_INVALID');
    expect(code({ ...TERM, repayment: { profile: 'annuity', frequency: 'monthly' } })).toBe('ANNUITY_RATE_REQUIRED');
    expect(code({ ...TERM, repayment: { profile: 'equal-principal' } })).toBe('REPAYMENT_FREQUENCY_REQUIRED');
    expect(code({ ...TERM, repayment: { profile: 'schedule', schedule: [{ date: '2026-01-01', principal: 300e6 }] } })).toBe('SCHEDULE_EXCEEDS_DISBURSED');
    expect(code({ ...TERM, utilisationFactor: 1.5 })).toBe('UTILISATION_FACTOR_INVALID');
  });
});

describe('the §6.2 undrawn commitment — apart, unweighted shall, weighted may (pp.169–173)', () => {
  const financed = { scope1And2: { value: 439.17 }, scope3: { absent: true } };
  test('committed minus drawn on the same denominator times the borrower’s figure; the weighted figure only beside the unweighted', () => {
    const u = facility.undrawnLine({ committed: 400e6, disbursed: 250e6, denominator: 1.5e9, attributionFactor: 250e6 / 1.5e9, financed, utilisationFactor: 0.5, currency: 'LKR' });
    expect(u.undrawnAmount).toBe(150e6);
    expect(u.attributionFactor).toBe(0.1);
    expect(u.unweighted).toMatchObject({ duty: 'shall', scope1And2: 263.502, scope3: null });
    expect(u.weighted).toMatchObject({ duty: 'may', scope1And2: 131.751, utilisationFactor: 0.5 });
    expect(u.separate).toBe(true);
    /* No key anywhere holds the drawn and the undrawn together. */
    const keys = o => Object.keys(o).flatMap(k => [k, ...(o[k] && typeof o[k] === 'object' ? keys(o[k]) : [])]);
    expect(keys(u).filter(k => /total|combined|aggregate/i.test(k))).toEqual([]);
  });
  test('no utilisation factor: the weighted figure is absent, never defaulted; fully drawn: not applicable; Option 3b: absent with the reason', () => {
    const u = facility.undrawnLine({ committed: 400e6, disbursed: 250e6, denominator: 1.5e9, attributionFactor: 0.1667, financed, utilisationFactor: null, currency: 'LKR' });
    expect(u.weighted).toMatchObject({ absent: true, duty: 'may' });
    expect(facility.undrawnLine({ committed: 250e6, disbursed: 250e6, denominator: 1.5e9, attributionFactor: 0.1667, financed, utilisationFactor: null, currency: 'LKR' })).toMatchObject({ applicable: false, undrawnAmount: 0 });
    const b = facility.undrawnLine({ committed: 400e6, disbursed: 250e6, denominator: null, attributionFactor: null, financed, utilisationFactor: null, currency: 'LKR' });
    expect(b).toMatchObject({ applicable: true, absent: true });
    expect(b.reason).toMatch(/cannot be attributed|no company figure/);
  });
});

describe('the register — the facility recorded, the numerator told apart from the schedule, the projection kept out of the position', () => {
  test('a scheduled year-end balance is accepted and carries a material finding; the ledger’s balance carries none; the figures are the same', async () => {
    const scheduled = await register.record(ORG, loan({ facility: { ...TERM, outstandingBasis: 'scheduled' } }));
    expect(scheduled.facility).toMatchObject({ committed: 250e6, outstandingBasis: 'scheduled' });
    expect(scheduled.result.facility.recorded).toMatchObject({ outstanding: 212.5e6, basis: 'scheduled', varianceFromSchedulePct: 0 });
    expect(scheduled.result.validation.verdict).toBe('accepted_with_findings');
    expect(scheduled.result.validation.findings.map(f => f.code)).toContain('OUTSTANDING_SCHEDULED_NOT_ACTUAL');
    expect(scheduled.result.validation.findings.find(f => f.code === 'OUTSTANDING_SCHEDULED_NOT_ACTUAL').severity).toBe('material');

    const ledger = await register.record(ORG, loan({ identifiers: { accountNumber: 'TL-LEDGER' }, facility: { ...TERM } }));
    expect(ledger.result.validation.findings.map(f => f.code)).not.toContain('OUTSTANDING_SCHEDULED_NOT_ACTUAL');
    expect(ledger.result.inventory.scope1And2.value).toBe(scheduled.result.inventory.scope1And2.value);
    expect(ledger.result.inventory.dataQuality.scope1And2).toEqual(scheduled.result.inventory.dataQuality.scope1And2);

    /* The facility changes no figure: the same loan with no facility at all. */
    const bare = await register.preview(ORG, loan());
    expect(bare.result.inventory.scope1And2.value).toBe(ledger.result.inventory.scope1And2.value);
    expect(bare.result.attribution.value).toBe(ledger.result.attribution.value);
    expect(bare.result.facility).toBeUndefined();
  });

  test('a keyed balance far from the schedule is advisory; a balance above the commitment or the drawn amount is refused', async () => {
    const off = await register.preview(ORG, loan({ outstanding: { amount: 150e6, asOf, currency: 'LKR' }, facility: { ...TERM } }));
    expect(off.result.validation.findings.map(f => f.code)).toContain('OUTSTANDING_OFF_SCHEDULE');
    expect(off.result.validation.findings.find(f => f.code === 'OUTSTANDING_OFF_SCHEDULE').severity).toBe('advisory');
    await expect(register.preview(ORG, loan({ outstanding: { amount: 300e6, asOf, currency: 'LKR' }, facility: { ...TERM, committed: 260e6, disbursed: 260e6 } })))
      .rejects.toMatchObject({ statusCode: 400, code: 'OUTSTANDING_EXCEEDS_COMMITMENT' });
    await expect(register.preview(ORG, loan({ facility: { ...TERM, disbursed: 200e6 } })))
      .rejects.toMatchObject({ statusCode: 400, code: 'OUTSTANDING_EXCEEDS_DISBURSED' });
  });

  test('the life of the loan is a projection on every row, declines to nought at maturity, and is not in the position', async () => {
    const x = await register.record(ORG, loan({ facility: { ...TERM } }));
    const p = x.result.facility.projection;
    expect(p.projection).toBe(true);
    expect(p.rows).toHaveLength(6);
    expect(p.rows.every(r => r.projection === true)).toBe(true);
    expect(p.rows.map(r => r.scheduledOutstanding)).toEqual([212.5e6, 162.5e6, 112.5e6, 62.5e6, 12.5e6, 0]);
    expect(p.rows[0]).toMatchObject({ isReportingYear: true, financedScope1And2: x.result.inventory.scope1And2.value, attributionFactor: x.result.attribution.value });
    expect(p.rows[5]).toMatchObject({ attributionFactor: 0, financedScope1And2: 0 });
    expect(p.declinesToZero).toBe(true);
    expect(p.assumptions.length).toBeGreaterThanOrEqual(4);

    const pos = await register.position(ORG, YEAR);
    expect(pos.total.lines.scope1And2.value).toBe(x.result.inventory.scope1And2.value);
    expect(JSON.stringify(pos)).not.toMatch(/scheduledOutstanding|"projection":true/);
  });

  test('the position sums the undrawn commitment apart and counts the numerators by basis', async () => {
    await register.record(ORG, loan({ identifiers: { accountNumber: 'A' }, facility: { ...TERM, committed: 400e6, utilisationFactor: 0.5, outstandingBasis: 'scheduled' } }));
    await register.record(ORG, loan({ identifiers: { accountNumber: 'B' }, facility: { ...TERM } }));
    await register.record(ORG, loan({ identifiers: { accountNumber: 'C' } }));
    const pos = await register.position(ORG, YEAR);
    expect(pos.undrawnCommitments).toMatchObject({ exposuresWithFacility: 2, exposures: 1, notAttributable: 0, undrawnAmount: 150e6, separate: true });
    expect(pos.undrawnCommitments.unweighted.scope1And2).toBeGreaterThan(0);
    expect(pos.undrawnCommitments.weighted.scope1And2).toBeCloseTo(pos.undrawnCommitments.unweighted.scope1And2 / 2, 2);
    /* The headline is three loans' financed figure and nothing of the undrawn. */
    const one = (await register.preview(ORG, loan())).result.inventory.scope1And2.value;
    expect(pos.total.lines.scope1And2.value).toBeCloseTo(one * 3, 1);
    expect(pos.numeratorBasis).toMatchObject({ exposures: 3, ledger: 2, scheduled: 1 });
    expect(pos.numeratorBasis.scheduledExposures).toHaveLength(1);

    const c = await consolidated.position(ORG, YEAR);
    expect(c.undrawnCommitments).toMatchObject({ exposures: 1, undrawnAmount: 150e6, separate: true });
    expect(c.numeratorBasis).toMatchObject({ scheduled: 1, ledger: 2 });
    expect(c.outstandingItems.some(i => /scheduled year-end balance/.test(i.what))).toBe(true);
    expect(c.totals.headline.value).toBe(pos.total.lines.scope1And2.value);
  });

  test('an edit that does not mention the facility keeps it; null clears it; a recomputation keeps it', async () => {
    const x = await register.record(ORG, loan({ facility: { ...TERM } }));
    const edited = await register.update(ORG, x.exposureId, loan({ outstanding: { amount: 200e6, asOf, currency: 'LKR' } }));
    expect(edited.facility).toMatchObject({ committed: 250e6 });
    expect(edited.result.facility.recorded.outstanding).toBe(200e6);
    const re = await register.recompute(ORG, x.exposureId);
    expect(re.exposure.facility).toMatchObject({ committed: 250e6 });
    expect(re.exposure.result.facility).toBeTruthy();
    const cleared = await register.update(ORG, x.exposureId, loan({ facility: null }));
    expect(cleared.facility).toBeNull();
    expect(cleared.result.facility).toBeUndefined();
  });

  test('the same principle on a property loan: the numerator is the year-end balance, the facility schedules it and the undrawn line rests on the origination value', async () => {
    const office = { assetClass: 'commercial-real-estate', reportingYear: YEAR, counterparty: { name: 'Harbour Tower' },
      buildingType: 'office', exposure: { outstanding: 45e6, currency: 'LKR', asOf }, value: { atOrigination: 100e6 },
      floorArea: { value: 1000, unit: 'm2' },
      facility: { committed: 60e6, disbursed: 50e6, originationDate: '2024-06-30', maturityDate: '2034-06-30', repayment: { profile: 'equal-principal', frequency: 'monthly' } } };
    const res = await request(app).post('/v1/pcaf/part-a/exposures/preview').set('x-api-key', KEY).send(office).expect(200);
    const f = res.body.preview.result.facility;
    expect(f.terms).toMatchObject({ committed: 60e6, undrawnAmount: 10e6 });
    expect(f.undrawn.applicable).toBe(true);
    expect(f.undrawn.attributionFactor).toBeCloseTo(0.1, 6);
    expect(f.projection.rows[f.projection.rows.length - 1].scheduledOutstanding).toBe(0);
    /* A listed holding carries no facility: a share is held, not drawn down. */
    const listed = { assetClass: 'listed-equity-corporate-bonds', reportingYear: YEAR, instrument: 'listed-equity', onBalanceSheetAtYearEnd: true,
      counterparty: { name: 'X PLC', naceL2: '70' }, outstanding: { amount: 1e6, basis: 'market-value', asOf, currency: 'LKR' },
      denominator: { marketCapOrdinary: 1e9, totalDebtInterestBearing: 1e8, asOf, currency: 'LKR' },
      emissions: { scope1: { value: 10, basis: 'reported-unverified', period: String(YEAR) }, scope2: { value: 1, basis: 'reported-unverified', period: String(YEAR) }, scope3AbsentReason: 'n/a' },
      facility: { ...TERM } };
    await request(app).post('/v1/pcaf/part-a/exposures/preview').set('x-api-key', KEY).send(listed).expect(400);
  });

  test('over the route the facility is recorded and the stored projection carries its summary', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/exposures').set('x-api-key', KEY)
      .send(loan({ facility: { ...TERM, committed: 300e6, outstandingBasis: 'scheduled' } })).expect(201);
    const id = res.body.exposure.exposureId;
    const rows = await repo.rollupsForYear(ORG, YEAR);
    const row = rows.find(r => r.exposureId === id);
    expect(row.result.facility.summary).toMatchObject({ committed: 300e6, undrawnAmount: 50e6, outstandingBasis: 'scheduled', undrawnApplicable: true });
    const got = await request(app).get(`/v1/pcaf/part-a/position/${YEAR}`).set('x-api-key', KEY).expect(200);
    expect(got.body.undrawnCommitments.exposures).toBe(1);
    expect(got.body.numeratorBasis.scheduled).toBe(1);
  });
});
