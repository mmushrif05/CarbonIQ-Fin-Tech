/**
 * CarbonIQ FinTech — PCAF Part C: BOQ Revisions and Diff
 *
 * A bill of quantities changes: tender, then variation orders, then as-built.
 * Every state is a revision; an assessment binds to exactly one; and the
 * question that matters on each new revision is not "what changed in the BOQ"
 * but "did the disclosure move enough to restate a figure already published".
 *
 * Two things this module is careful about:
 *
 *   Mapping carry-forward — a revision inherits the resolved factor keys of
 *   the revision before it, matched on the line's own wording. An eleven-line
 *   revision to a ten-line BOQ leaves one line to review, not eleven.
 *
 *   Attributable deltas — when comparing revisions, every non-BOQ input is
 *   held constant, so the movement is caused by the BOQ and nothing else.
 */

'use strict';

const crypto = require('crypto');
const store  = require('./partc-store');
const { runPartC } = require('./pcaf-partc');

const COLLECTION = 'boqRevisions';

const _id = () => `boq_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const _now = () => new Date().toISOString();

/**
 * Match key for a line across revisions.
 *
 * A revision exists BECAUSE quantities changed, so the key must ignore them:
 * keying on the raw pasted text would mean a line never matched its own
 * earlier self and carry-forward would fail in exactly the case it is for.
 * Trailing quantity, unit and dot-leaders are stripped before comparison.
 */
function normaliseKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s.·–—-]*[\d,]+(?:\.\d+)?\s*(m3|m2|m|mt|kg|nr)\s*$/i, '') // trailing qty + unit
    .replace(/[\s.·]+$/, '')                                                  // dot leaders
    .replace(/\s+/g, ' ')
    .trim();
}

function lineKey(item) {
  return normaliseKey(item.sourceText || item.name || '');
}

/**
 * Every key a line can be recognised by. Indexing on both its wording and its
 * resolved name lets a client's pasted description match a line that was
 * stored under a tidier name, and vice versa.
 */
function lineKeys(item) {
  return [...new Set([normaliseKey(item.sourceText), normaliseKey(item.name)].filter(Boolean))];
}

/** The mapping fields a line carries; what carry-forward preserves. */
const MAPPING_FIELDS = ['densityKey', 'massFactorKey', 'massFactor', 'wasteCategory', 'serviceLifeCategory'];

/**
 * The stable identifier a line keeps across revisions.
 *
 * Haul distances are keyed by material id. If a revision restates a line
 * without its id — which is exactly what happens when a client re-pastes an
 * amended BOQ — the distance no longer binds and that material's A4 silently
 * collapses to zero. Carrying the id forward with the mapping prevents a
 * variation order from quietly deleting transport emissions.
 *
 * The haul distance travels with the line for the same reason: a client who
 * re-pastes an amended BOQ should not lose the distances they already gave.
 */
const IDENTITY_FIELDS = ['id', 'sourceText', 'distance'];

function hasMapping(item) {
  return MAPPING_FIELDS.some(f => item[f] !== undefined && item[f] !== null && item[f] !== '');
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

async function listRevisions(orgId, projectId) {
  const all = await store.list(COLLECTION, orgId, { limit: 500 });
  return all
    .filter(r => r.projectId === projectId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

async function getRevision(orgId, revisionId) {
  return store.get(COLLECTION, orgId, revisionId);
}

async function latestRevision(orgId, projectId) {
  const list = await listRevisions(orgId, projectId);
  return list.length ? list[list.length - 1] : null;
}

/**
 * Carry mappings forward from the previous revision onto lines that arrive
 * unmapped, and report which lines still need a human.
 */
function carryForwardMappings(items = [], previousItems = []) {
  const prior = new Map();
  for (const p of previousItems) {
    for (const k of lineKeys(p)) if (!prior.has(k)) prior.set(k, p);
  }
  const findPrior = item => lineKeys(item).map(k => prior.get(k)).find(Boolean);

  let inherited = 0;
  const enriched = items.map(item => {
    const match = findPrior(item);
    if (!match) return item;

    // Identity is carried even when the line already arrives mapped, so a
    // re-pasted line keeps the id its haul distance is bound to.
    const carried = { ...item };
    for (const f of IDENTITY_FIELDS) {
      if ((carried[f] === undefined || carried[f] === null || carried[f] === '') &&
          match[f] !== undefined && match[f] !== null && match[f] !== '') {
        carried[f] = match[f];
      }
    }

    if (hasMapping(item)) return carried;

    inherited++;
    carried.mappingInheritedFrom = match.id || match.name || null;
    for (const f of MAPPING_FIELDS) {
      if (match[f] !== undefined && match[f] !== null && match[f] !== '') carried[f] = match[f];
    }
    if (!carried.confidence) carried.confidence = match.confidence || 'medium';
    return carried;
  });

  return {
    items: enriched,
    inherited,
    needsReview: enriched.filter(i => !hasMapping(i)).map(i => i.name || i.sourceText)
  };
}

/**
 * Create a revision. Labels auto-increment (R1, R2 …) and mappings are
 * inherited from the previous revision unless the caller supplied them.
 */
async function createRevision(orgId, projectId, data) {
  const existing = await listRevisions(orgId, projectId);
  const previous = existing.length ? existing[existing.length - 1] : null;

  const mats = carryForwardMappings(data.materials || [], previous ? previous.materials || [] : []);
  const demo = carryForwardMappings(data.demolitionItems || [], previous ? previous.demolitionItems || [] : []);

  const record = {
    revisionId: _id(),
    projectId, orgId,
    label: data.label || `R${existing.length + 1}`,
    note: data.note || '',
    source: data.source || 'paste',
    sourceRef: data.sourceRef || '',
    materials: mats.items,
    demolitionItems: demo.items,
    supersedes: previous ? previous.revisionId : null,
    mappingCarryForward: {
      inheritedLines: mats.inherited + demo.inherited,
      needsReview: [...mats.needsReview, ...demo.needsReview],
      fromRevision: previous ? previous.label : null
    },
    createdBy: data.createdBy || '',
    createdAt: _now()
  };

  await store.put(COLLECTION, orgId, record.revisionId, record);
  return record;
}

async function deleteRevision(orgId, revisionId) {
  await store.remove(COLLECTION, orgId, revisionId);
  return { deleted: true, revisionId };
}

// ---------------------------------------------------------------------------
// Line-level diff
// ---------------------------------------------------------------------------

/**
 * @returns {{added:[], removed:[], changed:[], unchanged:number}}
 */
function diffLines(fromItems = [], toItems = []) {
  const fromMap = new Map(fromItems.map(i => [lineKey(i), i]));
  const toMap   = new Map(toItems.map(i => [lineKey(i), i]));

  const added = [], removed = [], changed = [];
  let unchanged = 0;

  for (const [key, to] of toMap) {
    const from = fromMap.get(key);
    if (!from) { added.push({ name: to.name, quantity: to.quantity, unit: to.unit }); continue; }

    const fields = [];
    if (Number(from.quantity) !== Number(to.quantity)) {
      const delta = Number(to.quantity) - Number(from.quantity);
      fields.push({
        field: 'quantity', from: from.quantity, to: to.quantity, delta,
        deltaPct: Number(from.quantity) ? (delta / Number(from.quantity)) * 100 : null
      });
    }
    if (from.unit !== to.unit) fields.push({ field: 'unit', from: from.unit, to: to.unit });
    for (const f of MAPPING_FIELDS) {
      if ((from[f] ?? null) !== (to[f] ?? null)) fields.push({ field: f, from: from[f] ?? null, to: to[f] ?? null });
    }

    if (fields.length) changed.push({ name: to.name, fields });
    else unchanged++;
  }

  for (const [key, from] of fromMap) {
    if (!toMap.has(key)) removed.push({ name: from.name, quantity: from.quantity, unit: from.unit });
  }

  return { added, removed, changed, unchanged };
}

// ---------------------------------------------------------------------------
// Emissions delta and materiality
// ---------------------------------------------------------------------------

const MODULE_LABELS = {
  A4: 'Transport to site', 'A5.1': 'Demolition', 'A5.2': 'Site energy', 'A5.3': 'Waste'
};

function _moduleValues(result) {
  const out = { A4: result.modules.a4.value };
  for (const b of result.modules.a5Breakdown) out[b.module] = b.value;
  return out;
}

/**
 * Compare two revisions with every non-BOQ input held constant.
 *
 * @param {Object} params
 * @param {Object} params.from            revision record
 * @param {Object} params.to              revision record
 * @param {Object} params.enginePolicy    from the registry
 * @param {Object} params.siteInputs      gifa, distances to tip, previous project
 * @param {Object} params.distances       per-material haul distances
 * @param {number} params.thresholdPct    restatement materiality, default 5
 */
function compareRevisions({ from, to, enginePolicy, siteInputs = {}, distances = {}, thresholdPct = 5 }) {
  const runFor = rev => runPartC({
    policy: enginePolicy,
    materials: rev.materials || [],
    distances,
    siteInputs: { ...siteInputs, demolitionItems: rev.demolitionItems || [] }
  });

  const beforeResult = runFor(from);
  const afterResult  = runFor(to);

  const before = beforeResult.summary.construction_kgCO2e;
  const after  = afterResult.summary.construction_kgCO2e;
  const deltaKg  = after - before;
  const deltaPct = before > 0 ? (deltaKg / before) * 100 : 0;

  const beforeModules = _moduleValues(beforeResult);
  const afterModules  = _moduleValues(afterResult);

  const byModule = Object.keys(afterModules).map(m => {
    const d = (afterModules[m] || 0) - (beforeModules[m] || 0);
    return {
      module: m, label: MODULE_LABELS[m] || m,
      before: beforeModules[m] || 0, after: afterModules[m] || 0,
      delta: d,
      shareOfFigure: after > 0 ? ((afterModules[m] || 0) / after) * 100 : 0
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const breaches = Math.abs(deltaPct) >= thresholdPct;

  return {
    lines: diffLines(from.materials, to.materials),
    demolitionLines: diffLines(from.demolitionItems, to.demolitionItems),
    emissions: {
      before, after, deltaKg, deltaPct,
      beforeIAE: beforeResult.summary.insurerIAE_tCO2e,
      afterIAE:  afterResult.summary.insurerIAE_tCO2e
    },
    byModule,
    materiality: {
      thresholdPct, breaches,
      requiresRestatement: breaches,
      verdict: breaches
        ? `Movement of ${deltaPct.toFixed(2)}% reaches the ${thresholdPct}% threshold. A locked assessment for this year must be restated.`
        : `Movement of ${deltaPct.toFixed(2)}% is below the ${thresholdPct}% threshold. Any locked assessment stands as disclosed.`
    },
    explanation: explainDelta({ deltaPct, byModule, after }),
    from: { revisionId: from.revisionId, label: from.label, note: from.note, lines: (from.materials || []).length },
    to:   { revisionId: to.revisionId,   label: to.label,   note: to.note,   lines: (to.materials || []).length }
  };
}

/**
 * Say why the figure moved as little or as much as it did.
 *
 * Without this the app reports "+0.39%" and leaves the user wondering whether
 * their variation order registered at all. It usually did — it is simply that
 * site energy dominates the construction figure, so material quantities move
 * it very little.
 */
function explainDelta({ deltaPct, byModule, after }) {
  const moved = byModule.filter(m => Math.abs(m.delta) > 0.0001);
  const dominant = [...byModule].sort((a, b) => b.shareOfFigure - a.shareOfFigure)[0];

  if (moved.length === 0) {
    return { headline: 'No change to the disclosed figure.',
             detail: 'The revision did not alter any quantity, unit or mapping that feeds the calculation.' };
  }

  const movedNames = moved.map(m => `${m.module} ${m.delta >= 0 ? '+' : ''}${m.delta.toFixed(2)} kgCO2e`).join(', ');
  const dominantUnmoved = dominant && Math.abs(dominant.delta) < 0.0001;

  if (Math.abs(deltaPct) < 1 && dominantUnmoved) {
    return {
      headline: `The revision changed ${moved.length} module${moved.length === 1 ? '' : 's'} but moved the figure by only ${deltaPct.toFixed(2)}%.`,
      detail: `${movedNames}. ${dominant.module} (${dominant.label}) is ${dominant.shareOfFigure.toFixed(1)}% of the construction figure and was not affected by this revision, so material quantity changes move the total very little. A change to floor area or the site-energy basis would move it far more.`
    };
  }

  return {
    headline: `The figure moved ${deltaPct >= 0 ? 'up' : 'down'} by ${Math.abs(deltaPct).toFixed(2)}%.`,
    detail: `${movedNames}. ${dominant ? `${dominant.module} (${dominant.label}) carries ${dominant.shareOfFigure.toFixed(1)}% of the figure.` : ''}`.trim()
  };
}

module.exports = {
  createRevision, listRevisions, getRevision, latestRevision, deleteRevision,
  compareRevisions, diffLines, carryForwardMappings, lineKey, lineKeys,
  normaliseKey, explainDelta, COLLECTION
};
