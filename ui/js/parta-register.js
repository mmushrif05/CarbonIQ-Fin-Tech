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
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const show = (id, yes) => { const el = $(id); if (el) el.hidden = !yes; };

  const DEFAULT_CLASS = 'business-loans-unlisted-equity';
  let currency = 'LKR';
  let year = null;
  let cls = DEFAULT_CLASS;
  let classes = [];
  let reference = null;
  let rows = [];
  let openId = null;

  const classLabel = () => { const c = classes.find(x => x.assetClass === cls); return c ? `${c.label} — PCAF Part A ${c.section}` : cls; };
  const isProperty = () => cls === 'commercial-real-estate' || cls === 'mortgages';

  /* A score is a category on a scale where 1 is best. Never a fraction of
     five. The weighted score across a book is shown to two decimals; a single
     exposure's score is the whole number its option carries. */
  const dqBadge = (v, label, dp = 0) => v === null || v === undefined
    ? `<span class="dqb dqb-na">${esc(label || 'not scored')}</span>`
    : `<span class="dqb dqb-${Math.round(v)}">${label ? `<i>${esc(label)}</i>` : ''}<b>${Number(v).toFixed(dp)}</b></span>`;

  const sevChip = sev => `<span class="partc-sev">${sev === 'material' ? 'material' : 'advisory'}</span>`;

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

  // ── the position ───────────────────────────────────────────

  async function load() {
    year = $('pr-year').value;
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
      return;
    }
    let list = [];
    try { ({ exposures: list } = await call(`/exposures?reportingYear=${encodeURIComponent(year)}&assetClass=${encodeURIComponent(cls)}&limit=200`)); }
    catch (err) { say('pr-status', err.message); }
    rows = list;
    render(position);
    show('pr-body', true);
    say('pr-status', `${position.exposures} exposure(s) in FY${position.reportingYear}.`);
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
          <dt>Total loans and investments</dt><dd>${esc(c.currency || currency)} ${fmt(c.totalLoansAndInvestments, 0)}</dd>
          <dt>Assessed outstanding</dt><dd>${esc(currency)} ${fmt(p.total.outstanding, 0)}</dd>
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
          <thead><tr><th>Counterparty</th><th>Instrument</th><th>Outstanding</th><th>Attribution factor</th><th>Scope 1 and 2</th><th>Scope 3</th><th>Score</th><th>Checks</th></tr></thead>
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
              <td class="num">${dqBadge(dq.scope1And2 && dq.scope1And2.score, dq.scope1And2 && dq.scope1And2.option ? 'Option ' + dq.scope1And2.option : null)}</td>
              <td><span class="pr-verdict ${n === 0 ? 'pr-verdict-clean' : material ? 'pr-verdict-material' : ''}">${n === 0 ? 'clean' : `${n} finding${n === 1 ? '' : 's'}`}</span></td>
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
    renderDetail(exposure);
    renderRows();
    show('pr-detail', true);
    $('pr-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeDetail() { openId = null; show('pr-detail', false); renderRows(); }

  function renderDetail(e) {
    const x = e.result;
    const inv = x.inventory;
    const cp = x.exposure.counterparty || {};
    say('pr-detail-title', cp.name || 'Exposure');
    say('pr-detail-status', '');
    const line = (label, l) => `<dt>${label}</dt><dd>${l && !l.absent && Number.isFinite(l.value) ? fmt(l.value, 2) + ' tCO₂e' : (l && l.reason ? esc(l.reason) : '—')}</dd>`;
    const dq = inv.dataQuality;
    const findings = (x.validation && x.validation.findings) || [];
    setHtml('pr-detail-body', `
      <div class="partc-panels">
        <div class="partc-panel">
          <h5 class="partc-subhead">Financed lines</h5>
          <dl class="pr-kv">
            ${line('Scope 1', inv.scope1)}${line('Scope 2', inv.scope2)}${line('Scope 1 and 2', inv.scope1And2)}
            ${line('Scope 3', inv.scope3)}${line('Removals', inv.removals)}
            ${inv.creditsRetired ? line('Credits retired', inv.creditsRetired) : ''}${line('Credits generated', inv.creditsGenerated)}
          </dl>
          <p class="partc-hint">${esc(inv.separation)}</p>
        </div>
        <div class="partc-panel">
          <h5 class="partc-subhead">Data quality</h5>
          <p>${dqBadge(dq.scope1And2.score, 'Option ' + dq.scope1And2.option)} scope 1 and 2${dq.scope1And2.note ? ` <span class="partc-hint">${esc(dq.scope1And2.note)}</span>` : ''}</p>
          <p>${dq.scope3 && !dq.scope3.absent ? dqBadge(dq.scope3.score, 'Option ' + dq.scope3.option) + ' scope 3' : '<span class="dqb dqb-na">scope 3 not scored</span>'}</p>
          <p class="partc-hint">${esc(dq.scale)}</p>
          <h5 class="partc-subhead">Attribution</h5>
          ${x.attribution ? `<p class="pr-eq">${esc(x.attribution.equation)}</p>
            <dl class="pr-kv"><dt>Factor</dt><dd>${x.attribution.value}</dd>
            <dt>Outstanding</dt><dd>${fmt(x.exposure.outstanding.value, 0)}</dd>
            ${x.denominator ? `<dt>Company value</dt><dd>${fmt(x.denominator.value, 0)} <span class="partc-hint">${esc(x.denominator.equation)}</span></dd>` : ''}</dl>
            ${x.denominator && x.denominator.assumptions && x.denominator.assumptions.length ? `<ul class="partc-hint">${x.denominator.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}`
            : '<p class="partc-hint">No attribution factor: the figure rests on a sector-average option and is a rough estimate of this institution\'s share.</p>'}
          ${x.factorRelease ? `<h5 class="partc-subhead">Factor set</h5>
            <p class="partc-hint">${esc(x.factorRelease.tables[0].table)} v${esc(x.factorRelease.tables[0].version)}, ${esc(x.factorRelease.tables[0].status)} · rows ${esc(x.factorRelease.rows.join(', '))} · SHA-256 ${esc(x.factorRelease.checksum.slice(0, 16))}…</p>` : ''}
          ${x.exposure.counterparty.sectorKey ? `<p class="partc-hint">Held sector: ${esc(x.exposure.counterparty.sectorKey)}</p>` : ''}
        </div>
      </div>
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
      <p class="partc-hint">Computed ${esc(e.computedAt)} · ${esc(e.standard)}</p>`);
    for (const el of document.querySelectorAll('#pr-detail [data-writes]')) el.hidden = preview();
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
    if (isProperty()) return collectProperty();
    if (cls === 'motor-vehicle-loans') return collectVehicle();
    if (cls === 'project-finance') return collectProject();
    if (cls === 'listed-equity-corporate-bonds') return collectListed();
    return collectBusinessLoan();
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

    const basis = $('pr-f-basis').value;
    const period = str('pr-f-period');
    const reported = v => v === undefined ? undefined
      : { value: v, basis, period, verifier: basis === 'reported-verified' ? str('pr-f-verifier') : undefined };
    const s1 = num('pr-f-s1'), s2 = num('pr-f-s2'), s3 = num('pr-f-s3');
    if (s1 !== undefined || s2 !== undefined || s3 !== undefined || hasValue) {
      body.emissions = { scope1: reported(s1), scope2: reported(s2), scope3: reported(s3) };
    } else {
      /* Nothing reported and no company value: Option 3b from a sector factor —
         the one typed here, or, left empty, the held factor for the mapped
         sector. */
      const factor = sf => (sf === undefined ? undefined
        : { value: sf, unit: 'tCO2e per unit of assets', source: str('pr-f-sf-source'), vintage: num('pr-f-sf-vintage') });
      body.emissions = {
        scope1: { basis: 'assets-sector', activity: { factor: factor(num('pr-f-sf1')) } },
        scope2: { basis: 'assets-sector', activity: { factor: factor(num('pr-f-sf2')) } },
      };
    }
    if (s3 === undefined) body.emissions.scope3AbsentReason = str('pr-f-s3-reason');
    return prune(body);
  }

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
    say('pr-form-status', 'Recording…');
    try {
      const { exposure } = await post('/exposures', collect());
      say('pr-form-status', `Recorded ${exposure.counterparty.name || 'the exposure'}. ${(exposure.result.validation && exposure.result.validation.note) || ''}`);
      $('pr-form').reset();
      applyDenominatorMode();
      show('pr-record', false);
      await load();
      await openDetail(exposure.exposureId);
    } catch (err) {
      say('pr-form-status', err.message);
    }
  }

  function applyDenominatorMode() {
    const listed = $('pr-f-listed').checked && $('pr-f-instrument').value !== 'unlisted-equity';
    show('pr-denom-listed', listed);
    show('pr-denom-private', !listed);
    const factors = num('pr-f-s1') === undefined && num('pr-f-s2') === undefined
      && num('pr-f-equity') === undefined && num('pr-f-debt') === undefined && num('pr-f-mcap') === undefined;
    show('pr-sector-factor', factors);
  }

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
    on('pr-record-toggle', 'click', () => { show('pr-record', $('pr-record').hidden); applyClass(); applyDenominatorMode(); });
    on('pr-form-cancel', 'click', () => show('pr-record', false));
    on('pr-form', 'submit', submitForm);
    on('pr-book-form', 'submit', submitBook);
    on('pr-detail-close', 'click', closeDetail);
    on('pr-detail-recompute', 'click', recompute);
    on('pr-detail-remove', 'click', remove);
    on('pr-detail-report', 'click', exposureReport);
    on('pr-pdf', 'click', () => disclosure('pdf'));
    on('pr-docx', 'click', () => disclosure('docx'));
    for (const id of ['pr-f-listed', 'pr-f-instrument', 'pr-f-s1', 'pr-f-s2', 'pr-f-equity', 'pr-f-debt', 'pr-f-mcap']) {
      on(id, 'change', applyDenominatorMode);
      on(id, 'input', applyDenominatorMode);
    }
    for (const id of ['pr-f-asof', 'pr-f-re-asof', 'pr-f-le-asof', 'pr-f-mv-asof']) {
      if ($(id) && !$(id).value) $(id).value = `${new Date().getFullYear()}-12-31`;
    }
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
