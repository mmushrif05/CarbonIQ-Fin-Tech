// @ts-check
/**
 * The Option 3 sector factor library, and the vocabulary it is keyed to.
 *
 * PCAF Part A §5.2 (p.62) asks that an emission factor be as consistent as
 * possible with the primary business activity financed — a paddy-rice factor,
 * not an agriculture factor. So a factor is resolved by a **sector key** from
 * a closed vocabulary (`data/pcaf-parta/sectors.json`), and a borrower whose
 * sector is not held gets no factor and a reason, never the nearest neighbour.
 *
 * Three rules, each because the alternative is a unit error nobody sees:
 *
 *   A factor held in one currency is never applied to an exposure in another.
 *   The table says which currency it is in; an exposure in a different one is
 *   reported absent with the reason.
 *
 *   The table holds figures per million units of currency, because that is
 *   how a person reads and checks them; the equation runs per unit, and the
 *   trace carries both so a reviewer can follow the conversion.
 *
 *   Option 3b's per-assets factor is derived from the per-revenue factor and
 *   the sector's asset turnover — GHG ÷ revenue × revenue ÷ assets — rather
 *   than held as a second number that could disagree with the first.
 *
 * Every row of the shipped table is provisional and says so; a run that uses
 * one carries the table, its version and its checksum, so a disclosure names
 * the factor set it rests on.
 */

'use strict';

const { SECTORS, SECTOR_FACTORS } = require('./reference');
const { checksum } = require('../../../shared/checksum');

const VOCAB = SECTORS;
const TABLE = SECTOR_FACTORS;

/** Every alias, the key itself and the label, lower-cased, to the sector key. */
const BY_NAME = new Map();
for (const [key, s] of Object.entries(VOCAB.sectors)) {
  BY_NAME.set(key, key);
  BY_NAME.set(s.label.toLowerCase(), key);
  for (const a of s.aliases) BY_NAME.set(String(a).toLowerCase(), key);
}

const heldList = () => Object.keys(VOCAB.sectors).join(', ');

/**
 * Which held sector a borrower is in, and how that was decided.
 *
 * @param {{sectorKey?: string|null, sector?: string|null}} cp
 * @returns {{key: string|null, via: 'key'|'name'|null, label: string|null, assumptions: string[], reason?: string}}
 */
function resolveSector({ sectorKey, sector } = {}) {
  if (sectorKey) {
    const s = VOCAB.sectors[sectorKey];
    if (s) return { key: sectorKey, via: 'key', label: s.label, assumptions: [] };
    return { key: null, via: null, label: null, assumptions: [],
      reason: `"${sectorKey}" is not a sector in the vocabulary. Held: ${heldList()}.` };
  }
  if (sector && String(sector).trim()) {
    const key = BY_NAME.get(String(sector).trim().toLowerCase());
    if (key) {
      const s = VOCAB.sectors[key];
      return { key, via: 'name', label: s.label, assumptions: [
        `Sector "${sector}" mapped to ${key} (${s.label}, ISIC ${s.isic}) by name. State counterparty.sectorKey to make the mapping explicit.`,
      ] };
    }
    return { key: null, via: null, label: null, assumptions: [],
      reason: `Sector "${sector}" matches no held sector by name. Held: ${heldList()}.` };
  }
  return { key: null, via: null, label: null, assumptions: [], reason: 'No sector is stated for the borrower.' };
}

/**
 * The factor for one scope of one borrower, from the library — or absent
 * with the reason and what would settle it.
 *
 * @param {Object} q
 * @param {string|null} [q.sectorKey]
 * @param {string|null} [q.sector]
 * @param {'1'|'2'|'3'} q.scope
 * @param {'revenue'|'assets'} q.basis  per unit of revenue (3a, 3c) or of assets (3b)
 * @param {string|null} [q.currency]    the exposure's currency
 */
function factorFor({ sectorKey, sector, scope, basis, currency }) {
  const sec = resolveSector({ sectorKey, sector });
  const remedy = 'Supply activity.factor on the request, or map the borrower to a held sector with counterparty.sectorKey.';
  if (!sec.key) return { absent: true, reason: sec.reason, remedy };

  if (currency && String(currency).toUpperCase() !== TABLE.currency) {
    return { absent: true,
      reason: `The held factors are per unit of ${TABLE.currency} and this exposure is in ${currency}. A factor per unit of one currency applied to an amount in another is a unit error.`,
      remedy: `Supply activity.factor per unit of ${currency}, or record the exposure in ${TABLE.currency} at the valuation-date rate with the rate stated.` };
  }

  const row = TABLE.rows[sec.key];
  const perRevenueKey = `scope${scope}PerRevenue`;
  const perRevenue = row[perRevenueKey];
  if (!Number.isFinite(perRevenue)) {
    return { absent: true,
      reason: `No scope ${scope} factor is held for ${sec.label} (${sec.key}).`,
      remedy: `Supply activity.factor for scope ${scope}, or state why the scope is absent.` };
  }

  const perMillion = basis === 'assets' ? perRevenue * row.assetTurnover : perRevenue;
  const vintage = row.vintage || TABLE.vintage;
  const assumptions = [...sec.assumptions];
  assumptions.push(basis === 'assets'
    ? `Held as ${perRevenue} tCO2e per million ${TABLE.currency} of revenue for ${sec.label}; per unit of assets derived as GHG ÷ revenue × revenue ÷ assets with an asset turnover of ${row.assetTurnover} (Annex Table 10.1-2, Option 3b).`
    : `Held as ${perRevenue} tCO2e per million ${TABLE.currency} of revenue for ${sec.label}; applied per unit of currency.`);
  if (row.gap) assumptions.push(`Provisional factor: ${row.gap}`);

  return {
    absent: false,
    sectorKey: sec.key,
    via: sec.via,
    assetTurnover: row.assetTurnover,
    factor: {
      value: perMillion / 1e6,
      unit: `tCO2e/${TABLE.currency} of ${basis}`,
      source: `${TABLE.reference} — sector-factors v${TABLE.version}, row ${sec.key}`,
      vintage,
      tier: row.tier || TABLE.tier || null,
      region: null,
      library: {
        table: TABLE.table, version: TABLE.version, effectiveFrom: TABLE.effectiveFrom,
        status: TABLE.status, row: sec.key, sector: sec.label, isic: VOCAB.sectors[sec.key].isic,
        perMillion, currency: TABLE.currency, checksum: checksum(TABLE),
      },
    },
    assumptions,
  };
}

/** The vocabulary, for a form and for the reference endpoint. */
function vocabulary() {
  return {
    version: VOCAB.version, effectiveFrom: VOCAB.effectiveFrom, rule: VOCAB.rule,
    sectors: Object.entries(/** @type {Record<string, any>} */ (VOCAB.sectors)).map(([key, s]) => ({
      key, label: s.label, isic: s.isic, parent: s.parent || null, aliases: [...s.aliases],
      held: Boolean(TABLE.rows[key]),
    })),
  };
}

/**
 * The release a set of estimated figures rests on: the table with its
 * version, effective date, status and a SHA-256 over its canonical form, the
 * vocabulary likewise, and one checksum over both. The version says what was
 * intended; the checksum says what was there.
 */
function release() {
  const table = {
    table: TABLE.table, version: TABLE.version, effectiveFrom: TABLE.effectiveFrom,
    status: TABLE.status, provisionalRows: [...(TABLE.provisionalRows || [])],
    rowCount: Object.keys(TABLE.rows).length, currency: TABLE.currency, vintage: TABLE.vintage,
    checksum: checksum(TABLE),
  };
  const vocab = {
    table: 'sectors', version: VOCAB.version, effectiveFrom: VOCAB.effectiveFrom,
    rowCount: Object.keys(VOCAB.sectors).length, checksum: checksum(VOCAB),
  };
  return {
    tables: [table, vocab],
    checksum: checksum([[table.table, table.checksum], [vocab.table, vocab.checksum]]),
    provisionalTables: table.status === 'provisional' ? [table.table] : [],
    algorithm: 'SHA-256 over the canonical form (keys sorted at every level)',
  };
}

/** The table as published, for the transparency endpoint. */
function table() { return TABLE; }

module.exports = { resolveSector, factorFor, vocabulary, release, table };
