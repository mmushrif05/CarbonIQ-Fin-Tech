#!/usr/bin/env node
/**
 * CarbonIQ FinTech — Register UI API Key in Firebase
 *
 * Registers the UI_API_KEY (from .env / Netlify) into Firebase so it can
 * be managed through the standard API key system.
 *
 * Run once after Firebase is set up:
 *   node scripts/register-ui-key.js
 */

const crypto = require('crypto');
const path   = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = require('../config');

async function main() {
  const uiKey = process.env.UI_API_KEY;

  if (!uiKey) {
    console.error('\x1b[31m✗ UI_API_KEY is not set in .env\x1b[0m');
    process.exit(1);
  }

  if (!/^ck_(live|test)_[a-zA-Z0-9]{32}$/.test(uiKey)) {
    console.error('\x1b[31m✗ UI_API_KEY format is invalid. Expected: ck_(live|test)_<32chars>\x1b[0m');
    process.exit(1);
  }

  if (!config.firebase.serviceAccount) {
    console.error('\x1b[31m✗ FIREBASE_SERVICE_ACCOUNT is not set — cannot write to Firebase\x1b[0m');
    process.exit(1);
  }

  const admin = require('firebase-admin');
  if (admin.apps.length === 0) {
    const decoded = Buffer.from(config.firebase.serviceAccount, 'base64').toString('utf8');
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(decoded)),
      databaseURL: config.firebase.databaseURL
    });
  }
  const db = admin.database();

  const hashedKey = crypto
    .createHmac('sha256', config.apiKey.salt)
    .update(uiKey)
    .digest('hex');

  const existing = (await db.ref(`fintech/apiKeys/${hashedKey}`).once('value')).val();
  if (existing) {
    console.log('\x1b[33m⚠  UI API key is already registered in Firebase.\x1b[0m');
    console.log(`   Org: ${existing.orgName} | Active: ${existing.active}`);
    process.exit(0);
  }

  const record = {
    id:          hashedKey,
    orgId:       'ui-frontend',
    orgName:     'CarbonIQ Frontend',
    keyName:     'UI Application Key',
    keyType:     uiKey.startsWith('ck_test_') ? 'test' : 'live',
    active:      true,
    permissions: ['read', 'write', 'assess', 'pcaf', 'taxonomy', 'covenant', 'portfolio', 'agent'],
    projectIds:  [],
    rateLimit:   500,
    createdAt:   new Date().toISOString(),
    lastUsed:    null
  };

  await db.ref(`fintech/apiKeys/${hashedKey}`).set(record);

  console.log('\n\x1b[32m✅ UI API key registered in Firebase.\x1b[0m');
  console.log(`   Key      : ${uiKey.substring(0, 14)}...`);
  console.log(`   Org      : CarbonIQ Frontend`);
  console.log(`   Hash ID  : ${hashedKey.substring(0, 16)}...`);
  console.log('   Frontend calls will now authenticate via Firebase.\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\x1b[31m  Error:\x1b[0m', err.message);
  process.exit(1);
});
