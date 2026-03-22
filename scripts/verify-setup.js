#!/usr/bin/env node
/**
 * CarbonIQ FinTech — Setup Verifier
 *
 * Checks all required environment variables and Firebase connectivity.
 * Run after filling in your .env:
 *
 *   node scripts/verify-setup.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let passed = 0;
let failed = 0;
let warnings = 0;

function check(label, value, required = true) {
  const filled = value && !value.startsWith('PASTE_') && !value.startsWith('YOUR_');
  if (filled) {
    console.log(`  \x1b[32m✓\x1b[0m  ${label}`);
    passed++;
  } else if (!required) {
    console.log(`  \x1b[33m⚠\x1b[0m  ${label} \x1b[33m(optional — skipped)\x1b[0m`);
    warnings++;
  } else {
    console.log(`  \x1b[31m✗\x1b[0m  ${label} \x1b[31m(MISSING or placeholder)\x1b[0m`);
    failed++;
  }
}

async function checkFirebase() {
  const serviceAccount64 = process.env.FIREBASE_SERVICE_ACCOUNT;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  if (!serviceAccount64 || serviceAccount64.startsWith('PASTE_')) {
    console.log('  \x1b[33m⚠\x1b[0m  Firebase connection \x1b[33m(skipped — no service account)\x1b[0m');
    warnings++;
    return;
  }

  try {
    const decoded = Buffer.from(serviceAccount64, 'base64').toString('utf8');
    JSON.parse(decoded);
    console.log('  \x1b[32m✓\x1b[0m  FIREBASE_SERVICE_ACCOUNT (valid base64-encoded JSON)');
    passed++;
  } catch (e) {
    console.log('  \x1b[31m✗\x1b[0m  FIREBASE_SERVICE_ACCOUNT is NOT valid base64-encoded JSON');
    console.log(`     Hint: ${e.message}`);
    console.log('     Encode with: cat your-key.json | base64 -w 0');
    failed++;
    return;
  }

  if (!databaseURL || databaseURL.includes('YOUR_PROJECT_ID')) {
    console.log('  \x1b[31m✗\x1b[0m  FIREBASE_DATABASE_URL is missing or placeholder');
    failed++;
    return;
  }

  // Attempt actual Firebase connection
  try {
    const admin = require('firebase-admin');
    if (admin.apps.length === 0) {
      const decoded = Buffer.from(serviceAccount64, 'base64').toString('utf8');
      const serviceAccount = JSON.parse(decoded);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL
      });
    }
    const db = admin.database();
    // Write a small test record and read it back
    const testRef = db.ref('fintech/_setup_test');
    await testRef.set({ ts: Date.now(), status: 'ok' });
    const snap = await testRef.once('value');
    if (snap.val()?.status === 'ok') {
      console.log('  \x1b[32m✓\x1b[0m  Firebase Realtime Database (connected & read/write OK)');
      passed++;
    }
    await testRef.remove();
  } catch (e) {
    console.log('  \x1b[31m✗\x1b[0m  Firebase connection failed:', e.message);
    failed++;
  }
}

async function checkAnthropicKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.startsWith('PASTE_')) {
    console.log('  \x1b[33m⚠\x1b[0m  ANTHROPIC_API_KEY (missing — AI features disabled)');
    warnings++;
    return;
  }
  if (!key.startsWith('sk-ant-')) {
    console.log('  \x1b[31m✗\x1b[0m  ANTHROPIC_API_KEY format looks wrong (should start with sk-ant-)');
    failed++;
    return;
  }
  console.log('  \x1b[32m✓\x1b[0m  ANTHROPIC_API_KEY (format OK)');
  passed++;
}

async function main() {
  console.log('\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log('\x1b[36m  CarbonIQ FinTech — Setup Verification\x1b[0m');
  console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

  console.log('  Environment Variables:');
  check('NODE_ENV',              process.env.NODE_ENV, false);
  check('FINTECH_API_PORT',      process.env.FINTECH_API_PORT, false);
  check('DATA_ENCRYPTION_KEY',   process.env.DATA_ENCRYPTION_KEY);
  check('API_KEY_SALT',          process.env.API_KEY_SALT);
  check('WEBHOOK_SIGNING_SECRET',process.env.WEBHOOK_SIGNING_SECRET);
  check('DEV_API_KEY',           process.env.DEV_API_KEY, false);

  console.log('\n  Firebase:');
  check('FIREBASE_API_KEY',      process.env.FIREBASE_API_KEY, false);
  check('FIREBASE_DATABASE_URL', process.env.FIREBASE_DATABASE_URL, false);
  await checkFirebase();

  console.log('\n  Anthropic AI:');
  await checkAnthropicKey();

  console.log('\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log(`  Results: \x1b[32m${passed} passed\x1b[0m  \x1b[33m${warnings} warnings\x1b[0m  \x1b[31m${failed} failed\x1b[0m`);
  console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

  if (failed === 0) {
    console.log('  \x1b[32m✅ Setup looks good! You can run:\x1b[0m');
    console.log('     node scripts/create-api-key.js   ← create your first API key');
    console.log('     npm start                        ← start the server\n');
  } else {
    console.log('  \x1b[31m❌ Fix the issues above, then re-run this script.\x1b[0m\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\x1b[31m  Error during verification:\x1b[0m', err.message);
  process.exit(1);
});
