// @ts-check
/**
 * A rate limit that is actually a limit.
 *
 * `express-rate-limit`'s default store is a `Map` in one process. Production
 * is a Lambda that scales horizontally, so each container kept its own
 * counter and every per-key limit was really a per-container limit — which
 * matters most on the assess and agent routes, because those front paid model
 * calls, and a limit that multiplies by however many containers the platform
 * decided to start is not a ceiling on anything.
 *
 * Where PostgreSQL is the store, the counter is a row and the limit holds
 * across every container at once. Where it is not, the process-local store
 * remains — and `describe()` says so, rather than letting a deployment
 * believe it has a guarantee it does not.
 *
 * The window is part of the key, so a new window is a new row: there is no
 * reset to get wrong, and expiry is a delete.
 */

'use strict';

const client = require('../database/client');
const store = require('../database/store');
const logger = require('../observability/logger');

const log = logger.for('platform/http/rate-limit-store');

/** Sweep expired rows about once in every this-many increments. */
const SWEEP_EVERY = 200;

/** Whether the shared counter is available on this deployment. */
function shared() {
  return client.isConfigured() && store.capability().mode === 'postgres';
}

/** What this deployment's limits actually cover, for /health and the docs. */
function describe() {
  return shared()
    ? { scope: 'deployment', backing: 'postgres', note: 'One counter per key across every instance.' }
    : {
      scope: 'process',
      backing: 'memory',
      note: 'Counters are per process. On a platform that runs more than one, the effective limit is this figure times the number of instances.',
    };
}

/**
 * An `express-rate-limit` v7 store backed by one row per key per window.
 * @param {{prefix?: string}} [opts]
 */
function postgresStore({ prefix = 'rl' } = {}) {
  let windowMs = 60_000;
  let calls = 0;

  const bucketFor = key => {
    const window = Math.floor(Date.now() / windowMs);
    return `${prefix}:${window}:${key}`;
  };
  const resetTimeFor = () => new Date((Math.floor(Date.now() / windowMs) + 1) * windowMs);

  async function sweep() {
    await client.query('DELETE FROM rate_limits WHERE reset_at < now()')
      .catch(logger.fallback('limiter.sweep', undefined));
  }

  return {
    localKeys: false,

    init(options) {
      if (options && options.windowMs) windowMs = options.windowMs;
    },

    /**
     * One statement, atomic by construction: the insert either creates the
     * row or increments it, and returns the value it settled on. Two
     * containers racing cannot both read 4 and both write 5.
     */
    async increment(key) {
      const resetTime = resetTimeFor();
      try {
        const { rows } = await client.query(
          `INSERT INTO rate_limits (bucket, hits, reset_at) VALUES ($1, 1, $2)
           ON CONFLICT (bucket) DO UPDATE SET hits = rate_limits.hits + 1
           RETURNING hits`,
          [bucketFor(key), resetTime]);
        calls += 1;
        if (calls % SWEEP_EVERY === 0) await sweep();
        return { totalHits: Number(rows[0].hits), resetTime };
      } catch (err) {
        /* A counter that cannot be read must not become a closed door. The
           request is allowed and the failure is counted, because refusing
           every request when the limiter's table is unreachable turns a
           throttle into an outage. */
        log.warn({ err }, 'rate-limit counter unavailable — allowing the request');
        return { totalHits: 1, resetTime };
      }
    },

    async decrement(key) {
      await client.query(
        'UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE bucket = $1', [bucketFor(key)])
        .catch(logger.fallback('limiter.decrement', undefined));
    },

    async resetKey(key) {
      await client.query('DELETE FROM rate_limits WHERE bucket = $1', [bucketFor(key)])
        .catch(logger.fallback('limiter.resetKey', undefined));
    },

    async resetAll() {
      await client.query('DELETE FROM rate_limits')
        .catch(logger.fallback('limiter.resetAll', undefined));
    },
  };
}

/**
 * The store for this deployment, or `undefined` to leave the library on its
 * own in-process default.
 */
function storeFor(prefix) {
  return shared() ? postgresStore({ prefix }) : undefined;
}

module.exports = { storeFor, postgresStore, shared, describe };
