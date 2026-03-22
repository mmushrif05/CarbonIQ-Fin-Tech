#!/usr/bin/env node
/**
 * CarbonIQ FinTech — API Key Manager
 *
 * Creates, lists, or revokes API keys stored in Firebase.
 * Only the SHA-256 hash is stored — the plain key is shown once.
 *
 * Usage:
 *   node scripts/create-api-key.js create --org "My Bank" --name "Production Key"
 *   node scripts/create-api-key.js list
 *   node scripts/create-api-key.js revoke <hashed-key-id>
 */

const crypto  = require('crypto');
const path    = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = require('../config');

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateApiKey(type = 'live') {
  const random = crypto.randomBytes(16).toString('hex'); // 32 chars
  return `ck_${type}_${random}`;
}

function hashApiKey(key) {
  return crypto
    .createHmac('sha256', config.apiKey.salt || 'default-dev-salt-change-in-production')
    .update(key)
    .digest('hex');
}

async function getDb() {
  const admin = require('firebase-admin');
  if (admin.apps.length === 0) {
    if (!config.firebase.serviceAccount) {
      console.error('\x1b[31m✗ FIREBASE_SERVICE_ACCOUNT is not set in .env\x1b[0m');
      console.error('  Cannot create a real API key without Firebase.');
      console.error('  For local dev, use DEV_API_KEY from your .env instead.\n');
      process.exit(1);
    }
    const decoded = Buffer.from(config.firebase.serviceAccount, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(decoded);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: config.firebase.databaseURL
    });
  }
  return admin.database();
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function createKey(args) {
  // Parse --org and --name flags or prompt interactively
  let orgName = '';
  let keyName = '';
  let keyType = 'live';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--org')  orgName = args[i + 1] || '';
    if (args[i] === '--name') keyName = args[i + 1] || '';
    if (args[i] === '--test') keyType = 'test';
  }

  if (!orgName) orgName = await ask('  Organization name (e.g. "DBS Bank Singapore"): ');
  if (!keyName) keyName = await ask('  Key name (e.g. "Production Key"): ');

  if (!orgName || !keyName) {
    console.error('\x1b[31m✗ Organization name and key name are required.\x1b[0m');
    process.exit(1);
  }

  const plainKey   = generateApiKey(keyType);
  const hashedKey  = hashApiKey(plainKey);
  const orgId      = 'org_' + crypto.randomBytes(6).toString('hex');
  const now        = new Date().toISOString();

  const keyRecord = {
    id:          hashedKey,
    orgId,
    orgName,
    keyName,
    keyType,
    active:      true,
    permissions: ['read', 'write', 'assess', 'pcaf', 'taxonomy', 'covenant', 'portfolio', 'agent'],
    projectIds:  [],          // empty = access to all projects
    rateLimit:   config.apiKey.defaultRateLimit || 100,
    createdAt:   now,
    lastUsed:    null
  };

  const db = await getDb();
  await db.ref(`fintech/apiKeys/${hashedKey}`).set(keyRecord);

  console.log('\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log('\x1b[32m  ✅ API Key Created Successfully\x1b[0m');
  console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');
  console.log(`  Organization : ${orgName}`);
  console.log(`  Key Name     : ${keyName}`);
  console.log(`  Org ID       : ${orgId}`);
  console.log(`  Key Type     : ${keyType}`);
  console.log(`  Created      : ${now}\n`);
  console.log('  \x1b[33m⚠️  Copy this key now — it will NOT be shown again:\x1b[0m\n');
  console.log(`  \x1b[32m${plainKey}\x1b[0m\n`);
  console.log('  Save this in:');
  console.log('  • Frontend settings (Settings icon in the sidebar)');
  console.log('  • Netlify environment variables (CARBONIQ_API_KEY)');
  console.log('  • Your integration\'s X-API-Key header\n');
  console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');
}

async function listKeys() {
  const db = await getDb();
  const snap = await db.ref('fintech/apiKeys').once('value');
  const keys = snap.val();

  if (!keys || Object.keys(keys).length === 0) {
    console.log('\n  No API keys found.\n');
    return;
  }

  console.log('\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log('\x1b[36m  API Keys\x1b[0m');
  console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

  Object.values(keys).forEach(k => {
    const status = k.active ? '\x1b[32mActive\x1b[0m' : '\x1b[31mRevoked\x1b[0m';
    console.log(`  ${status}  ${k.orgName} / ${k.keyName}`);
    console.log(`         Org ID  : ${k.orgId}`);
    console.log(`         Type    : ${k.keyType || 'live'}`);
    console.log(`         Created : ${k.createdAt}`);
    console.log(`         Last Use: ${k.lastUsed ? new Date(k.lastUsed).toISOString() : 'Never'}`);
    console.log(`         Hash ID : ${k.id?.substring(0, 16)}...`);
    console.log('');
  });
}

async function revokeKey(hashId) {
  if (!hashId) {
    console.error('\x1b[31m✗ Provide a hash ID. Run "list" to see keys.\x1b[0m');
    process.exit(1);
  }
  const db = await getDb();
  await db.ref(`fintech/apiKeys/${hashId}/active`).set(false);
  console.log(`\x1b[32m✓ Key ${hashId.substring(0, 16)}... revoked.\x1b[0m`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const [,, command, ...rest] = process.argv;

(async () => {
  console.log('\n\x1b[36m  CarbonIQ FinTech — API Key Manager\x1b[0m');

  switch (command) {
    case 'create':  await createKey(rest); break;
    case 'list':    await listKeys();      break;
    case 'revoke':  await revokeKey(rest[0]); break;
    default:
      console.log('\n  Usage:');
      console.log('    node scripts/create-api-key.js create [--org "Name"] [--name "Key Name"] [--test]');
      console.log('    node scripts/create-api-key.js list');
      console.log('    node scripts/create-api-key.js revoke <hash-id>\n');
  }
  process.exit(0);
})().catch(err => {
  console.error('\x1b[31m  Error:\x1b[0m', err.message);
  process.exit(1);
});
