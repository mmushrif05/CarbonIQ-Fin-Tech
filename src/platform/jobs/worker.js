// @ts-check
/**
 * The worker: claim, execute, repeat.
 *
 * Three ways to run it. `npm run worker` is a long-lived process for a
 * container. The Netlify background function drains the queue for up to
 * twelve minutes when the API pokes it. The scheduled sweep drains what it
 * can inside its own budget and pokes the background function for the rest.
 * All three call `drain()`; none of them computes anything the engines do
 * not.
 */

'use strict';

const os = require('os');
const queue = require('./queue');
const logger = require('../observability/logger');

const log = logger.for('platform/jobs/worker');

const workerName = prefix => `${prefix}-${os.hostname()}-${process.pid}`;

/** Claim and run one job. Resolves to the finished job, or null when the queue is empty. */
async function runOnce(workerId = workerName('worker')) {
  const job = await queue.claim(workerId);
  if (!job) return null;
  return queue.execute(job, { workerId });
}

/**
 * Run jobs until the queue is empty or the deadline passes.
 * @returns {Promise<{processed: number, succeeded: number, failed: number, stopped: 'empty'|'deadline'}>}
 */
async function drain({ workerId = workerName('drain'), untilMs = Date.now() + 20_000, maxJobs = Infinity } = {}) {
  const out = /** @type {{processed: number, succeeded: number, failed: number, stopped: 'empty'|'deadline'}} */ ({ processed: 0, succeeded: 0, failed: 0, stopped: 'empty' });
  await queue.requeueStale();
  while (out.processed < maxJobs) {
    if (Date.now() >= untilMs) { out.stopped = 'deadline'; break; }
    const job = await runOnce(workerId);
    if (!job) break;
    out.processed += 1;
    if (job.status === 'succeeded') out.succeeded += 1;
    else if (job.status === 'failed') out.failed += 1;
  }
  if (out.processed) log.info({ ...out, workerId }, 'drain finished');
  return out;
}

/** A long-lived loop, for `npm run worker`. Resolves when `stop()` is called. */
function loop({ workerId = workerName('worker'), pollMs = 2000 } = {}) {
  let running = true;
  let timer = null;
  const done = (async () => {
    log.info({ workerId, mode: queue.mode() }, 'worker started');
    while (running) {
      try {
        const r = await drain({ workerId, untilMs: Date.now() + 60_000 });
        if (r.processed === 0) await new Promise(resolve => { timer = setTimeout(resolve, pollMs); });
      } catch (err) {
        log.error({ err, kind: logger.classify(err) }, 'worker loop error');
        await new Promise(resolve => { timer = setTimeout(resolve, pollMs * 5); });
      }
    }
    log.info({ workerId }, 'worker stopped');
  })();
  return { stop: () => { running = false; if (timer) clearTimeout(timer); return done; }, done };
}

module.exports = { runOnce, drain, loop, workerName };
