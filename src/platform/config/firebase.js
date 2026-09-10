// @ts-check
/**
 * CarbonIQ FinTech — Firebase Admin Initialization
 *
 * Initializes Firebase Admin SDK for:
 *   - API key storage & lookup (Realtime Database)
 *   - Audit log persistence (future)
 *
 * In test environments, returns a mock database reference.
 */

const admin = require('firebase-admin');
const config = require('./index');

let db = null;

const initFirebase = () => {
  if (db) return db;

  // In test mode, return null — tests inject their own mocks
  if (config.env === 'test') {
    return null;
  }

  try {
    if (!admin.apps.length) {
      const initConfig = {
        databaseURL: config.firebase.databaseURL,
      };

      // Parse service account from base64-encoded env var
      if (config.firebase.serviceAccount) {
        try {
          const decoded = Buffer.from(config.firebase.serviceAccount, 'base64').toString('utf8');
          initConfig.credential = admin.credential.cert(JSON.parse(decoded));
        } catch (e) {
          require('../observability/logger').for('platform/config/firebase').warn('could not parse the service account; using application default credentials');
          initConfig.credential = admin.credential.applicationDefault();
        }
      }

      admin.initializeApp(initConfig);
    }

    db = admin.database();
    return db;
  } catch (err) {
    require('../observability/logger').for('platform/config/firebase').error({ err }, 'Firebase initialisation failed');
    return null;
  }
};

module.exports = { initFirebase };
