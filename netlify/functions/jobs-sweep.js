// @ts-check
/**
 * The sweep: every ten minutes, look at the queue.
 *
 * A job whose poke was lost, or that failed and is waiting its backoff, or
 * whose worker died, is picked up here. With JOBS_TOKEN set the sweep pokes
 * the background worker, which has the time; without it the sweep drains
 * what it can inside its own budget, so a deployment that configured
 * nothing still works its queue — slowly, and /health says `worker: sweep`.
 */

'use strict';

const { schedule } = require('@netlify/functions');
require('../../src/jobs');
const config = require('../../src/platform/config');
const queue = require('../../src/platform/jobs/queue');
const worker = require('../../src/platform/jobs/worker');
const logger = require('../../src/platform/observability/logger');

const log = logger.for('netlify/functions/jobs-sweep');
const OWN_BUDGET_MS = 20 * 1000;

async function sweep() {
  if (queue.mode() !== 'postgres') return { skipped: 'inline mode' };
  const requeued = await queue.requeueStale();
  const counts = await queue.counts();
  if (!counts.queued) return { requeued, queued: 0 };
  if (config.runtime.jobsToken && config.runtime.siteUrl) {
    const poked = await queue.poke();
    if (poked) return { requeued, queued: counts.queued, poked: true };
  }
  const result = await worker.drain({ workerId: worker.workerName('netlify-sweep'), untilMs: Date.now() + OWN_BUDGET_MS });
  return { requeued, queued: counts.queued, poked: false, ...result };
}

exports.handler = schedule('*/10 * * * *', async () => {
  const result = await sweep();
  log.info(result, 'sweep finished');
  return { statusCode: 200 };
});
exports.sweep = sweep;
