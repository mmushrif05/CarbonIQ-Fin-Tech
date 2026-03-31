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

  let serviceAccount;
  try {
    const decoded = Buffer.from(config.firebase.serviceAccount, 'base64').toString('utf8');
    serviceAccount = JSON.parse(decoded);
  } catch (e) {
    console.error('[Firebase] FIREBASE_SERVICE_ACCOUNT is not valid base64-encoded JSON:', e.message);
    console.error('[Firebase] Hint: encode the service account JSON with: cat key.json | base64 -w 0');
    initialized = true;
    return;
  }

  if (!config.firebase.databaseURL) {
    console.error('[Firebase] FIREBASE_DATABASE_URL is not set — cannot initialize');
    initialized = true;
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: config.firebase.databaseURL
    });
    initialized = true;
    console.log('[Firebase] Initialized for FinTech API');
  } catch (e) {
    console.error('[Firebase] initializeApp failed:', e.message);
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

// ---------------------------------------------------------------------------
// Agent Run Persistence (reads/writes to /fintech/agentRuns/ paths)
// ---------------------------------------------------------------------------

async function saveAgentRun(orgId, run) {
  const db = getDatabase();
  if (!db) return;
  await db.ref(`fintech/agentRuns/${orgId}/${run.runId}`).set(run);
}

async function updateAgentRun(orgId, runId, updates) {
  const db = getDatabase();
  if (!db) return;
  await db.ref(`fintech/agentRuns/${orgId}/${runId}`).update(updates);
}

async function getAgentRun(orgId, runId) {
  const db = getDatabase();
  if (!db) return null;
  const snapshot = await db.ref(`fintech/agentRuns/${orgId}/${runId}`).once('value');
  return snapshot.val();
}

async function listAgentRuns(orgId, limit = 20) {
  const db = getDatabase();
  if (!db) return [];
  const snapshot = await db.ref(`fintech/agentRuns/${orgId}`)
    .orderByChild('createdAt')
    .limitToLast(limit)
    .once('value');
  const val = snapshot.val();
  if (!val) return [];
  return Object.values(val).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function saveProject(projectId, projectData) {
  const db = getDatabase();
  if (!db) return null;
  await db.ref(`fintech/projects/${projectId}`).set({ ...projectData, updatedAt: new Date().toISOString() });
  return projectId;
}

async function getFintechProject(projectId) {
  const db = getDatabase();
  if (!db) return null;
  const snapshot = await db.ref(`fintech/projects/${projectId}`).once('value');
  return snapshot.val();
}

async function listFintechProjects(orgId) {
  const db = getDatabase();
  if (!db) return [];
  const snapshot = await db.ref(`fintech/projects`).orderByChild('orgId').equalTo(orgId).once('value');
  const val = snapshot.val();
  if (!val) return [];
  return Object.entries(val).map(([id, data]) => ({ projectId: id, ...data }));
}

async function saveMonitoringEntry(projectId, year, entry) {
  const db = getDatabase();
  if (!db) return null;
  await db.ref(`fintech/monitoring/${projectId}/${year}`).set({ ...entry, savedAt: new Date().toISOString() });
}

async function listMonitoringEntries(projectId) {
  const db = getDatabase();
  if (!db) return [];
  const snapshot = await db.ref(`fintech/monitoring/${projectId}`).once('value');
  const val = snapshot.val();
  if (!val) return [];
  return Object.entries(val)
    .map(([year, data]) => ({ year: parseInt(year), ...data }))
    .sort((a, b) => a.year - b.year);
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
  savePortfolioSnapshot,
  saveAgentRun,
  updateAgentRun,
  getAgentRun,
  listAgentRuns,
  saveProject,
  getFintechProject,
  listFintechProjects,
  saveMonitoringEntry,
  listMonitoringEntries,
};
