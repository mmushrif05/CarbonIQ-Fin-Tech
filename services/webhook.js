/**
 * CarbonIQ FinTech — Webhook Service
 *
 * Manages webhook subscriptions (register / list / delete) in Firebase,
 * and dispatches signed event payloads to subscriber URLs.
 *
 * Security: payloads are signed with HMAC-SHA256.
 * Delivery: up to 3 retries with exponential backoff (1s, 2s, 4s).
 */

const crypto = require('crypto');
const { getDatabase } = require('../bridge/firebase');
const config = require('../config');

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
  const db = getDatabase();
  if (!db) throw new Error('Database unavailable');

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

  await db.ref(`fintech/webhooks/${subscriptionId}`).set(record);

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
  const db = getDatabase();
  if (!db) throw new Error('Database unavailable');

  const snap = await db.ref('fintech/webhooks')
    .orderByChild('orgId')
    .equalTo(orgId)
    .once('value');

  const all = snap.val() || {};
  return Object.values(all)
    .filter(w => w.active)
    .map(({ signingSecret: _s, ...safe }) => safe); // never return the secret
}

/**
 * Delete (deactivate) a webhook subscription.
 *
 * @param {string} subscriptionId
 * @param {string} orgId  — used to verify ownership
 * @returns {boolean}
 */
async function deleteWebhook(subscriptionId, orgId) {
  const db = getDatabase();
  if (!db) throw new Error('Database unavailable');

  const ref = db.ref(`fintech/webhooks/${subscriptionId}`);
  const snap = await ref.once('value');
  const record = snap.val();

  if (!record || record.orgId !== orgId) return false;

  await ref.update({ active: false, deletedAt: new Date().toISOString() });
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
  const db = getDatabase();
  if (!db) return;

  const snap = await db.ref('fintech/webhooks')
    .orderByChild('orgId')
    .equalTo(orgId)
    .once('value');

  const all = snap.val() || {};

  for (const record of Object.values(all)) {
    if (!record.active) continue;
    if (!record.events.includes(eventType)) continue;

    _deliverWithRetry(record, eventType, payload, db).catch(err =>
      console.error(`[WEBHOOK] Dispatch failed for ${record.subscriptionId}:`, err.message)
    );
  }
}

// ---------------------------------------------------------------------------
// Internal delivery
// ---------------------------------------------------------------------------

async function _deliverWithRetry(record, eventType, payload, db) {
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
        db.ref(`fintech/webhooks/${record.subscriptionId}`).update({
          deliveryCount: (record.deliveryCount || 0) + 1,
          lastDeliveredAt: new Date().toISOString()
        }).catch(() => {});
        return;
      }

      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
  }

  // All retries exhausted — record failure
  db.ref(`fintech/webhooks/${record.subscriptionId}`).update({
    failureCount: (record.failureCount || 0) + 1,
    lastFailedAt: new Date().toISOString(),
    lastError: lastError ? lastError.message : 'Unknown'
  }).catch(() => {});

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

module.exports = { registerWebhook, listWebhooks, deleteWebhook, dispatchEvent };
