// @ts-check
/**
 * The reporting entity's own settings — the recalculation protocol Chapter 6
 * asks a §5.2 disclosure to state.
 *
 * It is its own module rather than part of the register because it is a
 * different fact with a different owner: the register holds a bank's lending,
 * these settings hold the entity's claims about how it recalculates. Org-wide,
 * one row per organisation under the id 'default', so a base year — one claim
 * about history — cannot differ between two reporting years the way it could
 * if it sat on each year's book row.
 */

'use strict';

const repo = require('../infrastructure/store');
const store = require('../../../platform/database/store');
const { RECALCULATION_TRIGGERS, DEFAULT_SIGNIFICANCE_THRESHOLD_PCT } = require('../domain/recalculation');

const _now = () => new Date().toISOString();

/* The base year defaults to null on purpose: a base year is a claim about
   history and belongs to the entity, so where none is set the disclosure says
   so rather than implying the current year. */
const DEFAULT_SETTINGS = Object.freeze({
  baseYear: null,
  significanceThresholdPct: DEFAULT_SIGNIFICANCE_THRESHOLD_PCT,
  recalculationTriggers: RECALCULATION_TRIGGERS,
  recalculationPolicy: '',
});

/**
 * The entity's settings, merged over the defaults so a disclosure always has a
 * protocol to print.
 */
async function getSettings(orgId) {
  const stored = await repo.getSettings(orgId);
  return { ...DEFAULT_SETTINGS, ...(stored || {}) };
}

/**
 * Record the entity's settings. Only the recalculation-protocol fields are
 * accepted; anything else is ignored rather than written, so this cannot
 * become a second home for a fact that belongs elsewhere.
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
  const record_ = { ...merged, id: 'default', orgId: String(orgId), updatedAt: _now() };
  await repo.saveSettings(orgId, record_);
  return getSettings(orgId);
}

module.exports = { DEFAULT_SETTINGS, getSettings, saveSettings };
