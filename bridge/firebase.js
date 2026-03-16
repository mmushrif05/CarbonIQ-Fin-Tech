/**
 * CarbonIQ FinTech — Firebase Bridge
 *
 * Connects to the SAME Firebase instance as the core platform.
 * Reads project data, tender scenarios, 80% records from existing paths.
 * Writes ONLY to /fintech/ paths (API keys, covenants, webhooks, taxonomy results).
 *
 * IMPORTANT: This module shares the Firebase Admin SDK instance.
 * Do NOT initialize a second Firebase app — reuse the existing one.
 */

const admin = require('firebase-admin');
const config = require('../config');

let initialized = false;

function initFirebase() {
  if (initialized || admin.apps.length > 0) {
    initialized = true;
    return;
  }

  if (!config.firebase.serviceAccount) {
    // No credentials — run without Firebase (frontend-only or test mode)
    console.warn('[Firebase] No service account — API routes requiring Firebase will return 503');
    initialized = true;
    return;
  }

  const serviceAccount = JSON.parse(
    Buffer.from(config.firebase.serviceAccount, 'base64').toString()
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: config.firebase.databaseURL
  });

  initialized = true;
  console.log('[Firebase] Initialized for FinTech API');
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
  const snapshot = await db.ref(`fintech/apiKeys/${hashedKey}`).once('value');
  return snapshot.val();
}

async function saveCovenantResult(projectId, covenantId, result) {
  const db = getDatabase();
  await db.ref(`fintech/covenants/${projectId}/${covenantId}`).update(result);
}

async function saveTaxonomyResult(projectId, result) {
  const db = getDatabase();
  const date = new Date().toISOString().split('T')[0];
  await db.ref(`fintech/taxonomyResults/${projectId}/${date}`).set(result);
}

async function savePortfolioSnapshot(orgId, snapshot) {
  const db = getDatabase();
  const date = new Date().toISOString().split('T')[0];
  await db.ref(`fintech/portfolioSnapshots/${orgId}/${date}`).set(snapshot);
}

module.exports = {
  initFirebase,
  getFirebaseAdmin,
  getDatabase,
  getProject,
  getProjectTenders,
  getProjectEntries,
  getApiKeyData,
  saveCovenantResult,
  saveTaxonomyResult,
  savePortfolioSnapshot
};
