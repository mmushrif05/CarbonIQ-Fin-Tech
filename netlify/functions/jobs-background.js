/**
 * The background worker: drains the job queue for up to twelve minutes.
 *
 * A Netlify background function (the `-background` suffix) answers 202 at
 * once and may run for fifteen minutes — the room a portfolio roll-up or a
 * PDF over a real book needs, which a 26-second request does not have. The
 * API pokes it after every enqueue (JOBS_TOKEN, JOBS_URL); the scheduled
 * sweep pokes it when it finds work waiting. The token is shared, not
 * secret to a person: it stops the public from starting the worker at
 * will, and nothing more.
 */

'use strict';

require('../../src/jobs');
const config = require('../../src/platform/config');
const queue = require('../../src/platform/jobs/queue');
const worker = require('../../src/platform/jobs/worker');
const logger = require('../../src/platform/observability/logger');

const log = logger.for('netlify/functions/jobs-background');
const BUDGET_MS = 12 * 60 * 1000;

exports.handler = async (event) => {
  const given = (event.headers && (event.headers['x-jobs-token'] || event.headers['X-Jobs-Token'])) || '';
  if (!config.runtime.jobsToken || given !== config.runtime.jobsToken) {
    return { statusCode: 401, body: JSON.stringify({ error: 'JOBS_TOKEN_REQUIRED', message: 'The worker is started by the API, not by hand.' }) };
  }
  if (queue.mode() !== 'postgres') {
    return { statusCode: 200, body: JSON.stringify({ processed: 0, note: 'inline mode — jobs run inside the request that enqueued them' }) };
  }
  const result = await worker.drain({ workerId: worker.workerName('netlify-bg'), untilMs: Date.now() + BUDGET_MS });
  log.info(result, 'background drain finished');
  return { statusCode: 200, body: JSON.stringify(result) };
};
