// @ts-check
/**
 * CarbonIQ FinTech — Firebase Bridge
 *
 * Connects to the SAME Firebase instance as the core platform, and does two
 * things and no more:
 *
 * 1. **Reads the core engine** — `projects`, `tenders`, `entries`. Read-only,
 *    as `CLAUDE.md` requires: nothing here writes to core engine data.
 * 2. **Is the driver behind the seam's Firebase adapter** — the record verbs
 *    at the bottom of this file, and the connection every one of them needs.
 *
 * It used to be a third thing as well: a set of write helpers for lending
 * projects, monitoring entries, agent runs, pipeline runs and webhooks, each
 * opening with `const db = getDatabase(); if (!db) return;`. That is how a
 * deployment holding its records in PostgreSQL answered `POST /v1/projects`
 * with 201 Created and stored nothing — the seam that would have refused the
 * write was never consulted, because the write did not go through it.
 *
 * Those records now go through `src/platform/database/store.js` like every
 * other record in this repository. Nothing outside the seam and the core
 * engine reads may require this module, and `tests/data-layer.test.js` fails
 * the build when something does.
 *
 * IMPORTANT: This module shares the Firebase Admin SDK instance.
 * Do NOT initialize a second Firebase app — reuse the existing one.
 */

const admin = require('firebase-admin');
/* Required lazily: the logger reads config, and this file is loaded early. */
const log = () => require('../observability/logger').for('platform/bridge/firebase');
const config = require('../config');

let initialized = false;

function initFirebase() {
  if (initialized || admin.apps.length > 0) {
    initialized = true;
    return;
  }

  if (!config.firebase.serviceAccount) {
    // No credentials — run without Firebase (frontend-only or test mode)
    log().warn('no Firebase service account; routes that need Firebase answer 503');
    initialized = true;
    return;
  }

  let serviceAccount;
  try {
    const decoded = Buffer.from(config.firebase.serviceAccount, 'base64').toString('utf8');
    serviceAccount = JSON.parse(decoded);
  } catch (e) {
    log().error({ err: e, remedy: 'encode the service account JSON with: cat key.json | base64 -w 0' }, 'FIREBASE_SERVICE_ACCOUNT is not valid base64-encoded JSON');
    initialized = true;
    return;
  }

  if (!config.firebase.databaseURL) {
    log().error('FIREBASE_DATABASE_URL is not set; Firebase cannot initialise');
    initialized = true;
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: config.firebase.databaseURL
    });
    initialized = true;
    log().info('Firebase initialised');
  } catch (e) {
    log().error({ err: e }, 'Firebase initializeApp failed');
    initialized = true;
  }
}

function getFirebaseAdmin() {
  initFirebase();
  if (!admin.apps.length) return null;
  return admin;
}

function getDatabase() {
  initFirebase();
  if (!admin.apps.length) return null;
  return admin.database();
}

// ---------------------------------------------------------------------------
// Project Data Access (reads from existing paths)
// ---------------------------------------------------------------------------

async function getProject(projectId) {
  const db = getDatabase();
  if (!db) return null;
  const snapshot = await db.ref(`projects/${projectId}`).once('value');
  return snapshot.val();
}

async function getProjectTenders(projectId) {
  const db = getDatabase();
  if (!db) return null;
  const snapshot = await db.ref(`tenders/${projectId}`).once('value');
  return snapshot.val();
}

async function getProjectEntries(projectId) {
  const db = getDatabase();
  if (!db) return null;
  const snapshot = await db.ref(`entries/${projectId}`).once('value');
  return snapshot.val();
}

// ---------------------------------------------------------------------------
// FinTech Data Access (reads/writes to /fintech/ paths)
// ---------------------------------------------------------------------------

async function getApiKeyData(hashedKey) {
  const db = getDatabase();
  /* Every other reader here guards; this one did not, so on a deployment
     without Firebase — which is every deployment holding its keys in
     PostgreSQL — an API key lookup that reached this path threw
     "Cannot read properties of null" and answered 500. "No such key" is the
     true answer, and the caller already turns it into a 401. */
  if (!db) return null;
  const snapshot = await db.ref(`fintech/apiKeys/${hashedKey}`).once('value');
  return snapshot.val();
}

// ---------------------------------------------------------------------------
// The record verbs behind src/platform/database/adapters/firebase.js
//
// The `fintech/partc/` prefix is historical — these hold every collection the
// seam knows about, not only Part C's. It is left as it is because renaming
// it would strand every record an existing Firebase deployment holds, and a
// path is not worth that.
// ---------------------------------------------------------------------------

async function savePartCRecord(collection, orgId, id, record) {
  const db = getDatabase();
  if (!db) return;
  await db.ref(`fintech/partc/${orgId}/${collection}/${id}`).set(record);
}

async function getPartCRecord(collection, orgId, id) {
  const db = getDatabase();
  if (!db) return null;
  const snapshot = await db.ref(`fintech/partc/${orgId}/${collection}/${id}`).once('value');
  return snapshot.val();
}

async function listPartCRecords(collection, orgId, limit = 200) {
  const db = getDatabase();
  if (!db) return [];
  const snapshot = await db.ref(`fintech/partc/${orgId}/${collection}`).limitToLast(limit).once('value');
  const val = snapshot.val();
  return val ? Object.values(val) : [];
}

async function deletePartCRecord(collection, orgId, id) {
  const db = getDatabase();
  if (!db) return;
  await db.ref(`fintech/partc/${orgId}/${collection}/${id}`).remove();
}

module.exports = {
  initFirebase,
  getFirebaseAdmin,
  getDatabase,
  /* The core engine, read-only. */
  getProject,
  getProjectTenders,
  getProjectEntries,
  getApiKeyData,
  /* The driver behind src/platform/database/adapters/firebase.js. */
  savePartCRecord,
  getPartCRecord,
  listPartCRecords,
  deletePartCRecord,
};
