/**
 * Key provisioning — issue, scope, expire, rotate, revoke — against a
 * Firebase stand-in that records what was written.
 */

'use strict';

const model = require('../src/platform/auth/api-key-model');
const { hashApiKey } = require('../src/platform/auth/api-key');

/** A path-keyed store with Firebase's ref().set/update/once shape. */
function fakeDb() {
  const data = {};
  const ref = p => ({
    set: async v => { data[p] = JSON.parse(JSON.stringify(v)); },
    update: async v => { data[p] = { ...(data[p] || {}), ...JSON.parse(JSON.stringify(v)) }; },
    once: async () => ({
      val: () => {
        if (data[p]) return data[p];
        const children = Object.entries(data).filter(([k]) => k.startsWith(`${p}/`));
        if (!children.length) return null;
        return Object.fromEntries(children.map(([k, v]) => [k.slice(p.length + 1), v]));
      },
    }),
  });
  return { ref, data };
}

describe('Issuing a key', () => {
  test('stores the hash, never the key, with scopes and no expiry by default', async () => {
    const db = fakeDb();
    const r = await model.createApiKey(db, { orgId: 'org1', orgName: 'DFCC Bank', keyName: 'LOS', scopes: 'write,read' });
    expect(r.key).toMatch(/^ck_live_[a-f0-9]{32}$/);
    expect(r.hashedKey).toBe(hashApiKey(r.key));
    const stored = db.data[`fintech/apiKeys/${r.hashedKey}`];
    expect(stored.scopes).toEqual(['read', 'write']);
    expect(stored.expiresAt).toBeNull();
    expect(stored.active).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(r.key);
  });

  test('defaults to read only, refuses an unknown scope and a past expiry', async () => {
    const db = fakeDb();
    const r = await model.createApiKey(db, { orgId: 'o', orgName: 'O', keyName: 'k' });
    expect(db.data[`fintech/apiKeys/${r.hashedKey}`].scopes).toEqual(['read']);
    await expect(model.createApiKey(db, { orgId: 'o', orgName: 'O', scopes: ['delete'] })).rejects.toMatchObject({ code: 'UNKNOWN_SCOPE' });
    await expect(model.createApiKey(db, { orgId: 'o', orgName: 'O', expiresAt: '2001-01-01' })).rejects.toMatchObject({ code: 'BAD_EXPIRY' });
    await expect(model.createApiKey(db, { orgId: 'o', orgName: 'O', expiresAt: 'someday' })).rejects.toMatchObject({ code: 'BAD_EXPIRY' });
  });
});

describe('Scoping later', () => {
  test('a key issued without scopes is listed unscoped, then held to scopes once set', async () => {
    const db = fakeDb();
    db.data['fintech/apiKeys/legacy1'] = { orgId: 'o', orgName: 'O', keyName: 'old', active: true, permissions: ['read'] };
    let [k] = await model.listApiKeys(db);
    expect(k.unscoped).toBe(true);
    const r = await model.setScopes(db, 'legacy1', 'read,lock');
    expect(r).toMatchObject({ scopes: ['read', 'lock'], wasUnscoped: true });
    [k] = await model.listApiKeys(db);
    expect(k.unscoped).toBe(false);
    expect(k.scopes).toEqual(['read', 'lock']);
    expect(k.scopesSetAt).toBeTruthy();
  });

  test('scoping or expiring a key that does not exist is refused', async () => {
    const db = fakeDb();
    await expect(model.setScopes(db, 'nope', 'read')).rejects.toMatchObject({ code: 'KEY_NOT_FOUND' });
    await expect(model.setExpiry(db, 'nope', '2999-01-01')).rejects.toMatchObject({ code: 'KEY_NOT_FOUND' });
  });
});

describe('Rotation', () => {
  test('issues a replacement with the same scopes, and gives the old key a grace period pointing at the new one', async () => {
    const db = fakeDb();
    const first = await model.createApiKey(db, { orgId: 'o', orgName: 'O', keyName: 'LOS', scopes: ['read', 'write'], isTest: true });
    const r = await model.rotateApiKey(db, first.hashedKey, { graceDays: 7 });
    expect(r.key).toMatch(/^ck_test_/);
    expect(r.record.scopes).toEqual(['read', 'write']);
    expect(r.record.keyName).toBe('LOS');
    const old = db.data[`fintech/apiKeys/${first.hashedKey}`];
    expect(old.supersededBy).toBe(r.hashedKey);
    expect(old.active).toBe(true);
    expect(new Date(old.expiresAt).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  });

  test('with no grace the old key is revoked at once; a revoked key cannot be rotated', async () => {
    const db = fakeDb();
    const first = await model.createApiKey(db, { orgId: 'o', orgName: 'O', keyName: 'k' });
    const r = await model.rotateApiKey(db, first.hashedKey, { graceDays: 0 });
    expect(r.previousRevoked).toBe(true);
    expect(db.data[`fintech/apiKeys/${first.hashedKey}`].active).toBe(false);
    await expect(model.rotateApiKey(db, first.hashedKey)).rejects.toMatchObject({ code: 'KEY_REVOKED' });
  });

  test('revoking records when', async () => {
    const db = fakeDb();
    const first = await model.createApiKey(db, { orgId: 'o', orgName: 'O', keyName: 'k' });
    await model.revokeApiKey(db, first.hashedKey);
    const rec = db.data[`fintech/apiKeys/${first.hashedKey}`];
    expect(rec.active).toBe(false);
    expect(rec.revokedAt).toBeTruthy();
  });
});
