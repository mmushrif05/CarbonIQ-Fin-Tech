// @ts-check
/**
 * The sector intensity band an exposure is checked against, resolved from the
 * baseline registry.
 *
 * The band is regional judgement — PCAF sets no plausibility test — so it
 * lives in the master baseline table, scoped global → country → organisation,
 * released by an administrator and superseded only with a recorded reason.
 * This module is the one place Part A reads it, and the engine stays pure: it
 * is handed a band with its provenance and reports the divergence, citing the
 * baseline version it was checked against.
 *
 * The band is applied on the way into the engine and is never written into
 * the stored input, so a recomputation reads the band in force *now* — which
 * is exactly what a newly released band is for — and the register still holds
 * what the bank keyed rather than what the registry said that day.
 */

'use strict';

const baselines = require('../../baseline/application/registry');
const { sectorBandsOf } = require('../../baseline/domain/metrics');
const { resolveSector } = require('../domain/sector-factors');

const METRIC = 'sector_intensity_tCO2e_per_million_revenue';
/* The reporting entity's market, where the request does not say. The band is
   in the reporting currency's terms, so it follows the entity, not the borrower. */
const DEFAULT_COUNTRY = 'LK';

/**
 * The engine input with `plausibility.sectorBand` filled from the registry,
 * where the caller supplied none and the borrower's sector is held. A band the
 * caller supplied stands, and says so.
 *
 * @template {Record<string, any>} T
 * @param {T} input
 * @param {{orgId?: string|null, country?: string|null}} [ctx]
 * @returns {Promise<T>}
 */
async function withSectorBand(input, ctx = {}) {
  const p = input.plausibility || {};
  if (p.sectorBand && Number.isFinite(Number(p.sectorBand.low)) && Number.isFinite(Number(p.sectorBand.high))) {
    return { ...input, plausibility: { ...p, sectorBand: { ...p.sectorBand, basis: p.sectorBand.basis || 'Supplied on the request; not a released baseline.' } } };
  }

  const cp = input.counterparty || {};
  const sec = resolveSector({ sectorKey: cp.sectorKey, sector: cp.sector });
  if (!sec.key) return input;

  const country = String(ctx.country || DEFAULT_COUNTRY).toUpperCase();
  const r = await baselines.effective(METRIC, { country, orgId: ctx.orgId || null });
  if (!r.resolved) return input;

  const band = sectorBandsOf(r.values)[sec.key];
  if (!band || !Number.isFinite(band.low) || !Number.isFinite(band.high)) return input;

  return {
    ...input,
    plausibility: {
      ...p,
      sectorBand: {
        low: band.low, high: band.high,
        sectorKey: sec.key,
        basis: r.basis,
        provisional: r.provisional,
        scope: r.scope, baselineId: r.baselineId, version: r.version,
      },
    },
  };
}

module.exports = { withSectorBand, METRIC, DEFAULT_COUNTRY };
