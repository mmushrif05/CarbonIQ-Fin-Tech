// @ts-check
/**
 * `/v1/webhooks` — subscription management.
 *
 * The suite that stood here presented a key registered nowhere and asserted
 * the 503 from the door, so registration, listing and deletion were never
 * executed: the route file sat at 0% function coverage while the suite passed.
 * The service tests at the bottom re-implemented HMAC in the test and asserted
 * their own arithmetic, which proves Node's crypto works and nothing about
 * this code — they call the module now.
 */

'use strict';

const { api } = require('./helpers/api');
const { issueKey } = require('./helpers/key');
const { onPostgres, testOnPostgres } = require('./helpers/store-mode');
const store = require('../src/platform/database/store');
const webhookService = require('../src/domains/lending/application/webhook');

const VALID_URL = 'https://hooks.example.bank/carboniq';
const VALID_EVENTS = ['covenant.breach', 'assessment.complete'];

/** Well-formed, and registered nowhere. */
const UNREGISTERED = 'ck_test_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

let KEY;

beforeAll(async () => { KEY = (await issueKey({ orgId: 'webhook-org' })).key; });

describe('The door', () => {
  test('no key is 401 on every verb', async () => {
    expect((await api().post('/v1/webhooks').send({ url: VALID_URL, events: VALID_EVENTS })).status).toBe(401);
    expect((await api().get('/v1/webhooks')).status).toBe(401);
    expect((await api().delete('/v1/webhooks/wh_abc123')).status).toBe(401);
  });

  test('a key that is not shaped like one is 401', async () => {
    const res = await api().post('/v1/webhooks').set('X-API-Key', 'bad-key')
      .send({ url: VALID_URL, events: VALID_EVENTS });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_API_KEY');
  });

  test('a well-formed key registered nowhere is refused, and the refusal says which', async () => {
    const res = await api().get('/v1/webhooks').set('X-API-Key', UNREGISTERED);
    expect(res.status).toBe(onPostgres ? 401 : 503);
  });
});

describe('What it refuses', () => {
  const post = payload => api().post('/v1/webhooks').set('X-API-Key', KEY).send(payload);

  test('a URL that is not HTTPS', async () => {
    /* A subscription is where a signed payload is sent. Over plain HTTP the
       signature protects nothing, because the body is readable in transit. */
    const res = await post({ url: 'http://insecure.bank.com/hook', events: VALID_EVENTS });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('an empty event list', async () => {
    const res = await post({ url: VALID_URL, events: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('an event name this system never emits', async () => {
    const res = await post({ url: VALID_URL, events: ['not.a.real.event'] });
    expect(res.status).toBe(400);
  });
});

describe('Register, list, delete', () => {
  /* On a deployment that cannot persist, a write is refused with a 503 rather
     than accepted and lost — the rule tests/storage-seam.test.js exists for.
     The in-process store can persist, so this runs on both. */
  test('a subscription is created, listed, and gone once deleted', async () => {
    const created = await api().post('/v1/webhooks').set('X-API-Key', KEY)
      .send({ url: VALID_URL, events: VALID_EVENTS });
    expect(created.status).toBe(201);
    const id = created.body.subscriptionId;
    expect(id).toBeTruthy();

    const listed = await api().get('/v1/webhooks').set('X-API-Key', KEY);
    expect(listed.status).toBe(200);
    expect(listed.body.subscriptions.map(s => s.subscriptionId)).toContain(id);

    const removed = await api().delete(`/v1/webhooks/${id}`).set('X-API-Key', KEY);
    expect(removed.status).toBe(200);

    const after = await api().get('/v1/webhooks').set('X-API-Key', KEY);
    expect(after.body.subscriptions.map(s => s.subscriptionId)).not.toContain(id);
  });

  test('the signing secret is issued once and never listed again', async () => {
    /* It is the shared secret behind every signature; a list endpoint that
       returned it would hand it to anyone who could read the book. */
    const created = await api().post('/v1/webhooks').set('X-API-Key', KEY)
      .send({ url: VALID_URL, events: ['covenant.breach'] });
    expect(created.body.signingSecret).toBeTruthy();

    const listed = await api().get('/v1/webhooks').set('X-API-Key', KEY);
    for (const s of listed.body.subscriptions) expect(s.signingSecret).toBeUndefined();
  });

  test('deleting a subscription that is not there is 404, not a silent 200', async () => {
    const res = await api().delete('/v1/webhooks/wh_does_not_exist').set('X-API-Key', KEY);
    expect(res.status).toBe(404);
  });

  /* Two organisations need two credentials, and the in-process store holds no
     key table — every caller there is the dashboard key under the one
     organisation `ui`. So the isolation is asserted where it can be. */
  testOnPostgres('one organisation cannot list another’s subscriptions', async () => {
    const other = await issueKey({ orgId: 'webhook-other-org' });
    const mine = await api().post('/v1/webhooks').set('X-API-Key', KEY)
      .send({ url: VALID_URL, events: ['covenant.breach'] });
    const theirs = await api().get('/v1/webhooks').set('X-API-Key', other.key);
    expect(theirs.body.subscriptions.map(s => s.subscriptionId))
      .not.toContain(mine.body.subscriptionId);
  });
});

describe('The signature is the service’s, not the test’s', () => {
  test('it is sha256=<hex> over the body, from the module that sends it', () => {
    /* This asserted a signature the test computed itself, which proves Node's
       crypto works and nothing about this code. */
    const body = JSON.stringify({ event: 'covenant.breach', data: {} });
    const sig = webhookService._sign(body, 'test-signing-secret-12345');
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  test('a different secret gives a different signature', () => {
    const body = 'test-body';
    expect(webhookService._sign(body, 'secret-a')).not.toBe(webhookService._sign(body, 'secret-b'));
  });

  test('the same body and secret give the same signature', () => {
    const body = 'test-body-consistent';
    expect(webhookService._sign(body, 'shared')).toBe(webhookService._sign(body, 'shared'));
  });
});

void store;
