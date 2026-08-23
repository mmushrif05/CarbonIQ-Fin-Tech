#!/usr/bin/env node
/**
 * Turn a Firebase service-account JSON into the three environment variables
 * this application needs — and report what they cost.
 *
 * AWS Lambda caps ALL environment variables for a function at 4KB combined.
 * Storing the whole account as base64 spends about 3KB of that on seven
 * fields nothing reads, and base64 inflates the secret by a third on top.
 * The SDK's cert() uses exactly three values, so those are what we store.
 *
 *   node scripts/firebase-env.js path/to/service-account.json
 *
 * Nothing is written anywhere and nothing is sent anywhere: the values are
 * printed for you to paste into your host's environment settings.
 */

'use strict';

const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/firebase-env.js <service-account.json>');
  process.exit(2);
}

let account;
try {
  account = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`Could not read ${file} as JSON: ${err.message}`);
  process.exit(1);
}

const missing = ['project_id', 'client_email', 'private_key'].filter(k => !account[k]);
if (missing.length) {
  console.error(`That file is missing ${missing.join(', ')} — is it a service-account key?`);
  process.exit(1);
}

/* Newlines are escaped so the value survives a single-line form field. The
   application normalises both forms when it reads it back. */
const vars = {
  FIREBASE_PROJECT_ID: account.project_id,
  FIREBASE_CLIENT_EMAIL: account.client_email,
  FIREBASE_PRIVATE_KEY: account.private_key.replace(/\n/g, '\\n')
};

const bytes = o => Object.entries(o)
  .reduce((n, [k, v]) => n + Buffer.byteLength(`${k}=${v}`, 'utf8'), 0);

const splitBytes = bytes(vars);
const blobBytes = bytes({
  FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(account)).toString('base64')
});

console.log('# Set these three, and REMOVE FIREBASE_SERVICE_ACCOUNT.\n');
for (const [k, v] of Object.entries(vars)) console.log(`${k}=${v}\n`);
console.log('# ---------------------------------------------------------------');
console.log(`# These three cost          ${splitBytes.toLocaleString()} bytes`);
console.log(`# FIREBASE_SERVICE_ACCOUNT costs ${blobBytes.toLocaleString()} bytes`);
console.log(`# Saving                    ${(blobBytes - splitBytes).toLocaleString()} bytes of the 4,096-byte AWS Lambda cap`);
console.log('#');
console.log('# Check the whole budget with: node scripts/env-budget.js');
