// @ts-check
/**
 * Admin sign-in, and trial access for customers who have been allowed in.
 *
 * Three things this proves, and each exists because the alternative is a
 * message that sends somebody to the wrong person.
 *
 *   An access window is not a role and not the active flag. A role says what
 *   an account may do; a window says for how long; disabling is a decision
 *   somebody took rather than a date that passed. A customer told "your
 *   account has been disabled" on the morning after their trial ended calls
 *   their account manager and hears nothing useful.
 *
 *   A password an administrator typed is the administrator's. Until it is
 *   replaced the account reaches its own password and nothing else — enforced
 *   at the door, not asked for in a banner that every other route ignores.
 *
 *   The first administrator can be created on a deployment with no shell.
 *   That window is open only while the deployment holds no accounts at all,
 *   only against a token the operator set, and therefore only once.
 */

'use strict';

process.env.UI_API_KEY = 'ck_test_' + 't'.repeat(32);

const { api } = require('./helpers/api');
const users = require('../src/platform/auth/users');
const sessions = require('../src/platform/auth/sessions');

const SECRET = 'a passphrase nobody guesses';
const ORG = 'org_trial';

const login = (email, secret = SECRET) =>
  api().post('/v1/auth/login').send({ email, password: secret });

const tomorrow = () => new Date(Date.now() + 86400000).toISOString();
const yesterday = () => new Date(Date.now() - 86400000).toISOString();

let admin;
let adminToken;

beforeAll(async () => {
  admin = await users.createUser({
    orgId: ORG, email: 'boss@bank.lk', name: 'Boss', role: 'admin',
    password: SECRET, mustChangePassword: false,
  });
  adminToken = (await login('boss@bank.lk').expect(200)).body.token;
});

describe('An access window is its own fact', () => {
  test('an account with no window signs in and carries no end date', async () => {
    const res = await login('boss@bank.lk').expect(200);
    expect(res.body.user.accessEndsAt).toBeNull();
    expect(res.body.user.access.state).toBe('open');
    expect(res.body.user.access.daysRemaining).toBeNull();
  });

  test('a trial signs in normally, and says how long it has', async () => {
    await users.createUser({
      orgId: ORG, email: 'trial-open@customer.lk', role: 'esg_analyst',
      password: SECRET, accessEndsAt: tomorrow(), mustChangePassword: false,
    });
    const res = await login('trial-open@customer.lk').expect(200);
    expect(res.body.user.access.state).toBe('ending');
    expect(res.body.user.access.daysRemaining).toBe(1);
  });

  test('a window that has closed is refused, and named — not called a wrong password', async () => {
    await users.createUser({
      orgId: ORG, email: 'trial-over@customer.lk', role: 'esg_analyst',
      password: SECRET, accessEndsAt: yesterday(), mustChangePassword: false,
    });
    const res = await login('trial-over@customer.lk').expect(403);
    expect(res.body.error).toBe('ACCESS_ENDED');
    expect(res.body.message).toMatch(/end date/i);
    expect(res.body.remedy).toMatch(/administrator/i);
  });

  test('a closed window and a disabled account are different refusals', async () => {
    const off = await users.createUser({
      orgId: ORG, email: 'switched-off@customer.lk', role: 'esg_analyst',
      password: SECRET, mustChangePassword: false,
    });
    await users.setActive(off.id, false);
    const res = await login('switched-off@customer.lk').expect(403);
    expect(res.body.error).toBe('ACCOUNT_DISABLED');
  });

  test('a wrong password on an ended account is still just a wrong password', async () => {
    /* The named refusals are reachable only once the password has verified,
       so neither tells an attacker which addresses exist. */
    const res = await login('trial-over@customer.lk', 'not the passphrase').expect(401);
    expect(res.body.error).toBe('SIGN_IN_FAILED');
  });

  test('a bare date means through the end of that day, not its first second', () => {
    expect(users.assertInstant('2026-03-31')).toBe('2026-03-31T23:59:59.999Z');
  });

  test('a date this system cannot read is refused by name', () => {
    expect(() => users.assertInstant('next Tuesday')).toThrow(/not a date/i);
  });
});

describe('A session never outlives the window it was issued under', () => {
  test('the absolute clock is capped at the end of the window', async () => {
    const soon = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const user = await users.createUser({
      orgId: ORG, email: 'short@customer.lk', role: 'esg_analyst',
      password: SECRET, accessEndsAt: soon, mustChangePassword: false,
    });
    const issued = await sessions.issue(user, {});
    expect(new Date(issued.expiresAt).getTime()).toBe(new Date(soon).getTime());
    /* Twelve hours is the ordinary absolute clock; a five-minute window has
       to win, or the customer works for eleven hours past their trial. */
    expect(new Date(issued.expiresAt).getTime()).toBeLessThan(Date.now() + sessions.ABSOLUTE_MS);
  });

  test('ending a window ends the sessions held under it, at once', async () => {
    const user = await users.createUser({
      orgId: ORG, email: 'ends-now@customer.lk', role: 'esg_analyst',
      password: SECRET, accessEndsAt: tomorrow(), mustChangePassword: false,
    });
    const token = (await login('ends-now@customer.lk').expect(200)).body.token;
    await api().get('/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

    await api().patch(`/v1/auth/users/${user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ accessEndsAt: yesterday() })
      .expect(200);

    const after = await api().get('/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    expect(after.body.error).toBe('ACCESS_ENDED');
  });

  test('removing a window makes a trial an ordinary account, with the same id', async () => {
    const user = await users.createUser({
      orgId: ORG, email: 'converts@customer.lk', role: 'esg_analyst',
      password: SECRET, accessEndsAt: tomorrow(), mustChangePassword: false,
    });
    const res = await api().patch(`/v1/auth/users/${user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ accessEndsAt: null })
      .expect(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.accessEndsAt).toBeNull();
    expect(res.body.user.access.state).toBe('open');
    await login('converts@customer.lk').expect(200);
  });
});

describe("An administrator's password is the administrator's until it is replaced", () => {
  let issued;
  let token;

  beforeAll(async () => {
    const res = await api().post('/v1/auth/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'fresh@customer.lk', role: 'esg_analyst', password: SECRET, accessEndsAt: tomorrow() })
      .expect(201);
    issued = res.body.user;
    token = (await login('fresh@customer.lk').expect(200)).body.token;
  });

  test('an issued account is marked, and the trial window came through', () => {
    expect(issued.mustChangePassword).toBe(true);
    expect(issued.access.state).toBe('ending');
  });

  test('it reaches nothing but its own password', async () => {
    const res = await api().get('/v1/partc/clients').set('Authorization', `Bearer ${token}`).expect(403);
    expect(res.body.error).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(res.body.remedy).toMatch(/\/v1\/auth\/password/);
  });

  test('it can still see who it is and sign out', async () => {
    await api().get('/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
  });

  test('changing the password clears it, and the account works', async () => {
    const own = 'a password only they know';
    const changed = await api().post('/v1/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: SECRET, newPassword: own })
      .expect(200);
    expect(changed.body.changed).toBe(true);

    const me = await api().get('/v1/auth/me')
      .set('Authorization', `Bearer ${changed.body.token}`).expect(200);
    expect(me.body.user.mustChangePassword).toBe(false);

    await api().get('/v1/partc/clients')
      .set('Authorization', `Bearer ${changed.body.token}`).expect(200);
  });

  test('an administrator resetting a password issues a temporary one again', async () => {
    const res = await api().post(`/v1/auth/users/${issued.id}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'another issued passphrase' })
      .expect(200);
    expect(res.body.user.mustChangePassword).toBe(true);
  });
});

describe('Only an administrator issues or ends access', () => {
  let analystToken;

  beforeAll(async () => {
    await users.createUser({
      orgId: ORG, email: 'analyst@bank.lk', role: 'esg_analyst',
      password: SECRET, mustChangePassword: false,
    });
    analystToken = (await login('analyst@bank.lk').expect(200)).body.token;
  });

  test('an analyst cannot issue an account', async () => {
    const res = await api().post('/v1/auth/users')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ email: 'self@customer.lk', role: 'admin', password: SECRET })
      .expect(403);
    expect(res.body.error).toBe('SCOPE_REQUIRED');
    expect(JSON.stringify(res.body)).toContain('admin');
  });

  test('an analyst cannot end anyone\'s access', async () => {
    await api().patch(`/v1/auth/users/${admin.id}`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ accessEndsAt: yesterday() })
      .expect(403);
  });

  test('an account in another organisation is not found, rather than refused', async () => {
    const outsider = await users.createUser({
      orgId: 'some-other-bank', email: 'elsewhere@other.lk', role: 'esg_analyst',
      password: SECRET, mustChangePassword: false,
    });
    const res = await api().patch(`/v1/auth/users/${outsider.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false })
      .expect(404);
    expect(res.body.error).toBe('USER_NOT_FOUND');
  });
});

describe('The first administrator, on a deployment with no shell', () => {
  test('a refusal to persist carries the store\'s own reason, not a guess', async () => {
    /* "Set DATABASE_URL" is the wrong instruction for most of the ways this
       can be false — a forced backend that is unreachable is fixed by
       changing STORAGE_BACKEND, and setting a database while the force stands
       changes nothing. The seam knows which case it is; the refusal says so. */
    const store = require('../src/platform/database/store');
    const cap = jest.spyOn(store, 'capability').mockReturnValue({
      mode: 'none', durable: false, writable: false, transactional: false, chosen: true,
      reason: 'STORAGE_BACKEND=blobs, but Netlify Blobs is not reachable from this runtime.',
      remedy: 'Unset STORAGE_BACKEND to fall back to automatic selection.',
    });
    try {
      const res = await login('boss@bank.lk').expect(503);
      expect(res.body.error).toBe('STORAGE_UNAVAILABLE');
      expect(res.body.message).toContain('Netlify Blobs is not reachable');
      expect(res.body.remedy).toContain('STORAGE_BACKEND');
      /* And it no longer sends an operator to a variable that would not help. */
      expect(res.body.remedy).not.toMatch(/Set DATABASE_URL/);

      const boot = await api().get('/v1/auth/bootstrap').expect(200);
      expect(boot.body.reason).toContain('Netlify Blobs is not reachable');
    } finally {
      cap.mockRestore();
    }
  });

  test('the window is shut once accounts exist, and says so rather than refusing', async () => {
    const res = await api().get('/v1/auth/bootstrap').expect(200);
    expect(res.body.available).toBe(false);
    expect(res.body.reason).toMatch(/already has accounts/i);
    expect(res.body.remedy).toMatch(/POST \/v1\/auth\/users/);
  });

  test('a shut window is gone, not forbidden', async () => {
    /* 410 rather than 403: a 403 invites somebody to go looking for a
       credential that would open it, and there is not one. */
    const res = await api().post('/v1/auth/bootstrap')
      .send({ token: 'anything', email: 'second@bank.lk', password: SECRET, orgId: ORG })
      .expect(410);
    expect(res.body.error).toBe('BOOTSTRAP_CLOSED');
  });

  test('neither answer carries the token', async () => {
    process.env.ADMIN_BOOTSTRAP_TOKEN = 'a-very-secret-bootstrap-token';
    try {
      const get = await api().get('/v1/auth/bootstrap').expect(200);
      const post = await api().post('/v1/auth/bootstrap')
        .send({ token: 'wrong', email: 'x@bank.lk', password: SECRET, orgId: ORG });
      for (const body of [get.body, post.body]) {
        expect(JSON.stringify(body)).not.toContain('a-very-secret-bootstrap-token');
      }
    } finally {
      delete process.env.ADMIN_BOOTSTRAP_TOKEN;
    }
  });

  test('with no accounts and a token set, the window opens and creates exactly one administrator', async () => {
    /* The condition is "no accounts at all", which cannot be arranged inside a
       suite that has created several — so the count is stubbed and everything
       else is real: the same route, the same token comparison, the same
       creation path. */
    const spy = jest.spyOn(users, 'countUsers').mockResolvedValue(0);
    process.env.ADMIN_BOOTSTRAP_TOKEN = 'a-very-secret-bootstrap-token';
    try {
      const open = await api().get('/v1/auth/bootstrap').expect(200);
      expect(open.body.available).toBe(true);

      const wrong = await api().post('/v1/auth/bootstrap')
        .send({ token: 'not it', email: 'first@bank.lk', password: SECRET, orgId: 'first-org' })
        .expect(401);
      expect(wrong.body.error).toBe('BOOTSTRAP_TOKEN_INVALID');

      const made = await api().post('/v1/auth/bootstrap')
        .send({ token: 'a-very-secret-bootstrap-token', email: 'first@bank.lk', password: SECRET, orgId: 'first-org' })
        .expect(201);
      expect(made.body.user.role).toBe('admin');
      /* They chose this password themselves, so there is nothing to replace. */
      expect(made.body.user.mustChangePassword).toBe(false);

    } finally {
      spy.mockRestore();
      delete process.env.ADMIN_BOOTSTRAP_TOKEN;
    }

    /* And it is a real account: with the count no longer stubbed, it signs in
       like any other. */
    const token = (await login('first@bank.lk').expect(200)).body.token;
    expect(token).toEqual(expect.any(String));

    /* The window is shut again, by the account it created. */
    expect((await api().get('/v1/auth/bootstrap').expect(200)).body.available).toBe(false);
  });

  test('/health says whether the first-run window is open, as a boolean', async () => {
    const res = await api().get('/health').expect(200);
    expect(typeof res.body.configured.bootstrap).toBe('boolean');
    expect(res.body.configured.bootstrap).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/bootstrap.?token/i);
  });
});
