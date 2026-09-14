// @ts-check
/**
 * The consolidated Part A position — the bank's whole financed-emissions
 * book across every asset class, for one reporting year — and the one
 * document a bank files from it.
 *
 * Until now Part A produced four documents covering two classes, each saying
 * on its face that it was "one input to a Chapter 6 disclosure, not the
 * disclosure". This is the disclosure: one position over every register, one
 * coverage against the one shared book total, one entity, one checklist.
 *
 * Four rules, each a way a consolidated figure could quietly say the wrong
 * thing, and each enforced by shape rather than by convention:
 *
 *   The headline across classes sums what each class reports as its headline
 *   — §5.2 financed scope 1 and 2, §5.9 financed scope 1 excluding LULUCF —
 *   and the note beside it names the boundary each class contributed on.
 *   Scope 3 is summed apart and never into it.
 *
 *   The data-quality score is never averaged across classes: §5.2 and §5.9
 *   score on different tables (Box 6.1-6 options against Table 5.9-6), and a
 *   mean of two categories from two scales is a number that means nothing.
 *   One score per class, weighted within its class, never combined.
 *
 *   Coverage sums outstanding only across classes in the book's currency.
 *   The sovereign register is denominated in international USD by
 *   construction; a lending book in LKR cannot be added to it without a rate
 *   this system does not hold, so a class in another currency is reported
 *   with its own outstanding and excluded from the combined share, named.
 *
 *   A class that is not recorded is a row, not a silence: recorded ·
 *   not recorded for the year · engine built but no register yet · not built.
 *   Chapter 6 asks for the classes not reported with the reason (p.162); the
 *   entity's stated reason overrides the system's, never the reverse.
 *
 * Nothing here computes an emission. Every figure is one a class's own
 * roll-up returned; this module lays them side by side.
 */

'use strict';

const register = require('./register');
const sovereign = require('./sovereign-register');
const settingsService = require('./parta-settings');
const { shared } = require('./parta-report');
const reporting = require('../reporting/consolidated/report');
const { fallback } = require('../../../platform/observability/logger');

const { ASSET_CLASSES } = settingsService;

/* What this system holds for each class: an engine and a register, an engine
   alone, or nothing yet. The order to build the rest is in
   docs/PCAF-PART-A-RESEARCH.md §11. */
const CAPABILITY = Object.freeze({
  'business-loans-unlisted-equity': 'register',
  'sovereign-debt': 'register',
  'project-finance': 'engine',
  'commercial-real-estate': 'engine',
  'mortgages': 'engine',
  'listed-equity-corporate-bonds': 'engine-unrouted',
});

const SYSTEM_REASON = Object.freeze({
  'engine': 'The assessment engine is built; the register that holds exposures for a reporting year is not yet built, so nothing can be disclosed for this class.',
  'engine-unrouted': 'The engine is built and reachable from no route or register yet.',
  'not-built': 'No methodology is built for this class in this system yet.',
  'empty': 'No exposures are recorded for the reporting year.',
});

const num = v => typeof v === 'number' && Number.isFinite(v);
const r2 = n => +Number(n).toFixed(2);
const r4 = n => +Number(n).toFixed(4);

/** A 409 from a class's roll-up means "nothing recorded", which is a row here, not an error. */
async function tryPosition(fn) {
  try { return { ok: true, value: await fn() }; }
  catch (err) {
    const e = /** @type {any} */ (err);
    if (e && e.statusCode === 409) return { ok: false, value: null };
    throw err;
  }
}

function businessLoansRow(pos, bookCurrency) {
  const t = pos.total || {};
  const l = t.lines || {};
  const v = k => (l[k] && num(l[k].value) ? l[k].value : null);
  const dq = t.dataQuality || {};
  const plan = pos.improvementPlan || {};
  return {
    exposures: pos.exposures,
    outstanding: t.outstanding,
    currency: bookCurrency || 'LKR',
    headline: { value: v('scope1And2'), label: 'Financed scope 1 and 2', basis: 'Attributed borrower scope 1 and 2 (§5.2, p.56)' },
    scope1: { value: v('scope1') }, scope2: { value: v('scope2') },
    scope3: { value: v('scope3'), note: 'A separate line; never summed with scope 1 and 2 (§5.2, p.56).' },
    dataQuality: { score: dq.scope1And2 ? dq.scope1And2.score : null, scope3Score: dq.scope3 ? dq.scope3.score : null,
      table: 'Box 6.1-6 option mapping (Table 5.2-1)', weighting: 'outstanding amount' },
    coveragePct: num(pos.coverage && pos.coverage.share) ? r2(pos.coverage.share * 100) : null,
    intensity: { value: num(t.economicIntensity_tCO2e_per_M) ? t.economicIntensity_tCO2e_per_M : null, unit: `tCO2e per million ${bookCurrency || 'LKR'}` },
    findings: ((plan.byRemedy) || []).reduce((s, x) => s + (x.exposures || 0), 0),
    bySector: pos.bySector || {},
    financialSector: pos.financialSector || null,
    optionDistribution: plan.byOption || [],
  };
}

function sovereignRow(pos) {
  const t = pos.totals || {};
  const dq = pos.dataQuality || {};
  return {
    exposures: pos.exposures,
    outstanding: pos.coverage ? pos.coverage.assessedOutstanding : null,
    currency: 'USD',
    headline: { value: num(t.financedScope1ExclLULUCF) ? t.financedScope1ExclLULUCF : null, label: 'Financed scope 1, excluding LULUCF', basis: 'Territorial emissions attributed by PPP-GDP (§5.9, p.141)' },
    scope1: { value: num(t.financedScope1ExclLULUCF) ? t.financedScope1ExclLULUCF : null },
    scope2: { value: t.financedScope2 && num(t.financedScope2.value) ? t.financedScope2.value : null },
    scope1InclLULUCF: { value: t.financedScope1InclLULUCF && num(t.financedScope1InclLULUCF.value) ? t.financedScope1InclLULUCF.value : null, note: (t.financedScope1InclLULUCF && t.financedScope1InclLULUCF.note) || '' },
    scope3: { value: t.financedScope3 && num(t.financedScope3.value) ? t.financedScope3.value : null, note: 'Non-energy imports, a §5.9 should; a separate line.' },
    dataQuality: { score: num(dq.score) ? dq.score : null, table: 'Table 5.9-6', weighting: 'outstanding amount' },
    coveragePct: num(pos.coverage && pos.coverage.share) ? r2(pos.coverage.share) : null,
    intensity: { value: num(t.economicIntensity_tCO2e_per_M) ? t.economicIntensity_tCO2e_per_M : null, unit: 'tCO2e per million USD' },
    findings: (pos.improvementPlan || []).reduce((s, x) => s + (x.count || 0), 0),
    bySovereign: pos.bySovereign || [],
  };
}

/**
 * The position across every asset class for one reporting year.
 *
 * @param {string} orgId
 * @param {string|number} reportingYear
 */
async function position(orgId, reportingYear) {
  const year = String(reportingYear);
  const [book, settings, bl, sv] = await Promise.all([
    register.getBook(orgId, year),
    settingsService.getSettings(orgId).catch(fallback('parta.consolidated.settings', settingsService.DEFAULT_SETTINGS)),
    tryPosition(() => register.position(orgId, year)),
    tryPosition(() => sovereign.position(orgId, year)),
  ]);
  const bookCurrency = book ? book.currency : null;
  const statedReason = new Map((settings.assetClassesNotReported || []).map(x => [x.assetClass, x.reason]));

  const classes = /** @type {any[]} */ (ASSET_CLASSES.map(c => {
    const cap = CAPABILITY[c.assetClass] || 'not-built';
    let row = /** @type {any} */ (null);
    if (c.assetClass === 'business-loans-unlisted-equity' && bl.ok) row = { status: 'recorded', ...businessLoansRow(bl.value, bookCurrency) };
    else if (c.assetClass === 'sovereign-debt' && sv.ok) row = { status: 'recorded', ...sovereignRow(sv.value) };
    else if (cap === 'register') row = { status: 'not-recorded', reason: SYSTEM_REASON.empty, reasonStatedBy: 'system' };
    else if (cap === 'engine') row = { status: 'engine-only', reason: SYSTEM_REASON.engine, reasonStatedBy: 'system' };
    else if (cap === 'engine-unrouted') row = { status: 'not-built', reason: SYSTEM_REASON['engine-unrouted'], reasonStatedBy: 'system' };
    else row = { status: 'not-built', reason: SYSTEM_REASON['not-built'], reasonStatedBy: 'system' };
    if (row.status !== 'recorded' && statedReason.has(c.assetClass)) {
      row.reason = statedReason.get(c.assetClass);
      row.reasonStatedBy = 'entity';
    }
    const combinable = row.status === 'recorded' && Boolean(bookCurrency) && row.currency === bookCurrency;
    /* A class outside the book's currency carries no share of the book: its
       own roll-up divides its outstanding by a total in another currency, and
       printing that percentage here would state a ratio nothing converted. */
    if (row.status === 'recorded' && !combinable) row.coveragePct = null;
    return { assetClass: c.assetClass, section: c.section, label: c.label, ...row, combinable };
  }));

  const recorded = /** @type {any[]} */ (classes.filter(c => c.status === 'recorded'));
  const sum = (xs, pick) => {
    const held = xs.map(pick).filter(num);
    return held.length ? r2(held.reduce((s, v) => s + v, 0)) : null;
  };

  const totals = {
    unit: 'tCO2e',
    headline: {
      value: sum(recorded, c => c.headline.value),
      basis: recorded.map(c => `${c.label} (${c.section}): ${c.headline.label}`).join('; ') || 'No class recorded',
      note: 'The headline sums each recorded class on the boundary its section reports: §5.2 contributes '
        + 'financed scope 1 and 2, §5.9 contributes financed scope 1 excluding LULUCF. Scope 3 is summed '
        + 'apart and never into it; scope 1 including LULUCF is never added to the excluding figure.',
    },
    scope1: { value: sum(recorded, c => c.scope1 && c.scope1.value) },
    scope2: { value: sum(recorded, c => c.scope2 && c.scope2.value) },
    scope3: { value: sum(recorded, c => c.scope3 && c.scope3.value), note: 'Summed across classes apart from scope 1 and 2; never added to the headline.' },
    category: 'Scope 3 Category 15 (investments) of the reporting financial institution',
  };

  const combinableClasses = recorded.filter(c => c.combinable);
  const assessed = combinableClasses.length ? r2(combinableClasses.reduce((s, c) => s + (num(c.outstanding) ? c.outstanding : 0), 0)) : null;
  const excluded = recorded.filter(c => !c.combinable).map(c => ({ assetClass: c.assetClass, label: c.label, currency: c.currency, outstanding: c.outstanding }));
  const coverage = book && assessed !== null
    ? {
      assessedOutstanding: assessed, currency: bookCurrency, totalLoansAndInvestments: book.totalLoansAndInvestments,
      sharePct: r2((assessed / book.totalLoansAndInvestments) * 100), statedBy: book.statedBy || null,
      basis: 'Assessed outstanding across the classes in the book’s currency, over total loans and investments (DCL p.124).',
      excluded,
    }
    : {
      assessedOutstanding: assessed, currency: bookCurrency, totalLoansAndInvestments: book ? book.totalLoansAndInvestments : null,
      sharePct: null, excluded,
      remedy: book ? 'No recorded class is in the book’s currency, so no combined share can be stated.'
        : 'State the reporting year’s total loans and investments at PUT /v1/pcaf/part-a/book.',
    };

  const combinableHeadline = sum(combinableClasses, c => c.headline.value);
  const intensity = assessed !== null && assessed > 0 && combinableHeadline !== null
    ? { value: r4(combinableHeadline / (assessed / 1e6)), unit: `tCO2e per million ${bookCurrency}`,
      basis: 'Headline across the classes in the book’s currency over their assessed outstanding, in millions (DCL p.127).' }
    : { value: null, unit: bookCurrency ? `tCO2e per million ${bookCurrency}` : null, basis: 'No combined intensity: no recorded class shares the book’s currency, or no book total is stated.' };

  const outstandingItems = [];
  if (!book) outstandingItems.push({ what: 'State the reporting year’s total loans and investments', why: 'Coverage cannot be a percentage of a book nobody stated.', clause: 'DCL p.124' });
  if (!settings.reportingEntity) outstandingItems.push({ what: 'Record the reporting entity’s legal name', clause: 'Part A ch.6 (p.161)' });
  if (!settings.consolidationApproach) outstandingItems.push({ what: 'State the consolidation approach', clause: 'Part A ch.6 (p.161)' });
  if (!settings.fiscalYearEnd) outstandingItems.push({ what: 'Record the fiscal year-end', clause: 'Part A ch.4' });
  if (!settings.gwpBasis) outstandingItems.push({ what: 'State the IPCC assessment report the GWPs come from', clause: 'Part A ch.6 (p.163)' });
  if (!settings.preparedBy || !settings.approvedBy) outstandingItems.push({ what: 'Name who prepared and who approved the disclosure', clause: 'ISAE 3000 §12(a)' });
  for (const c of classes.filter(x => x.status !== 'recorded' && x.reasonStatedBy !== 'entity')) {
    outstandingItems.push({ what: `State why ${c.label} (${c.section}) is not reported, or record it`, why: c.reason, clause: 'Part A ch.6 (p.162)' });
  }
  for (const x of excluded) outstandingItems.push({ what: `${x.label} is denominated in ${x.currency}; the book total is in ${bookCurrency || 'an unstated currency'}`, why: 'Its outstanding is excluded from the combined coverage share rather than converted at a rate this system does not hold.', clause: 'DCL p.124' });

  return {
    reportingYear: year,
    currency: bookCurrency,
    book: book ? { totalLoansAndInvestments: book.totalLoansAndInvestments, currency: book.currency, statedBy: book.statedBy || null } : null,
    entity: settings,
    classes,
    totals,
    coverage,
    intensity,
    dataQuality: {
      byClass: recorded.map(c => ({ assetClass: c.assetClass, section: c.section, label: c.label, score: c.dataQuality.score, table: c.dataQuality.table, weighting: c.dataQuality.weighting })),
      note: 'One score per class, weighted by outstanding amount within it (DCL p.128). Scores are never averaged '
        + 'across classes: §5.2 and §5.9 score on different tables, and a mean of two categories from two scales means nothing.',
    },
    outstandingItems,
    exposures: recorded.reduce((s, c) => s + (c.exposures || 0), 0),
    source: 'Each class’s own reporting-year roll-up, read from its stored projection and laid side by side; nothing recomputed.',
  };
}

/** Every exposure of every recorded class, one row each, with the class named. */
async function registerRows(orgId, reportingYear) {
  const year = String(reportingYear);
  const [bl, sv] = await Promise.all([register.rows(orgId, year), sovereign.rows(orgId, year)]);
  const num_ = v => (num(v) ? v : null);
  const out = [];
  for (const r of bl) {
    const ex = r.exposure || {}; const cp = ex.counterparty || {}; const inv = r.inventory || {}; const dq = (inv.dataQuality || {}).scope1And2 || {};
    out.push({
      assetClass: 'business-loans-unlisted-equity', section: '§5.2', exposureId: ex.identifiers && ex.identifiers.id,
      counterparty: cp.name || null, sector: cp.sector || cp.naceL2 || null, instrument: ex.instrument || ex.kind || null,
      outstanding: ex.outstanding ? num_(ex.outstanding.value) : null, currency: (ex.outstanding && ex.outstanding.unit) || null,
      attributionFactor: r.attribution ? num_(r.attribution.value) : null, option: dq.option || null, score: num_(dq.score),
      headline: inv.scope1And2 ? num_(inv.scope1And2.value) : null, headlineLabel: 'scope 1 and 2',
      scope3: inv.scope3 && !inv.scope3.absent ? num_(inv.scope3.value) : null,
      verdict: (r.validation && r.validation.verdict) || 'clean', findings: (r.validation && r.validation.findings && r.validation.findings.length) || 0,
    });
  }
  for (const r of sv) {
    out.push({
      assetClass: 'sovereign-debt', section: '§5.9', exposureId: r.exposureId,
      counterparty: (r.country && (r.country.name || r.country.code)) || null, sector: (r.country && r.country.code) || null, instrument: 'sovereign',
      outstanding: num_(r.outstanding), currency: 'USD', attributionFactor: num_(r.attributionFactor), option: r.dqOption || null, score: num_(r.dqScore),
      headline: num_(r.attributed && r.attributed.scope1Excl), headlineLabel: 'scope 1 excl. LULUCF',
      scope3: num_(r.attributed && r.attributed.scope3),
      verdict: (r.findings || []).length ? 'accepted_with_findings' : 'clean', findings: (r.findings || []).length,
    });
  }
  return out;
}

const CSV_COLUMNS = ['assetClass', 'section', 'exposureId', 'counterparty', 'sector', 'instrument', 'outstanding', 'currency',
  'attributionFactor', 'option', 'score', 'headline', 'headlineLabel', 'scope3', 'verdict', 'findings'];

/** The register as CSV, RFC 4180 quoting, one header row. */
function csv(rows) {
  const cell = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [CSV_COLUMNS.join(','), ...rows.map(r => CSV_COLUMNS.map(k => cell(r[k])).join(','))].join('\r\n') + '\r\n';
}

function safe(s) { return String(s || 'report').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(); }

/** The consolidated disclosure, assembled from the position and the register. */
async function annualDisclosure(orgId, year, opts = {}) {
  const [pos, rows, common] = await Promise.all([
    position(orgId, year),
    registerRows(orgId, year),
    shared(orgId, opts.country),
  ]);
  if (!pos.classes.some(c => c.status === 'recorded')) {
    const err = /** @type {import('../../../shared/types').AppError} */ (new Error(
      `No Part A asset class holds exposures for ${year}. An empty year is not a position of zero.`));
    err.statusCode = 409; err.code = 'EMPTY_YEAR';
    err.remedy = 'Record exposures in the lending book or the sovereign book for this year first.';
    throw err;
  }
  const input = {
    position: pos, rows, reportingYear: String(year), insurer: opts.insurer,
    currency: opts.currency || pos.currency || 'LKR',
    assurance: common.assurance, assuranceDeclaration: common.assuranceDeclaration,
    band: common.band, recalculation: common.settings, meta: opts.meta || {},
  };
  const facts = reporting.disclosureFacts(input);
  return {
    facts,
    model: reporting.disclosureModel(input),
    input,
    safeName: `${safe(facts.insurer !== 'Reporting entity not stated' ? facts.insurer : opts.insurer)}-part-a-financed-emissions-${year}`,
  };
}

module.exports = { position, registerRows, csv, annualDisclosure, CAPABILITY, CSV_COLUMNS };
