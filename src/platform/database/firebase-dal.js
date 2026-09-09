/**
 * CarbonIQ FinTech — Firebase Data Access Layer
 *
 * Provides typed CRUD helpers for the FinTech-specific paths in
 * Firebase Realtime Database. All paths are under `fintech/`.
 *
 * Collections:
 *   fintech/apiKeys/{hashedKey}    — API key records
 *   fintech/scores/{id}            — Carbon Finance Score results
 *   fintech/pcaf/{id}              — PCAF output records
 *   fintech/covenants/{loanId}     — Covenant evaluation history
 *   fintech/portfolios/{id}        — Portfolio aggregation snapshots
 *   fintech/webhooks/{clientId}/{id} — Webhook subscriptions
 *   fintech/audit/{id}             — Persistent audit log entries
 */

const { v4: uuidv4 } = require('uuid');

class DataStore {
  /**
   * @param {import('firebase-admin').database.Database|null} db
   */
  constructor(db) {
    this.db = db;
  }

  // ---- Generic helpers ---------------------------------------------------

  async get(path) {
    if (!this.db) return null;
    const snapshot = await this.db.ref(path).once('value');
    return snapshot.val();
  }

  async set(path, data) {
    if (!this.db) return;
    await this.db.ref(path).set(data);
  }

  async update(path, data) {
    if (!this.db) return;
    await this.db.ref(path).update(data);
  }

  async remove(path) {
    if (!this.db) return;
    await this.db.ref(path).remove();
  }

  async push(path, data) {
    if (!this.db) return null;
    const ref = await this.db.ref(path).push(data);
    return ref.key;
  }

  // ---- Score Results -----------------------------------------------------

  async saveScore(result) {
    const id = result.id || uuidv4();
    const record = {
      ...result,
      id,
      createdAt: new Date().toISOString(),
    };
    await this.set(`fintech/scores/${id}`, record);
    return record;
  }

  async getScore(id) {
    return this.get(`fintech/scores/${id}`);
  }

  // ---- PCAF Output -------------------------------------------------------

  async savePcaf(result) {
    const id = result.id || uuidv4();
    const record = {
      ...result,
      id,
      createdAt: new Date().toISOString(),
    };
    await this.set(`fintech/pcaf/${id}`, record);
    return record;
  }

  async getPcaf(id) {
    return this.get(`fintech/pcaf/${id}`);
  }

  // ---- Covenant Evaluations ----------------------------------------------

  async saveCovenant(loanId, evaluation) {
    const id = uuidv4();
    const record = {
      ...evaluation,
      id,
      loanId,
      evaluatedAt: new Date().toISOString(),
    };
    await this.set(`fintech/covenants/${loanId}/${id}`, record);
    return record;
  }

  async getCovenantHistory(loanId) {
    return this.get(`fintech/covenants/${loanId}`);
  }

  // ---- Portfolio Snapshots -----------------------------------------------

  async savePortfolio(result) {
    const id = result.id || uuidv4();
    const record = {
      ...result,
      id,
      createdAt: new Date().toISOString(),
    };
    await this.set(`fintech/portfolios/${id}`, record);
    return record;
  }

  async getPortfolio(id) {
    return this.get(`fintech/portfolios/${id}`);
  }

  // ---- Webhooks ----------------------------------------------------------

  async saveWebhook(clientId, webhook) {
    const id = uuidv4();
    const record = {
      ...webhook,
      id,
      clientId,
      createdAt: new Date().toISOString(),
    };
    await this.set(`fintech/webhooks/${clientId}/${id}`, record);
    return record;
  }

  async getWebhooks(clientId) {
    return this.get(`fintech/webhooks/${clientId}`);
  }

  async getWebhook(clientId, webhookId) {
    return this.get(`fintech/webhooks/${clientId}/${webhookId}`);
  }

  async deleteWebhook(clientId, webhookId) {
    await this.remove(`fintech/webhooks/${clientId}/${webhookId}`);
  }

  // ---- Audit Log ---------------------------------------------------------

  async saveAuditEntry(entry) {
    return this.push('fintech/audit', {
      ...entry,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = DataStore;
