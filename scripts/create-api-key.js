#!/usr/bin/env node
/**
 * CarbonIQ FinTech — API Key Manager
 *
 * Issues, lists, scopes, expires, rotates and revokes API keys stored in
 * Firebase. Only the SHA-256 hash is stored — the plain key is shown once.
 *
 *   npm run key:create -- --org "DFCC Bank" --name "LOS integration" --scopes read,write [--expires 2027-03-31] [--test]
 *   npm run key:list
 *   npm run key:scope  -- <key-id> --scopes read,write,lock
 *   npm run key:expire -- <key-id> --expires 2027-03-31
 *   npm run key:rotate -- <key-id> [--grace-days 7]
 *   npm run key:revoke -- <key-id>
 *
 * Scopes: read · write · lock · assess · admin (src/platform/auth/scopes.js).
 * A key issued before scopes existed has none recorded: it keeps everything
 * it could do, every response on it says `X-Key-Scopes: unscoped`, and
 * `list` counts them. `scope` is how one is brought under control, whenever
 * that is convenient — nothing breaks in the meantime.
 */

'use strict';

const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = require('../src/platform/config');
const model = require('../src/platform/auth/api-key-model');
const { SCOPES } = require('../src/platform/auth/scopes');

const C = { cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', dim: '\x1b[2m', off: '\x1b[0m' };
const rule = () => console.log(`${C.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.off}`);

function flags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=');
      if (inline !== undefined) out[k] = inline;
      else if (i + 1 < args.length && !args[i + 1].startsWith('--')) { out[k] = args[i + 1]; i++; }
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

async function getDb() {
  const admin = require('firebase-admin');
  if (admin.apps.length === 0) {
    if (!config.firebase.serviceAccount) {
      console.error(`${C.red}✗ FIREBASE_SERVICE_ACCOUNT is not set in .env${C.off}`);
      console.error('  Keys live in Firebase; without it there is nothing to write to.');
      console.error('  For local development use DEV_API_KEY from your .env instead.\n');
      process.exit(1);
    }
    const serviceAccount = JSON.parse(Buffer.from(config.firebase.serviceAccount, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL: config.firebase.databaseURL });
  }
  return admin.database();
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

/** Resolve a key id given in full or as a unique prefix. */
async function resolveKey(db, given) {
  if (!given) { console.error(`${C.red}✗ Provide a key id. Run "list" to see keys.${C.off}`); process.exit(1); }
  const all = await model.listApiKeys(db);
  const hits = all.filter(k => k.hashedKey.startsWith(given));
  if (hits.length === 1) return hits[0];
  if (!hits.length) { console.error(`${C.red}✗ No key starts with ${given}.${C.off}`); process.exit(1); }
  console.error(`${C.red}✗ ${hits.length} keys start with ${given}; give more of the id.${C.off}`); process.exit(1);
}

function printIssued(issued, orgName) {
  const r = issued.record;
  console.log(''); rule();
  console.log(`${C.green}  ✅ API key issued${C.off}`); rule(); console.log('');
  console.log(`  Organisation : ${orgName}`);
  console.log(`  Key name     : ${r.keyName}`);
  console.log(`  Org ID       : ${r.orgId}`);
  console.log(`  Type         : ${r.keyType}`);
  console.log(`  Scopes       : ${r.scopes.join(', ')}`);
  console.log(`  Expires      : ${r.expiresAt || 'never'}`);
  console.log(`  Key ID       : ${issued.hashedKey.slice(0, 16)}…`);
  console.log(`\n  ${C.yellow}⚠️  Copy this key now — it will NOT be shown again:${C.off}\n`);
  console.log(`  ${C.green}${issued.key}${C.off}\n`);
  console.log('  Send it in the X-API-Key header. Name the person behind a request in X-Actor.');
  rule(); console.log('');
}

// ── Commands ─────────────────────────────────────────────────────────────

async function createKey(f) {
  let orgName = f.org || '';
  let keyName = f.name || '';
  if (!orgName) orgName = await ask('  Organisation name (e.g. "DFCC Bank"): ');
  if (!keyName) keyName = await ask('  Key name (e.g. "LOS integration"): ');
  if (!orgName || !keyName) { console.error(`${C.red}✗ Organisation and key name are required.${C.off}`); process.exit(1); }
  let scopes = f.scopes;
  if (!scopes) scopes = (await ask(`  Scopes [${SCOPES.join(', ')}] (default read): `)) || 'read';
  const db = await getDb();
  const orgId = f['org-id'] || ('org_' + require('crypto').randomBytes(6).toString('hex'));
  const issued = await model.createApiKey(db, {
    orgId, orgName, keyName, scopes, expiresAt: f.expires, isTest: f.test === true,
    rateLimit: config.apiKey.defaultRateLimit || 100, createdBy: process.env.USER || null,
  });
  printIssued(issued, orgName);
}

async function listKeys() {
  const db = await getDb();
  const keys = await model.listApiKeys(db);
  if (!keys.length) { console.log('\n  No API keys found.\n'); return; }
  console.log(''); rule(); console.log(`${C.cyan}  API keys${C.off}`); rule(); console.log('');
  let unscoped = 0;
  for (const k of keys) {
    const expired = k.expiresAt && new Date(k.expiresAt).getTime() <= Date.now();
    const status = !k.active ? `${C.red}Revoked${C.off}` : expired ? `${C.red}Expired${C.off}` : `${C.green}Active ${C.off}`;
    if (k.active && k.unscoped) unscoped++;
    console.log(`  ${status}  ${k.orgName} / ${k.keyName || 'unnamed'}`);
    console.log(`           Key ID  : ${k.hashedKey.slice(0, 16)}…`);
    console.log(`           Org ID  : ${k.orgId}`);
    console.log(`           Scopes  : ${k.unscoped ? `${C.yellow}unscoped — full access until scoped${C.off}` : k.scopes.join(', ')}`);
    console.log(`           Expires : ${k.expiresAt || 'never'}${k.supersededBy ? `  (rotated → ${k.supersededBy.slice(0, 16)}…)` : ''}`);
    console.log(`           Last use: ${k.lastUsed ? new Date(k.lastUsed).toISOString() : 'never'}`);
    console.log('');
  }
  if (unscoped) {
    console.log(`  ${C.yellow}${unscoped} active key(s) carry no scopes.${C.off} Apply them with:`);
    console.log('    npm run key:scope -- <key-id> --scopes read,write\n');
  }
}

async function scopeKey(f) {
  const db = await getDb();
  const key = await resolveKey(db, f._[0]);
  if (!f.scopes) { console.error(`${C.red}✗ --scopes is required, e.g. --scopes read,write,lock${C.off}`); process.exit(1); }
  const r = await model.setScopes(db, key.hashedKey, f.scopes);
  console.log(`${C.green}✓${C.off} ${key.orgName} / ${key.keyName}: scopes now ${r.scopes.join(', ')}${r.wasUnscoped ? ' (was unscoped)' : ''}.`);
}

async function expireKey(f) {
  const db = await getDb();
  const key = await resolveKey(db, f._[0]);
  if (!f.expires) { console.error(`${C.red}✗ --expires is required, e.g. --expires 2027-03-31${C.off}`); process.exit(1); }
  const r = await model.setExpiry(db, key.hashedKey, f.expires);
  console.log(`${C.green}✓${C.off} ${key.orgName} / ${key.keyName}: expires ${r.expiresAt}.`);
}

async function rotateKey(f) {
  const db = await getDb();
  const key = await resolveKey(db, f._[0]);
  const graceDays = f['grace-days'] === undefined ? 7 : Number(f['grace-days']);
  const r = await model.rotateApiKey(db, key.hashedKey, { graceDays, createdBy: process.env.USER || null });
  printIssued(r, key.orgName);
  console.log(r.previousRevoked
    ? `  The previous key is revoked.`
    : `  The previous key keeps working until ${r.previousExpiresAt}, then answers 401 KEY_EXPIRED naming this one.`);
  console.log('');
}

async function revokeKey(f) {
  const db = await getDb();
  const key = await resolveKey(db, f._[0]);
  await model.revokeApiKey(db, key.hashedKey);
  console.log(`${C.green}✓${C.off} ${key.orgName} / ${key.keyName} revoked.`);
}

function usage() {
  console.log('\n  Usage:');
  console.log('    npm run key:create -- --org "Name" --name "Key name" --scopes read,write [--expires YYYY-MM-DD] [--test]');
  console.log('    npm run key:list');
  console.log('    npm run key:scope  -- <key-id> --scopes read,write,lock');
  console.log('    npm run key:expire -- <key-id> --expires YYYY-MM-DD');
  console.log('    npm run key:rotate -- <key-id> [--grace-days 7]');
  console.log('    npm run key:revoke -- <key-id>');
  console.log(`\n  Scopes: ${SCOPES.join(' · ')}\n`);
}

const [,, command, ...rest] = process.argv;
(async () => {
  console.log(`\n${C.cyan}  CarbonIQ FinTech — API Key Manager${C.off}`);
  const f = flags(rest);
  switch (command) {
    case 'create': await createKey(f); break;
    case 'list':   await listKeys(); break;
    case 'scope':  await scopeKey(f); break;
    case 'expire': await expireKey(f); break;
    case 'rotate': await rotateKey(f); break;
    case 'revoke': await revokeKey(f); break;
    default: usage();
  }
  process.exit(0);
})().catch(err => {
  console.error(`${C.red}  Error:${C.off}`, err.message);
  process.exit(1);
});
