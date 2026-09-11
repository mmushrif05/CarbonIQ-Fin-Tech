// @ts-check
/**
 * The first administrator from the build (scripts/first-admin.js).
 *
 * The decision table, on whichever store the run is on: unset is a no-op,
 * half-set is reported and skipped under --if-configured, a preview never
 * touches accounts, a missing account is created as an administrator with
 * the password its own, an existing one is left alone unless RESET says
 * otherwise, and the password is never in the log.
 */

'use strict';

const { run } = require('../scripts/first-admin');
const users = require('../src/platform/auth/users');

const SECRET = 'a first administrator passphrase';
const OTHER = 'the password that was there before';
const ORG = 'datum';

/** A distinct address per test, so nothing leans on the store being reset. */
let n = 0;
const address = () => `first-admin-${Date.now()}-${++n}@bank.lk`;

/** Run with a captured log. */
async function drive(env, opts = {}) {
  const lines = [];
  const result = await run({ env, log: l => lines.push(l), ifConfigured: true, ...opts });
  return { result, lines };
}

const signsIn = async (email, secret) => Boolean((await users.authenticate(email, secret)).user);

describe('nothing configured', () => {
  test('is a no-op under --if-configured and a refusal without it', async () => {
    const before = await users.countUsers();
    const { result, lines } = await drive({});
    expect(result).toEqual({ action: 'skipped', reason: 'unset' });
    expect(lines.join('\n')).toMatch(/FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD not set/);
    expect(await users.countUsers()).toBe(before);
    await expect(run({ env: {}, log: () => {}, ifConfigured: false })).rejects.toThrow(/not set/);
  });

  test('an address without its password is reported and skipped, not a failed build', async () => {
    const email = address();
    const { result, lines } = await drive({ FIRST_ADMIN_EMAIL: email, FIRST_ADMIN_RESET: 'true' });
    expect(result).toEqual({ action: 'skipped', reason: 'incomplete' });
    expect(lines.join('\n')).toMatch(/FIRST_ADMIN_PASSWORD not set/);
    expect(await users.findByEmail(email)).toBeNull();
    await expect(run({ env: { FIRST_ADMIN_EMAIL: email }, log: () => {}, ifConfigured: false }))
      .rejects.toThrow(/FIRST_ADMIN_PASSWORD not set/);
  });
});

describe('a deploy preview', () => {
  test('never touches accounts, because it may share the production database', async () => {
    const email = address();
    const { result } = await drive({ CONTEXT: 'deploy-preview', FIRST_ADMIN_EMAIL: email,
      FIRST_ADMIN_PASSWORD: SECRET, FIRST_ADMIN_ORG: ORG });
    expect(result).toEqual({ action: 'skipped', reason: 'preview' });
    expect(await users.findByEmail(email)).toBeNull();
  });
});

describe('no account holds the address', () => {
  test('it is created as an administrator, the password its own', async () => {
    const email = address();
    const { result, lines } = await drive({ FIRST_ADMIN_EMAIL: email, FIRST_ADMIN_PASSWORD: SECRET,
      FIRST_ADMIN_ORG: ORG, FIRST_ADMIN_NAME: 'Ana Perera' });
    expect(result).toEqual({ action: 'created', email });
    const user = await users.findByEmail(email);
    expect(user).toMatchObject({ role: 'admin', orgId: ORG, name: 'Ana Perera', mustChangePassword: false, active: true });
    expect(await signsIn(email, SECRET)).toBe(true);
    expect(lines.join('\n')).not.toContain(SECRET);
  });

  test('without an organisation it refuses rather than inventing one', async () => {
    const email = address();
    await expect(run({ env: { FIRST_ADMIN_EMAIL: email, FIRST_ADMIN_PASSWORD: SECRET }, log: () => {}, ifConfigured: true }))
      .rejects.toThrow(/FIRST_ADMIN_ORG/);
    expect(await users.findByEmail(email)).toBeNull();
  });
});

describe('an account already holds the address', () => {
  test('it is left alone unless RESET says otherwise', async () => {
    const email = address();
    await users.createUser({ orgId: ORG, email, role: 'admin', password: OTHER });
    const { result, lines } = await drive({ FIRST_ADMIN_EMAIL: email, FIRST_ADMIN_PASSWORD: SECRET, FIRST_ADMIN_ORG: ORG });
    expect(result).toEqual({ action: 'unchanged', email });
    expect(lines.join('\n')).toMatch(/FIRST_ADMIN_RESET=true/);
    expect(await signsIn(email, OTHER)).toBe(true);
    expect(await signsIn(email, SECRET)).toBe(false);
  });

  test('with RESET the password is replaced, its sessions ended, and never printed', async () => {
    const email = address();
    await users.createUser({ orgId: ORG, email, role: 'esg_analyst', password: OTHER });
    const { result, lines } = await drive({ FIRST_ADMIN_EMAIL: email, FIRST_ADMIN_PASSWORD: SECRET, FIRST_ADMIN_RESET: 'true' });
    expect(result).toEqual({ action: 'reset', email });
    expect(await signsIn(email, SECRET)).toBe(true);
    expect(await signsIn(email, OTHER)).toBe(false);
    const log = lines.join('\n');
    expect(log).toMatch(/session\(s\) ended/);
    expect(log).toMatch(/Delete FIRST_ADMIN_PASSWORD and FIRST_ADMIN_RESET/);
    expect(log).not.toContain(SECRET);
    /* Only the password moved: the role is whatever it was. */
    const after = await users.findByEmail(email);
    expect(after && after.role).toBe('esg_analyst');
    expect(after && after.mustChangePassword).toBe(false);
  });
});
