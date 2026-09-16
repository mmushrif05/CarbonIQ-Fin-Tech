/**
 * The approval lifecycle on the exposure register.
 *
 * A figure a bank has not stood behind is a figure it has not yet approved,
 * and until this the register could not say which were which: every row was
 * "recorded" and nothing distinguished a number keyed this morning from one
 * the reporting entity had reviewed and signed off. So an exposure moves
 * recorded → under review → approved through one state machine, approving
 * needs the lock scope (a different authority from recording, as Part C's
 * lock is), every move is dated and attributed, an approved exposure is
 * frozen until it is reopened with a recorded reason, and the consolidated
 * position and its checklist say how many stand approved.
 *
 * Proved over the HTTP surface on whichever store the run is on.
 */

'use strict';

const request = require('supertest');
const store = require('../src/platform/database/store');
const app = require('../src/server');
const register = require('../src/domains/pcaf-part-a/application/register');
const consolidated = require('../src/domains/pcaf-part-a/application/parta-consolidated');
const repo = require('../src/domains/pcaf-part-a/infrastructure/store');
const { requiredScopeFor } = require('../src/platform/auth/scopes');
const { issueKey } = require('./helpers/key');

let ORG = 'org-approval';
let KEY;
const YEAR = 2027;
const asOf = `${YEAR}-12-31`;

const loan = name => ({
  reportingYear: YEAR, instrument: 'business-loan', borrowerListed: false,
  counterparty: { name, sector: 'Example' },
  outstanding: { amount: 100000, asOf, currency: 'LKR' },
  denominator: { totalEquity: 600000, totalDebt: 400000, asOf, currency: 'LKR' },
  emissions: {
    scope1: { value: 1000, basis: 'reported-unverified', period: String(YEAR) },
    scope2: { value: 100, basis: 'reported-unverified', period: String(YEAR) },
    scope3AbsentReason: 'not measured',
  },
});

async function clear() {
  for (const e of await store.list(repo.EXPOSURES, ORG)) await store.remove(repo.EXPOSURES, ORG, e.exposureId || e.id);
}

beforeAll(async () => {
  const k = await issueKey({ orgId: ORG, keyName: 'approval suite' });
  KEY = k.key; ORG = k.orgId;
});
beforeEach(clear);
afterAll(clear);

const h = () => ({ 'x-api-key': KEY, 'X-Actor': 'Ana Perera' });
const post = (path, body) => request(app).post(path).set(h()).send(body);
const statusOf = (id, body) => post(`/v1/pcaf/part-a/exposures/${id}/status`, body);
const recordOne = async name => {
  const res = await post('/v1/pcaf/part-a/exposures', loan(name));
  expect(res.status).toBe(201);
  return res.body.exposure;
};

describe('the approval lifecycle', () => {
  test('an exposure moves recorded → under review → approved, attributed and dated, and reopening needs a reason', async () => {
    const e = await recordOne('Borrower A');
    expect(e.status).toBe('recorded');

    /* One step at a time. */
    const skip = await statusOf(e.exposureId, { status: 'approved' });
    expect(skip.status).toBe(409);
    expect(skip.body.error).toBe('ILLEGAL_TRANSITION');
    expect(skip.body.message).toMatch(/under review/);

    const review = await statusOf(e.exposureId, { status: 'under_review' });
    expect(review.status).toBe(200);
    expect(review.body.exposure.status).toBe('under_review');

    const same = await statusOf(e.exposureId, { status: 'under_review' });
    expect(same.status).toBe(409);
    expect(same.body.error).toBe('STATUS_UNCHANGED');

    const approved = await statusOf(e.exposureId, { status: 'approved' });
    expect(approved.status).toBe(200);
    const a = approved.body.exposure.approval;
    expect(approved.body.exposure.status).toBe('approved');
    expect(a.approvedBy).toBe('Ana Perera');
    expect(a.approvedAt).toBeTruthy();
    expect(a.history.map(m => m.to)).toEqual(['under_review', 'approved']);
    expect(a.history.every(m => m.at && m.by === 'Ana Perera')).toBe(true);

    /* Reopening an approved exposure is a recorded decision, not a click. */
    const bare = await statusOf(e.exposureId, { status: 'under_review' });
    expect(bare.status).toBe(400);
    expect(bare.body.error).toBe('REASON_REQUIRED');

    const reopened = await statusOf(e.exposureId, { status: 'under_review', reason: 'Balance restated after the year-end audit' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.exposure.status).toBe('under_review');
    expect(reopened.body.exposure.approval.approvedBy).toBeNull();
    expect(reopened.body.exposure.approval.lastApprovedAt).toBe(a.approvedAt);
    const last = reopened.body.exposure.approval.history.slice(-1)[0];
    expect(last).toMatchObject({ from: 'approved', to: 'under_review', by: 'Ana Perera' });
    expect(last.reason).toMatch(/restated/);

    /* The service refuses a value the schema would refuse first. */
    const junk = await statusOf(e.exposureId, { status: 'locked' });
    expect(junk.status).toBe(400);
    await expect(register.setStatus(ORG, e.exposureId, { status: 'nowhere' })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('an approved exposure is frozen until reopened, and the consolidated position and checklist say how many stand approved', async () => {
    const a = await recordOne('Borrower A');
    const b = await recordOne('Borrower B');
    await statusOf(a.exposureId, { status: 'under_review' });
    expect((await statusOf(a.exposureId, { status: 'approved' })).status).toBe(200);

    /* Frozen: no edit, no recomputation, no removal while it stands. */
    const edit = await request(app).put(`/v1/pcaf/part-a/exposures/${a.exposureId}`).set(h()).send(loan('Borrower A'));
    expect(edit.status).toBe(409);
    expect(edit.body.error).toBe('APPROVED_FROZEN');
    expect(edit.body.remedy).toMatch(/under_review/);
    expect((await post(`/v1/pcaf/part-a/exposures/${a.exposureId}/recompute`, {})).status).toBe(409);
    expect((await request(app).delete(`/v1/pcaf/part-a/exposures/${a.exposureId}`).set(h())).status).toBe(409);
    /* The other one is still a draft and still moves. */
    expect((await request(app).put(`/v1/pcaf/part-a/exposures/${b.exposureId}`).set(h()).send(loan('Borrower B'))).status).toBe(200);

    /* The position counts, per class and in total, and names what is outstanding. */
    const pos = await consolidated.position(ORG, YEAR);
    expect(pos.approval).toMatchObject({ total: 2, approved: 1, recorded: 1, underReview: 0, approvedPct: 50 });
    const bl = pos.classes.find(c => c.assetClass === 'business-loans-unlisted-equity');
    expect(bl.approval).toMatchObject({ total: 2, approved: 1 });
    expect(pos.outstandingItems.some(x => /Approve 1 exposure/.test(x.what))).toBe(true);

    /* The checklist answers from the same fact, so it can fail. */
    const doc = await consolidated.annualDisclosure(ORG, YEAR);
    const item = doc.model.checklist.items.find(i => i.id === 'APR-1');
    expect(item.answer).toBe('No');
    expect(item.justification).toMatch(/1 of 2/);

    await statusOf(b.exposureId, { status: 'under_review' });
    await statusOf(b.exposureId, { status: 'approved' });
    const pos2 = await consolidated.position(ORG, YEAR);
    expect(pos2.approval).toMatchObject({ total: 2, approved: 2, approvedPct: 100 });
    expect(pos2.outstandingItems.some(x => /^Approve /.test(x.what))).toBe(false);
    const doc2 = await consolidated.annualDisclosure(ORG, YEAR);
    expect(doc2.model.checklist.items.find(i => i.id === 'APR-1').answer).toBe('Yes');

    /* Reopened with a reason, it can be changed again — and the change restarts review. */
    await statusOf(a.exposureId, { status: 'under_review', reason: 'Facility repriced' });
    const edit2 = await request(app).put(`/v1/pcaf/part-a/exposures/${a.exposureId}`).set(h()).send(loan('Borrower A'));
    expect(edit2.status).toBe(200);
    expect(edit2.body.exposure.status).toBe('recorded');
    expect(edit2.body.exposure.approval.history.slice(-1)[0]).toMatchObject({ from: 'under_review', to: 'recorded' });
  });

  test('approving needs the lock scope; recording and sending for review need write', () => {
    const p = '/v1/pcaf/part-a/exposures/:exposureId/status';
    expect(requiredScopeFor('POST', p, { status: 'approved' }).scope).toBe('lock');
    expect(requiredScopeFor('POST', p, { status: 'under_review' }).scope).toBe('write');
    expect(requiredScopeFor('POST', p, { status: 'recorded' }).scope).toBe('write');
    /* Part C's lock is unchanged. */
    expect(requiredScopeFor('POST', '/v1/partc/assessments/:assessmentId/status', { status: 'locked' }).scope).toBe('lock');
    expect(requiredScopeFor('POST', '/v1/partc/assessments/:assessmentId/status', { status: 'under_review' }).scope).toBe('write');
  });

  /* Only PostgreSQL holds a key table, so only there can a narrower key be issued. */
  const onPostgres = store.capability().mode === 'postgres';
  (onPostgres ? test : test.skip)('on PostgreSQL, a key holding read and write is refused when it approves, and the refusal names lock', async () => {
    const writer = await issueKey({ orgId: ORG, scopes: ['read', 'write'], keyName: 'writer only' });
    const e = await recordOne('Borrower C');
    const review = await request(app).post(`/v1/pcaf/part-a/exposures/${e.exposureId}/status`).set({ 'x-api-key': writer.key }).send({ status: 'under_review' });
    expect(review.status).toBe(200);
    const res = await request(app).post(`/v1/pcaf/part-a/exposures/${e.exposureId}/status`).set({ 'x-api-key': writer.key }).send({ status: 'approved' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SCOPE_REQUIRED');
    expect(res.body.required).toBe('lock');
  });
});
