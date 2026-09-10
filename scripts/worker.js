#!/usr/bin/env node
// @ts-check
/**
 * A long-lived worker for the job queue — `npm run worker`.
 *
 * For a container or a VM beside the database: claims jobs as they arrive
 * and runs them with no ceiling but the machine's. On Netlify the same
 * loop runs inside the background function instead; see docs/JOBS.md.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('../src/jobs');
const queue = require('../src/platform/jobs/queue');
const worker = require('../src/platform/jobs/worker');

if (queue.mode() !== 'postgres') {
  process.stderr.write('The queue is inline (no DATABASE_URL, or JOBS_INLINE set): there is nothing for a worker to claim.\n');
  process.exit(1);
}

const run = worker.loop({ pollMs: Number(process.env.WORKER_POLL_MS) || 2000 });
const stop = () => run.stop().then(() => require('../src/platform/database/client').close()).then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
