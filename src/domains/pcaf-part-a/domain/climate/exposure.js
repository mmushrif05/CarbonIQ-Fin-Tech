// @ts-check
/**
 * The climate classification a loan carries, and the sums S2 asks of it.
 *
 * SLFRS S2 §29(b)–(d) ask a bank for the amount and percentage of its assets
 * vulnerable to transition risk, vulnerable to physical risk, and aligned with
 * climate-related opportunities. None of those is derivable from an emissions
 * figure: they are a judgement the bank makes about each exposure, which is
 * why the classification sits on the loan and the arithmetic sits here.
 *
 * Three rules, and the first is the one that keeps the answer honest.
 *
 * **Not assessed is an answer, and it is reported.** A book nobody has
 * classified must read as unclassified, never as safe. So every share is taken
 * over the outstanding actually assessed, the unassessed amount is reported
 * beside it, and a position with nothing classified says so rather than
 * printing a confident zero per cent.
 *
 * **The engine sums; the bank classifies.** Nothing here decides whether an
 * exposure is vulnerable. It counts what was recorded and says on what basis.
 *
 * **Carbon-related is our reading, and it says so.** S2's banking guidance
 * asks for lending to carbon-related industries but the standard leaves the
 * boundary to the entity; the set below follows the four non-financial groups
 * the TCFD 2021 implementing guidance names — energy, transportation,
 * materials and buildings, and agriculture, food and forest products — mapped
 * onto this repository's own sector vocabulary. It is a stated judgement, not
 * a figure PCAF or the ISSB publishes, and the roll-up carries that sentence
 * wherever the subtotal appears.
 */

'use strict';

const { CLIMATE_VERDICTS, ALIGNMENT_VERDICTS, HORIZONS, idsOf } = require('./vocabulary');

/** The basis every §29(b)–(d) figure carries, so no reader takes it for measured. */
const CLASSIFICATION_BASIS =
  'Classified per exposure by the reporting entity, summed by the engine. '
  + 'Shares are taken over the outstanding actually assessed; the unassessed amount is stated beside them.';

/**
 * Sectors this repository treats as carbon-related for the S2 banking
 * guidance, from the TCFD 2021 implementing guidance's four non-financial
 * groups. Keys are `data/pcaf-parta/sectors.json`, and a key not in that file
 * would be a mapping to nothing — a test holds the two together.
 */
const CARBON_RELATED_SECTORS = Object.freeze([
  /* Agriculture, food and forest products */
  'agriculture', 'agriculture_tea', 'agriculture_rice', 'manufacturing_food',
  /* Materials and buildings */
  'mining', 'manufacturing', 'manufacturing_textiles', 'manufacturing_cement',
  'manufacturing_rubber_plastics', 'construction', 'real_estate',
  /* Energy */
  'electricity', 'water_waste',
  /* Transportation */
  'transport',
]);

const CARBON_RELATED_BASIS =
  'Carbon-related industries follow the four non-financial groups of the TCFD 2021 implementing '
  + 'guidance — energy, transportation, materials and buildings, and agriculture, food and forest '
  + 'products — mapped onto this system\'s sector vocabulary. The boundary is the reporting entity\'s '
  + 'to set and this is the set applied here.';

const isCarbonRelated = sectorKey => CARBON_RELATED_SECTORS.includes(String(sectorKey || ''));

// ---------------------------------------------------------------------------
// Recording the classification
// ---------------------------------------------------------------------------

const text = (v, max) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
};

const pick = (v, ids) => (v !== null && v !== undefined && ids.includes(String(v)) ? String(v) : null);

const VERDICTS = idsOf(CLIMATE_VERDICTS);
const ALIGNMENTS = idsOf(ALIGNMENT_VERDICTS);
const HORIZON_IDS = idsOf(HORIZONS);

/** One risk verdict with the horizon it was judged over and a note. */
function risk(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const verdict = pick(raw.verdict, VERDICTS);
  const out = { verdict, horizon: pick(raw.horizon, HORIZON_IDS), note: text(raw.note, 1000) };
  return verdict || out.note ? out : null;
}

/** The opportunity verdict, carrying the taxonomy activity where one applies. */
function opportunity(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const verdict = pick(raw.verdict, ALIGNMENTS);
  const out = {
    verdict,
    /* The Sri Lanka Green Finance Taxonomy activity code, as the taxonomy
       screen already records it. Kept as given: this module knows nothing
       about the taxonomy and must not start deciding what is aligned. */
    taxonomyCode: text(raw.taxonomyCode, 20),
    note: text(raw.note, 1000),
  };
  return verdict || out.taxonomyCode || out.note ? out : null;
}

/**
 * The block as it is stored on an exposure's input, or null where the bank
 * recorded nothing — which is different from recording *not assessed*, and the
 * roll-up counts them the same way on purpose: neither is an assessment.
 */
function normaliseExposureClimate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {
    transitionRisk: risk(raw.transitionRisk),
    physicalRisk: risk(raw.physicalRisk),
    opportunity: opportunity(raw.opportunity),
  };
  return out.transitionRisk || out.physicalRisk || out.opportunity ? out : null;
}

// ---------------------------------------------------------------------------
// The sums S2 asks for
// ---------------------------------------------------------------------------

const money = v => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const r2 = n => Math.round(n * 100) / 100;

/**
 * One §29 line: how much of the book is vulnerable, how much is not, and how
 * much nobody has looked at.
 *
 * @param {any[]} rows each `{ outstanding, verdict }`
 * @param {string} positive the verdict that counts towards the reported amount
 */
function band(rows, positive) {
  let amount = 0, negative = 0, unassessed = 0, assessedCount = 0;
  for (const row of rows) {
    const value = money(row.outstanding);
    if (value === null) continue;
    if (row.verdict === positive) { amount += value; assessedCount += 1; }
    else if (row.verdict && row.verdict !== 'not_assessed') { negative += value; assessedCount += 1; }
    else unassessed += value;
  }
  const assessed = amount + negative;
  return {
    amount: r2(amount),
    notAmount: r2(negative),
    unassessedAmount: r2(unassessed),
    assessedAmount: r2(assessed),
    exposuresAssessed: assessedCount,
    /* Over the assessed outstanding, never over the whole book: a share of a
       book nobody classified is a number about nothing. Null rather than zero
       where nothing was assessed, because `Number(null)` is 0 and 0 here would
       read as "none of the book is vulnerable". */
    sharePct: assessed > 0 ? r2((amount / assessed) * 100) : null,
    basis: CLASSIFICATION_BASIS,
  };
}

/**
 * The §29(b)–(d) position and the §32 industry table, over the projection the
 * roll-up already reads.
 *
 * @param {any[]} exposures each carrying `outstanding`, `sector` and the
 *   recorded `climate` block
 */
function position(exposures) {
  const rows = (exposures || []).map(e => ({
    outstanding: e.outstanding,
    sector: e.sector || null,
    sectorKey: e.sectorKey || null,
    emissions: e.emissions,
    climate: e.climate || null,
  }));

  const verdictOf = (row, key) => (row.climate && row.climate[key] && row.climate[key].verdict) || null;

  const transitionRisk = band(rows.map(r => ({ outstanding: r.outstanding, verdict: verdictOf(r, 'transitionRisk') })), 'vulnerable');
  const physicalRisk = band(rows.map(r => ({ outstanding: r.outstanding, verdict: verdictOf(r, 'physicalRisk') })), 'vulnerable');
  const opportunities = band(rows.map(r => ({ outstanding: r.outstanding, verdict: verdictOf(r, 'opportunity') })), 'aligned');

  /* By industry: outstanding and emissions per sector, with the
     carbon-related subtotal S2's banking guidance asks for. A row whose sector
     was never recorded is its own row rather than folded into another, because
     "we do not know" is not a sector. */
  const bySector = new Map();
  for (const row of rows) {
    /* Grouped on the vocabulary key where the class holds one, so two spellings
       of one sector are one row; labelled with what the bank actually keyed. */
    const key = row.sectorKey || row.sector || null;
    const held = bySector.get(key) || {
      sector: row.sector || key, sectorKey: row.sectorKey || null,
      outstanding: 0, emissions: 0, exposures: 0,
      /* From the key alone: a free-text label matches no vocabulary, so a
         sector recorded only as text is not claimed to be carbon-related and
         not claimed not to be — it is simply outside the subtotal, and the
         subtotal says the boundary is the entity's to set. */
      carbonRelated: isCarbonRelated(row.sectorKey),
    };
    held.outstanding += money(row.outstanding) || 0;
    held.emissions += money(row.emissions) || 0;
    held.exposures += 1;
    bySector.set(key, held);
  }
  const industries = [...bySector.values()]
    .map(x => ({ ...x, outstanding: r2(x.outstanding), emissions: r2(x.emissions) }))
    .sort((a, b) => b.outstanding - a.outstanding);

  const carbonRelated = industries.filter(x => x.carbonRelated);
  const total = industries.reduce((sum, x) => sum + x.outstanding, 0);
  const carbonOutstanding = carbonRelated.reduce((sum, x) => sum + x.outstanding, 0);

  return {
    transitionRisk,
    physicalRisk,
    opportunities,
    industries: {
      rows: industries,
      carbonRelated: {
        outstanding: r2(carbonOutstanding),
        sharePct: total > 0 ? r2((carbonOutstanding / total) * 100) : null,
        sectors: carbonRelated.map(x => x.sector),
        basis: CARBON_RELATED_BASIS,
      },
    },
    classified: transitionRisk.exposuresAssessed + physicalRisk.exposuresAssessed + opportunities.exposuresAssessed > 0,
  };
}

module.exports = {
  CLASSIFICATION_BASIS, CARBON_RELATED_SECTORS, CARBON_RELATED_BASIS,
  isCarbonRelated, normaliseExposureClimate, position, band,
};
