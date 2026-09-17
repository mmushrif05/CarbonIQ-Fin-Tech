// @ts-check
/**
 * The SLFRS S2 half of the consolidated disclosure, assembled from facts the
 * document already holds.
 *
 * Nothing here computes an emission. The four pillars are the entity's own
 * statements, read from the settings through the one registry that declares
 * what S2 asks for; the §29(b)–(d) amounts and the §32 industry table are the
 * sums the engine already took over the register's projection; and Category 15
 * is the consolidated headline, moved and never recalculated.
 *
 * Three rules the rest of this file exists to keep.
 *
 * **Every statement carries who made it.** An item still equal to the
 * illustrative pack is marked illustrative wherever it is printed. A
 * governance paragraph the tool provider wrote, printed unmarked, would read
 * as the bank's own statement — the failure `src/shared/report-integrity.js`
 * exists to prevent, in the direction that matters most.
 *
 * **Absent is an answer with a clause.** An item the entity has not stated is
 * printed as not stated, naming the paragraph that asks for it, never omitted
 * and never filled in.
 *
 * **The index resolves to sections that exist.** The S2 index names, for each
 * paragraph, the section of this document that answers it; a row naming a
 * section the model does not build is a broken cross-reference in a filed
 * document, so a test holds every row to the built section ids.
 */

'use strict';

const { PILLARS, ITEMS, ROW_SHAPES, listFor } = require('../../domain/climate/items');
const { labelOf } = require('../../domain/climate/vocabulary');
const climate = require('../../domain/climate');
const { moneyAnnotated } = require('../../../../shared/money');

const num = v => typeof v === 'number' && Number.isFinite(v);

/** Where each pillar is printed, so the index and the sections cannot drift. */
const PILLAR_SECTION = Object.freeze({
  governance: 's2Governance',
  strategy: 's2Strategy',
  riskManagement: 's2RiskManagement',
  metricsTargets: 's2Inventory',
});

const PROVENANCE = Object.freeze({
  stated: 'Stated by the reporting entity.',
  illustrative: 'Illustrative trial content supplied with the tool — not a statement by the reporting entity.',
  absent: 'Not stated by the reporting entity.',
});

// ---------------------------------------------------------------------------
// Rendering one recorded value into what a page prints
// ---------------------------------------------------------------------------

const get = (obj, path) => {
  let cur = obj;
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = cur[key];
  }
  return cur;
};

const N = n => (n === null || n === undefined) ? '—'
  : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** A stated figure, with how it was arrived at and the period it covers. */
function figureOf(raw, unitDefault) {
  if (!raw || typeof raw !== 'object') return null;
  const basis = raw.basis ? labelOf(listFor('inventoryBases'), raw.basis) : null;
  return {
    value: num(raw.value) ? raw.value : null,
    unit: raw.unit || unitDefault || 'tCO2e',
    basis, period: raw.period || null, note: raw.note || null,
    absentReason: raw.absentReason || null,
    /* A figure and a reason it is absent are different answers and the
       document prints them differently; a reader is owed the difference. */
    display: num(raw.value) ? `${N(raw.value)} ${raw.unit || unitDefault || 'tCO2e'}` : 'Not reported',
  };
}

function moneyOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    amount: num(raw.amount) ? raw.amount : null, currency: raw.currency || null,
    note: raw.note || null, absentReason: raw.absentReason || null,
    display: num(raw.amount) ? moneyAnnotated(raw.amount, raw.currency) : 'Not reported',
  };
}

function carbonPriceOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const uses = (raw.appliedTo || []).map(id => labelOf(listFor('carbonPriceUses'), id));
  return {
    appliedTo: uses, price: num(raw.price) ? raw.price : null, currency: raw.currency || null,
    note: raw.note || null,
    display: num(raw.price) ? `${N(raw.price)} ${raw.currency || ''} per tCO2e`.replace('  ', ' ').trim()
      : (uses.length ? uses.join('; ') : 'Not reported'),
  };
}

function remunerationOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    linked: raw.linked, sharePct: num(raw.sharePct) ? raw.sharePct : null, note: raw.note || null,
    display: raw.linked === true
      ? (num(raw.sharePct) ? `Linked — ${raw.sharePct}% of remuneration recognised in the period` : 'Linked')
      : raw.linked === false ? 'Not linked' : 'Not reported',
  };
}

/** A repeating block, rendered row by row through the shape the registry declares. */
function rowsOf(raw, shapeName) {
  const shape = ROW_SHAPES[shapeName] || [];
  return (Array.isArray(raw) ? raw : []).map(row => {
    const out = { _raw: row };
    for (const field of shape) {
      const v = row[field.key];
      out[field.key] = field.kind === 'enum' ? labelOf(listFor(field.list), v)
        : field.kind === 'number' ? (num(v) ? v : null) : (v || null);
    }
    return out;
  });
}

function valueOf(item, raw) {
  switch (item.kind) {
    case 'figure': return item.path === 'crossIndustry.capitalDeployed' ? moneyOf(raw) : figureOf(raw);
    case 'carbonPrice': return carbonPriceOf(raw);
    case 'remuneration': return remunerationOf(raw);
    case 'list': return rowsOf(raw, item.of);
    case 'enum': return raw === null || raw === undefined ? null : labelOf(listFor(item.list), raw);
    default: return raw === null || raw === undefined ? null : raw;
  }
}

// ---------------------------------------------------------------------------
// The pillars
// ---------------------------------------------------------------------------

/**
 * One row per registry item, carrying the entity's answer, the paragraph that
 * asks for it and who stated it.
 *
 * @param {any} facts the recorded `climate` block
 * @param {any} readiness the derived provenance, one state per item path
 */
function itemsOf(facts, readiness) {
  const state = new Map((readiness.items || []).map(i => [i.path, i.state]));
  return ITEMS.map(item => {
    const raw = get(facts, item.path);
    const s = state.get(item.path) || 'absent';
    return {
      path: item.path, label: item.label, paragraph: item.paragraph, pillar: item.pillar,
      kind: item.kind, optional: Boolean(item.optional),
      state: s, provenance: PROVENANCE[s],
      value: s === 'absent' ? null : valueOf(item, raw),
    };
  });
}

const byPath = (items, path) => items.find(i => i.path === path) || null;

// ---------------------------------------------------------------------------
// The index: every paragraph, and the section of this document that answers it
// ---------------------------------------------------------------------------

/**
 * Where each S2 paragraph is answered. The financed-emissions rows point at
 * the annex that carries the blocks this document has always printed, which
 * is the whole point: the file is read as an S2 disclosure without a figure
 * being rewritten for S2. `answered` is read from the facts, so a row can say
 * No.
 */
function indexOf(f, s2) {
  const item = path => byPath(s2.items, path);
  const stated = path => { const i = item(path); return Boolean(i && i.state !== 'absent'); };
  const anyOf = paths => paths.some(stated);
  const rows = [
    { paragraph: 'S2 §6(a)', requirement: 'The body or individual responsible for oversight, and how it exercises it', section: 's2Governance', answered: anyOf(['governance.body', 'governance.oversight', 'governance.frequency']) },
    { paragraph: 'S2 §6(b)', requirement: 'Management’s role in governance processes, controls and procedures', section: 's2Governance', answered: stated('governance.managementRole') },
    { paragraph: 'S2 §10(a)–(c)', requirement: 'The climate-related risks and opportunities identified, and the horizons over which each could affect the entity', section: 's2Strategy', answered: anyOf(['strategy.exposures', 'strategy.horizonDefinitions']) },
    { paragraph: 'S2 §13', requirement: 'Current and anticipated effects on the business model and value chain', section: 's2Strategy', answered: stated('strategy.businessModel') },
    { paragraph: 'S2 §14(a)', requirement: 'The climate-related transition plan, its assumptions and dependencies', section: 's2Strategy', answered: stated('strategy.transitionPlan') },
    { paragraph: 'S2 §16(a)–(b)', requirement: 'Effects on financial position, performance and cash flows, for the period and anticipated', section: 's2Strategy', answered: anyOf(['strategy.financialEffectsCurrent', 'strategy.financialEffectsAnticipated']) },
    { paragraph: 'S2 §22', requirement: 'Climate resilience, and the scenario analysis it rests on', section: 's2Strategy', answered: anyOf(['strategy.resilience', 'strategy.scenarios']) },
    { paragraph: 'S2 §25(a)–(c)', requirement: 'How climate-related risks and opportunities are identified, assessed, prioritised and monitored, and how that sits inside overall risk management', section: 's2RiskManagement', answered: anyOf(['riskManagement.identification', 'riskManagement.prioritisation', 'riskManagement.monitoring', 'riskManagement.opportunities', 'riskManagement.integration']) },
    { paragraph: 'S2 §29(a)(i)', requirement: 'Absolute gross scope 1 emissions', section: 's2Inventory', answered: stated('inventory.scope1') },
    { paragraph: 'S2 §29(a)(ii)', requirement: 'Absolute gross scope 2 emissions, location-based', section: 's2Inventory', answered: stated('inventory.scope2Location') },
    { paragraph: 'S2 §29(a)(iii)', requirement: 'The measurement approach, inputs and assumptions used for the inventory, and any change from the prior period', section: 's2Inventory', answered: stated('inventory.measurementApproach') },
    { paragraph: 'S2 §29(a)(iv)', requirement: 'Scope 3 emissions by category, other than category 15', section: 's2Inventory', answered: stated('inventory.scope3Other') },
    { paragraph: 'S2 §29(a)(vi); B58–B63', requirement: 'Financed emissions — scope 3 category 15 — by asset class, with the method, the gross exposure and the coverage', section: 'annexFinanced', answered: f.recorded.length > 0 },
    { paragraph: 'S2 §29(b)', requirement: 'Amount and percentage of assets vulnerable to climate-related transition risks', section: 's2CrossIndustry', answered: num(s2.exposure.transitionRisk.sharePct) },
    { paragraph: 'S2 §29(c)', requirement: 'Amount and percentage of assets vulnerable to climate-related physical risks', section: 's2CrossIndustry', answered: num(s2.exposure.physicalRisk.sharePct) },
    { paragraph: 'S2 §29(d)', requirement: 'Amount and percentage of assets aligned with climate-related opportunities', section: 's2CrossIndustry', answered: num(s2.exposure.opportunities.sharePct) },
    { paragraph: 'S2 §29(e)', requirement: 'Capital deployed towards climate-related risks and opportunities', section: 's2CrossIndustry', answered: stated('crossIndustry.capitalDeployed') },
    { paragraph: 'S2 §29(f)', requirement: 'Internal carbon price, and how it is applied in decision-making', section: 's2CrossIndustry', answered: stated('crossIndustry.carbonPrice') },
    { paragraph: 'S2 §29(g)', requirement: 'Remuneration linked to climate-related considerations', section: 's2CrossIndustry', answered: stated('crossIndustry.remuneration') },
    { paragraph: 'S2 §32; banking guidance', requirement: 'Exposure and financed emissions by industry, with lending to carbon-related industries identified', section: 's2Industry', answered: s2.exposure.industries.rows.length > 0 },
    { paragraph: 'S2 §33–36', requirement: 'Each climate-related target, its basis, and performance against it', section: 's2Targets', answered: anyOf(['targets.entries', 'targets.ghgBasis']) },
    { paragraph: 'S2 §37; DCL p.127', requirement: 'Emission intensity of the financed book', section: 'annexFinanced', answered: num(f.intensity && f.intensity.value) },
  ];
  return rows.map(r => ({ ...r, answered: Boolean(r.answered) }));
}

// ---------------------------------------------------------------------------
// The whole S2 block
// ---------------------------------------------------------------------------

/**
 * @param {any} f the consolidated facts, already built
 * @param {any} settings the reporting entity's Part A settings
 * @param {any} climateExposure the §29(b)–(d) and §32 sums the engine took
 */
function s2Facts(f, settings, climateExposure) {
  const recorded = (settings && settings.climate) || {};
  const readiness = (settings && settings.climateReadiness) || climate.readiness(recorded);
  const items = itemsOf(recorded, readiness);

  const pillars = PILLARS.map(p => {
    const mine = items.filter(i => i.pillar === p.id);
    const count = s => mine.filter(i => i.state === s).length;
    return {
      id: p.id, label: p.label, paragraphs: p.paragraphs, section: PILLAR_SECTION[p.id],
      total: mine.length, stated: count('stated'), illustrative: count('illustrative'), absent: count('absent'),
      items: mine,
    };
  });

  const s2 = {
    items, pillars,
    readiness: {
      total: items.length,
      stated: items.filter(i => i.state === 'stated').length,
      illustrative: items.filter(i => i.state === 'illustrative').length,
      absent: items.filter(i => i.state === 'absent').length,
    },
    governance: {
      body: byPath(items, 'governance.body'),
      oversight: byPath(items, 'governance.oversight'),
      frequency: byPath(items, 'governance.frequency'),
      managementRole: byPath(items, 'governance.managementRole'),
    },
    strategy: {
      horizons: byPath(items, 'strategy.horizonDefinitions'),
      exposures: byPath(items, 'strategy.exposures'),
      businessModel: byPath(items, 'strategy.businessModel'),
      transitionPlan: byPath(items, 'strategy.transitionPlan'),
      financialCurrent: byPath(items, 'strategy.financialEffectsCurrent'),
      financialAnticipated: byPath(items, 'strategy.financialEffectsAnticipated'),
      resilience: byPath(items, 'strategy.resilience'),
      scenarios: byPath(items, 'strategy.scenarios'),
    },
    riskManagement: items.filter(i => i.pillar === 'riskManagement'),
    inventory: {
      scope1: byPath(items, 'inventory.scope1'),
      scope2Location: byPath(items, 'inventory.scope2Location'),
      scope2Market: byPath(items, 'inventory.scope2Market'),
      scope3Other: byPath(items, 'inventory.scope3Other'),
      measurementApproach: byPath(items, 'inventory.measurementApproach'),
      /* Category 15 is not collected: it is the headline this document already
         computed, moved into the inventory table rather than recomputed, so
         one book cannot produce two financed-emissions figures. */
      category15: {
        value: f.totals.headline.value, unit: 'tCO2e',
        note: 'Measured by this system from the exposure register — the headline of Annex A, moved and not '
          + 'recomputed. Financed emissions are scope 3 category 15 of the inventory (S2 B58–B63).',
        scope3: f.totals.scope3.value,
      },
    },
    crossIndustry: {
      capitalDeployed: byPath(items, 'crossIndustry.capitalDeployed'),
      carbonPrice: byPath(items, 'crossIndustry.carbonPrice'),
      remuneration: byPath(items, 'crossIndustry.remuneration'),
    },
    targets: {
      entries: byPath(items, 'targets.entries'),
      ghgBasis: byPath(items, 'targets.ghgBasis'),
    },
    exposure: climateExposure || { transitionRisk: {}, physicalRisk: {}, opportunities: {}, industries: { rows: [], carbonRelated: {} }, classified: false },
  };

  /* Whether the entity's own inventory is stated decides three things a
     reader acts on: the checklist's INV-1, the scope statement on the cover,
     and whether the regulatory mapping still says the whole inventory is made
     elsewhere. It is one fact, read once, so the three cannot disagree. */
  s2.inventoryStated = Boolean(s2.inventory.scope1 && s2.inventory.scope1.state !== 'absent'
    && s2.inventory.scope2Location && s2.inventory.scope2Location.state !== 'absent');
  s2.index = indexOf(f, s2);
  s2.answeredParagraphs = s2.index.filter(r => r.answered).length;
  return s2;
}

/** The entity's own prose, for the endorsement-language guard to read. */
function proseOf(s2) {
  const out = [];
  for (const i of s2.items) {
    if (typeof i.value === 'string') out.push(i.value);
    else if (Array.isArray(i.value)) {
      for (const row of i.value) {
        for (const [k, v] of Object.entries(row)) if (k !== '_raw' && typeof v === 'string') out.push(v);
      }
    } else if (i.value && typeof i.value === 'object' && typeof i.value.note === 'string') out.push(i.value.note);
  }
  return out.join('\n');
}

module.exports = { s2Facts, proseOf, PROVENANCE, PILLAR_SECTION, N };
