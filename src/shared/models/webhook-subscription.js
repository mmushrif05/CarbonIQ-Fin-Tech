// @ts-check
/**
 * A bank's webhook subscription: the stored record, and what is answered.
 *
 * This file was a `module.exports = {}` placeholder citing "Step 13" of a
 * build plan finished long ago. The record it was meant to declare has been
 * live since; it was declared nowhere, so the one fact about it that matters
 * most was also written down nowhere.
 *
 * **The stored record and the answered record are not the same shape, and that
 * is deliberate.** `signingSecret` is on the record and is returned exactly
 * once — at registration, and only when this system generated it, so the bank
 * can store it. It is never on a read: a subscription that hands its own HMAC
 * secret back on every `GET` is a secret that leaks to anything that can list
 * subscriptions, and the signature it protects then proves nothing.
 *
 * The two shapes are `WebhookSubscription` and `WebhookSubscriptionView`
 * below, and the second is not simply the first with fields hidden — it is
 * what a caller is allowed to see.
 */

'use strict';

/**
 * The events a bank may subscribe to. This list is also enforced by the Joi
 * schema at the HTTP boundary (`interface/schemas/webhooks.js`); it is
 * repeated here as the vocabulary rather than as a second gate, and a test
 * holds the two to each other so neither can grow alone.
 */
const WEBHOOK_EVENTS = Object.freeze([
  'score.completed',
  'score.updated',
  'covenant.breach',
  'covenant.warning',
  'portfolio.report_ready',
  'taxonomy.updated',
]);

/** How many times a delivery is attempted before the failure is recorded. */
const WEBHOOK_MAX_ATTEMPTS = 3;

/** How long a single delivery attempt is given. */
const WEBHOOK_TIMEOUT_MS = 10000;

/**
 * The stored record. `signingSecret` is on it and never leaves except at the
 * moment of registration.
 *
 * @typedef {object} WebhookSubscription
 * @property {string} subscriptionId  `wh_` + 24 hex characters
 * @property {string} orgId
 * @property {string} url             HTTPS only — enforced at the boundary
 * @property {string[]} events        a subset of `WEBHOOK_EVENTS`
 * @property {string} signingSecret   HMAC key for `X-CarbonIQ-Signature`
 * @property {boolean} active
 * @property {string} createdAt       ISO 8601
 * @property {number} deliveryCount   successful deliveries
 * @property {number} failureCount    attempts exhausted without a 2xx
 * @property {string} [lastDeliveredAt]
 * @property {string} [lastFailedAt]
 * @property {string} [lastError]
 * @property {Record<string, string>} [metadata]
 */

/**
 * What a caller sees. `signingSecret` is present **only** on the response to
 * the registration that generated it, and absent from every read thereafter.
 *
 * @typedef {object} WebhookSubscriptionView
 * @property {string} subscriptionId
 * @property {string} url
 * @property {string[]} events
 * @property {string} createdAt
 * @property {string} [signingSecret] once, at registration, if generated here
 */

/**
 * The headers every delivery carries. The signature covers the serialised
 * body, so a receiver must verify against the raw bytes it was sent rather
 * than a re-serialisation of the parsed object.
 *
 * @typedef {{
 *   'X-CarbonIQ-Signature': string,
 *   'X-CarbonIQ-Event': string
 * }} WebhookDeliveryHeaders
 */

module.exports = { WEBHOOK_EVENTS, WEBHOOK_MAX_ATTEMPTS, WEBHOOK_TIMEOUT_MS };
