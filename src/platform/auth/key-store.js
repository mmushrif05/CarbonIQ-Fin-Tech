// @ts-check
/**
 * Where API keys live — one interface, two homes.
 *
 * On a deployment with PostgreSQL configured, keys are rows in `api_keys`,
 * read and written through the storage seam like every other record, so
 * the one database the operator provisioned holds the credentials too.
 * Where PostgreSQL is not configured, keys stay where they have always
 * been, at `fintech/apiKeys/{hash}` in Firebase, and nothing moves.
 *
 * The interface is four verbs on a hashed key: get, set, update, list.
 * `api-key.js` (the middleware), `api-key-model.js` (issue, scope, rotate,
 * revoke) and the CLI all go through it, so none of them knows which home
 * a key is in.
 */

'use strict';

const store = require('../database/store');

/** Keys are looked up by hash, not by organisation, so they share one partition. */
const COLLECTION = 'api_keys';
const PARTITION = '_';
const FIREBASE_PATH = 'fintech/apiKeys';

function postgresKeyStore() {
  return {
    kind: 'postgres',
    get: hash => store.get(COLLECTION, PARTITION, hash),
    set: (hash, record) => store.put(COLLECTION, PARTITION, hash, record),
    update: (hash, patch) => store.patch(COLLECTION, PARTITION, hash, patch),
    list: async () => (await store.list(COLLECTION, PARTITION)).map(r => ({ hashedKey: r.id || null, ...r })),
    touch: hash => store.patch(COLLECTION, PARTITION, hash, { lastUsed: Date.now() }),
  };
}

function firebaseKeyStore(db) {
  const ref = hash => db.ref(hash ? `${FIREBASE_PATH}/${hash}` : FIREBASE_PATH);
  return {
    kind: 'firebase',
    get: async hash => (await ref(hash).once('value')).val() || null,
    set: (hash, record) => ref(hash).set(record),
    update: (hash, patch) => ref(hash).update(patch),
    list: async () => {
      const all = (await ref().once('value')).val() || {};
      return Object.entries(all).map(([hashedKey, r]) => ({ hashedKey, ...r }));
    },
    touch: hash => db.ref(`${FIREBASE_PATH}/${hash}/lastUsed`).set(Date.now()),
  };
}

/**
 * The key store for this deployment. PostgreSQL when it is the live store;
 * otherwise Firebase, which needs its database handle; otherwise null, and
 * the caller says so.
 */
function keyStoreFor({ firebaseDb } = /** @type {{firebaseDb?: any}} */ ({})) {
  if (store.capability().mode === 'postgres') return postgresKeyStore();
  if (firebaseDb) return firebaseKeyStore(firebaseDb);
  return null;
}

module.exports = { keyStoreFor, postgresKeyStore, firebaseKeyStore, COLLECTION, PARTITION, FIREBASE_PATH };
