/* ============================================================
   CarbonIQ — PCAF Part A, the lending book
   ============================================================

   Every figure on this screen comes from /v1/pcaf/part-a. The page holds
   no arithmetic of its own — not an attribution factor, not a sum of
   lines, not a score. A number computed here and a number computed by the
   engine would agree until the day they did not, and the disagreement
   would surface in a disclosure.

   So the loop is: choose a class and a year, read that class's position,
   read its rows, render what came back. One register holds every built
   Part A class; each is rolled up on its own table and never with another,
   and the form shows the selected class's inputs — a property's floor area
   travels with the unit it was measured in, and the engine converts it. Recording an exposure posts the form and renders the
   engine's answer — the figures, or the refusal with its clause.

   Three rules the render carries, each a way to draw a confident screen
   that is wrong:

     scope 3 is a line of its own and is never added to scope 1 and 2;
     removals and credits are lines of their own and net against nothing;
     an exposure with no attribution factor shows a dash, not a zero —
     Number(null) is 0, and 0 is finite, and that has cost this codebase
     three defects already.
   ============================================================ */

const PartARegisterPage = (() => {

  const $ = id => document.getElementById(id);
  const fmt = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—'
    : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  /* An amount with its code and its scale — `LKR 250,000,000 (250 mn)` — from the shared formatter. */
  const money = (n, ccy) => (window.CARBONIQ_money ? window.CARBONIQ_money.annotated(n, ccy || '') : `${ccy || ''} ${fmt(n, 0)}`.trim());
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const show = (id, yes) => { const el = $(id); if (el) el.hidden = !yes; };
  const when = iso => (iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '');

  const DEFAULT_CLASS = 'business-loans-unlisted-equity';
  let currency = 'LKR';
  let year = null;
  let cls = DEFAULT_CLASS;
  let classes = [];
  let reference = null;
  /* The climate vocabularies the detail prints in words, from the server. */
  let climateVocabulary = {};
  let rows = [];
  let openId = null;
  /* The exposure open in the detail, whole, and the one the form is editing. */
  let current = null;
  let editingId = null;

  const classLabel = () => { const c = classes.find(x => x.assetClass === cls); return c ? `${c.label} — PCAF Part A ${c.section}` : cls; };
  const isProperty = () => cls === 'commercial-real-estate' || cls === 'mortgages';

  /* A score is a category on a scale where 1 is best. Never a fraction of
     five. The weighted score across a book is shown to two decimals; a single
     exposure's score is the whole number its option carries. */
  const dqBadge = (v, label, dp = 0) => v === null || v === undefined
    ? `<span class="dqb dqb-na">${esc(label || 'not scored')}</span>`
    : `<span class="dqb dqb-${Math.round(v)}">${label ? `<i>${esc(label)}</i>` : ''}<b>${Number(v).toFixed(dp)}</b></span>`;

  const sevChip = sev => `<span class="partc-sev">${sev === 'material' ? 'material' : 'advisory'}</span>`;
  /* The five-cell scale takes the same ramp every PCAF screen badges with. */
  const DQ_RAMP = [1, 2, 3, 4, 5].map(n => `var(--dq${n})`);

  /* Each finding code, in the reader's words. The code is the engine's stable
     key for grouping; what a bank reads is what the finding is about. A code
     not listed here is spelled out from its own words. */
  const FINDING_WORDS = {
    FN71_AVERAGE_NOT_HELD: 'Year-end balance with no annual average to check it against (footnote 71)',
    FN71_YEAR_END_FLUCTUATION: 'Year-end balance well below the year’s average (footnote 71)',
    EMISSIONS_DATA_LAG: 'Borrower emissions from an earlier year than the reporting year',
    DENOMINATOR_EXCEEDS_ASSETS: 'Company value stated above the borrower’s total assets',
    INTENSITY_BAND_NOT_HELD: 'No sector intensity band held to check the figure against',
    INTENSITY_OUTSIDE_SECTOR_BAND: 'Emissions intensity outside the sector’s band',
    FACTOR_VINTAGE_STALE: 'Sector factor older than the vintage threshold, no deflator applied',
    HIGH_ATTRIBUTION_SHARE: 'Attribution share high enough to read as control',
  };
  const words = code => FINDING_WORDS[code] || String(code || '').replace(/_/g, ' ').toLowerCase();

  /* `Auth` is a top-level const in a classic script — a global lexical
     binding, not a property of window — so it is reached by name, the way
     app.js reaches every page module. */
  const preview = () => {
    try { return typeof Auth !== 'undefined' && typeof Auth.isPreview === 'function' && Boolean(Auth.isPreview()); }
    catch (_) { return false; }
  };

  async function call(path, opts = {}) {
    const res = await window.CARBONIQ_fetch('/v1/pcaf/part-a' + path, opts);
    let data = {};
    try { data = await res.json(); } catch (_) { /* empty */ }
    if (!res.ok) {
      const err = new Error([data.message, data.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
      err.status = res.status;
      err.code = data.error || data.code;
      throw err;
    }
    return data;
  }
  const post = (path, body) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const put = (path, body) => call(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const del = path => call(path, { method: 'DELETE' });

  /* Where an exposure stands in review — words, never a number. */
  const STATE_LABEL = { recorded: 'Recorded', under_review: 'Under review', approved: 'Approved' };
  const statePill = s => `<span class="pr-state pr-state-${esc(s || 'recorded')}">${esc(STATE_LABEL[s || 'recorded'] || s)}</span>`;

  // ── the held vocabulary ─────────────────────────────────────

  /* Reference data for the form: the sectors a factor and a band are held
     for. Loaded before the first request so the select is populated before
     anyone can open the form. */
  async function loadVocabulary() {
    /* The classes this register holds, offered in the order the server lists
       them; the selected one decides the form block, the position and the rows. */
    try {
      const { classes: held, defaultClass } = await call('/classes');
      classes = held || [];
      cls = defaultClass || DEFAULT_CLASS;
      setHtml('pr-class', classes.map(c => `<option value="${esc(c.assetClass)}">${esc(c.label)} · ${esc(c.section)}</option>`).join(''));
      /* The overview may have chosen a class on the way here; honoured once,
         before the first request, and only where it is a class held. */
      try {
        const wanted = localStorage.getItem('carboniq.parta.class');
        if (wanted) { localStorage.removeItem('carboniq.parta.class'); if (classes.some(c => c.assetClass === wanted)) cls = wanted; }
      } catch (_) { /* a courtesy */ }
      if ($('pr-class')) $('pr-class').value = cls;
    } catch (_) { classes = [{ assetClass: DEFAULT_CLASS, label: 'Business loans and unlisted equity', section: '§5.2' }]; }

    /* Building types, archetypes and the data-quality options come from the
       reference, so the form offers only what the engine holds. */
    try {
      reference = await call('/reference');
      const at = id => (reference.assetClasses || []).find(c => c.id === id) || {};
      const types = at('commercial-real-estate').buildingTypes || [];
      setHtml('pr-f-building-type', types.map(t => `<option value="${esc(t.key)}">${esc(t.label)}</option>`).join(''));
      setHtml('pr-f-pf-archetype', (reference.archetypes || [{ id: 'general', label: 'General' }])
        .map(a => `<option value="${esc(a.id)}">${esc(a.label)}</option>`).join(''));
      const vehicleClasses = at('motor-vehicle-loans').vehicleClasses || [];
      setHtml('pr-f-mv-class', '<option value="">Not known — average vehicle</option>' + vehicleClasses
        .filter(c => c.key !== 'average').map(c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join(''));
      const pfOptions = at('project-finance').dataQualityOptions || [];
      setHtml('pr-f-pf-option', pfOptions.map(o => `<option value="${esc(o.option)}">Option ${esc(o.option)} — score ${esc(o.score)}</option>`).join(''));
    } catch (_) { /* the engine refuses a type or an option it does not hold, by name */ }

    /* The climate vocabularies, from the same registry the S2 facts panel
       reads, so the two screens cannot offer different words for one answer. */
    try {
      const { vocabulary } = await call('/climate/reference');
      climateVocabulary = vocabulary || {};
      fillClimateLists(climateVocabulary);
    } catch (_) { /* the register refuses a verdict outside the list, by name */ }

    const sel = $('pr-f-sector-key');
    if (!sel) return;
    try {
      const { vocabulary } = await call('/factors');
      const sectors = (vocabulary && vocabulary.sectors) || [];
      sel.innerHTML = '<option value="">Not mapped</option>' + sectors
        .map(x => `<option value="${esc(x.key)}">${esc(x.label)} · ISIC ${esc(x.isic)}${x.held ? '' : ' · no factor held'}</option>`).join('');
    } catch (_) { /* the free-text sector still records; the engine says what it could not map */ }
  }

  /* Show the selected class's block and nothing else's. */
  function applyClass() {
    cls = ($('pr-class') && $('pr-class').value) || cls;
    for (const el of document.querySelectorAll('#pr-form [data-class-form]')) {
      el.hidden = !el.getAttribute('data-class-form').split(' ').includes(cls);
    }
    show('pr-re-construction', cls === 'commercial-real-estate');
    /* The §5.2 disclosure is §5.2's; the other classes are filed through the
       consolidated disclosure on the Financed emissions screen. */
    show('pr-pdf', cls === DEFAULT_CLASS);
    show('pr-docx', cls === DEFAULT_CLASS);
    say('pr-subtitle', `${classLabel()}`);
    say('pr-record-hint', isProperty()
      ? 'A property loan. Key the floor area in the unit the valuation states; the engine converts it and the trace shows the conversion.'
      : 'The engine runs before anything is written; a refusal names its clause.');
    /* The form's shape has just changed — a class carries its own blocks and
       the rest are hidden — so the sections are re-read and a section left
       holding nothing is dropped from the rail rather than opening blank. */
    if (typeof FormSteps !== 'undefined') FormSteps.reset($('pr-form'));
  }

  // ── years ──────────────────────────────────────────────────

  async function loadYears() {
    let years = [];
    try { ({ years } = await call('/years')); } catch (_) { years = []; }
    const chosen = $('pr-year') ? $('pr-year').value : '';
    const list = years.map(y => y.reportingYear);
    if (!list.length) list.push(String(new Date().getFullYear()));
    setHtml('pr-year', list.map(y => `<option value="${esc(y)}">${esc(y)}</option>`).join(''));
    $('pr-year').value = list.includes(chosen) ? chosen : list[list.length - 1];
    year = $('pr-year').value;
  }

  /* The year-end balance is the reporting year's (§5.2 fn 71), so the as-of
     fields default to that year's 31 December and follow the year selector —
     the calendar year's would put a FY2025 exposure on a 2026 date. A date
     somebody typed is left alone. */
  const ASOF_FIELDS = ['pr-f-asof', 'pr-f-re-asof', 'pr-f-le-asof', 'pr-f-mv-asof'];
  let asOfDefault = '';
  function defaultAsOf() {
    const next = year ? `${year}-12-31` : '';
    for (const id of ASOF_FIELDS) {
      const el = $(id);
      if (el && (!el.value || el.value === asOfDefault)) el.value = next;
    }
    asOfDefault = next;
  }

  // ── the position ───────────────────────────────────────────

  /* The Walkthrough hands over what it wants this screen to show — the record
     form filled in for one example loan, the loan just recorded, or that loan
     with its approval controls marked — the way the overview hands it a class:
     one key, read once the book is on screen, then forgotten. */
  const REGISTER_INTENT = 'carboniq.register.intent';
  const cue = id => { if (typeof window !== 'undefined' && typeof window.CARBONIQ_cue === 'function') window.CARBONIQ_cue(id); };

  async function applyIntent() {
    let intent = null;
    try { intent = localStorage.getItem(REGISTER_INTENT); if (intent) localStorage.removeItem(REGISTER_INTENT); } catch (_) { intent = null; }
    if (!intent) return;
    const [kind, key] = intent.split(':');
    if (kind === 'record' && key === 'example') await recordExample('reported');
    if (kind === 'record' && key === 'example-sector') await recordExample('sector');
    if (kind === 'open' && key === 'latest') await openLatest(false);
    if (kind === 'approve' && key === 'latest') await openLatest(true);
  }

  /* The most recently recorded row of the class on screen: the one the
     presenter just pressed Record on. A pick, not a computation. */
  function latestRow() {
    let best = null;
    for (const r of rows) if (!best || String(r.createdAt || '') > String(best.createdAt || '')) best = r;
    return best;
  }

  async function openLatest(approving) {
    const r = latestRow();
    if (!r) return;
    await openDetail(r.exposureId);
    if (approving) { cue('pr-detail-review'); cue('pr-detail-approve'); }
  }

  /* The record form, filled in for one illustrative borrower the API serves,
     so the room sees what is collected without watching it typed. Nothing is
     written until Record is pressed, and every field can be changed first. */
  async function recordExample(variant) {
    if (preview()) return;
    let example;
    try { ({ example } = await call(`/starter/example?reportingYear=${encodeURIComponent(year)}&variant=${encodeURIComponent(variant || 'reported')}`)); }
    catch (err) { say('pr-status', err.message); return; }
    endEdit(); closeDetail();
    cls = example.assetClass || cls;
    if ($('pr-class')) $('pr-class').value = cls;
    applyClass();
    $('pr-form').reset();
    fill(example);
    fillClimate(example.climate);
    applyDenominatorMode();
    applyKnown();
    say('pr-record-hint', variant === 'sector'
      ? `${example.counterparty.name} — a borrower with no emissions figures of its own. Its industry and revenue are set; the preview beneath shows what the held sector factor makes of it. Change anything, then press Record.`
      : `${example.counterparty.name} — an illustrative loan with every field filled. Change anything, then press Record: the engine runs before it is written.`);
    show('pr-record', true);
    $('pr-record').scrollIntoView({ behavior: 'smooth', block: 'start' });
    schedulePreview(0);
    cue('pr-form-submit');
  }

  async function load() {
    year = $('pr-year').value;
    defaultAsOf();
    say('pr-status', 'Loading…');
    let position = null;
    try {
      position = await call(`/position/${year}?assetClass=${encodeURIComponent(cls)}`);
    } catch (err) {
      /* An empty year is a 409 by design — a book with nothing in it and a
         book nobody has measured are different claims. It is told apart from
         a failure: one is the next step, the other is a fault to report. */
      show('pr-body', false);
      say('pr-status', err.status === 409
        ? `No ${classLabel().split(' — ')[0].toLowerCase()} exposures recorded in FY${year} yet.${preview() ? '' : ' Record an exposure to begin.'}`
        : `Could not read the book: ${err.message}`);
      /* An empty year is where recording begins, so a hand-over asking for
         the record form is honoured here too. */
      if (err.status === 409) await applyIntent();
      return;
    }
    let list = [];
    let unread = null;
    try { ({ exposures: list } = await call(`/exposures?reportingYear=${encodeURIComponent(year)}&assetClass=${encodeURIComponent(cls)}&limit=200`)); }
    catch (err) { unread = err; }
    rows = list;
    render(position);
    show('pr-body', true);
    /* A list that could not be read is not an empty book. The failure used to
       be written to the status and then overwritten two lines later by the
       count the position returned, so a refused read drew the position's own
       "7 exposure(s)" above a table with nothing in it — the reader is told
       the book is there and shown that it is not. */
    say('pr-status', unread
      ? `The position is FY${position.reportingYear}; the exposures could not be read: ${unread.message}`
      : `${position.exposures} exposure(s) in FY${position.reportingYear}.`);
    await applyIntent();
  }

  function render(p) {
    currency = (p.coverage && p.coverage.currency) || currency;
    const L = p.total.lines;
    say('pr-subtitle', `FY${p.reportingYear} · ${currency} · ${classLabel()}`);
    say('pr-s12', fmt(L.scope1And2.value, 2));
    say('pr-s3', L.scope3.value === null ? '—' : fmt(L.scope3.value, 2));
    say('pr-removals', L.removals.value === null ? '—' : fmt(L.removals.value, 2));

    const dq = p.total.dataQuality;
    setHtml('pr-dq12', dq.scope1And2.score === null
      ? '<span class="dqb dqb-na">no score</span>'
      : `Outstanding-weighted ${dqBadge(dq.scope1And2.score, null, 2)}`);
    setHtml('pr-dq3', dq.scope3.score === null
      ? `<span class="dqb dqb-na">${L.scope3.counted ? 'no score' : 'not reported'}</span>`
      : `Outstanding-weighted ${dqBadge(dq.scope3.score, null, 2)}${dq.scope3.excluded ? ` <span class="partc-hint">${dq.scope3.excluded} without a figure, excluded</span>` : ''}`);

    if (p.coverage.share === null) {
      say('pr-coverage', '—');
      say('pr-coverage-unit', 'book total not stated');
    } else {
      say('pr-coverage', `${(p.coverage.share * 100).toFixed(1)}%`);
      say('pr-coverage-unit', 'of total loans and investments');
    }

    renderBook(p);
    renderGroups(p);
    renderPlan(p.improvementPlan);
    renderRows();
    if (openId && !rows.find(r => r.exposureId === openId)) closeDetail();
  }

  function renderBook(p) {
    const c = p.coverage;
    if (c.share === null) {
      setHtml('pr-book', `<p class="partc-hint">Not stated for FY${esc(p.reportingYear)}. Coverage cannot be a percentage of anything until it is.</p>`);
    } else {
      setHtml('pr-book', `
        <dl class="pr-kv">
          <dt>Total loans and investments</dt><dd>${esc(money(c.totalLoansAndInvestments, c.currency || currency))}</dd>
          <dt>Assessed outstanding</dt><dd>${esc(money(p.total.outstanding, currency))}</dd>
          <dt>Coverage</dt><dd>${(c.share * 100).toFixed(2)}%</dd>
          <dt>Basis</dt><dd>Declared${c.statedBy ? ` by ${esc(c.statedBy)}` : ''}</dd>
        </dl>`);
    }
    show('pr-book-form', !preview());
    if ($('pr-book-currency') && !$('pr-book-currency').value) $('pr-book-currency').value = currency;
  }

  function renderGroups(p) {
    const groups = [];
    const g = (label, obj) => Object.entries(obj || {}).map(([k, v]) => ({ label, key: k, ...v }));
    /* The groupings are the class's own — sector, kind and borrower type for a
       loan book; building type and product for a property book. */
    const declared = Array.isArray(p.groupings) && p.groupings.length
      ? p.groupings
      : [{ key: 'bySector', label: 'Sector' }, { key: 'byKind', label: 'Kind' }, { key: 'byBorrowerType', label: 'Borrower type' }];
    for (const d of declared) groups.push(...g(d.label, p[d.key]));
    const fin = p.financialSector;
    setHtml('pr-groups', `
      <div class="pr-scroll"><table class="partc-table">
        <thead><tr><th>Grouped by</th><th>Group</th><th>Exposures</th><th>Outstanding</th><th>Scope 1 and 2</th><th>Scope 3</th><th>Score</th></tr></thead>
        <tbody>
          ${groups.map(x => `<tr>
            <td>${esc(x.label)}</td><td>${esc(x.key)}</td>
            <td class="num">${x.exposures}</td>
            <td class="num">${fmt(x.outstanding, 0)}</td>
            <td class="num">${fmt(x.lines.scope1And2.value, 2)}</td>
            <td class="num">${x.lines.scope3.value === null ? '—' : fmt(x.lines.scope3.value, 2)}</td>
            <td class="num">${dqBadge(x.dataQuality.scope1And2.score, null, 2)}</td>
          </tr>`).join('')}
          ${fin ? `<tr class="total"><td>Financial-sector borrowers</td><td>apart</td>
            <td class="num">${fin.exposures}</td><td class="num">${fmt(fin.outstanding, 0)}</td>
            <td class="num">${fmt(fin.lines.scope1And2.value, 2)}</td>
            <td class="num">${fin.lines.scope3.value === null ? '—' : fmt(fin.lines.scope3.value, 2)}</td>
            <td class="num">${dqBadge(fin.dataQuality.scope1And2.score, null, 2)}</td></tr>` : ''}
        </tbody></table></div>
      ${fin ? `<p class="partc-hint">Exposures to other financial institutions are rolled up apart — PCAF Part A §5.2 (p.56); §5.1 (p.41).</p>` : ''}`);
  }

  function renderPlan(plan) {
    if (!plan) { setHtml('pr-plan', ''); return; }
    say('pr-plan-note', `Reported score ${plan.reportedScore.score === null ? '—' : Number(plan.reportedScore.score).toFixed(2)}, weighted by outstanding amount. Target score ${plan.target}. Every figure below is a scenario.`);
    const steps = plan.steps.length
      ? `<h5 class="partc-subhead">By option — what one step would be worth</h5>
        <div class="pr-scroll"><table class="partc-table">
          <thead><tr><th>Option</th><th>Score now</th><th>Exposures</th><th>Outstanding</th><th>Share of book</th><th>Scenario score</th><th>Movement</th></tr></thead>
          <tbody>${plan.steps.map(s => `<tr>
            <td>Option ${esc(s.option)}</td>
            <td class="num">${dqBadge(s.currentScore)}</td>
            <td class="num">${s.exposures}</td>
            <td class="num">${fmt(s.outstanding, 0)}</td>
            <td class="num">${s.shareOfBook === null ? '—' : (s.shareOfBook * 100).toFixed(1) + '%'}</td>
            <td class="num">${s.scenarioScore === null ? '—' : Number(s.scenarioScore).toFixed(2)} <span class="partc-hint">scenario</span></td>
            <td class="num">${s.movement === null ? '—' : '−' + Number(s.movement).toFixed(2)}</td>
          </tr>`).join('')}</tbody></table></div>`
      : '<p class="partc-hint">Every exposure is at or above the target score.</p>';
    const remedies = plan.byRemedy.length
      ? `<h5 class="partc-subhead">By remedy — what would clear each finding</h5>
        <div class="pr-scroll"><table class="partc-table">
          <thead><tr><th>Severity</th><th>Finding</th><th>Exposures</th><th>Outstanding</th><th>What clears it</th></tr></thead>
          <tbody>${plan.byRemedy.map(r => `<tr>
            <td>${sevChip(r.severity)}</td>
            <td>${esc(words(r.code))}</td>
            <td class="num">${r.exposures}</td>
            <td class="num">${fmt(r.outstanding, 0)}</td>
            <td>${esc(r.remedy)}</td>
          </tr>`).join('')}</tbody></table></div>`
      : '<p class="partc-hint">No findings across the book.</p>';
    setHtml('pr-plan', `${steps}${remedies}<p class="partc-hint">${esc(plan.scenarioNote)}</p>`);
  }

  function renderRows() {
    say('pr-rows-note', rows.length ? `${rows.length} shown. Open a row for its trace and findings.` : '');
    setHtml('pr-rows', rows.length === 0
      ? '<p class="partc-hint">No exposures recorded in this year.</p>'
      : `<div class="pr-scroll"><table class="partc-table">
          <thead><tr><th>Counterparty</th><th>Instrument</th><th>Outstanding</th><th>Attribution factor</th><th>Scope 1 and 2</th><th>Scope 3</th><th>Score</th><th>Checks</th><th>Status</th></tr></thead>
          <tbody>${rows.map(r => {
            const x = r.result || {};
            const inv = x.inventory || {};
            const af = x.attribution && Number.isFinite(x.attribution.value) ? x.attribution.value.toFixed(4) : '—';
            const dq = inv.dataQuality || {};
            const v = (x.validation || {});
            const n = (v.findings || []).length;
            const material = (v.findings || []).some(f => f.severity === 'material');
            return `<tr class="pr-row${r.exposureId === openId ? ' is-open' : ''}" data-id="${esc(r.exposureId)}">
              <td>${esc(r.counterparty && r.counterparty.name)}<br><span class="partc-hint">${esc(r.counterparty && r.counterparty.sector || '')}</span></td>
              <td>${esc((x.exposure && x.exposure.instrument || '').replace(/-/g, ' '))}</td>
              <td class="num">${fmt(x.exposure && x.exposure.outstanding && x.exposure.outstanding.value, 0)}</td>
              <td class="num">${af}</td>
              <td class="num">${fmt(inv.scope1And2 && inv.scope1And2.value, 2)}</td>
              <td class="num">${inv.scope3 && inv.scope3.absent ? '—' : fmt(inv.scope3 && inv.scope3.value, 2)}</td>
              <td class="num">${dqBadge(dq.scope1And2 && dq.scope1And2.score, dq.scope1And2 && dq.scope1And2.option ? 'Option ' + dq.scope1And2.option : null)}<br>${basisChip(dq.scope1And2 && dq.scope1And2.option)}</td>
              <td><span class="pr-verdict ${n === 0 ? 'pr-verdict-clean' : material ? 'pr-verdict-material' : ''}">${n === 0 ? 'clean' : `${n} finding${n === 1 ? '' : 's'}`}</span></td>
              <td>${statePill(r.status)}</td>
            </tr>`;
          }).join('')}</tbody></table></div>`);
    for (const tr of document.querySelectorAll('#pr-rows .pr-row')) {
      tr.addEventListener('click', () => openDetail(tr.getAttribute('data-id')));
    }
  }

  // ── one exposure ───────────────────────────────────────────

  async function openDetail(id) {
    openId = id;
    let exposure;
    try { ({ exposure } = await call(`/exposures/${encodeURIComponent(id)}`)); }
    catch (err) { say('pr-status', err.message); return; }
    current = exposure;
    renderDetail(exposure);
    renderRows();
    show('pr-detail', true);
    $('pr-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeDetail() { openId = null; current = null; show('pr-detail', false); renderRows(); }

  /* The bank's own SLFRS S2 judgement about this loan, in the words the
     vocabulary uses. An exposure with none says so: unassessed is an answer
     the disclosure reports, not a blank. */
  function climatePanel(c) {
    const word = (list, id) => {
      const row = (climateVocabulary[list] || []).find(o => o.id === id);
      return row ? esc(row.label) : null;
    };
    const t = (c && c.transitionRisk) || {}; const ph = (c && c.physicalRisk) || {}; const op = (c && c.opportunity) || {};
    const horizon = h => (h ? ` <span class="partc-hint">over the ${esc((word('horizons', h) || h).toLowerCase())}</span>` : '');
    const verdict = (list, v) => (word(list, v) || 'Not assessed');
    return `<h5 class="partc-subhead">Climate risk and opportunity</h5>
      <dl class="pr-kv">
        <dt>Transition risk</dt><dd>${verdict('climateVerdicts', t.verdict)}${horizon(t.horizon)}</dd>
        <dt>Physical risk</dt><dd>${verdict('climateVerdicts', ph.verdict)}${horizon(ph.horizon)}</dd>
        <dt>Opportunity alignment</dt><dd>${verdict('alignmentVerdicts', op.verdict)}${op.taxonomyCode ? ` <span class="partc-hint">${esc(op.taxonomyCode)}</span>` : ''}</dd>
      </dl>
      ${t.note ? `<p class="partc-hint">${esc(t.note)}</p>` : ''}
      <p class="partc-hint">SLFRS S2 §29(b)–(d). Recorded by the bank; the position sums what is assessed and states what is not.</p>`;
  }

  function renderDetail(e) {
    const x = e.result;
    const inv = x.inventory;
    const cp = x.exposure.counterparty || {};
    say('pr-detail-title', cp.name || 'Exposure');
    say('pr-detail-status', '');
    const stateEl = $('pr-detail-state');
    if (stateEl) { stateEl.className = `pr-state pr-state-${e.status || 'recorded'}`; stateEl.textContent = STATE_LABEL[e.status || 'recorded'] || e.status; }
    const dq = inv.dataQuality;
    const findings = (x.validation && x.validation.findings) || [];
    const ccy = x.exposure.outstanding && x.exposure.outstanding.currency;
    const held = l => Boolean(l && !l.absent && Number.isFinite(l.value));
    const charts = typeof Charts !== 'undefined';
    /* The seven lines the engine returns, drawn: scope 1 and 2 in the page's
       hue, scope 3 apart in grey — every value the engine's, the drawing only
       scales them. The table beneath carries the lines the borrower did not
       report with the standard's own sentence behind a disclosure, so the
       panel reads as figures first and reasons on request. */
    const bars = [
      { key: 'scope1', label: 'Scope 1', value: held(inv.scope1) ? inv.scope1.value : null, color: 'var(--p-accent, #0d9488)' },
      { key: 'scope2', label: 'Scope 2', value: held(inv.scope2) ? inv.scope2.value : null, color: 'color-mix(in srgb, var(--p-accent, #0d9488) 55%, white)' },
      { key: 'scope3', label: 'Scope 3 — apart', value: held(inv.scope3) ? inv.scope3.value : null, color: 'var(--cls-scope3, #a3a3a3)' },
    ];
    const LINES = [['Scope 1', inv.scope1], ['Scope 2', inv.scope2], ['Scope 1 and 2', inv.scope1And2], ['Scope 3', inv.scope3],
      ['Removals', inv.removals], ['Credits generated', inv.creditsGenerated], ['Credits retired', inv.creditsRetired]].filter(([, l]) => l);
    const lineRow = ([label, l]) => `<tr><td>${esc(label)}</td><td class="num">${held(l) ? fmt(l.value, 2) : '—'}</td>
      <td>${held(l) ? '<span class="pr-chip pr-chip-ok">Reported</span>'
        : `<span class="pr-chip">Not reported</span>${l.reason ? `<details class="pr-why"><summary>Why</summary><p>${esc(l.reason)}</p></details>` : ''}`}</td></tr>`;
    /* The attribution factor is the engine's; the ring shows it as the share
       of the borrower it is, which is the factor in percent and nothing more. */
    const af = x.attribution ? Number(x.attribution.value) : NaN;
    const attributionPct = Number.isFinite(af) ? af * 100 : null;
    const badge12 = dqBadge(dq.scope1And2.score, `Option ${dq.scope1And2.option}`);
    const badge3 = dq.scope3 && !dq.scope3.absent ? `${dqBadge(dq.scope3.score, `Option ${dq.scope3.option}`)} scope 3` : 'scope 3 not scored';
    const steps = ['recorded', 'under_review', 'approved'];
    const at = steps.indexOf(e.status || 'recorded');
    const trail = (e.approval && e.approval.history) || [];
    setHtml('pr-detail-body', `
      <div class="pr-stats">
        <div class="pr-stat pr-stat-primary">
          <span class="pr-stat-label">Financed scope 1 and 2</span>
          <span class="pr-stat-value">${held(inv.scope1And2) ? fmt(inv.scope1And2.value, 2) : '—'}</span>
          <span class="pr-stat-unit">tCO₂e · the bank’s attributed share</span>
        </div>
        <div class="pr-stat">
          <span class="pr-stat-label">Financed scope 3 — apart</span>
          <span class="pr-stat-value${held(inv.scope3) ? '' : ' pr-stat-value-sm'}">${held(inv.scope3) ? fmt(inv.scope3.value, 2) : 'Not reported'}</span>
          <span class="pr-stat-unit">${held(inv.scope3) ? 'tCO₂e · never summed with scope 1 and 2' : 'the reason is stated with the line below'}</span>
        </div>
        <div class="pr-stat">
          <span class="pr-stat-label">Data quality</span>
          ${charts ? Charts.scale(dq.scope1And2.score, { label: 'Data quality score, scope 1 and 2', colors: DQ_RAMP }) : ''}
          <span class="pr-stat-unit">${badge12} scope 1 and 2 · ${badge3}</span>
          <span class="pr-stat-unit">${basisChip(dq.scope1And2.option)}</span>
        </div>
        <div class="pr-stat pr-stat-ring">
          <div class="pr-stat-ring-draw">${charts ? Charts.ring(attributionPct, { label: 'Attribution share', color: 'var(--p-accent, #0d9488)' }) : ''}</div>
          <div class="pr-stat-ring-text">
            <span class="pr-stat-label">Attribution</span>
            <span class="pr-stat-value pr-stat-value-sm">${x.attribution ? esc(String(x.attribution.value)) : '—'}</span>
            <span class="pr-stat-unit">${x.attribution ? 'of the borrower’s emissions is the bank’s' : 'no attribution factor — a sector-average option'}</span>
          </div>
        </div>
      </div>
      <div class="partc-panels">
        <div class="partc-panel">
          <h5 class="partc-subhead">Financed lines</h5>
          ${charts ? Charts.hbars(bars, { label: 'Financed scope 1, scope 2 and scope 3 apart, tCO2e', decimals: 2, compact: true }) : ''}
          <div class="pr-scroll"><table class="partc-table pr-lines">
            <thead><tr><th>Line</th><th>tCO₂e</th><th>Basis</th></tr></thead>
            <tbody>${LINES.map(lineRow).join('')}</tbody></table></div>
          <p class="partc-hint">${esc(inv.separation)}</p>
        </div>
        <div class="partc-panel">
          <h5 class="partc-subhead">Attribution</h5>
          ${x.attribution ? `<p class="pr-eq">${esc(x.attribution.equation)}</p>
            <dl class="pr-kv"><dt>Factor</dt><dd>${esc(String(x.attribution.value))}</dd>
            <dt>Outstanding</dt><dd>${esc(money(x.exposure.outstanding.value, ccy))}</dd>
            ${x.denominator ? `<dt>Company value</dt><dd>${esc(money(x.denominator.value, ccy))} <span class="partc-hint">${esc(x.denominator.equation)}</span></dd>` : ''}</dl>
            ${x.denominator && x.denominator.assumptions && x.denominator.assumptions.length ? `<ul class="partc-hint">${x.denominator.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}`
            : '<p class="partc-hint">No attribution factor: the figure rests on a sector-average option and is a rough estimate of this institution\'s share.</p>'}
          <h5 class="partc-subhead">Data quality</h5>
          <p class="partc-hint">${esc(dq.scale)}${dq.scope1And2.note ? ` ${esc(dq.scope1And2.note)}` : ''}</p>
          ${x.factorRelease ? `<h5 class="partc-subhead">Factor set</h5>
            <dl class="pr-kv"><dt>Table</dt><dd>${esc(x.factorRelease.tables[0].table)} v${esc(x.factorRelease.tables[0].version)} · ${esc(x.factorRelease.tables[0].status)}</dd>
            <dt>Rows</dt><dd>${esc(x.factorRelease.rows.join(', '))}</dd>
            <dt>SHA-256</dt><dd><code>${esc(x.factorRelease.checksum.slice(0, 16))}…</code></dd></dl>` : ''}
          ${x.exposure.counterparty.sectorKey ? `<p class="partc-hint">Held sector: ${esc(x.exposure.counterparty.sectorKey)}</p>` : ''}
        </div>
      </div>
      ${facilityPanel(x, ccy)}
      ${climatePanel(e.climate)}
      ${nativePanel(x)}
      <h5 class="partc-subhead">What the data says about itself</h5>
      ${findings.length === 0
        ? `<p class="partc-hint">${esc((x.validation && x.validation.note) || 'No findings.')}</p>`
        : findings.map(f => `<div class="pr-finding partc-sev-${f.severity === 'material' ? 'material' : 'info'}">
            <div>${sevChip(f.severity)}</div>
            <div class="pr-finding-body">
              <p>${esc(f.statement)}</p>
              <p class="partc-hint">${esc(f.effect)}</p>
              <p><strong>What clears it.</strong> ${esc(f.remedy)}</p>
              <span class="partc-hint">${esc(f.reference)}</span>
            </div>
          </div>`).join('')}
      <h5 class="partc-subhead">Review</h5>
      <ol class="pr-steps" aria-label="Review">${steps.map((s, i) => `<li class="${i < at ? 'is-done' : i === at ? 'is-on' : ''}"><i></i><span>${esc(STATE_LABEL[s])}</span></li>`).join('')}</ol>
      ${e.approval && e.approval.approvedAt ? `<p class="partc-hint">Approved by ${esc(e.approval.approvedBy || 'the reporting entity')} on ${esc(when(e.approval.approvedAt))} — frozen until reopened with a reason.</p>` : ''}
      ${trail.length ? `<p class="partc-hint">Review trail: ${trail.map(m => `${esc(STATE_LABEL[m.from] || m.from)} → ${esc(STATE_LABEL[m.to] || m.to)} (${esc(m.by || 'system')}${m.reason ? `: ${esc(m.reason)}` : ''})`).join('; ')}.</p>` : ''}
      <p class="partc-hint">Computed ${esc(when(e.computedAt))} · ${esc(e.standard)}</p>`);
    for (const el of document.querySelectorAll('#pr-detail [data-writes]')) el.hidden = preview();
    applyState(e);
  }

  /* Which review controls the exposure's state allows. A preview visitor has
     none; an approved exposure offers no edit, recomputation or removal — it
     is frozen until reopened — and the server refuses either way. */
  function applyState(e) {
    const st = e.status || 'recorded';
    const allow = (id, ok) => { const el = $(id); if (el) el.hidden = preview() || !ok; };
    allow('pr-detail-review', st === 'recorded');
    allow('pr-detail-approve', st === 'under_review');
    allow('pr-detail-draft', st === 'under_review');
    allow('pr-detail-reopen', st === 'approved');
    allow('pr-detail-edit', st !== 'approved');
    allow('pr-detail-recompute', st !== 'approved');
    allow('pr-detail-remove', st !== 'approved');
  }

  /* One move through review. Reopening an approved exposure asks for the
     reason, because the server records it and refuses without one. */
  async function changeStatus(to) {
    if (!openId || !current) return;
    let reason;
    if (to === 'under_review' && current.status === 'approved') {
      reason = window.prompt('Why is this approved exposure being reopened? The reason is recorded on its trail.');
      if (!reason || !reason.trim()) return;
    }
    say('pr-detail-status', 'Moving…');
    try {
      await post(`/exposures/${encodeURIComponent(openId)}/status`, reason ? { status: to, reason: reason.trim() } : { status: to });
      await load();
      if (openId) await openDetail(openId);
      say('pr-detail-status', `Now ${(STATE_LABEL[to] || to).toLowerCase()}.`);
    } catch (err) { say('pr-detail-status', err.message); }
  }

  /* The engine's own result for a class whose shape is not the seven lines —
     the building's energy and the area as keyed, the project's derivation and
     impact, the holding's classification. Read and rendered, never restated. */
  function nativePanel(x) {
    const n = x.native;
    if (!n) return '';
    const kv = pairs => `<dl class="pr-kv">${pairs.filter(p => p && p[1] !== undefined && p[1] !== null && p[1] !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
    let body = '';
    if (n.property) {
      const en = (n.inventory && n.inventory.energy) || {};
      const fx = (n.inventory && n.inventory.factors) || {};
      const bl = fx.baselines || {};
      const origin = b => (b ? (b.scope === 'table' ? 'provisional table' : `${b.scope} baseline${b.version ? ` v${b.version}` : ''}`) : '');
      body = kv([
        ['Class', `${esc(n.property.class)} (${esc(n.property.section)}) · ${esc(n.property.country)}`],
        ['Building type', esc(n.property.buildingType || '—')],
        ['Energy basis', esc(fx.basis || '')],
        en.floorAreaAsKeyed ? ['Floor area as keyed', `${fmt(en.floorAreaAsKeyed.value, 2)} ${esc(en.floorAreaAsKeyed.unit)}`] : null,
        en.floorAreaConversion ? ['Conversion', `<span class="pr-eq">${esc(en.floorAreaConversion)}</span>`] : null,
        en.floorArea_m2 !== undefined ? ['Floor area', `${fmt(en.floorArea_m2, 2)} m²`] : null,
        en.intensity_kWh_per_m2_yr !== undefined ? ['Energy intensity', `${fmt(en.intensity_kWh_per_m2_yr, 1)} kWh per m² per year · ${esc(origin(bl.intensity))}`] : null,
        en.labelClass ? ['Energy label', esc(en.labelClass)] : null,
        en.buildingCount ? ['Buildings', `${en.buildingCount} × ${fmt(en.floorAreaPerBuilding_m2, 0)} m² typical`] : null,
        ['Electricity', `${fmt(en.electricity_kWh, 0)} kWh × ${esc(String(fx.electricity))} kgCO₂e/kWh · ${esc(origin(bl.electricity))}`],
        ['Fuel', `${fmt(en.fuel_kWh, 0)} kWh ${esc(en.fuelSource || '')} × ${esc(String(fx.fuel))} kgCO₂e/kWh · ${esc(origin(bl.fuel))}`],
        ['Building scope 1 and 2 (100%)', `${fmt(n.inventory.buildingEmissions.combined, 2)} tCO₂e`],
        ['Origination value', `${fmt(x.denominator && x.denominator.value, 0)} · ${esc(x.denominator && x.denominator.state || '')}`],
        n.provisional ? ['Provisional', 'A provisional factor or intensity is in use; the trace names it.'] : null,
      ]);
    } else if (n.facility) {
      const dq = n.inventory.dataQuality;
      body = kv([
        ['Facility', `${esc(n.facility.section)} · ${n.facility.vehicles} vehicle(s) · ${esc(n.facility.productType)}`],
        ['Value at origination', n.denominator.value === null ? 'unknown — 100% attribution, the standard’s default (§5.6, p.91)' : fmt(n.denominator.value, 0)],
        dq.mix && dq.mix.length > 1 ? ['Options in the mix', `${esc(dq.mix.join(', '))} — ${esc(dq.rule)}`] : null,
        ['Vehicles (100%)', `${fmt(n.inventory.vehicleEmissions.combined, 2)} tCO₂e`],
      ]) + n.inventory.vehicles.map(v => kv([
        [esc(v.makeModel || v.label), `${dqBadge(v.score, 'Option ' + v.option)} ${esc(v.basis)}`],
        v.efficiency ? ['Efficiency', `${fmt(v.efficiency.value, 2)} ${esc(v.efficiency.unit)}${v.efficiency.asKeyed && v.efficiency.conversion ? ` <span class="partc-hint">(${fmt(v.efficiency.asKeyed.value, 1)} ${esc(v.efficiency.asKeyed.unit)} as keyed)</span>` : ''} · ${esc(v.efficiency.basis)}`] : null,
        v.distance ? ['Distance', `${fmt(v.distance.km, 0)} km · ${esc(v.distance.basis)} <span class="partc-hint">${esc(v.distance.source)}</span>`] : null,
        ['Energy', `${v.energy.litres ? `${fmt(v.energy.litres, 0)} L ${esc(v.energy.fuel || '')} (${fmt(v.energy.fuel_kWh, 0)} kWh)` : ''}${v.energy.electricity_kWh ? ` ${fmt(v.energy.electricity_kWh, 0)} kWh electricity` : ''}`],
        ['Scope 1 and 2 (100%)', `${fmt(v.emissions.scope1, 2)} + ${fmt(v.emissions.scope2, 2)} tCO₂e`],
      ])).join('');
    } else if (n.project) {
      const gen = n.generation;
      const metrics = (n.impact && n.impact.metrics) || [];
      body = kv([
        ['Project', `${esc(n.project.projectName || '')} · ${esc(n.project.archetype)}`],
        gen ? ['Derived from generation', `${esc(gen.technology || '')} · ${fmt(gen.annualGeneration && gen.annualGeneration.value, 0)} MWh · ${esc(gen.country || '')}`] : ['Scopes', 'Reported by the project'],
        ...metrics.map(m => [esc(m.metric || m.label || 'Impact'), `${fmt(m.value, 2)} ${esc(m.unit || 'tCO₂e')} <span class="partc-hint">impact — outside the inventory</span>`]),
        n.impact && n.impact.absent ? ['Avoided emissions', esc(n.impact.absent.reason || 'absent')] : null,
      ]);
    } else {
      return '';
    }
    return `<h5 class="partc-subhead">Engine trace</h5>${body}`;
  }

  async function recompute() {
    if (!openId) return;
    say('pr-detail-status', 'Recomputing…');
    try {
      const { movement } = await post(`/exposures/${encodeURIComponent(openId)}/recompute`);
      await load();
      if (openId) await openDetail(openId);
      /* After the re-open, not before: openDetail() resets the status line, so
         setting the note first left it wiped the instant the detail refreshed. */
      say('pr-detail-status', movement.note);
    } catch (err) { say('pr-detail-status', err.message); }
  }

  /* A document is read whole and checked before a file is offered: a
     refusal — an empty year is a 409 — is shown as its message, never saved
     as a file that will not open. */
  async function download(path, opts, filename, label, statusId) {
    say(statusId, `Preparing the ${label}…`);
    try {
      const res = await window.CARBONIQ_fetch('/v1/pcaf/part-a' + path, opts);
      if (!res.ok) {
        let data = {};
        try { data = await res.json(); } catch (_) { /* empty */ }
        throw new Error([data.message, data.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say(statusId, `${label} downloaded.`);
    } catch (err) { say(statusId, err.message); }
  }
  const disclosure = format => download(`/disclosure/${encodeURIComponent(year)}?format=${format}`, {},
    `part-a-business-loans-fy${year}.${format}`, `FY${year} §5.2 disclosure (${format.toUpperCase()})`, 'pr-status');
  /* The per-exposure document is §5.2's; the server says so for another class. */
  const exposureReport = () => openId && download(`/exposures/${encodeURIComponent(openId)}/report`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'pdf' }) },
    `part-a-exposure-${openId}.pdf`, 'Exposure report (PDF)', 'pr-detail-status');

  async function remove() {
    if (!openId) return;
    if (!window.confirm('Remove this exposure from the register?')) return;
    try {
      await del(`/exposures/${encodeURIComponent(openId)}`);
      closeDetail();
      await load();
    } catch (err) { say('pr-detail-status', err.message); }
  }

  // ── recording ──────────────────────────────────────────────

  const num = id => { const v = $(id) && $(id).value; return v === '' || v === undefined || v === null ? undefined : Number(v); };
  const str = id => { const v = $(id) && $(id).value; return v ? String(v).trim() : undefined; };

  /** The request the engine takes, read from the form and nothing else — per class. */
  function collect() {
    const body = isProperty() ? collectProperty()
      : cls === 'motor-vehicle-loans' ? collectVehicle()
        : cls === 'project-finance' ? collectProject()
          : cls === 'listed-equity-corporate-bonds' ? collectListed()
            : collectBusinessLoan();
    /* Sent on every class, because S2 asks for the share of the whole book and
       a block only some classes carried would answer for only some of it. */
    body.climate = collectClimate();
    /* The facility on every loan class and never on a holding; absent when
       no commitment is keyed, so a loan recorded without one is unchanged. */
    const facility = collectFacility();
    if (facility) body.facility = facility;
    return body;
  }

  // ── the facility behind the loan ───────────────────────────
  /* The commitment is not the numerator; the balance owed at the year-end
     is (Part A §5.2, p.56). The form records the facility once and asks the
     engine what the schedule expects at the position date; taking that
     figure as the year-end balance records the basis as scheduled, and the
     exposure carries the material finding until the ledger's replaces it.
     Nothing here schedules, sums or converts. */
  const FACILITY_CLASSES = ['business-loans-unlisted-equity', 'commercial-real-estate', 'mortgages', 'motor-vehicle-loans', 'project-finance'];
  let facilityBasis = 'ledger';
  let lastScheduled = null;
  let facilityTimer = null;
  let facilitySeq = 0;

  function outstandingFieldId() {
    return isProperty() ? 'pr-f-re-outstanding' : cls === 'motor-vehicle-loans' ? 'pr-f-mv-outstanding'
      : cls === 'project-finance' ? 'pr-f-pf-outstanding' : 'pr-f-outstanding';
  }
  function positionDate() {
    const id = isProperty() ? 'pr-f-re-asof' : cls === 'motor-vehicle-loans' ? 'pr-f-mv-asof' : cls === 'project-finance' ? null : 'pr-f-asof';
    return (id && str(id)) || `${year}-12-31`;
  }
  function classCurrency() {
    return str(isProperty() ? 'pr-f-re-currency' : cls === 'motor-vehicle-loans' ? 'pr-f-mv-currency'
      : cls === 'project-finance' ? 'pr-f-pf-currency' : 'pr-f-currency') || '';
  }

  function collectFacility() {
    if (!FACILITY_CLASSES.includes(cls)) return undefined;
    const committed = num('pr-f-fac-committed');
    if (committed === undefined) return undefined;
    const profile = str('pr-f-fac-profile') || 'equal-principal';
    const repayment = { profile };
    if (profile !== 'bullet') repayment.frequency = str('pr-f-fac-freq') || undefined;
    if (num('pr-f-fac-grace') !== undefined) repayment.graceMonths = num('pr-f-fac-grace');
    if (profile === 'annuity') repayment.annualRatePct = num('pr-f-fac-rate');
    return prune({
      committed, disbursed: num('pr-f-fac-disbursed'),
      originationDate: str('pr-f-fac-orig') || undefined, maturityDate: str('pr-f-fac-maturity') || undefined,
      repayment: prune(repayment),
      utilisationFactor: num('pr-f-fac-util'),
      outstandingBasis: facilityBasis,
      currency: classCurrency() || undefined,
    });
  }

  function fillFacility(f) {
    const r = (f && f.repayment) || {};
    set('pr-f-fac-committed', f && f.committed); set('pr-f-fac-disbursed', f && f.disbursed);
    set('pr-f-fac-orig', f && f.originationDate); set('pr-f-fac-maturity', f && f.maturityDate);
    set('pr-f-fac-profile', r.profile || 'equal-principal'); set('pr-f-fac-freq', r.frequency || 'monthly');
    set('pr-f-fac-grace', r.graceMonths); set('pr-f-fac-rate', r.annualRatePct); set('pr-f-fac-util', f && f.utilisationFactor);
    facilityBasis = (f && f.outstandingBasis) || 'ledger';
    applyFacilityBasis();
    applyFacilityProfile();
    lastScheduled = null;
    show('pr-fac-scheduled', false);
    scheduleFacility();
  }

  function applyFacilityProfile() {
    const profile = str('pr-f-fac-profile');
    const rate = $('pr-f-fac-rate'), freq = $('pr-f-fac-freq');
    if (rate) rate.disabled = profile !== 'annuity';
    if (freq) freq.disabled = profile === 'bullet';
  }

  function applyFacilityBasis() {
    const el = $('pr-fac-basis');
    if (!el) return;
    const scheduled = facilityBasis === 'scheduled';
    el.hidden = !scheduled;
    el.textContent = scheduled
      ? 'Year-end balance taken from the repayment schedule — the loan account’s balance replaces it before the disclosure is filed.'
      : '';
  }

  function scheduleFacility() {
    clearTimeout(facilityTimer);
    facilityTimer = setTimeout(runFacilitySchedule, 400);
  }

  async function runFacilitySchedule() {
    facilityTimer = null;
    const row = $('pr-fac-scheduled');
    if (!row || $('pr-record').hidden || preview()) return;
    const f = collectFacility();
    if (!f || f.disbursed === undefined || !f.originationDate || !f.maturityDate) { row.hidden = true; return; }
    const seq = ++facilitySeq;
    const facility = { ...f };
    delete facility.outstandingBasis; delete facility.currency;
    try {
      const { scheduled } = await post('/facility/schedule', { facility, asOf: positionDate() });
      if (seq !== facilitySeq) return;
      lastScheduled = scheduled;
      say('pr-fac-scheduled-text', `Scheduled balance at ${scheduled.asOf}: ${money(scheduled.value, classCurrency())}`
        + (scheduled.instalmentsPaid !== null && scheduled.instalmentsPaid !== undefined ? ` — ${scheduled.instalmentsPaid} instalment(s) repaid` : '')
        + (scheduled.beforeOrigination ? ' — before origination' : scheduled.matured ? ' — matured' : ''));
      show('pr-fac-use', true);
    } catch (err) {
      if (seq !== facilitySeq) return;
      lastScheduled = null;
      say('pr-fac-scheduled-text', err.message);
      show('pr-fac-use', false);
    }
    row.hidden = false;
  }

  function useScheduledBalance() {
    if (!lastScheduled) return;
    const el = $(outstandingFieldId());
    if (!el) return;
    el.value = lastScheduled.value;
    moneyHint(el);
    facilityBasis = 'scheduled';
    applyFacilityBasis();
    schedulePreview(0);
  }

  /* The facility as the engine read it: sanctioned, drawn and outstanding on
     one scale, never stacked; the §6.2 line apart; the life of the loan
     hatched, because a table of future balances without the mark reads as
     a forecast. Every figure is the engine's. */
  function facilityPanel(x, ccy) {
    const f = x && x.facility;
    if (!f) return '';
    const charts = typeof Charts !== 'undefined';
    const t = f.terms || {}, s = f.scheduled || {}, r = f.recorded || {}, u = f.undrawn || {}, p = f.projection || { rows: [], assumptions: [] };
    const rep = t.repayment || {};
    const PROFILE = { bullet: 'Bullet — repaid at maturity', 'equal-principal': 'Equal principal instalments', annuity: 'Annuity — level payments', schedule: 'Custom schedule' };
    const scaleRows = [
      { key: 'committed', label: 'Sanctioned', value: t.committed, color: 'var(--p-fill-2, #c7c7cc)' },
      { key: 'drawn', label: 'Drawn to date', value: t.disbursed, color: 'color-mix(in srgb, var(--p-accent, #0d9488) 55%, white)' },
      { key: 'outstanding', label: 'Outstanding at year-end', value: r.outstanding, color: 'var(--p-accent, #0d9488)' },
    ];
    const life = (p.rows || []).map(row => ({ key: String(row.year), label: `${row.year}${row.isReportingYear ? ' · this year' : ''}`,
      value: row.scheduledOutstanding, color: 'var(--p-accent, #0d9488)', projected: true }));
    const undrawnHtml = !u.applicable
      ? '<p class="partc-hint">The facility is fully drawn: there is no undrawn commitment to report.</p>'
      : u.absent
        ? `<p class="partc-hint">Undrawn commitment ${esc(money(u.undrawnAmount, ccy))}. ${esc(u.reason || '')}</p>`
        : `<dl class="pr-kv">
            <dt>Undrawn commitment</dt><dd>${esc(money(u.undrawnAmount, ccy))} · attribution factor ${esc(String(u.attributionFactor))}</dd>
            <dt>Unweighted — shall</dt><dd>${fmt(u.unweighted.scope1And2, 2)} tCO₂e scope 1 and 2${u.unweighted.scope3 !== null && u.unweighted.scope3 !== undefined ? ` · ${fmt(u.unweighted.scope3, 2)} scope 3` : ''}</dd>
            <dt>Weighted — may</dt><dd>${u.weighted && !u.weighted.absent ? `${fmt(u.weighted.scope1And2, 2)} tCO₂e at utilisation ${esc(String(u.weighted.utilisationFactor))}` : esc((u.weighted && u.weighted.reason) || 'No utilisation factor recorded.')}</dd>
          </dl>
          <p class="partc-hint">${esc(u.note || '')}</p>`;
    return `<div class="partc-panel pr-facility">
      <h5 class="partc-subhead">The facility, and the balance it produces</h5>
      ${charts ? Charts.hbars(scaleRows, { label: 'Sanctioned, drawn and outstanding, on one scale', compact: true, unit: ccy }) : ''}
      <dl class="pr-kv">
        <dt>Repayment</dt><dd>${esc(PROFILE[rep.profile] || rep.profile || '—')}${rep.frequency ? `, ${esc(rep.frequency)}` : ''}${rep.instalments ? `, ${esc(String(rep.instalments))} instalment(s)` : ''}${rep.annualRatePct !== null && rep.annualRatePct !== undefined ? `, ${esc(String(rep.annualRatePct))}% p.a.` : ''}</dd>
        <dt>Originated · matures</dt><dd>${esc(t.originationDate || '—')} · ${esc(t.maturityDate || '—')}${t.tenorMonths ? ` (${esc(String(t.tenorMonths))} months)` : ''}</dd>
        <dt>Scheduled balance at ${esc(s.asOf || '')}</dt><dd>${esc(money(s.value, ccy))}${s.instalmentsPaid !== null && s.instalmentsPaid !== undefined ? ` — ${esc(String(s.instalmentsPaid))} instalment(s) repaid` : ''}</dd>
        <dt>Year-end balance</dt><dd>${r.basis === 'scheduled' ? '<span class="pr-chip">Taken from the schedule</span>' : '<span class="pr-chip pr-chip-ok">Read from the loan account</span>'}${r.varianceFromSchedulePct ? ` <span class="partc-hint">differs from the schedule by ${esc(String(r.varianceFromSchedulePct))}%</span>` : ''}</dd>
      </dl>
      <h5 class="partc-subhead">Undrawn commitment — §6.2, reported apart</h5>
      ${undrawnHtml}
      <h5 class="partc-subhead">The life of the loan — a projection</h5>
      ${charts && life.length ? Charts.hbars(life, { label: 'Scheduled balance at each year-end — a projection', compact: true, unit: ccy }) : ''}
      <div class="pr-scroll"><table class="partc-table pr-life">
        <thead><tr><th>Year-end</th><th>Scheduled balance</th><th>Attribution factor</th><th>Financed scope 1 and 2, tCO₂e</th></tr></thead>
        <tbody>${(p.rows || []).map(row => `<tr class="${row.isReportingYear ? 'is-on' : ''}"><td>${esc(row.asOf)}</td><td class="num">${fmt(row.scheduledOutstanding, 0)}</td><td class="num">${row.attributionFactor === null || row.attributionFactor === undefined ? '—' : esc(String(row.attributionFactor))}</td><td class="num">${row.financedScope1And2 === null || row.financedScope1And2 === undefined ? '—' : fmt(row.financedScope1And2, 2)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="partc-hint">Hatched: a projection. ${esc(p.basis || '')}</p>
      <ul class="partc-hint pr-assumptions">${(p.assumptions || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>`;
  }

  /* The bank's own SLFRS S2 judgement. Every control is optional: an exposure
     with nothing chosen sends nothing, which the register records as
     unassessed rather than as not vulnerable. */
  function collectClimate() {
    const verdict = id => { const v = $(id) && $(id).value; return v || null; };
    const note = str('pr-f-cl-note') || null;
    const code = str('pr-f-cl-code') || null;
    return {
      transitionRisk: { verdict: verdict('pr-f-cl-transition'), horizon: verdict('pr-f-cl-transition-horizon'), note },
      physicalRisk: { verdict: verdict('pr-f-cl-physical'), horizon: verdict('pr-f-cl-physical-horizon'), note: null },
      opportunity: { verdict: verdict('pr-f-cl-opportunity'), taxonomyCode: code, note: null },
    };
  }

  /* The three closed lists come from the server's own vocabulary, so the form
     cannot offer an answer the register would refuse. Loaded with the class
     vocabulary, before the first request — the rule this codebase has shipped
     four defects by breaking. */
  function fillClimateLists(vocabulary) {
    const put_ = (id, list, blank) => {
      const el = $(id);
      if (!el || !list) return;
      el.innerHTML = `<option value="">${blank}</option>`
        + list.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('');
    };
    put_('pr-f-cl-transition', vocabulary.climateVerdicts, 'Not assessed');
    put_('pr-f-cl-physical', vocabulary.climateVerdicts, 'Not assessed');
    put_('pr-f-cl-opportunity', vocabulary.alignmentVerdicts, 'Not assessed');
    put_('pr-f-cl-transition-horizon', vocabulary.horizons, 'Not stated');
    put_('pr-f-cl-physical-horizon', vocabulary.horizons, 'Not stated');
  }

  /** Prefill the block from what the register holds, for an edit. */
  function fillClimate(held) {
    const set = (id, v) => { const el = $(id); if (el) el.value = v || ''; };
    const c = held || {};
    const t = c.transitionRisk || {}; const ph = c.physicalRisk || {}; const op = c.opportunity || {};
    set('pr-f-cl-transition', t.verdict); set('pr-f-cl-transition-horizon', t.horizon);
    set('pr-f-cl-physical', ph.verdict); set('pr-f-cl-physical-horizon', ph.horizon);
    set('pr-f-cl-opportunity', op.verdict); set('pr-f-cl-code', op.taxonomyCode);
    set('pr-f-cl-note', t.note);
  }

  /* §5.4 / §5.5. The floor area travels with its unit; nothing here converts. */
  function collectProperty() {
    const body = {
      assetClass: cls,
      reportingYear: Number(year),
      country: (str('pr-f-re-country') || 'LK').toUpperCase(),
      counterparty: { name: str('pr-f-name') },
      buildingType: str('pr-f-building-type'),
      productType: str('pr-f-product'),
      exposure: { outstanding: num('pr-f-re-outstanding'), currency: str('pr-f-re-currency'), asOf: str('pr-f-re-asof') },
      value: { atOrigination: num('pr-f-re-value'), latest: num('pr-f-re-latest') },
    };
    const ref = str('pr-f-ref');
    if (ref) body.identifiers = { accountNumber: ref };
    const area = num('pr-f-area');
    if (area !== undefined) body.floorArea = { value: area, unit: str('pr-f-area-unit') || 'm2' };
    if (str('pr-f-label')) body.label = str('pr-f-label').toUpperCase();
    if (num('pr-f-count') !== undefined) body.buildingCount = num('pr-f-count');
    const elec = num('pr-f-elec'), fuel = num('pr-f-fuel');
    if (elec !== undefined || fuel !== undefined) {
      const supplier = $('pr-f-ef-basis').value === 'supplier';
      body.energy = { electricity_kWh: elec, fuel_kWh: fuel, fuelSource: str('pr-f-fuel-source'),
        emissionFactorBasis: supplier ? 'supplier' : 'average',
        electricityFactor: supplier ? num('pr-f-elec-factor') : undefined, fuelFactor: supplier ? num('pr-f-fuel-factor') : undefined };
    }
    if (cls === 'commercial-real-estate' && num('pr-f-construction') !== undefined) body.developerConstructionEmissions_tCO2e = num('pr-f-construction');
    return prune(body);
  }

  /* §5.6. One vehicle from the screen; the efficiency and the distance travel
     in the units and on the basis they were keyed, and the engine derives the
     option from them. */
  function collectVehicle() {
    const vehicle = { vehicleClass: str('pr-f-mv-class'), fuel: str('pr-f-mv-fuel'), makeModel: str('pr-f-mv-model') };
    if (num('pr-f-mv-eff') !== undefined) vehicle.efficiency = { value: num('pr-f-mv-eff'), unit: str('pr-f-mv-eff-unit') || 'km/L', basis: 'make-model', cycle: str('pr-f-mv-cycle') };
    if (num('pr-f-mv-km') !== undefined) vehicle.distance = { value_km: num('pr-f-mv-km'), basis: str('pr-f-mv-km-basis') || 'local' };
    const petrol = num('pr-f-mv-petrol'), diesel = num('pr-f-mv-diesel'), kwh = num('pr-f-mv-kwh');
    if (petrol !== undefined || diesel !== undefined || kwh !== undefined) vehicle.fuelConsumed = { petrol_L: petrol, diesel_L: diesel, electricity_kWh: kwh };
    if (num('pr-f-mv-production') !== undefined) vehicle.productionEmissions_tCO2e = num('pr-f-mv-production');
    const body = {
      assetClass: cls,
      reportingYear: Number(year),
      counterparty: { name: str('pr-f-name') },
      productType: str('pr-f-mv-product'),
      exposure: { outstanding: num('pr-f-mv-outstanding'), currency: str('pr-f-mv-currency'), asOf: str('pr-f-mv-asof') },
      value: { atOrigination: num('pr-f-mv-value') },
      vehicles: [vehicle],
    };
    const ref = str('pr-f-ref');
    if (ref) body.identifiers = { accountNumber: ref };
    return prune(body);
  }

  /* §5.3. */
  function collectProject() {
    const body = {
      assetClass: cls,
      reportingYear: Number(year),
      projectName: str('pr-f-pf-project') || str('pr-f-name'),
      counterparty: str('pr-f-name'),
      sector: str('pr-f-pf-sector'),
      archetype: str('pr-f-pf-archetype') || 'general',
      outstandingAmount: num('pr-f-pf-outstanding'),
      totalProjectEquityPlusDebt: num('pr-f-pf-denominator'),
      currency: str('pr-f-pf-currency'),
      projectScope1_tCO2e: num('pr-f-pf-s1'),
      projectScope2_tCO2e: num('pr-f-pf-s2'),
      projectScope3_tCO2e: num('pr-f-pf-s3'),
      scope3Relevant: num('pr-f-pf-s3') !== undefined ? true : undefined,
      dataQualityOption: str('pr-f-pf-option'),
    };
    const ref = str('pr-f-ref');
    if (ref) body.identifiers = { accountNumber: ref };
    return prune(body);
  }

  /* §5.1. */
  function collectListed() {
    const asOf = str('pr-f-le-asof'), currency_ = str('pr-f-le-currency');
    const instrument = $('pr-f-le-instrument').value;
    const basis = $('pr-f-le-basis').value;
    const period = str('pr-f-le-period');
    const reported = v => v === undefined ? undefined
      : { value: v, basis, period, verifier: basis === 'reported-verified' ? str('pr-f-le-verifier') : undefined };
    const s1 = num('pr-f-le-s1'), s2 = num('pr-f-le-s2'), s3 = num('pr-f-le-s3');
    const body = {
      assetClass: cls,
      reportingYear: Number(year),
      instrument,
      issuerListed: instrument === 'corporate-bond' ? true : undefined,
      onBalanceSheetAtYearEnd: true,
      counterparty: { name: str('pr-f-name'), naceL2: str('pr-f-le-nace'), financialInstitution: $('pr-f-le-fi').checked || undefined },
      outstanding: { amount: num('pr-f-le-outstanding'), asOf, currency: currency_ },
      denominator: { marketCapOrdinary: num('pr-f-le-mcap'), marketCapPreferred: num('pr-f-le-mcap-pref'),
        totalDebtInterestBearing: num('pr-f-le-debt'), minorityInterests: num('pr-f-le-minorities'), asOf, currency: currency_ },
      emissions: { scope1: reported(s1), scope2: reported(s2), scope3: reported(s3),
        scope3AbsentReason: s3 === undefined ? str('pr-f-le-s3-reason') : undefined },
    };
    const ref = str('pr-f-ref');
    if (ref) body.identifiers = { accountNumber: ref };
    return prune(body);
  }

  /* §5.2. */
  function collectBusinessLoan() {
    const listed = $('pr-f-listed').checked;
    const fi = $('pr-f-fi').checked;
    const instrument = $('pr-f-instrument').value;
    const body = {
      reportingYear: Number(year),
      instrument,
      borrowerListed: instrument === 'unlisted-equity' ? false : listed,
      borrowerType: $('pr-f-borrower-type').value,
      counterparty: { name: str('pr-f-name'), sector: str('pr-f-sector'), sectorKey: str('pr-f-sector-key'), financialInstitution: fi || undefined },
      plausibility: { revenue: num('pr-f-revenue') },
      outstanding: { amount: num('pr-f-outstanding'), averageOutstanding: num('pr-f-average'), asOf: str('pr-f-asof'), currency: str('pr-f-currency') },
    };
    const ref = str('pr-f-ref');
    if (ref) body.identifiers = { accountNumber: ref };

    const hasValue = listed
      ? num('pr-f-mcap') !== undefined
      : (num('pr-f-equity') !== undefined || num('pr-f-debt') !== undefined);
    if (hasValue) {
      body.denominator = listed
        ? { marketCapOrdinary: num('pr-f-mcap'), totalDebtInterestBearing: num('pr-f-debt-ib'), minorityInterests: num('pr-f-minorities'),
          financialInstitution: fi || undefined, customerDeposits: fi ? num('pr-f-deposits') : undefined, asOf: str('pr-f-asof'), currency: str('pr-f-currency') }
        : { totalEquity: num('pr-f-equity'), totalDebt: num('pr-f-debt'),
          financialInstitution: fi || undefined, customerDeposits: fi ? num('pr-f-deposits') : undefined, asOf: str('pr-f-asof'), currency: str('pr-f-currency') };
    }

    /* How the borrower's emissions are known decides the option family the
       engine can reach, and the form asks it rather than inferring it from
       which boxes happen to hold a number. Reported: the borrower's own
       figures, Option 1. Not known: the held sector factor — per unit of the
       borrower's revenue where one is keyed (Option 3a), per unit of assets on
       the outstanding alone where none is (Option 3b). The engine chooses the
       row; the form only says what it has. */
    const s3 = num('pr-f-s3');
    if (knownPath() === 'sector') {
      const revenue = num('pr-f-revenue');
      const basis = revenue !== undefined ? 'revenue-sector' : 'assets-sector';
      const factor = sf => (sf === undefined ? undefined
        : { value: sf, unit: basis === 'revenue-sector' ? 'tCO2e per unit of revenue' : 'tCO2e per unit of assets', source: str('pr-f-sf-source'), vintage: num('pr-f-sf-vintage') });
      const line = sf => ({ basis, activity: { revenue: basis === 'revenue-sector' ? revenue : undefined, currency: basis === 'revenue-sector' ? str('pr-f-currency') : undefined, factor: factor(sf) } });
      body.emissions = { scope1: line(num('pr-f-sf1')), scope2: line(num('pr-f-sf2')) };
      body.emissions.scope3AbsentReason = str('pr-f-s3-reason');
      return prune(body);
    }
    const basis = $('pr-f-basis').value;
    const period = str('pr-f-period');
    const reported = v => v === undefined ? undefined
      : { value: v, basis, period, verifier: basis === 'reported-verified' ? str('pr-f-verifier') : undefined };
    const s1 = num('pr-f-s1'), s2 = num('pr-f-s2');
    body.emissions = { scope1: reported(s1), scope2: reported(s2), scope3: reported(s3) };
    if (s3 === undefined) body.emissions.scope3AbsentReason = str('pr-f-s3-reason');
    return prune(body);
  }

  /** Which path the form is on: 'reported' or 'sector'. */
  function knownPath() {
    const el = $('pr-f-known-sector');
    return el && el.checked ? 'sector' : 'reported';
  }

  /* Show the path's own fields and nothing of the other's. */
  function applyKnown() {
    const sector = knownPath() === 'sector';
    show('pr-known-reported', !sector);
    show('pr-known-sector', sector);
  }

  const SECTOR_BASES = ['revenue-sector', 'assets-sector', 'turnover-sector'];

  /* Undefined keys never reach the wire: the schema is closed and a key set
     to undefined is a key the server would refuse by name. */
  function prune(v) {
    if (Array.isArray(v)) return v.map(prune);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        const p = prune(val);
        if (p !== undefined && !(p && typeof p === 'object' && !Array.isArray(p) && Object.keys(p).length === 0)) out[k] = p;
      }
      return out;
    }
    return v;
  }

  async function submitForm(ev) {
    ev.preventDefault();
    const editing = editingId;
    say('pr-form-status', editing ? 'Saving — the engine reruns over the edited input…' : 'Recording…');
    try {
      const { exposure } = editing
        ? await put(`/exposures/${encodeURIComponent(editing)}`, collect())
        : await post('/exposures', collect());
      say('pr-form-status', `${editing ? 'Saved' : 'Recorded'} ${exposure.counterparty.name || 'the exposure'}. ${(exposure.result.validation && exposure.result.validation.note) || ''}`);
      endEdit();
      $('pr-form').reset();
      applyDenominatorMode();
      show('pr-record', false);
      show('pr-preview', false);
      await load();
      await openDetail(exposure.exposureId);
    } catch (err) {
      say('pr-form-status', err.message);
    }
  }

  // ── editing ────────────────────────────────────────────────

  /* Editing is the record form, prefilled from the input the register holds
     for the exposure, and saved through PUT: the engine reruns over the
     edited input, both halves are kept, and the position moves. The form is
     filled field by field from the stored input — the collectors then build
     the request exactly as they do for a new exposure, so an edit can never
     send a key the schema refuses. */
  function startEdit() {
    if (!current) return;
    editingId = current.exposureId;
    cls = current.assetClass || cls;
    if ($('pr-class')) $('pr-class').value = cls;
    applyClass();
    $('pr-form').reset();
    fill({ ...(current.input || {}), facility: current.facility || null });
    /* The classification is kept beside the engine's input rather than inside
       it, so it is prefilled from the record itself. */
    fillClimate(current.climate);
    applyDenominatorMode();
    say('pr-record-hint', `Editing ${(current.counterparty && current.counterparty.name) || 'the exposure'} — the engine reruns over the saved input and the figures move.`);
    if ($('pr-form-submit')) $('pr-form-submit').textContent = 'Save changes';
    show('pr-record', true);
    $('pr-record').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function endEdit() {
    editingId = null;
    if ($('pr-form-submit')) $('pr-form-submit').textContent = 'Record';
  }

  /* Sets a field where the input holds a value; leaves the form's own
     default where it does not. A checkbox takes a boolean. */
  const set = (id, v) => {
    const el = $(id);
    if (!el || v === undefined || v === null) return;
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = Boolean(v);
    else el.value = String(v);
  };

  function fill(i) {
    set('pr-f-ref', i.identifiers && i.identifiers.accountNumber);
    if (isProperty()) fillProperty(i);
    else if (cls === 'motor-vehicle-loans') fillVehicle(i);
    else if (cls === 'project-finance') fillProject(i);
    else if (cls === 'listed-equity-corporate-bonds') fillListed(i);
    else fillBusinessLoan(i);
    fillFacility(i.facility || null);
    refreshMoneyHints();
  }

  /* A money field prints what was keyed with its separators and its scale
     beside it — 250,000,000 reads as LKR 250 mn — through the shared
     formatter (`ui/js/format.js`), so no scale and no symbol lives here.
     The currency is the one the same form block names; the book total's is
     its own. */
  const CURRENCY_OF = [['pr-f-re-', 'pr-f-re-currency'], ['pr-f-mv-', 'pr-f-mv-currency'], ['pr-f-pf-', 'pr-f-pf-currency'], ['pr-f-le-', 'pr-f-le-currency'], ['pr-book-', 'pr-book-currency']];
  function currencyFor(input) {
    if (input.id.startsWith('pr-f-fac-')) return classCurrency();
    const hit = CURRENCY_OF.find(([prefix]) => input.id.startsWith(prefix));
    return str(hit ? hit[1] : 'pr-f-currency') || '';
  }
  function moneyHint(input) {
    let hint = input.nextElementSibling;
    if (!hint || !hint.classList.contains('pr-money-hint')) {
      hint = document.createElement('span'); hint.className = 'pr-money-hint';
      input.insertAdjacentElement('afterend', hint);
    }
    const M = window.CARBONIQ_money;
    hint.textContent = input.value === '' || !M ? '' : M.annotated(input.value, currencyFor(input));
  }
  function refreshMoneyHints() { document.querySelectorAll('.parta-register [data-money]').forEach(moneyHint); }
  function wireMoneyHints() {
    document.querySelectorAll('.parta-register [data-money]').forEach(i => i.addEventListener('input', () => moneyHint(i)));
    for (const [, id] of CURRENCY_OF) on(id, 'input', refreshMoneyHints);
    on('pr-f-currency', 'input', refreshMoneyHints);
    for (const id of ['pr-form', 'pr-book-form']) on(id, 'reset', () => setTimeout(refreshMoneyHints, 0));
  }

  function fillBusinessLoan(i) {
    const cp = i.counterparty || {}, o = i.outstanding || {}, d = i.denominator || {}, e = i.emissions || {};
    set('pr-f-name', cp.name); set('pr-f-sector', cp.sector); set('pr-f-sector-key', cp.sectorKey); set('pr-f-fi', cp.financialInstitution);
    set('pr-f-instrument', i.instrument); set('pr-f-listed', i.borrowerListed); set('pr-f-borrower-type', i.borrowerType);
    set('pr-f-revenue', i.plausibility && i.plausibility.revenue);
    set('pr-f-outstanding', o.amount); set('pr-f-average', o.averageOutstanding); set('pr-f-asof', o.asOf); set('pr-f-currency', o.currency);
    set('pr-f-mcap', d.marketCapOrdinary); set('pr-f-debt-ib', d.totalDebtInterestBearing); set('pr-f-minorities', d.minorityInterests);
    set('pr-f-deposits', d.customerDeposits); set('pr-f-equity', d.totalEquity); set('pr-f-debt', d.totalDebt);
    const s1 = e.scope1 || {}, s2 = e.scope2 || {}, s3 = e.scope3 || {};
    const onSector = SECTOR_BASES.includes(s1.basis || s2.basis);
    set('pr-f-known-sector', onSector); set('pr-f-known-reported', !onSector);
    set('pr-f-s1', s1.value); set('pr-f-s2', s2.value); set('pr-f-s3', s3.value);
    if (!onSector) set('pr-f-basis', s1.basis || s2.basis);
    set('pr-f-period', s1.period || s2.period); set('pr-f-verifier', s1.verifier || s2.verifier);
    set('pr-f-s3-reason', e.scope3AbsentReason);
    /* An Option 3a input carries its revenue on the line; the form holds it
       once, in the revenue field the band check also reads. */
    const a1 = s1.activity || {};
    if (onSector && a1.revenue !== undefined && num('pr-f-revenue') === undefined) set('pr-f-revenue', a1.revenue);
    const f1 = a1.factor, f2 = s2.activity && s2.activity.factor;
    set('pr-f-sf1', f1 && f1.value); set('pr-f-sf2', f2 && f2.value);
    set('pr-f-sf-source', (f1 && f1.source) || (f2 && f2.source)); set('pr-f-sf-vintage', (f1 && f1.vintage) || (f2 && f2.vintage));
    applyKnown();
  }

  function fillProperty(i) {
    const cp = i.counterparty || {}, x = i.exposure || {}, v = i.value || {}, en = i.energy || {};
    set('pr-f-name', cp.name); set('pr-f-re-country', i.country); set('pr-f-building-type', i.buildingType); set('pr-f-product', i.productType);
    set('pr-f-re-outstanding', x.outstanding); set('pr-f-re-currency', x.currency); set('pr-f-re-asof', x.asOf);
    set('pr-f-re-value', v.atOrigination); set('pr-f-re-latest', v.latest);
    if (i.floorArea) { set('pr-f-area', i.floorArea.value); set('pr-f-area-unit', i.floorArea.unit); }
    else if (i.floorArea_m2 !== undefined) { set('pr-f-area', i.floorArea_m2); set('pr-f-area-unit', 'm2'); }
    set('pr-f-label', i.label); set('pr-f-count', i.buildingCount);
    set('pr-f-elec', en.electricity_kWh); set('pr-f-fuel', en.fuel_kWh); set('pr-f-fuel-source', en.fuelSource);
    set('pr-f-ef-basis', en.emissionFactorBasis); set('pr-f-elec-factor', en.electricityFactor); set('pr-f-fuel-factor', en.fuelFactor);
    set('pr-f-construction', i.developerConstructionEmissions_tCO2e);
  }

  function fillVehicle(i) {
    const cp = i.counterparty || {}, x = i.exposure || {}, v = i.value || {}, veh = (i.vehicles || [])[0] || {};
    set('pr-f-name', cp.name); set('pr-f-mv-product', i.productType);
    set('pr-f-mv-outstanding', x.outstanding); set('pr-f-mv-currency', x.currency); set('pr-f-mv-asof', x.asOf); set('pr-f-mv-value', v.atOrigination);
    set('pr-f-mv-class', veh.vehicleClass); set('pr-f-mv-fuel', veh.fuel); set('pr-f-mv-model', veh.makeModel);
    if (veh.efficiency) { set('pr-f-mv-eff', veh.efficiency.value); set('pr-f-mv-eff-unit', veh.efficiency.unit); set('pr-f-mv-cycle', veh.efficiency.cycle); }
    if (veh.distance) { set('pr-f-mv-km', veh.distance.value_km); set('pr-f-mv-km-basis', veh.distance.basis); }
    const fc = veh.fuelConsumed || {};
    set('pr-f-mv-petrol', fc.petrol_L); set('pr-f-mv-diesel', fc.diesel_L); set('pr-f-mv-kwh', fc.electricity_kWh);
    set('pr-f-mv-production', veh.productionEmissions_tCO2e);
  }

  function fillProject(i) {
    set('pr-f-name', typeof i.counterparty === 'string' ? i.counterparty : (i.counterparty && i.counterparty.name));
    set('pr-f-pf-project', i.projectName); set('pr-f-pf-sector', i.sector); set('pr-f-pf-archetype', i.archetype);
    set('pr-f-pf-outstanding', i.outstandingAmount); set('pr-f-pf-denominator', i.totalProjectEquityPlusDebt); set('pr-f-pf-currency', i.currency);
    set('pr-f-pf-s1', i.projectScope1_tCO2e); set('pr-f-pf-s2', i.projectScope2_tCO2e); set('pr-f-pf-s3', i.projectScope3_tCO2e);
    set('pr-f-pf-option', i.dataQualityOption);
  }

  function fillListed(i) {
    const cp = i.counterparty || {}, o = i.outstanding || {}, d = i.denominator || {}, e = i.emissions || {};
    set('pr-f-name', cp.name); set('pr-f-le-nace', cp.naceL2); set('pr-f-le-fi', cp.financialInstitution); set('pr-f-le-instrument', i.instrument);
    set('pr-f-le-outstanding', o.amount); set('pr-f-le-asof', o.asOf); set('pr-f-le-currency', o.currency);
    set('pr-f-le-mcap', d.marketCapOrdinary); set('pr-f-le-mcap-pref', d.marketCapPreferred); set('pr-f-le-debt', d.totalDebtInterestBearing); set('pr-f-le-minorities', d.minorityInterests);
    const s1 = e.scope1 || {}, s2 = e.scope2 || {}, s3 = e.scope3 || {};
    set('pr-f-le-s1', s1.value); set('pr-f-le-s2', s2.value); set('pr-f-le-s3', s3.value);
    set('pr-f-le-basis', s1.basis || s2.basis); set('pr-f-le-period', s1.period || s2.period); set('pr-f-le-verifier', s1.verifier || s2.verifier);
    set('pr-f-le-s3-reason', e.scope3AbsentReason);
  }

  function applyDenominatorMode() {
    const listed = $('pr-f-listed').checked && $('pr-f-instrument').value !== 'unlisted-equity';
    show('pr-denom-listed', listed);
    show('pr-denom-private', !listed);
  }

  // ── the preview: the engine's answer before Record ─────────

  /* The record form shows what the standard makes of the fields as they
     change — the same body Record sends, through a route that writes nothing.
     Every figure here is the engine's; the card scales a score to a cell and
     prints the rest. It is marked as a preview and never as a record. */
  let previewTimer = null;
  let previewSeq = 0;

  function schedulePreview(delay) {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(runPreview, delay === undefined ? 450 : delay);
  }

  async function runPreview() {
    previewTimer = null;
    const card = $('pr-preview');
    if (!card || $('pr-record').hidden || preview()) return;
    let body;
    try { body = collect(); } catch (_) { return; }
    if (!body.counterparty || !body.counterparty.name) { card.hidden = true; return; }
    const seq = ++previewSeq;
    let answer = null;
    try {
      ({ preview: answer } = await post('/exposures/preview', body));
    } catch (err) {
      if (seq !== previewSeq) return;
      setHtml('pr-preview-body', `<div class="pr-preview-refusal"><b>The standard would refuse this as it stands.</b><p>${esc(err.message)}</p></div>`);
      card.hidden = false;
      return;
    }
    if (seq !== previewSeq) return;
    renderPreview(answer);
    card.hidden = false;
  }

  function renderPreview(p) {
    const charts = typeof Charts !== 'undefined';
    const x = p.result || {};
    const inv = x.inventory || {};
    const dq = inv.dataQuality || { scope1And2: {} };
    const held = l => l && !l.absent && l.value !== null && l.value !== undefined;
    const fr = x.factorRelease;
    const findings = (x.validation && x.validation.findings) || [];
    const material = findings.filter(f => f.severity === 'material');
    /* The rail marks the sections holding a figure the engine took issue
       with. Material findings only: an advisory one changes nothing the
       reader would act on, and a mark that is always lit is a mark nobody
       reads. The names are the engine's own — a control claims one with
       `data-engine-path` — so nothing here decides which field is at fault. */
    if (typeof FormSteps !== 'undefined') {
      FormSteps.flag($('pr-form'), material.map(f => f.field).filter(Boolean));
    }
    const basisWord = BASIS_WORD[(dq.scope1And2.option || '').slice(0, 1)] || '';
    const steps = (p.raise && p.raise.steps) || [];
    setHtml('pr-preview-body', `
      <div class="pr-stats pr-preview-stats">
        <div class="pr-stat">
          <span class="pr-stat-label">Data quality</span>
          ${charts ? Charts.scale(dq.scope1And2.score, { label: 'Data quality score, scope 1 and 2', colors: DQ_RAMP }) : ''}
          <span class="pr-stat-unit">${dqBadge(dq.scope1And2.score, dq.scope1And2.option ? `Option ${dq.scope1And2.option}` : null)} ${esc(basisWord)}</span>
        </div>
        <div class="pr-stat pr-stat-primary">
          <span class="pr-stat-label">Financed scope 1 and 2</span>
          <span class="pr-stat-value">${held(inv.scope1And2) ? fmt(inv.scope1And2.value, 2) : '—'}</span>
          <span class="pr-stat-unit">tCO₂e · ${x.attribution ? `attribution factor ${esc(String(x.attribution.value))}` : 'no attribution factor — a sector-average option'}</span>
        </div>
        <div class="pr-stat">
          <span class="pr-stat-label">Rests on</span>
          <span class="pr-stat-value pr-stat-value-sm">${fr ? `${esc(fr.tables[0].table)} v${esc(fr.tables[0].version)}` : 'the borrower’s own figures'}</span>
          <span class="pr-stat-unit">${fr ? `${esc(fr.tables[0].status)} · ${esc(fr.rows.join(', '))} · <code>${esc(fr.checksum.slice(0, 12))}…</code>` : `${esc(dq.scope1And2.family || '')}`}</span>
        </div>
        <div class="pr-stat">
          <span class="pr-stat-label">Checks</span>
          <span class="pr-stat-value pr-stat-value-sm">${findings.length === 0 ? 'Clean' : `${findings.length} finding${findings.length === 1 ? '' : 's'}`}</span>
          <span class="pr-stat-unit">${material.length ? esc(material[0].statement) : esc((x.validation && x.validation.note) || 'every check that could run ran')}</span>
        </div>
      </div>
      ${steps.length ? `<h5 class="partc-subhead">What would raise the score</h5>
        <ol class="pr-raise">${steps.map(st => `<li><span class="pr-raise-score">${dqBadge(st.score, `Option ${st.option}`)}</span><span>${esc(st.needs)}</span></li>`).join('')}</ol>`
        : (p.raise && p.raise.from ? '<p class="partc-hint">Score 1 is the highest the table holds; nothing would raise it.</p>' : '')}
      ${facilityPanel(x, (x.exposure && x.exposure.outstanding && (x.exposure.outstanding.unit || x.exposure.outstanding.currency)) || '')}`);
  }

  /* The word for an option family — the first character of the option is the
     family in every Part A table: 1 reported, 2 activity, 3 sector. */
  const BASIS_WORD = { 1: 'reported by the borrower', 2: 'from the borrower’s activity', 3: 'estimated on the sector library', a: 'alternative method' };
  const basisChip = option => (option ? `<span class="pr-chip${String(option).startsWith('3') ? '' : ' pr-chip-ok'}">${esc(BASIS_WORD[String(option).slice(0, 1)] || option)}</span>` : '');

  async function submitBook(ev) {
    ev.preventDefault();
    say('pr-book-status', 'Stating…');
    try {
      await put('/book', prune({ reportingYear: Number(year), totalLoansAndInvestments: num('pr-book-total'),
        currency: str('pr-book-currency'), statedBy: str('pr-book-by') }));
      say('pr-book-status', 'Stated.');
      await load();
    } catch (err) { say('pr-book-status', err.message); }
  }

  // ── lifecycle ──────────────────────────────────────────────

  /* Everything that changes what the first request says — the year, the
     preview state, the listeners — is wired before load() is called. */
  async function init() {
    on('pr-refresh', 'click', load);
    on('pr-year', 'change', () => { closeDetail(); load(); });
    on('pr-class', 'change', () => { closeDetail(); applyClass(); load(); });
    on('pr-record-toggle', 'click', () => { const opening = $('pr-record').hidden; if (opening && editingId) { endEdit(); $('pr-form').reset(); } show('pr-record', opening); applyClass(); applyDenominatorMode(); });
    on('pr-form-cancel', 'click', () => { endEdit(); show('pr-record', false); });
    on('pr-detail-edit', 'click', startEdit);
    on('pr-detail-review', 'click', () => changeStatus('under_review'));
    on('pr-detail-approve', 'click', () => changeStatus('approved'));
    on('pr-detail-draft', 'click', () => changeStatus('recorded'));
    on('pr-detail-reopen', 'click', () => changeStatus('under_review'));
    on('pr-form', 'submit', submitForm);
    on('pr-book-form', 'submit', submitBook);
    on('pr-detail-close', 'click', closeDetail);
    on('pr-detail-recompute', 'click', recompute);
    on('pr-detail-remove', 'click', remove);
    on('pr-detail-report', 'click', exposureReport);
    wireMoneyHints();
    on('pr-pdf', 'click', () => disclosure('pdf'));
    on('pr-docx', 'click', () => disclosure('docx'));
    for (const id of ['pr-f-listed', 'pr-f-instrument']) {
      on(id, 'change', applyDenominatorMode);
      on(id, 'input', applyDenominatorMode);
    }
    on('pr-f-known-reported', 'change', applyKnown);
    on('pr-f-known-sector', 'change', applyKnown);
    /* Every change to the form re-asks the engine, a moment after the typing
       stops; the answer is the preview and never a record. */
    on('pr-form', 'input', () => schedulePreview());
    on('pr-form', 'change', () => schedulePreview());
    on('pr-form', 'reset', () => { show('pr-preview', false); setTimeout(applyKnown, 0); facilityBasis = 'ledger'; lastScheduled = null; show('pr-fac-scheduled', false); setTimeout(() => { applyFacilityBasis(); applyFacilityProfile(); }, 0); });
    /* The facility: every change asks the engine what the schedule expects;
       the profile decides which of its fields apply; taking the scheduled
       figure records the basis, and typing a balance restores the ledger's. */
    for (const id of ['pr-f-fac-committed', 'pr-f-fac-disbursed', 'pr-f-fac-orig', 'pr-f-fac-maturity', 'pr-f-fac-profile', 'pr-f-fac-freq', 'pr-f-fac-grace', 'pr-f-fac-rate']) {
      on(id, 'input', scheduleFacility); on(id, 'change', scheduleFacility);
    }
    on('pr-f-fac-profile', 'change', applyFacilityProfile);
    on('pr-fac-use', 'click', useScheduledBalance);
    for (const id of ['pr-f-outstanding', 'pr-f-re-outstanding', 'pr-f-mv-outstanding', 'pr-f-pf-outstanding']) {
      on(id, 'input', () => { facilityBasis = 'ledger'; applyFacilityBasis(); });
    }
    for (const id of ['pr-f-asof', 'pr-f-re-asof', 'pr-f-mv-asof']) on(id, 'change', scheduleFacility);
    defaultAsOf();
    /* A preview visitor is offered no write control. For everyone else the
       markup's own state stands — the record form opens on the button, not on
       load; `el.hidden = preview()` alone had been opening it for every
       signed-in reader and the button then closed it. */
    for (const el of document.querySelectorAll('.parta-register [data-writes]')) el.hidden = preview() || el.hidden;
    await loadVocabulary();
    applyClass();
    await loadYears();
    await load();
  }

  function refresh() {
    return load();
  }

  return { init, refresh, load, collect, prune };
})();
