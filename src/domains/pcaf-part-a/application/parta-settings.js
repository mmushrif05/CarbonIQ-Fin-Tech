// @ts-check
/**
 * The reporting entity's own settings — the facts about itself a Part A
 * disclosure has to state and nothing in this system can derive.
 *
 * It is its own module rather than part of the register because it is a
 * different fact with a different owner: the register holds a bank's lending,
 * these settings hold the entity's claims about itself. Org-wide, one row per
 * organisation under the id 'default', so a base year — one claim about
 * history — cannot differ between two reporting years the way it could if it
 * sat on each year's book row.
 *
 * Two groups of facts live here, and both default to "not stated" on purpose:
 *
 *   The recalculation protocol Chapter 6 asks for — base year, significance
 *   threshold, the triggers, the policy.
 *
 *   The reporting entity and its boundary — the legal name, the consolidation
 *   approach (operational control, financial control or equity share), the
 *   fiscal year-end the position is taken at, the GWP basis the CO2e rests
 *   on, who prepared and who approved the disclosure, and which Part A asset
 *   classes are not reported and why (Chapter 6, p.162). A verifier under
 *   ISO 14064-3 cannot start without these, and a disclosure that printed a
 *   default in their place would be asserting a fact the entity never made.
 *
 * The legal name used to arrive on the query string of the disclosure route.
 * A reporting entity is not something a caller types into a URL; it is a fact
 * the entity records once. The query parameter survives as an override so no
 * existing caller breaks, and the settings are the source.
 */

'use strict';

const repo = require('../infrastructure/store');
const store = require('../../../platform/database/store');
const { RECALCULATION_TRIGGERS, DEFAULT_SIGNIFICANCE_THRESHOLD_PCT } = require('../domain/recalculation');
const climate = require('../domain/climate');

const _now = () => new Date().toISOString();

/** The three consolidation approaches the GHG Protocol and PCAF recognise. */
const CONSOLIDATION_APPROACHES = Object.freeze({
  operational_control: 'Operational control',
  financial_control: 'Financial control',
  equity_share: 'Equity share',
});

/** The ten Part A asset classes of the Third Edition, by section. */
const ASSET_CLASSES = Object.freeze([
  { assetClass: 'listed-equity-corporate-bonds', section: '§5.1', label: 'Listed equity and corporate bonds' },
  { assetClass: 'business-loans-unlisted-equity', section: '§5.2', label: 'Business loans and unlisted equity' },
  { assetClass: 'project-finance', section: '§5.3', label: 'Project finance' },
  { assetClass: 'commercial-real-estate', section: '§5.4', label: 'Commercial real estate' },
  { assetClass: 'mortgages', section: '§5.5', label: 'Mortgages' },
  { assetClass: 'motor-vehicle-loans', section: '§5.6', label: 'Motor vehicle loans' },
  { assetClass: 'use-of-proceeds', section: '§5.7', label: 'Use of proceeds' },
  { assetClass: 'securitizations', section: '§5.8', label: 'Securitizations and structured products' },
  { assetClass: 'sovereign-debt', section: '§5.9', label: 'Sovereign debt' },
  { assetClass: 'sub-sovereign-debt', section: '§5.10', label: 'Sub-sovereign debt' },
]);

/* The base year defaults to null on purpose: a base year is a claim about
   history and belongs to the entity, so where none is set the disclosure says
   so rather than implying the current year. The entity facts default to null
   for the same reason — a name, a boundary or an approver invented by software
   is not a statement the entity made. */
const DEFAULT_SETTINGS = Object.freeze({
  baseYear: null,
  significanceThresholdPct: DEFAULT_SIGNIFICANCE_THRESHOLD_PCT,
  recalculationTriggers: RECALCULATION_TRIGGERS,
  recalculationPolicy: '',

  reportingEntity: null,
  consolidationApproach: null,
  boundaryNote: '',
  fiscalYearEnd: null,
  gwpBasis: null,
  preparedBy: null,
  approvedBy: null,
  assetClassesNotReported: Object.freeze([]),

  /* The SLFRS S2 facts about the entity itself — governance, strategy, risk
     management, its own inventory and its targets. Empty by default for the
     same reason the boundary is: a governance paragraph invented by software
     is not a statement the entity made. */
  climate: Object.freeze({}),
});

/**
 * The entity's settings, merged over the defaults so a disclosure always has a
 * protocol to print and an entity block to answer from.
 */
async function getSettings(orgId) {
  const stored = await repo.getSettings(orgId);
  const settings = /** @type {any} */ ({ ...DEFAULT_SETTINGS, ...(stored || {}) });
  /* Derived on read rather than stored: provenance is a comparison against
     the shipped pack, so it cannot go stale and there is no second copy of
     the answer to keep in step. */
  settings.climateReadiness = climate.readiness(settings.climate);
  return settings;
}

const str = (v, max) => (v === null || v === undefined) ? null : String(v).trim().slice(0, max) || null;

/** A person: name and role, or null where neither is given. */
function person(p) {
  if (!p || typeof p !== 'object') return null;
  const name = str(p.name, 200);
  if (!name) return null;
  return { name, role: str(p.role, 200), date: str(p.date, 10) };
}

/**
 * Record the entity's settings. Only the named fields are accepted; anything
 * else is ignored rather than written, so this cannot become a second home for
 * a fact that belongs elsewhere.
 */
async function saveSettings(orgId, patch = {}) {
  store.assertWritable();
  const current = await getSettings(orgId);
  const merged = /** @type {any} */ ({ ...current });

  if ('baseYear' in patch) merged.baseYear = patch.baseYear === null ? null : Number(patch.baseYear);
  if ('significanceThresholdPct' in patch) merged.significanceThresholdPct = Number(patch.significanceThresholdPct);
  if ('recalculationTriggers' in patch && Array.isArray(patch.recalculationTriggers)) {
    merged.recalculationTriggers = patch.recalculationTriggers;
  }
  if ('recalculationPolicy' in patch) merged.recalculationPolicy = String(patch.recalculationPolicy || '');

  if ('reportingEntity' in patch) merged.reportingEntity = str(patch.reportingEntity, 200);
  if ('consolidationApproach' in patch) {
    const key = String(patch.consolidationApproach || '');
    merged.consolidationApproach = Object.prototype.hasOwnProperty.call(CONSOLIDATION_APPROACHES, key) ? key : null;
  }
  if ('boundaryNote' in patch) merged.boundaryNote = String(patch.boundaryNote || '').slice(0, 2000);
  if ('fiscalYearEnd' in patch) merged.fiscalYearEnd = /^\d{2}-\d{2}$/.test(String(patch.fiscalYearEnd || '')) ? String(patch.fiscalYearEnd) : null;
  if ('gwpBasis' in patch) merged.gwpBasis = str(patch.gwpBasis, 120);
  if ('preparedBy' in patch) merged.preparedBy = person(patch.preparedBy);
  if ('approvedBy' in patch) merged.approvedBy = person(patch.approvedBy);
  if ('assetClassesNotReported' in patch && Array.isArray(patch.assetClassesNotReported)) {
    const known = new Set(ASSET_CLASSES.map(c => c.assetClass));
    merged.assetClassesNotReported = patch.assetClassesNotReported
      .filter(x => x && known.has(x.assetClass) && str(x.reason, 500))
      .map(x => ({ assetClass: x.assetClass, reason: str(x.reason, 500) }));
  }

  /* Merged path by path rather than replaced, so a form showing one pillar
     can save it without clearing the other three. */
  if ('climate' in patch) merged.climate = climate.normalise(merged.climate || {}, patch.climate);

  /* Never stored: it is derived from what is, and a stored copy would be a
     second answer able to disagree with the first. */
  delete merged.climateReadiness;

  const record_ = { ...merged, id: 'default', orgId: String(orgId), updatedAt: _now() };
  await repo.saveSettings(orgId, record_);
  return getSettings(orgId);
}

/**
 * Record the shipped illustrative pack so a trial opens on a complete
 * disclosure rather than on a page of absences.
 *
 * It refuses over anything already recorded — `409 CLIMATE_NOT_EMPTY`, the
 * same shape as the starter book's refusal — because overwriting a paragraph
 * a bank wrote with one we wrote is the one thing this must never do. The
 * facts are recorded as themselves: nothing marks them, and nothing needs to,
 * because every document works out their provenance by comparing them with
 * the pack they came from.
 */
async function installIllustrativeClimate(orgId) {
  store.assertWritable();
  const current = await getSettings(orgId);
  if (!climate.isEmpty(current.climate)) {
    const err = /** @type {any} */ (new Error(
      'This organisation has already recorded climate facts, so the illustrative content was not loaded.'));
    err.statusCode = 409; err.code = 'CLIMATE_NOT_EMPTY';
    err.remedy = 'Edit the facts already held, or clear them first.';
    throw err;
  }
  const settings = await saveSettings(orgId, { climate: climate.ILLUSTRATIVE });
  return { installed: climate.ILLUSTRATIVE_ITEMS, settings };
}

module.exports = {
  DEFAULT_SETTINGS, CONSOLIDATION_APPROACHES, ASSET_CLASSES,
  getSettings, saveSettings, installIllustrativeClimate,
};
