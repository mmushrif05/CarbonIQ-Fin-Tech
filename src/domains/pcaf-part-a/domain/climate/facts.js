// @ts-check
/**
 * Recording the entity's SLFRS S2 facts, and telling its words from ours.
 *
 * Two jobs, and the second is the one that matters.
 *
 * **Recording.** `normalise()` takes a patch and returns the stored shape,
 * reading the item registry rather than a second list of field names. An item
 * the registry does not hold is ignored rather than written, so this cannot
 * quietly become a second home for a fact that belongs on the settings record
 * beside it; an enum outside its vocabulary is cleared rather than kept,
 * because a screen that offered it would have sent an id from the list.
 *
 * **Provenance.** The product ships an illustrative pack so a bank can see a
 * complete disclosure on the first day of a trial, and every one of those
 * sentences is ours rather than the bank's. Printing them unmarked would be
 * exactly the failure `src/shared/report-integrity.js` exists to prevent: a
 * governance paragraph that reads as the entity's statement and is not.
 *
 * So provenance is **derived by comparison, never stored**. A value equal to
 * the illustrative pack's value for that item is illustrative; a value that
 * differs is the entity's. Nothing has to be bookkept as the entity edits,
 * there is no flag to go stale, and the moment a word changes the item becomes
 * theirs — which is the truth of it. The alternative, a flag set at install
 * and cleared on save, marks a whole form stated when one field was touched.
 */

'use strict';

const { ITEMS, PILLARS, ROW_SHAPES, listFor } = require('./items');
const { idsOf } = require('./vocabulary');

// ---------------------------------------------------------------------------
// Reading and writing a dotted path
// ---------------------------------------------------------------------------

function get(obj, path) {
  let cur = obj;
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = cur[key];
  }
  return cur;
}

function set(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (const key of keys.slice(0, -1)) {
    if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key];
  }
  cur[keys[keys.length - 1]] = value;
}

// ---------------------------------------------------------------------------
// Normalising one value, by the kind its item declares
// ---------------------------------------------------------------------------

const text = (value, max) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().slice(0, max || 4000);
  return s || null;
};

const num = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const pick = (value, list) => {
  if (value === null || value === undefined || value === '') return null;
  return idsOf(list).includes(String(value)) ? String(value) : null;
};

/**
 * A figure the entity states: the number with how it was arrived at and the
 * period it covers, or the reason it is absent. Both may be null, which is
 * "not stated" and is different from "stated as absent with a reason" — the
 * document prints those differently and a reader is owed the difference.
 */
function figure(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {
    value: num(value.value),
    unit: text(value.unit, 40) || 'tCO2e',
    basis: pick(value.basis, listFor('inventoryBases')),
    period: text(value.period, 40),
    note: text(value.note, 1000),
    absentReason: text(value.absentReason, 1000),
  };
  if (out.value === null && !out.absentReason && !out.note) return null;
  return out;
}

/** A money figure: the amount and the currency it is in. */
function money(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {
    amount: num(value.amount),
    currency: text(value.currency, 10),
    note: text(value.note, 1000),
    absentReason: text(value.absentReason, 1000),
  };
  if (out.amount === null && !out.absentReason && !out.note) return null;
  return out;
}

/** S2 §29(f): where the price is applied, and what it is. */
function carbonPrice(value) {
  if (!value || typeof value !== 'object') return null;
  const uses = Array.isArray(value.appliedTo)
    ? value.appliedTo.map(x => pick(x, listFor('carbonPriceUses'))).filter(Boolean)
    : [];
  const out = {
    appliedTo: [...new Set(uses)],
    price: num(value.price),
    currency: text(value.currency, 10),
    note: text(value.note, 1000),
  };
  if (!out.appliedTo.length && out.price === null && !out.note) return null;
  return out;
}

/** S2 §29(g): whether remuneration is linked, and the share recognised. */
function remuneration(value) {
  if (!value || typeof value !== 'object') return null;
  const linked = value.linked === null || value.linked === undefined ? null : Boolean(value.linked);
  const out = { linked, sharePct: num(value.sharePct), note: text(value.note, 1000) };
  if (out.linked === null && out.sharePct === null && !out.note) return null;
  return out;
}

/** A repeating block: its rows held to the shape the registry declares. */
function rows(value, shapeName) {
  if (!Array.isArray(value)) return [];
  const shape = ROW_SHAPES[shapeName] || [];
  return value.map(raw => {
    if (!raw || typeof raw !== 'object') return null;
    const row = {};
    for (const field of shape) {
      const v = raw[field.key];
      row[field.key] = field.kind === 'number' ? num(v)
        : field.kind === 'enum' ? pick(v, listFor(field.list))
          : text(v, field.max);
    }
    /* A row whose required fields are not all answered is not a row: it is a
       half-filled form control that would print as a blank line in the
       document. Dropped rather than stored, so nothing empty reaches a page. */
    return shape.filter(f => f.required).every(f => row[f.key] !== null) ? row : null;
  }).filter(Boolean).slice(0, 60);
}

/** One value, by the kind its item declares. */
function valueOf(item, raw) {
  switch (item.kind) {
    case 'text': return text(raw, item.max);
    case 'enum': return pick(raw, listFor(item.list));
    case 'number': return num(raw);
    case 'figure': return item.path === 'crossIndustry.capitalDeployed' ? money(raw) : figure(raw);
    case 'carbonPrice': return carbonPrice(raw);
    case 'remuneration': return remuneration(raw);
    case 'list': return rows(raw, item.of);
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/** True where an item's value counts as answered. */
function answered(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Merge a patch of climate facts over what is held.
 *
 * Only a path the patch actually carries is touched, so a form that renders
 * one pillar can save it without clearing the other three — the shape a
 * screen chooses to show must never decide what the record keeps.
 *
 * @param {any} current what is stored today
 * @param {any} patch what the caller sent
 */
function normalise(current, patch) {
  const out = JSON.parse(JSON.stringify(current || {}));
  if (!patch || typeof patch !== 'object') return out;
  for (const item of ITEMS) {
    const raw = get(patch, item.path);
    if (raw === undefined) continue;
    set(out, item.path, valueOf(item, raw));
  }
  return out;
}

/** The whole pack, recorded at once — used to install the illustrative set. */
const normaliseWhole = pack => normalise({}, pack);

// ---------------------------------------------------------------------------
// Provenance and readiness
// ---------------------------------------------------------------------------

const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

/**
 * How each S2 item stands: the entity's own words, illustrative trial content
 * still carrying ours, or not stated at all.
 *
 * @param {any} climate what is stored
 * @param {any} illustrative the shipped pack, or null where none is held
 */
function readiness(climate, illustrative) {
  const items = ITEMS.map(item => {
    const value = get(climate, item.path);
    const shipped = illustrative ? get(illustrative, item.path) : undefined;
    const state = !answered(value) ? 'absent'
      : (answered(shipped) && same(value, shipped)) ? 'illustrative'
        : 'stated';
    return {
      path: item.path,
      label: item.label,
      paragraph: item.paragraph,
      pillar: item.pillar,
      kind: item.kind,
      optional: Boolean(item.optional),
      state,
    };
  });

  const count = (list, state) => list.filter(i => i.state === state).length;
  const pillars = PILLARS.map(p => {
    const mine = items.filter(i => i.pillar === p.id);
    return {
      id: p.id,
      label: p.label,
      paragraphs: p.paragraphs,
      total: mine.length,
      stated: count(mine, 'stated'),
      illustrative: count(mine, 'illustrative'),
      absent: count(mine, 'absent'),
      /* One word for the whole pillar, so a tile can be read at a glance:
         complete only where every item is the entity's own. */
      state: count(mine, 'absent') === mine.length ? 'absent'
        : count(mine, 'stated') === mine.length ? 'stated'
          : count(mine, 'illustrative') > 0 ? 'illustrative' : 'partial',
    };
  });

  return {
    items,
    pillars,
    total: items.length,
    stated: count(items, 'stated'),
    illustrative: count(items, 'illustrative'),
    absent: count(items, 'absent'),
  };
}

/** True where nothing at all has been recorded. */
const isEmpty = climate => !ITEMS.some(i => answered(get(climate, i.path)));

module.exports = { normalise, normaliseWhole, readiness, isEmpty, answered, get, set };
