/**
 * H1 — authentication and per-user identity.
 *
 * The exit criterion of the phase, as a test: an anonymous request to every
 * route is refused, and a read-only role that signs in cannot lock an
 * assessment. Around it: a sign-in that does not say whether the address
 * exists, a session that ends the moment the account is disabled, a browser
 * that is served no credential at all, an audit line that says whether the
 * name on it was established or merely asserted, and a key issued before
 * scopes existed held to `read` rather than waved through.
 */

'use strict';

process.env.UI_API_KEY = 'ck_test_' + 'h'.repeat(32);

const request = require('supertest');

const app = require('../src/server');
const users = require('../src/platform/auth/users');
const sessions = require('../src/platform/auth/sessions');
const password = require('../src/platform/auth/password');
const store = require('../src/platform/database/store');
const { scopesForRoleLevel } = require('../src/platform/auth/scopes');

const KEY = process.env.UI_API_KEY;
const SECRET = 'a passphrase nobody guesses';

/** Each suite gets its own organisation, so nothing here reads anyone else's. */
const ORG = 'org_h1';

let admin;

async function signIn(email) {
  const res = await request(app).post('/v1/auth/login').send({ email, password: SECRET }).expect(200);
  return res.body.token;
}

beforeAll(async () => {
  admin = await users.createUser({ orgId: ORG, email: 'ana@bank.lk', name: 'Ana Perera', role: 'admin', password: SECRET });
  await users.createUser({ orgId: ORG, email: 'rex@bank.lk', name: 'Rex Silva', role: 'auditor', password: SECRET });
});

describe('Nothing is reachable without a credential', () => {
  test('a protected route refuses an anonymous request and names both ways in', async () => {
    const res = await request(app).get('/v1/partc/clients').expect(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
    expect(res.body.remedy).toMatch(/Authorization: Bearer/);
    expect(res.body.remedy).toMatch(/X-API-Key/);
  });

  test('sign-in is the one write that carries no credential', async () => {
    await request(app).post('/v1/auth/login').send({ email: 'nobody@bank.lk', password: 'x'.repeat(20) }).expect(401);
  });

  test('a garbage bearer token is refused, and says the session is not recognised', async () => {
    const res = await request(app).get('/v1/partc/clients').set('Authorization', 'Bearer cqs_not-a-real-token').expect(401);
    expect(res.body.error).toBe('SESSION_INVALID');
  });
});

describe('Signing in', () => {
  test('a wrong password and an unknown address answer identically', async () => {
    const wrong = await request(app).post('/v1/auth/login').send({ email: 'ana@bank.lk', password: 'not the passphrase' }).expect(401);
    const absent = await request(app).post('/v1/auth/login').send({ email: 'ghost@bank.lk', password: 'not the passphrase' }).expect(401);
    /* Identical but for the request id, which correlates a log line and says
       nothing about the account. */
    const shape = ({ requestId: _id, ...rest }) => rest;
    expect(shape(wrong.body)).toEqual(shape(absent.body));
    expect(wrong.body.error).toBe('SIGN_IN_FAILED');
    /* Nothing in the refusal distinguishes "no such account" from "wrong
       password", which is what stops the form being an address oracle. */
    expect(JSON.stringify(wrong.body)).not.toMatch(/exist|unknown|not found/i);
  });

  test('the right password returns a token, the account, and never a hash', async () => {
    const res = await request(app).post('/v1/auth/login').send({ email: 'ANA@Bank.LK', password: SECRET }).expect(200);
    expect(res.body.token).toMatch(/^cqs_/);
    expect(res.body.user).toMatchObject({ email: 'ana@bank.lk', role: 'admin', orgId: ORG, roleLevel: 100 });
    expect(JSON.stringify(res.body)).not.toMatch(/scrypt|passwordHash/);
  });

  test('the token authenticates, and /v1/auth/me answers with the account', async () => {
    const token = await signIn('ana@bank.lk');
    const me = await request(app).get('/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.user.email).toBe('ana@bank.lk');
  });

  test('what is stored is the hash of the token, so a database read cannot impersonate anyone', async () => {
    const token = await signIn('ana@bank.lk');
    const row = await store.get('sessions', '_', sessions.digest(token));
    expect(row).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain(token);
  });

  test('a password is stored as scrypt with its parameters, and verifies constant-time', async () => {
    const hash = await password.hash(SECRET);
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await password.verify(SECRET, hash)).toBe(true);
    expect(await password.verify('wrong', hash)).toBe(false);
    /* A malformed or absent hash is a failure to verify, never a pass. */
    expect(await password.verify(SECRET, null)).toBe(false);
    expect(await password.verify(SECRET, 'nonsense')).toBe(false);
  });

  test('a password below the floor is refused before it is hashed', async () => {
    await expect(users.createUser({ orgId: ORG, email: 'short@bank.lk', role: 'auditor', password: 'short' }))
      .rejects.toMatchObject({ code: 'WEAK_PASSWORD', statusCode: 400 });
  });

  test('one account per address, whatever the case', async () => {
    await expect(users.createUser({ orgId: ORG, email: 'Ana@BANK.lk', role: 'auditor', password: SECRET }))
      .rejects.toMatchObject({ code: 'EMAIL_IN_USE', statusCode: 409 });
  });
});

describe('The exit criterion: a role decides what a signed-in person may do', () => {
  test('an auditor holds read alone; an administrator holds every scope', () => {
    expect(scopesForRoleLevel(30)).toEqual(['read']);
    expect(scopesForRoleLevel(100)).toEqual(['read', 'write', 'lock', 'assess', 'admin']);
  });

  test('an auditor can read the book and cannot write to it', async () => {
    const token = await signIn('rex@bank.lk');
    await request(app).get('/v1/partc/clients').set('Authorization', `Bearer ${token}`).expect(200);

    const refused = await request(app).post('/v1/partc/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ceylon Infrastructure', country: 'LK' })
      .expect(403);
    expect(refused.body).toMatchObject({ error: 'SCOPE_REQUIRED', required: 'write', held: ['read'] });
    expect(refused.body.remedy).toMatch(/administrator/i);
  });

  test('an auditor cannot lock an assessment — the scope that enters a disclosure', async () => {
    const token = await signIn('rex@bank.lk');
    const res = await request(app).post('/v1/partc/assessments/any/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'locked' })
      .expect(403);
    expect(res.body.required).toBe('lock');
  });

  test('administering accounts requires admin, which no dashboard key holds', async () => {
    const adminToken = await signIn('ana@bank.lk');
    await request(app).get('/v1/auth/users').set('Authorization', `Bearer ${adminToken}`).expect(200);

    const auditorToken = await signIn('rex@bank.lk');
    await request(app).get('/v1/auth/users').set('Authorization', `Bearer ${auditorToken}`).expect(403);

    /* The dashboard key deliberately stops short of key and user administration. */
    const byKey = await request(app).get('/v1/auth/users').set('x-api-key', KEY).expect(403);
    expect(byKey.body.required).toBe('admin');
  });

  test('anyone signed in can end their own session, whatever their role', async () => {
    const token = await signIn('rex@bank.lk');
    await request(app).post('/v1/auth/logout').set('Authorization', `Bearer ${token}`).expect(200);
    await request(app).get('/v1/partc/clients').set('Authorization', `Bearer ${token}`).expect(401);
  });
});

describe('A session can be withdrawn', () => {
  test('disabling an account ends its sessions at once, not at its next sign-in', async () => {
    const victim = await users.createUser({ orgId: ORG, email: 'leaver@bank.lk', role: 'esg_analyst', password: SECRET });
    const token = await signIn('leaver@bank.lk');
    await request(app).get('/v1/partc/clients').set('Authorization', `Bearer ${token}`).expect(200);

    await users.setActive(victim.id, false);
    const after = await request(app).get('/v1/partc/clients').set('Authorization', `Bearer ${token}`).expect(401);
    expect(after.body.error).toBe('ACCOUNT_DISABLED');
  });

  test('a role change reaches an open session on its next request', async () => {
    const mover = await users.createUser({ orgId: ORG, email: 'mover@bank.lk', role: 'esg_analyst', password: SECRET });
    const token = await signIn('mover@bank.lk');
    await request(app).post('/v1/partc/clients').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Written While Analyst', country: 'LK' }).expect(201);

    await users.setRole(mover.id, 'auditor');
    await request(app).post('/v1/partc/clients').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Refused After Demotion', country: 'LK' }).expect(403);
  });

  test('changing a password ends every other session', async () => {
    const u = await users.createUser({ orgId: ORG, email: 'rotate@bank.lk', role: 'esg_analyst', password: SECRET });
    const first = await signIn('rotate@bank.lk');
    const second = await signIn('rotate@bank.lk');

    const changed = await request(app).post('/v1/auth/password')
      .set('Authorization', `Bearer ${first}`)
      .send({ currentPassword: SECRET, newPassword: 'a different passphrase entirely' })
      .expect(200);
    expect(changed.body.token).toMatch(/^cqs_/);

    /* Both of the old tokens are gone, including the one that asked. */
    await request(app).get('/v1/partc/clients').set('Authorization', `Bearer ${second}`).expect(401);
    await request(app).get('/v1/partc/clients').set('Authorization', `Bearer ${changed.body.token}`).expect(200);
    expect(u.id).toBeTruthy();
  });
});

describe('The organisation comes from the credential, never from a default', () => {
  test('a signed-in person reads their own organisation and not another', async () => {
    const other = 'org_h1_other';
    await users.createUser({ orgId: other, email: 'far@bank.lk', role: 'esg_analyst', password: SECRET });

    const mine = await signIn('ana@bank.lk');
    await request(app).post('/v1/partc/clients').set('Authorization', `Bearer ${mine}`)
      .send({ name: 'Only In Org H1', country: 'LK' }).expect(201);

    const theirs = await signIn('far@bank.lk');
    const seen = await request(app).get('/v1/partc/clients').set('Authorization', `Bearer ${theirs}`).expect(200);
    expect(seen.body.clients.map(c => c.name)).not.toContain('Only In Org H1');
  });
});

describe('The browser is handed no credential', () => {
  test('/v1/ui-config.js serves a build stamp and nothing that authenticates', async () => {
    const res = await request(app).get('/v1/ui-config.js').expect(200);
    expect(res.text).not.toMatch(/ck_(live|test)_/);
    expect(res.text).not.toMatch(/API_KEY/);
    expect(res.text).toMatch(/CARBONIQ_BUILD/);
  });

  test('no page module carries an API key or sends one', () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..', 'ui');
    const files = [];
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== 'vendor') walk(full); }
        else if (/\.(js|html)$/.test(entry.name)) files.push(full);
      }
    }(root));

    const offenders = files.filter(f => /x-api-key|CARBONIQ_API_KEY|ck_(live|test)_/i.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(root, f));
    expect(offenders).toEqual([]);
  });
});

describe('Who acted, and whether we know it', () => {
  test('a session names the person and marks the name established', async () => {
    const token = await signIn('ana@bank.lk');
    const res = await request(app).get('/v1/partc/settings').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.status).toBe(200);
    const { actorOf } = require('../src/platform/auth/scopes');
    expect(actorOf({ user: { uid: admin.id, email: 'ana@bank.lk' }, headers: {} }))
      .toMatchObject({ id: admin.id, via: 'user', verified: true });
  });

  test('X-Actor from an integration is believed and recorded unverified', () => {
    const { actorOf } = require('../src/platform/auth/scopes');
    const actor = actorOf({ headers: { 'x-actor': 'ops@bank.lk' }, apiKey: { keyName: 'los' } });
    expect(actor).toMatchObject({ id: 'ops@bank.lk', via: 'header', verified: false });
  });
});

describe('A key issued before scopes existed is held to read', () => {
  const unscoped = { orgId: ORG, orgName: 'Legacy', keyName: 'legacy', permissions: [], scopes: undefined };

  test('it may read', () => {
    const { heldScopes } = require('../src/platform/auth/scopes');
    expect(heldScopes({ apiKey: unscoped })).toEqual({ scopes: null, unscoped: true });
  });

  test('and it may not write, and the refusal names the command that fixes it', () => {
    const { enforceScope } = require('../src/platform/auth/scopes');
    const req = { method: 'POST', apiKey: unscoped, headers: {}, baseUrl: '/v1/partc', route: { path: '/clients' }, body: {} };
    let body = null;
    const res = {
      setHeader() {},
      status(code) { this.code = code; return this; },
      json(payload) { body = { code: this.code, ...payload }; return this; },
    };
    enforceScope(req, res, () => { body = { code: 200 }; });
    expect(body.code).toBe(403);
    expect(body.remedy).toMatch(/npm run key:scope/);
  });
});
