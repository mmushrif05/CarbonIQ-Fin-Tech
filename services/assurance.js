/**
 * CarbonIQ FinTech — external assurance, declared or absent
 *
 * A data-quality score says how good the evidence behind a figure is. It does
 * not say whether anyone independent has checked it, and those are different
 * questions a reader conflates at their peril: a PCAF score of 1 on an
 * unaudited number and a score of 3 on an assured one carry different weight
 * in front of a regulator.
 *
 * Whether a figure has been audited cannot be computed from anything held
 * here. It is a **declared** fact in the sense services/report-integrity.js
 * uses the word — something only the reporting entity can state — and
 * inventing one is exactly the failure that module exists to prevent. So there
 * are three states and no fourth:
 *
 *   assured      the entity has recorded a provider, a standard and a level
 *   not_assured  the entity has stated that these figures are not assured
 *   not_declared nobody has said either way
 *
 * "Not declared" is deliberately not shown as "not assured". They are
 * different claims: one is a statement the entity has made, the other is the
 * absence of any statement, and a screen that renders the second as the first
 * is putting words in the entity's mouth.
 *
 * The baseline lives in data/assurance.json and declares nothing, so the
 * honest answer is what a deployment says before anyone has recorded anything.
 * An organisation's own record replaces it **entirely** — the same rule the
 * capital book follows, and for the same reason: a half-merged declaration is
 * a claim nobody made.
 */

'use strict';

const store = require('./partc-store');

const COLLECTION = 'assurance';
const DOC = 'default';

/** Deep-frozen, read once. A baseline has no business changing under a read. */
const BASELINE = Object.freeze(require('../data/assurance.json'));

const STATES = ['assured', 'not_assured', 'not_declared'];
const LEVELS = ['limited', 'reasonable'];
const SCOPES = ['financed', 'insurance'];

/** How a scope's declaration renders, in the register the screens use. */
function present(decl) {
  const d = decl || {};
  if (d.status === 'assured') {
    const parts = [];
    if (d.level) parts.push(`${d.level} assurance`);
    if (d.standard) parts.push(d.standard);
    if (d.provider) parts.push(d.provider);
    if (d.period) parts.push(d.period);
    return {
      status: 'assured',
      tone: 'good',
      label: 'Independently assured',
      detail: parts.length ? parts.join(' · ') : 'Assurance recorded without further detail.',
      declared: true,
    };
  }
  if (d.status === 'not_assured') {
    return {
      status: 'not_assured',
      tone: 'plain',
      label: 'Not independently assured',
      detail: d.note || 'The entity has stated that these figures carry no external assurance.',
      declared: true,
    };
  }
  return {
    status: 'not_declared',
    tone: 'quiet',
    label: 'Assurance not stated',
    /* Absent, with what it would take — the shape every other absent fact in
       this application is reported in. */
    detail: 'Whether these figures have been externally assured is a statement only the '
      + 'reporting entity can make. It has not been recorded.',
    declared: false,
  };
}

/**
 * The declaration in force for an organisation.
 *
 * @param {string} orgId
 * @returns {Promise<Object>} `{ source, scopes: { financed, insurance } }`
 */
async function read(orgId) {
  let recorded = null;
  try { recorded = await store.get(COLLECTION, orgId, DOC); } catch (_) { recorded = null; }

  const base = recorded && recorded.scopes ? recorded : BASELINE;
  const scopes = {};
  for (const key of SCOPES) {
    const decl = (base.scopes && base.scopes[key]) || {};
    scopes[key] = { ...present(decl), scope: key, scopeLabel: decl.label || key };
  }

  return {
    source: recorded && recorded.scopes ? 'recorded' : 'baseline',
    sourceNote: recorded && recorded.scopes
      ? 'Recorded by this organisation.'
      : 'No organisation record — nothing has been declared on this deployment.',
    scopes,
  };
}

/**
 * Record a declaration. Refused whole if any scope is malformed, because half
 * a declaration is a claim nobody made.
 */
async function save(orgId, input) {
  const scopes = {};
  for (const key of SCOPES) {
    const d = (input && input.scopes && input.scopes[key]) || {};
    const status = STATES.includes(d.status) ? d.status : 'not_declared';
    if (status === 'assured' && d.level && !LEVELS.includes(d.level)) {
      const err = new Error(`assurance level for ${key} must be one of: ${LEVELS.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
    scopes[key] = {
      status,
      label: (BASELINE.scopes[key] || {}).label,
      provider: d.provider || null,
      standard: d.standard || null,
      level: status === 'assured' ? (d.level || null) : null,
      period: d.period || null,
      note: d.note || null,
    };
  }
  const record = { id: DOC, orgId, version: '1.0', scopes, updatedAt: new Date().toISOString() };
  await store.put(COLLECTION, orgId, DOC, record);
  return read(orgId);
}

module.exports = { read, save, present, STATES, LEVELS, SCOPES, BASELINE };
