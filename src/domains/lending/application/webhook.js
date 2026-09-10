/**
 * CarbonIQ FinTech — Webhook Service
 *
 * Manages webhook subscriptions (register / list / delete) on the storage
 * seam, and dispatches signed event payloads to subscriber URLs.
 *
 * Subscriptions used to be written straight to Firebase, past the seam, and
 * every entry point began by asking the bridge for a database handle and
 * throwing when there was none — so on a deployment holding its records in
 * PostgreSQL the whole feature answered "Database unavailable", which names
 * neither what is unavailable nor what to do about it. On the seam a
 * deployment that cannot persist is refused with a 503 naming DATABASE_URL,
 * and one on PostgreSQL simply works.
 *
 * Security: payloads are signed with HMAC-SHA256.
 * Delivery: up to 3 retries with exponential backoff (1s, 2s, 4s).
 */

const crypto = require('crypto');
const logger = require('../../../platform/observability/logger');
const { fallback } = logger;
const log = logger.for('domains/lending/application/webhook');
const store = require('../../../platform/database/store');
const config = require('../../../platform/config');

const COLLECTION = 'webhooks';

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

// ---------------------------------------------------------------------------
// Subscription management
// ---------------------------------------------------------------------------

/**
 * Register a webhook subscription for an org.
 *
 * @param {string} orgId
 * @param {Object} sub - { url, events, secret? }
 * @returns {Object} { subscriptionId, url, events, createdAt }
 */
async function registerWebhook(orgId, sub) {
  const subscriptionId = `wh_${crypto.randomBytes(12).toString('hex')}`;
  const signingSecret = sub.secret || crypto.randomBytes(24).toString('hex');
  const createdAt = new Date().toISOString();

  const record = {
    subscriptionId,
    orgId,
    url: sub.url,
    events: sub.events,
    signingSecret,
    active: true,
    createdAt,
    deliveryCount: 0,
    failureCount: 0
  };

  await store.put(COLLECTION, orgId, subscriptionId, record);

  // Return without exposing signingSecret unless it was user-supplied
  return {
    subscriptionId,
    url: sub.url,
    events: sub.events,
    createdAt,
    // Return the generated secret only once so the bank can store it
    signingSecret: sub.secret ? undefined : signingSecret
  };
}

/**
 * List all active webhook subscriptions for an org.
 *
 * @param {string} orgId
 * @returns {Object[]}
 */
async function listWebhooks(orgId) {
  const rows = await store.query(COLLECTION, orgId, { where: { active: true } });
  return rows.map(({ signingSecret: _s, ...safe }) => safe); // never return the secret
}

/**
 * Delete (deactivate) a webhook subscription.
 *
 * @param {string} subscriptionId
 * @param {string} orgId  — used to verify ownership
 * @returns {boolean}
 */
async function deleteWebhook(subscriptionId, orgId) {
  /* The read is scoped to the organisation by the partition, so a
     subscription belonging to somebody else is simply not found here. */
  const record = await store.get(COLLECTION, orgId, subscriptionId);
  if (!record) return false;

  await store.patch(COLLECTION, orgId, subscriptionId,
    { active: false, deletedAt: new Date().toISOString() });
  return true;
}

// ---------------------------------------------------------------------------
// Event dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch an event to all subscribed URLs for an org.
 * Non-blocking — errors are logged but not thrown.
 *
 * @param {string} orgId
 * @param {string} eventType - e.g. 'covenant.breach'
 * @param {Object} payload
 */
async function dispatchEvent(orgId, eventType, payload) {
  const subscriptions = await store.query(COLLECTION, orgId, { where: { active: true } })
    .catch(fallback('webhook.listSubscriptions', []));

  for (const record of subscriptions) {
    if (!Array.isArray(record.events) || !record.events.includes(eventType)) continue;

    _deliverWithRetry(orgId, record, eventType, payload).catch(err =>
      log.warn({ err, subscriptionId: record.subscriptionId, kind: logger.classify(err) }, 'webhook dispatch failed')
    );
  }
}

// ---------------------------------------------------------------------------
// Internal delivery
// ---------------------------------------------------------------------------

async function _deliverWithRetry(orgId, record, eventType, payload) {
  const body = JSON.stringify({
    event: eventType,
    sentAt: new Date().toISOString(),
    subscriptionId: record.subscriptionId,
    data: payload
  });

  const signature = _sign(body, record.signingSecret);
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await _sleep(BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
    }

    try {
      const res = await fetch(record.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CarbonIQ-Signature': signature,
          'X-CarbonIQ-Event': eventType
        },
        body,
        signal: AbortSignal.timeout(10000)
      });

      if (res.ok) {
        // Update delivery stats (fire-and-forget)
        store.patch(COLLECTION, orgId, record.subscriptionId, {
          deliveryCount: (record.deliveryCount || 0) + 1,
          lastDeliveredAt: new Date().toISOString()
        }).catch(fallback('webhook.recordDelivery'));
        return;
      }

      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
  }

  // All retries exhausted — record failure
  store.patch(COLLECTION, orgId, record.subscriptionId, {
    failureCount: (record.failureCount || 0) + 1,
    lastFailedAt: new Date().toISOString(),
    lastError: lastError ? lastError.message : 'Unknown'
  }).catch(fallback('webhook.recordFailure'));

  throw lastError;
}

function _sign(body, secret) {
  return 'sha256=' + crypto
    .createHmac('sha256', secret || config.webhooks.signingSecret || '')
    .update(body)
    .digest('hex');
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* `_sign` is exported so the suite asserts the signature this module
   produces rather than one the test computes for itself — the latter proves
   Node's crypto works and nothing about this code. */
module.exports = { registerWebhook, listWebhooks, deleteWebhook, dispatchEvent, _sign };
