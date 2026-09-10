#!/usr/bin/env node
// @ts-check
/**
 * Walk the audit chain and recompute every hash.
 *
 *   npm run db:verify-audit
 *
 * Exit 0 when the chain verifies, 3 when it does not — with the sequence
 * number of the first row that fails and why.
 */

'use strict';

require('dotenv').config();
const db = require('../src/platform/database');

(async () => {
  if (!db.client.isConfigured()) { console.error('DATABASE_URL is not set.'); process.exit(2); }
  const r = await db.auditChain.verify();
  if (r.ok) console.log(`Audit chain verified: ${r.checked} event(s), unbroken.`);
  else { console.error(`Audit chain BROKEN at seq ${r.brokenAt} after ${r.checked} good event(s): ${r.reason}`); process.exitCode = 3; }
  await db.client.close();
})().catch(err => { console.error(err.message); process.exit(1); });
