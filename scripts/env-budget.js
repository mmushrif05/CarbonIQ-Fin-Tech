#!/usr/bin/env node
/**
 * How much of the AWS Lambda environment budget is spent, and on what.
 *
 * AWS caps ALL environment variables for a function at 4KB combined.
 * Exceeding it does not fail the build — it fails the DEPLOY, at the upload
 * step, after Initializing and Building have both gone green:
 *
 *   Failed to create function: invalid parameter for function creation:
 *   Your environment variables exceed the 4KB limit imposed by AWS Lambda.
 *
 * Nothing in the application is wrong, so nothing in the application
 * reports it. This script makes the budget visible before a deploy does.
 *
 *   node scripts/env-budget.js            # measure the current environment
 *
 * Only names and byte counts are printed. No value is ever shown.
 */

'use strict';

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) { /* optional */ }

const LIMIT = 4096;

/* The host adds its own variables to the function at deploy time — Netlify
   injects roughly this many bytes of build and deploy metadata — and they
   count against the same cap. Measuring only our own variables would give a
   number that looks safe right up until the deploy fails. */
const HOST_RESERVE = 600;

/** Variables this application declares. Host-injected ones are excluded. */
const HOST_PREFIXES = /^(npm_|NODE_|PATH$|HOME$|PWD$|SHELL$|TERM$|LANG$|_$|HOSTNAME$|AWS_|LAMBDA_|NETLIFY|COMMIT_REF|CACHED_COMMIT_REF|BRANCH|HEAD|CONTEXT|DEPLOY_|SITE_|URL$|REPOSITORY_URL|PULL_REQUEST|REVIEW_ID|BUILD_ID|INCOMING_HOOK)/;

const APP_VARS = [
  'ALLOWED_ORIGINS', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'ANTHROPIC_VISION_MODEL',
  'ANTHROPIC_FAST_MODEL', 'ANTHROPIC_TIMEOUT_MS', 'ANTHROPIC_MAX_RETRIES',
  'API_KEY_SALT', 'API_KEY_DEFAULT_RATE_LIMIT', 'CORE_APP_URL', 'DATA_ENCRYPTION_KEY',
  'FINTECH_API_ENABLED', 'FINTECH_API_PORT', 'FIREBASE_API_KEY', 'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_DATABASE_URL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_PROJECT_ID',
  'FIREBASE_SERVICE_ACCOUNT', 'JWT_SECRET', 'LOG_LEVEL', 'LOG_VERBOSE', 'NODE_ENV',
  'PCAF_DEFAULT_ATTRIBUTION', 'PCAF_VERSION', 'SENTRY_DSN',
  'TAXONOMY_ASEAN_VERSION', 'TAXONOMY_EU_VERSION', 'TAXONOMY_HK_VERSION',
  'UI_API_KEY', 'WEBHOOK_MAX_RETRIES', 'WEBHOOK_SIGNING_SECRET', 'WEBHOOK_TIMEOUT_MS'
].concat(Object.keys(process.env).filter(k => /^FF_/.test(k)));

const rows = [...new Set(APP_VARS)]
  .filter(k => process.env[k] !== undefined && !HOST_PREFIXES.test(k))
  .map(k => ({ key: k, bytes: Buffer.byteLength(`${k}=${process.env[k]}`, 'utf8') }))
  .sort((a, b) => b.bytes - a.bytes);

const total = rows.reduce((n, r) => n + r.bytes, 0);
const projected = total + HOST_RESERVE;

console.log('AWS Lambda environment budget\n');
for (const r of rows) {
  const bar = '█'.repeat(Math.max(1, Math.round(r.bytes / 60)));
  console.log(`  ${String(r.bytes).padStart(5)}  ${r.key.padEnd(26)} ${bar}`);
}
console.log('  ' + '-'.repeat(60));
console.log(`  ${String(total).padStart(5)}  declared by this application`);
console.log(`  ${String(HOST_RESERVE).padStart(5)}  reserved for host-injected variables (estimate)`);
console.log(`  ${String(projected).padStart(5)}  projected total   of ${LIMIT} allowed\n`);

if (projected > LIMIT) {
  console.log(`OVER by ${projected - LIMIT} bytes. The deploy will fail at the upload step.`);
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('Largest saving available: replace FIREBASE_SERVICE_ACCOUNT with the three');
    console.log('split fields — node scripts/firebase-env.js <service-account.json>');
  }
  process.exit(1);
}
console.log(`${LIMIT - projected} bytes of headroom.`);
