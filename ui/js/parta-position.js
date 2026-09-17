/* ============================================================
   CarbonIQ — PCAF Part A, the financed-emissions position
   ============================================================

   Every figure on this screen comes from /v1/pcaf/part-a/financed-emissions.
   The page holds no arithmetic of its own — not a sum across classes, not a
   coverage share, not a score. A number computed here and a number computed
   by the engine would agree until the day they did not, and the disagreement
   would surface in the document a bank files.

   So the loop is: choose a year, read the position, render what came back,
   and hand the same year to the disclosure route for the download. Recording
   the entity's facts puts the form on the wire and renders the settings the
   server holds afterwards.

   Four rules the render carries, each a way to draw a confident screen that
   is wrong:

     the headline is the sum of each class on its own boundary, and the note
     beside it names those boundaries — it is never a sum of everything;
     scope 3 is a line of its own and is never added to the headline;
     one data-quality score per class, never an average across classes —
     §5.2 and §5.9 score on different tables;
     a class outside the book's currency shows a dash for coverage, not a
     ratio nothing converted — Number(null) is 0, and 0 is finite.
   ============================================================ */

const PartAPositionPage = (() => {

  const $ = id => document.getElementById(id);
  const fmt = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—'
    : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const show = (id, yes) => { const el = $(id); if (el) el.hidden = !yes; };

  let year = null;
  let position = null;

  /* A score is a category on a scale where 1 is best. Never a fraction of
     five. The weighted score across a class is shown to two decimals. */
  const dqBadge = (v, label, dp = 2) => v === null || v === undefined
    ? `<span class="dqb dqb-na">${esc(label || 'not scored')}</span>`
    : `<span class="dqb dqb-${Math.round(v)}">${label ? `<i>${esc(label)}</i>` : ''}<b>${Number(v).toFixed(dp)}</b></span>`;

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
  const put = (path, body) => call(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  /* The screen a class is recorded on. The row's action opens it. */
  const BOOK_PAGE = { 'business-loans-unlisted-equity': 'parta-register', 'sovereign-debt': 'parta-sovereign' };
  const BOOK_LABEL = { 'parta-register': 'Open the lending book', 'parta-sovereign': 'Open the sovereign book' };

  function goTo(pageId) {
    const item = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (item) item.click();
  }

  // ── years ──────────────────────────────────────────────────

  /* Both registers, one list: a year holding only sovereign holdings is
     still a year the consolidated position answers for. */
  async function years() {
    const out = new Set();
    for (const path of ['/years', '/sovereign/years']) {
      try {
        const { years: ys } = await call(path);
        for (const y of ys || []) out.add(String(y.reportingYear));
      } catch (_) { /* the other register may still hold a year */ }
    }
    return [...out].sort();
  }

  async function loadYears() {
    const list = await years();
    const chosen = $('fe-year') ? $('fe-year').value : '';
    if (!list.length) list.push(String(new Date().getFullYear()));
    setHtml('fe-year', list.map(y => `<option value="${esc(y)}">${esc(y)}</option>`).join(''));
    $('fe-year').value = list.includes(chosen) ? chosen : list[list.length - 1];
    year = $('fe-year').value;
  }

  // ── the position ───────────────────────────────────────────

  async function load() {
    year = $('fe-year').value;
    say('fe-status', 'Reading the book…');
    try {
      position = await call(`/financed-emissions/${encodeURIComponent(year)}`);
    } catch (err) {
      show('fe-body', false);
      say('fe-status', err.message);
      return;
    }
    render(position);
    show('fe-body', true);
    const recorded = position.classes.filter(c => c.status === 'recorded');
    say('fe-status', recorded.length
      ? `${position.exposures} exposure(s) across ${recorded.length} asset class(es) in FY${position.reportingYear}.`
      : `No asset class holds exposures for FY${position.reportingYear} yet. Record them in the lending book or the sovereign book; the disclosure is refused until one does.`);
  }

  function render(p) {
    say('fe-subtitle', `FY${p.reportingYear}${p.currency ? ` · ${p.currency}` : ''} · every Part A asset class, side by side`);
    renderReadiness(p);
    renderFigures(p);
    renderClasses(p);
    renderBook(p);
    renderDq(p);
    renderEntity(p.entity, p.classes);
    /* The S2 facts panel is its own module over the same settings record.
       Handed what this load already fetched, so the screen makes one request
       for the entity rather than two that could disagree. */
    if (typeof PartAClimatePanel !== 'undefined') PartAClimatePanel.load(p.entity);
  }

  function renderReadiness(p) {
    const items = p.outstandingItems || [];
    const pill = $('fe-ready-pill');
    if (pill) {
      pill.textContent = items.length ? `${items.length} item(s) outstanding` : 'Nothing outstanding';
      pill.classList.toggle('fe-pill-ready', items.length === 0);
    }
    setHtml('fe-outstanding', items.length === 0
      ? '<p class="partc-hint">Every fact Chapter 6 asks the reporting entity to state is on the record for this year.</p>'
      : items.map(it => {
        /* Where each item is answered: the book total and the entity facts on
           this screen; a class not yet recorded on its own book. */
        const what = it.what || '';
        let go = 'entity';
        if (/total loans and investments/i.test(what)) go = 'book';
        else if (/Sovereign debt/.test(what)) go = 'parta-sovereign';
        else if (/Business loans/.test(what)) go = 'parta-register';
        const label = go === 'entity' ? 'Answer below' : go === 'book' ? 'State the book total' : BOOK_LABEL[go];
        return `<div class="fe-item">
          <div>
            <p>${esc(what)}</p>
            ${it.why ? `<span class="partc-hint">${esc(it.why)}</span>` : ''}
            <span class="partc-hint">${esc(it.clause || '')}</span>
          </div>
          ${preview() ? '' : `<button type="button" class="fe-item-go" data-go="${esc(go)}">${esc(label)}</button>`}
        </div>`;
      }).join(''));
    for (const b of document.querySelectorAll('#fe-outstanding [data-go]')) {
      b.addEventListener('click', () => {
        const to = b.getAttribute('data-go');
        const target = to === 'entity' ? $('fe-entity') : to === 'book' ? $('fe-book') : null;
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else goTo(to);
      });
    }
  }

  function renderFigures(p) {
    const t = p.totals || {};
    say('fe-headline', t.headline && t.headline.value !== null ? fmt(t.headline.value, 2) : '—');
    say('fe-headline-basis', t.headline ? t.headline.basis : '');
    say('fe-headline-note', t.headline ? t.headline.note : '');
    say('fe-s3', t.scope3 && t.scope3.value !== null ? fmt(t.scope3.value, 2) : '—');

    const c = p.coverage || {};
    if (c.sharePct === null || c.sharePct === undefined) {
      say('fe-coverage', '—');
      say('fe-coverage-unit', c.remedy || 'book total not stated');
    } else {
      say('fe-coverage', `${Number(c.sharePct).toFixed(2)}%`);
      say('fe-coverage-unit', `of ${esc(c.currency)} ${fmt(c.totalLoansAndInvestments, 0)} total loans and investments`);
    }

    const i = p.intensity || {};
    say('fe-intensity', i.value === null || i.value === undefined ? '—' : fmt(i.value, 2));
    say('fe-intensity-unit', i.unit ? i.unit.replace('tCO2e', 'tCO₂e') : (i.basis || 'tCO₂e per million'));
  }

  const STATE = {
    'recorded': 'Recorded', 'not-recorded': 'Not recorded this year',
    'engine-only': 'Engine built, no register', 'not-built': 'Not built',
  };

  function renderClasses(p) {
    const rows = p.classes || [];
    setHtml('fe-classes', `
      <div class="fe-scroll"><table class="partc-table">
        <thead><tr><th>Asset class</th><th>Section</th><th>Status</th><th>Exposures</th><th>Outstanding</th><th>Headline</th><th>Scope 3</th><th>Score</th><th>Coverage</th><th>Action</th></tr></thead>
        <tbody>${rows.map(c => {
          const rec = c.status === 'recorded';
          const page = BOOK_PAGE[c.assetClass];
          const action = page && !preview() ? `<button type="button" class="fe-row-go" data-page="${esc(page)}">${rec ? 'Open' : 'Record'}</button>` : '';
          return `<tr>
            <td>${esc(c.label)}${!rec ? `<br><span class="partc-hint">${esc(c.reason || '')}${c.reasonStatedBy === 'entity' ? ' — stated by the reporting entity' : ''}</span>` : ''}</td>
            <td>${esc(c.section)}</td>
            <td><span class="fe-state${rec ? ' fe-state-recorded' : ''}">${esc(STATE[c.status] || c.status)}</span></td>
            <td class="num">${rec ? c.exposures : '—'}</td>
            <td class="num">${rec ? `${esc(c.currency)} ${fmt(c.outstanding, 0)}` : '—'}</td>
            <td class="num">${rec && c.headline && c.headline.value !== null ? `${fmt(c.headline.value, 2)}<br><span class="partc-hint">${esc(c.headline.label)}</span>` : '—'}</td>
            <td class="num">${rec && c.scope3 && c.scope3.value !== null ? fmt(c.scope3.value, 2) : '—'}</td>
            <td class="num">${rec ? dqBadge(c.dataQuality && c.dataQuality.score) : '—'}</td>
            <td class="num">${rec && c.coveragePct !== null && c.coveragePct !== undefined ? `${Number(c.coveragePct).toFixed(2)}%` : '—'}</td>
            <td>${action}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`);
    for (const b of document.querySelectorAll('#fe-classes [data-page]')) {
      b.addEventListener('click', () => goTo(b.getAttribute('data-page')));
    }
  }

  function renderBook(p) {
    const c = p.coverage || {};
    const currency = p.currency || 'LKR';
    if (!p.book) {
      setHtml('fe-book', `<p class="partc-hint">Not stated for FY${esc(p.reportingYear)}. Coverage cannot be a percentage of anything until it is.</p>`);
    } else {
      setHtml('fe-book', `
        <dl class="fe-kv">
          <dt>Total loans and investments</dt><dd>${esc(p.book.currency || currency)} ${fmt(p.book.totalLoansAndInvestments, 0)}</dd>
          <dt>Assessed outstanding</dt><dd>${c.assessedOutstanding === null || c.assessedOutstanding === undefined ? '—' : `${esc(c.currency)} ${fmt(c.assessedOutstanding, 0)}`}</dd>
          <dt>Coverage</dt><dd>${c.sharePct === null || c.sharePct === undefined ? '—' : `${Number(c.sharePct).toFixed(2)}%`}</dd>
          <dt>Basis</dt><dd>Declared${p.book.statedBy ? ` by ${esc(p.book.statedBy)}` : ''}</dd>
          ${(c.excluded || []).map(x => `<dt>Excluded from the share</dt><dd>${esc(x.label)} — ${esc(x.currency)} ${fmt(x.outstanding, 0)}, not in the book's currency</dd>`).join('')}
        </dl>`);
    }
    show('fe-book-form', !preview());
    if ($('fe-book-currency') && !$('fe-book-currency').value) $('fe-book-currency').value = currency;
  }

  function renderDq(p) {
    const dq = p.dataQuality || {};
    say('fe-dq-note', dq.note || '');
    const rows = dq.byClass || [];
    setHtml('fe-dq', rows.length === 0
      ? '<p class="partc-hint">No class recorded, so no score to state.</p>'
      : `<div class="fe-scroll"><table class="partc-table">
          <thead><tr><th>Asset class</th><th>Score</th><th>Table</th><th>Weighting</th></tr></thead>
          <tbody>${rows.map(r => `<tr>
            <td>${esc(r.label)} <span class="partc-hint">${esc(r.section)}</span></td>
            <td class="num">${dqBadge(r.score)}</td>
            <td>${esc(r.table)}</td>
            <td>${esc(r.weighting)}</td>
          </tr>`).join('')}</tbody></table></div>`);
  }

  // ── the reporting entity ───────────────────────────────────

  const APPROACH = { operational_control: 'Operational control', financial_control: 'Financial control', equity_share: 'Equity share' };
  const stated = v => (v === null || v === undefined || v === '') ? '<span class="fe-absent">not stated</span>' : esc(v);
  const person = x => x && x.name ? esc([x.name, x.role, x.date].filter(Boolean).join(' · ')) : '<span class="fe-absent">not stated</span>';

  function renderEntity(s, classes) {
    s = s || {};
    setHtml('fe-entity-view', `
      <dl class="fe-kv">
        <dt>Legal name</dt><dd>${stated(s.reportingEntity)}</dd>
        <dt>Consolidation approach</dt><dd>${stated(s.consolidationApproach ? APPROACH[s.consolidationApproach] || s.consolidationApproach : null)}</dd>
        <dt>Fiscal year-end</dt><dd>${stated(s.fiscalYearEnd)}</dd>
        <dt>GWP basis</dt><dd>${stated(s.gwpBasis)}</dd>
        <dt>Boundary note</dt><dd>${stated(s.boundaryNote)}</dd>
        <dt>Prepared by</dt><dd>${person(s.preparedBy)}</dd>
        <dt>Approved by</dt><dd>${person(s.approvedBy)}</dd>
        <dt>Base year</dt><dd>${stated(s.baseYear)}</dd>
        <dt>Significance threshold</dt><dd>${s.significanceThresholdPct === null || s.significanceThresholdPct === undefined ? stated(null) : `${esc(s.significanceThresholdPct)}%`}</dd>
        <dt>Recalculation policy</dt><dd>${stated(s.recalculationPolicy)}</dd>
      </dl>`);
    if (preview()) return;

    const set = (id, v) => { const el = $(id); if (el) el.value = v === null || v === undefined ? '' : String(v); };
    set('fe-e-name', s.reportingEntity); set('fe-e-approach', s.consolidationApproach || '');
    set('fe-e-fye', s.fiscalYearEnd); set('fe-e-gwp', s.gwpBasis); set('fe-e-boundary', s.boundaryNote);
    set('fe-e-prep-name', s.preparedBy && s.preparedBy.name); set('fe-e-prep-role', s.preparedBy && s.preparedBy.role); set('fe-e-prep-date', s.preparedBy && s.preparedBy.date);
    set('fe-e-appr-name', s.approvedBy && s.approvedBy.name); set('fe-e-appr-role', s.approvedBy && s.approvedBy.role); set('fe-e-appr-date', s.approvedBy && s.approvedBy.date);
    set('fe-e-base-year', s.baseYear); set('fe-e-threshold', s.significanceThresholdPct); set('fe-e-policy', s.recalculationPolicy);

    const reasons = new Map((s.assetClassesNotReported || []).map(x => [x.assetClass, x.reason]));
    setHtml('fe-e-not-reported', (classes || []).filter(c => c.status !== 'recorded').map(c => `
      <label class="fe-wide">${esc(c.label)} (${esc(c.section)})
        <input type="text" maxlength="500" data-not-reported="${esc(c.assetClass)}" value="${esc(reasons.get(c.assetClass) || '')}" placeholder="${esc(c.reasonStatedBy === 'system' ? c.reason : '')}"></label>`).join(''));
    show('fe-entity-form', true);
  }

  const str = id => { const v = $(id) && $(id).value; return v ? String(v).trim() : null; };
  const num = id => { const v = $(id) && $(id).value; return v === '' || v === undefined || v === null ? null : Number(v); };
  /* A person is a name, and a role and a date only where typed: the schema
     refuses a null role, and an absent key is the honest shape of "not
     stated". No name at all is null, which clears the person. */
  const who = (n, r, d) => {
    if (!str(n)) return null;
    const p = { name: str(n) };
    if (str(r)) p.role = str(r);
    if (str(d)) p.date = str(d);
    return p;
  };

  /** The settings request, read from the form and nothing else. */
  function collectEntity() {
    const notReported = [];
    for (const el of document.querySelectorAll('#fe-e-not-reported [data-not-reported]')) {
      const reason = String(el.value || '').trim();
      if (reason) notReported.push({ assetClass: el.getAttribute('data-not-reported'), reason });
    }
    const body = {
      reportingEntity: str('fe-e-name'),
      consolidationApproach: str('fe-e-approach'),
      fiscalYearEnd: str('fe-e-fye'),
      gwpBasis: str('fe-e-gwp'),
      boundaryNote: str('fe-e-boundary') || '',
      preparedBy: who('fe-e-prep-name', 'fe-e-prep-role', 'fe-e-prep-date'),
      approvedBy: who('fe-e-appr-name', 'fe-e-appr-role', 'fe-e-appr-date'),
      baseYear: num('fe-e-base-year'),
      recalculationPolicy: str('fe-e-policy') || '',
      assetClassesNotReported: notReported,
    };
    const threshold = num('fe-e-threshold');
    if (threshold !== null) body.significanceThresholdPct = threshold;
    return body;
  }

  async function submitEntity(ev) {
    ev.preventDefault();
    say('fe-entity-status', 'Recording…');
    try {
      await put('/settings', collectEntity());
      say('fe-entity-status', 'Recorded.');
      document.dispatchEvent(new CustomEvent('carboniq:entity'));
      await load();
    } catch (err) { say('fe-entity-status', err.message); }
  }

  async function submitBook(ev) {
    ev.preventDefault();
    say('fe-book-status', 'Stating…');
    try {
      const body = { reportingYear: Number(year), totalLoansAndInvestments: num('fe-book-total') };
      if (str('fe-book-currency')) body.currency = str('fe-book-currency');
      if (str('fe-book-by')) body.statedBy = str('fe-book-by');
      await put('/book', body);
      say('fe-book-status', 'Stated.');
      await load();
    } catch (err) { say('fe-book-status', err.message); }
  }

  // ── the documents ──────────────────────────────────────────

  /* The response is read whole and checked before a file is offered: a
     refusal — an empty year is a 409 — is shown as its message, never saved
     as a file that will not open. */
  async function download(path, filename, label) {
    say('fe-status', `Preparing the ${label}…`);
    try {
      const res = await window.CARBONIQ_fetch('/v1/pcaf/part-a' + path);
      if (!res.ok) {
        let data = {};
        try { data = await res.json(); } catch (_) { /* empty */ }
        throw new Error([data.message, data.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say('fe-status', `FY${year} ${label} downloaded.`);
    } catch (err) { say('fe-status', err.message); }
  }
  const disclosure = format => download(`/financed-emissions/${encodeURIComponent(year)}/disclosure?format=${format}`,
    `part-a-financed-emissions-fy${year}.${format}`, `disclosure (${format.toUpperCase()})`);

  // ── the dashboard band ─────────────────────────────────────

  /* The landing dashboard carries the latest year's position in one band,
     read from the same route this screen reads. Every id it writes lives in
     the shell, so a dashboard without the band is a no-op. */
  async function band() {
    if (!$('fe-band-headline')) return;
    let latest = null;
    try { const ys = await years(); latest = ys.length ? ys[ys.length - 1] : null; } catch (_) { latest = null; }
    if (!latest) {
      say('fe-band-year', 'No reporting year recorded');
      for (const id of ['fe-band-headline', 'fe-band-s3', 'fe-band-coverage']) say(id, '—');
      say('fe-band-ready', '—');
      say('fe-band-note', 'Record exposures in the lending book or the sovereign book to begin.');
      return;
    }
    try {
      const p = await call(`/financed-emissions/${encodeURIComponent(latest)}`);
      const t = p.totals || {};
      say('fe-band-year', `FY${p.reportingYear}`);
      say('fe-band-headline', t.headline && t.headline.value !== null ? fmt(t.headline.value, 2) : '—');
      say('fe-band-s3', t.scope3 && t.scope3.value !== null ? fmt(t.scope3.value, 2) : '—');
      const c = p.coverage || {};
      say('fe-band-coverage', c.sharePct === null || c.sharePct === undefined ? '—' : `${Number(c.sharePct).toFixed(1)}%`);
      const n = (p.outstandingItems || []).length;
      say('fe-band-ready', n === 0 ? 'Nothing outstanding' : `${n} item(s) outstanding`);
      const recorded = p.classes.filter(x => x.status === 'recorded').map(x => `${x.label} (${x.section})`);
      say('fe-band-note', recorded.length
        ? `${recorded.join(' · ')}. Scope 3 is a separate line — PCAF Part A §5.2 (p.56).`
        : `No asset class holds exposures for FY${p.reportingYear}.`);
    } catch (err) {
      say('fe-band-year', '—');
      say('fe-band-note', err.message);
    }
  }

  /* The starter book: recorded into this organisation through the same
     services a keyed exposure goes through; the server refuses it over a
     year that already holds one, and the refusal is shown as its message. */
  async function loadStarter() {
    const nameEl = document.getElementById('fe-starter-name');
    const name = nameEl ? nameEl.value.trim() : '';
    const body = name ? { reportingEntity: name } : {};
    if (!window.confirm('Load the illustrative starter book into this organisation? Every figure is a placeholder to edit.')) return;
    say('fe-status', 'Loading the starter book…');
    try {
      const r = await call('/starter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      document.dispatchEvent(new CustomEvent('carboniq:entity'));
      say('fe-status', `Starter book loaded: ${r.installed.exposures} exposures and ${r.installed.sovereign} sovereign holdings across ${r.installed.classes} classes for FY${r.reportingYear}. ${r.note}`);
      await loadYears();
      if ($('fe-year')) $('fe-year').value = String(r.reportingYear);
      await load();
    } catch (err) { say('fe-status', err.message); }
  }

  // ── lifecycle ──────────────────────────────────────────────

  /* Everything that changes what the first request says — the year, the
     preview state, the listeners — is wired before load() is called. */
  async function init() {
    on('fe-refresh', 'click', load);
    on('fe-year', 'change', load);
    on('fe-pdf', 'click', () => disclosure('pdf'));
    on('fe-docx', 'click', () => disclosure('docx'));
    on('fe-json', 'click', () => disclosure('json'));
    on('fe-csv', 'click', () => download(`/financed-emissions/${encodeURIComponent(year)}/register.csv`,
      `part-a-register-fy${year}.csv`, 'exposure register (CSV)'));
    on('fe-entity-form', 'submit', submitEntity);
    on('fe-book-form', 'submit', submitBook);
    on('fe-starter', 'click', loadStarter);
    for (const el of document.querySelectorAll('.parta-position [data-writes]')) el.hidden = preview();
    await loadYears();
    await load();
  }

  function refresh() {
    return load();
  }

  return { init, refresh, load, band, collectEntity };
})();
