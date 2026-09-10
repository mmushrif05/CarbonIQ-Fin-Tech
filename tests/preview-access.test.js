'use strict';

/**
 * Preview access — the sample book, opened by an address.
 *
 * The whole feature rests on three claims, and each of them is a way it could
 * be quietly wrong:
 *
 *   1. A preview session can read the sample book.  If it cannot, the door
 *      opens onto an empty screen and the feature is worse than absent.
 *   2. A preview session can change nothing.  A read-only claim that is only
 *      a label is the failure this codebase already had with an unscoped API
 *      key waved through `lock` on every route.
 *   3. A preview session can reach no other organisation's records.  This is
 *      the one that matters, and it is not enforced by a check — it holds
 *      because every read at the seam is partitioned by organisation and the
 *      preview organisation holds nothing but the sample.
 *
 * The register is tested for the property that makes it useful rather than
 * merely present: one row per address however often that address returns.
 */

const { api } = require('./helpers/api');
const { source, must, mustNot } = require('./helpers/ui-source');
const preview = require('../src/platform/auth/preview');
const users = require('../src/platform/auth/users');
const store = require('../src/platform/database/store');

/** A fresh address per test, so a run never depends on another run's register. */
let n = 0;
const address = () => `visitor${++n}.${Date.now()}@bank.lk`;

/** Admit a visitor and hand back the bearer token. */
async function admitted(email = address()) {
  const res = await api().post('/v1/auth/preview').send({ email });
  expect(res.status).toBe(201);
  return { token: res.body.token, body: res.body, email };
}

const bearer = token => req => req.set('Authorization', `Bearer ${token}`);

describe('The door', () => {
  test('says whether it is open before anyone presses it', async () => {
    /* A screen that finds out by failing shows a button that does nothing. */
    const res = await api().get('/v1/auth/preview');
    expect(res.status).toBe(200);
    expect(typeof res.body.available).toBe('boolean');
    if (!res.body.available) expect(typeof res.body.reason).toBe('string');
  });

  test('an address alone is admitted, and nothing else is asked for', async () => {
    const { body } = await admitted();
    expect(body.token).toEqual(expect.any(String));
    expect(body.preview).toBe(true);
    expect(body.user.role).toBe('viewer');
    expect(body.user.orgId).toBe(preview.PREVIEW_ORG);
  });

  test('a malformed address is refused by name', async () => {
    const res = await api().post('/v1/auth/preview').send({ email: 'not-an-address' });
    expect(res.status).toBe(400);
  });

  test('the address is normalised, so one person is one visitor', async () => {
    const email = address();
    const first = await api().post('/v1/auth/preview').send({ email: email.toUpperCase() });
    const second = await api().post('/v1/auth/preview').send({ email });
    expect(first.status).toBe(201);
    expect(second.body.visits).toBe(first.body.visits + 1);
  });

  test('every visitor shares one account and holds their own session', async () => {
    /* An account per visitor would be an unbounded public write on the table
       that holds every real person, and would collide with a real address the
       first time somebody at a bank typed their own into the form. */
    const a = await admitted();
    const b = await admitted();
    expect(a.token).not.toBe(b.token);

    const [meA, meB] = await Promise.all([
      bearer(a.token)(api().get('/v1/auth/me')),
      bearer(b.token)(api().get('/v1/auth/me')),
    ]);
    expect(meA.body.user.id).toBe(meB.body.user.id);
    expect(meA.body.user.email).toBe(preview.PREVIEW_EMAIL);
  });

  test('a visitor typing a real account\'s address does not touch that account', async () => {
    /* The form takes an address it cannot verify. If admission went looking
       for a matching account, anyone could aim this at a real one. */
    const real = `officer.${Date.now()}@realbank.lk`;
    const created = await users.createUser({
      orgId: 'realbank', email: real, name: 'Officer',
      role: 'credit_officer', password: 'a-real-password-12',
    });

    const res = await api().post('/v1/auth/preview').send({ email: real });
    expect(res.status).toBe(201);
    expect(res.body.user.id).not.toBe(created.id);
    expect(res.body.user.orgId).toBe(preview.PREVIEW_ORG);

    const after = await users.getUser(created.id);
    expect(after.orgId).toBe('realbank');
    expect(after.role).toBe('credit_officer');
    expect(after.active).toBe(true);
  });
});

describe('What a preview session can and cannot do', () => {
  let token;
  beforeAll(async () => { ({ token } = await admitted()); });

  test('it reads the sample book, so the door does not open onto an empty screen', async () => {
    const res = await bearer(token)(api().get('/v1/partc/clients'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.clients)).toBe(true);
    expect(res.body.clients.length).toBeGreaterThan(0);
  });

  test('it holds `read` and nothing else', async () => {
    const res = await bearer(token)(api().get('/v1/auth/me'));
    expect(res.body.user.role).toBe('viewer');
    const scopes = require('../src/platform/auth/scopes');
    expect(scopes.scopesForRoleLevel(res.body.user.roleLevel)).toEqual(['read']);
  });

  test('a write is refused, naming the scope it would need', async () => {
    const res = await bearer(token)(api().post('/v1/partc/clients').send({ name: 'Acme Ltd' }));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SCOPE_REQUIRED');
  });

  test('an agent is refused, so a public form cannot spend the AI budget', async () => {
    const res = await bearer(token)(api()
      .post('/v1/pcaf/part-c/runs/start').send({ projectName: 'x' }));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SCOPE_REQUIRED');
  });

  test('the register is refused to the visitor whose address is in it', async () => {
    /* It is the most personal thing this deployment holds, and it is the one
       list on the surface that needs `admin` rather than `read`. */
    const res = await bearer(token)(api().get('/v1/auth/preview/signups'));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SCOPE_REQUIRED');
  });

  test('it cannot reach another organisation, because there is nothing of theirs to reach', async () => {
    /* Not a check that refuses — a partition that is empty. A record written
       into another organisation is invisible from here with no rule firing. */
    await store.put('clients', 'realbank', 'cli_secret', {
      clientId: 'cli_secret', name: 'A Real Insurer', orgId: 'realbank',
    });
    const res = await bearer(token)(api().get('/v1/partc/clients'));
    expect(res.status).toBe(200);
    const names = res.body.clients.map(c => c.name);
    expect(names).not.toContain('A Real Insurer');
  });
});

describe('The register — who asked, and how often', () => {
  test('a returning address is one row with a count, not two rows', async () => {
    const email = address();
    await api().post('/v1/auth/preview').send({ email });
    await api().post('/v1/auth/preview').send({ email });
    await api().post('/v1/auth/preview').send({ email });

    const { signups } = await preview.signups({ limit: 500 });
    const mine = signups.filter(s => s.email === email);
    expect(mine).toHaveLength(1);
    expect(mine[0].visits).toBe(3);
    expect(mine[0].firstSeenAt <= mine[0].lastSeenAt).toBe(true);
  });

  test('it never records the visitor\'s address on the account, only in the register', async () => {
    /* The two facts are kept apart so that removing an account does not erase
       the fact that the question was asked. */
    const { email } = await admitted();
    const account = await preview.account();
    expect(account.email).toBe(preview.PREVIEW_EMAIL);
    expect(account.email).not.toBe(email);

    const { signups } = await preview.signups({ limit: 500 });
    expect(signups.map(s => s.email)).toContain(email);
  });

  test('no IP address is kept — the register holds what a visitor chose to give', async () => {
    const email = address();
    await api().post('/v1/auth/preview').send({ email });
    const { signups } = await preview.signups({ limit: 500 });
    const row = signups.find(s => s.email === email);
    expect(row).toBeTruthy();
    expect(Object.keys(row)).not.toContain('ip');
    expect(JSON.stringify(row)).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });

  test('an administrator can read it', async () => {
    const admin = await users.createUser({
      orgId: 'datum', email: `admin.${Date.now()}@datum.lk`, name: 'Admin',
      role: 'admin', password: 'an-admin-password-12',
    });
    const sessions = require('../src/platform/auth/sessions');
    const stored = await users.getUser(admin.id);
    const { token } = await sessions.issue(stored);

    const res = await bearer(token)(api().get('/v1/auth/preview/signups'));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(Array.isArray(res.body.signups)).toBe(true);
  });

  test('it is newest first, because that is the only way it is read', async () => {
    const { signups } = await preview.signups({ limit: 500 });
    const seen = signups.map(s => s.lastSeenAt);
    expect([...seen].sort().reverse()).toEqual(seen);
  });
});

describe('The switch', () => {
  afterEach(() => { delete process.env.PREVIEW_ACCESS; });

  test('an operator can close it, and it says so rather than failing', async () => {
    process.env.PREVIEW_ACCESS = 'off';
    const state = await preview.state();
    expect(state.available).toBe(false);
    expect(state.reason).toMatch(/switched off/i);
    expect(state.remedy).toMatch(/PREVIEW_ACCESS/);

    const res = await api().post('/v1/auth/preview').send({ email: address() });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PREVIEW_UNAVAILABLE');
  });

  test('it is open by default, because what it can do is bounded by construction', async () => {
    expect(preview.isEnabled()).toBe(true);
  });
});

describe('The screen', () => {
  /*
   * The four mechanical faults this codebase has already shipped once each,
   * checked against the panel that was just added rather than trusted to have
   * avoided them. A source sweep cannot prove the fix works — that is what
   * `e2e/` is for — but it can prove the shape of it is there.
   */
  const shell = () => source('ui/index.html');
  const auth = () => source('ui/js/auth.js');
  const css = () => source('ui/css/login.css');

  test('the panel is hidden with [hidden], never with a class that sets display', () => {
    /* `[hidden]` is `display: none` from the user-agent sheet, and any class
       rule that sets display beats it — which is how a drawer once covered the
       page from load while its markup said hidden. */
    must(shell(), /id="login-preview"[^>]*\shidden/, 'the preview panel starts hidden');
    must(shell(), /getElementById\('login-preview'\)[\s\S]{0,120}\.hidden = false/,
      'and is revealed by clearing [hidden], not by a class');
    mustNot(css(), /\.login-preview\s*\{[^}]*display\s*:/,
      'no class rule sets display on the preview panel',
      'A display rule here would beat [hidden] and show the panel from load.');
  });

  test('the input can shrink, so one long address does not widen the page', () => {
    /* A flex item\'s min-width is auto: it refuses to shrink below its
       content, and one long placeholder sets the width of the card. */
    must(css(), /\.login-preview-row \.login-input\s*\{[^}]*min-width\s*:\s*0/,
      'the preview input may shrink below its content width');
  });

  test('availability is asked before the panel could be pressed', () => {
    /* Anything that changes what the first screen offers has to be loaded
       before that screen is offered. */
    must(shell(), /_checkPreview\(\);/, 'the check runs during wiring');
    const t = shell().text;
    expect(t.indexOf('async function _checkPreview')).toBeLessThan(t.indexOf('return { submit, changePassword, bootstrap, preview }'));
  });

  test('the session says it is a preview from the role the server gave it', () => {
    /* Not from a flag the browser was handed: that would drift from what the
       server will actually allow, and would not survive a reload. */
    must(auth(), /function isPreview\(\)[\s\S]{0,200}session\.role === 'viewer'/,
      'a preview session is recognised by its role');
    must(auth(), /applyPreviewMark\(\);/, 'and the mark is applied when the shell is enforced');
  });

  test('the mark says what the book is and stops', () => {
    must(auth(), /Sample book — illustrative records, read-only\./,
      'the mark states the provenance');
    /* Amber is for something the reader has to act on; this is a label. */
    mustNot(css(), /\.preview-mark\s*\{[^}]*(#f59e0b|245,\s*158)/,
      'the mark is not amber', 'Amber in this product means act on this.');
  });
});
