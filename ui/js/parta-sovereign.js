/* ============================================================
   CarbonIQ — PCAF Part A §5.9, the sovereign book
   ============================================================

   Every figure on this screen comes from /v1/pcaf/part-a/sovereign. The page
   holds no arithmetic of its own — not the attribution factor (exposure ÷
   PPP-adjusted GDP), not a sum of lines, not a score. A number computed here
   and a number computed by the engine would agree until the day they did not,
   and the disagreement would surface in a disclosure.

   Three rules the render carries, each a way to draw a confident screen that
   is wrong:

     scope 1 is shown on both LULUCF boundaries and the two are never summed;
     scope 3 is a line of its own and is never added to scope 1;
     a holding with no attribution factor shows a dash, not a zero —
     Number(null) is 0, and 0 is finite.
   ============================================================ */

const PartASovereignPage = (() => {

  const $ = id => document.getElementById(id);
  const fmt = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—'
    : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const show = (id, yes) => { const el = $(id); if (el) el.hidden = !yes; };

  let currency = 'USD';
  let year = null;
  let rows = [];
  let openId = null;

  /* A score is a category on a scale where 1 is best. Never a fraction of
     five. The weighted score across a book is shown to two decimals; a single
     holding's score is the whole number its option carries. */
  const dqBadge = (v, label, dp = 0) => v === null || v === undefined
    ? `<span class="dqb dqb-na">${esc(label || 'not scored')}</span>`
    : `<span class="dqb dqb-${Math.round(v)}">${label ? `<i>${esc(label)}</i>` : ''}<b>${Number(v).toFixed(dp)}</b></span>`;

  const sevChip = sev => `<span class="partc-sev">${sev === 'material' ? 'material' : 'advisory'}</span>`;

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

  // ── the held countries ─────────────────────────────────────

  /* The sovereigns the dataset holds, for the form's select. Loaded before the
     first request so the select is populated before anyone opens the form. */
  async function loadCountries() {
    const sel = $('ps-f-country');
    if (!sel) return;
    try {
      const { assetClasses } = await call('/reference');
      const cls = (assetClasses || []).find(c => c.id === 'sovereign-debt');
      const held = (cls && cls.countriesHeld) || [];
      sel.innerHTML = '<option value="">Custom — enter figures below</option>' + held
        .map(c => `<option value="${esc(c.code)}">${esc(c.name)}${c.provisional ? ' · provisional' : ''}</option>`).join('');
    } catch (_) { /* the custom path still records */ }
  }

  // ── years ──────────────────────────────────────────────────

  async function loadYears() {
    let years = [];
    try { ({ years } = await call('/sovereign/years')); } catch (_) { years = []; }
    const chosen = $('ps-year') ? $('ps-year').value : '';
    const list = years.map(y => y.reportingYear);
    if (!list.length) list.push(String(new Date().getFullYear()));
    setHtml('ps-year', list.map(y => `<option value="${esc(y)}">${esc(y)}</option>`).join(''));
    $('ps-year').value = list.includes(chosen) ? chosen : list[list.length - 1];
    year = $('ps-year').value;
  }

  // ── the position ───────────────────────────────────────────

  async function load() {
    year = $('ps-year').value;
    say('ps-status', 'Loading…');
    let position = null;
    try {
      position = await call(`/sovereign/position/${year}`);
    } catch (err) {
      show('ps-body', false);
      say('ps-status', err.message);
      return;
    }
    let list = [];
    try { ({ exposures: list } = await call(`/sovereign/exposures?reportingYear=${encodeURIComponent(year)}&limit=200`)); }
    catch (err) { say('ps-status', err.message); }
    rows = list;
    render(position);
    show('ps-body', true);
    say('ps-status', `${position.exposures} holding(s) in FY${position.reportingYear}.`);
  }

  function render(p) {
    currency = (p.coverage && p.coverage.currency) || currency;
    const t = p.totals;
    say('ps-subtitle', `FY${p.reportingYear} · sovereign debt · exposure ÷ PPP-adjusted GDP`);
    say('ps-s1-excl', fmt(t.financedScope1ExclLULUCF, 2));
    say('ps-s1-incl', t.financedScope1InclLULUCF.value === null ? '—' : fmt(t.financedScope1InclLULUCF.value, 2));
    say('ps-s1-incl-note', `${t.financedScope1InclLULUCF.heldCount} of ${t.financedScope1InclLULUCF.total} held`);
    say('ps-s3', t.financedScope3.value === null ? '—' : fmt(t.financedScope3.value, 2));

    const dq = p.dataQuality;
    setHtml('ps-dq', dq.score === null
      ? '<span class="dqb dqb-na">no score</span>'
      : `Outstanding-weighted ${dqBadge(dq.score, null, 2)}${dq.excluded ? ` <span class="partc-hint">${dq.excluded} without a score, excluded</span>` : ''}`);

    if (p.coverage.share === null || p.coverage.share === undefined) {
      say('ps-coverage', '—');
      say('ps-coverage-unit', 'book total not stated');
    } else {
      say('ps-coverage', `${Number(p.coverage.share).toFixed(2)}%`);
      say('ps-coverage-unit', 'of total loans and investments');
    }

    renderBook(p);
    renderGroups(p);
    renderPlan(p.improvementPlan);
    renderRows();
    if (openId && !rows.find(r => r.exposureId === openId)) closeDetail();
  }

  function renderBook(p) {
    const c = p.coverage;
    if (c.share === null || c.share === undefined) {
      setHtml('ps-book', `<p class="partc-hint">Not stated for FY${esc(p.reportingYear)}. Coverage cannot be a percentage of anything until it is.</p>`);
    } else {
      setHtml('ps-book', `
        <dl class="ps-kv">
          <dt>Total loans and investments</dt><dd>${esc(c.currency || currency)} ${fmt(c.totalLoansAndInvestments, 0)}</dd>
          <dt>Assessed outstanding</dt><dd>${esc(currency)} ${fmt(c.assessedOutstanding, 0)}</dd>
          <dt>Coverage</dt><dd>${Number(c.share).toFixed(2)}%</dd>
          <dt>Basis</dt><dd>Declared${c.basisStatedBy ? ` by ${esc(c.basisStatedBy)}` : ''}</dd>
        </dl>`);
    }
    show('ps-book-form', !preview());
    if ($('ps-book-currency') && !$('ps-book-currency').value) $('ps-book-currency').value = currency;
  }

  function renderGroups(p) {
    const g = p.bySovereign || [];
    setHtml('ps-groups', `
      <div class="ps-scroll"><table class="partc-table">
        <thead><tr><th>Sovereign</th><th>Holdings</th><th>Outstanding</th><th>Financed scope 1 (excl. LULUCF)</th></tr></thead>
        <tbody>
          ${g.map(x => `<tr>
            <td>${esc(x.name || x.country || 'unknown')}</td>
            <td class="num">${x.exposures}</td>
            <td class="num">${fmt(x.outstanding, 0)}</td>
            <td class="num">${fmt(x.financedScope1ExclLULUCF, 2)}</td>
          </tr>`).join('')}
        </tbody></table></div>`);
  }

  function renderPlan(plan) {
    if (!plan || !plan.length) { setHtml('ps-plan', '<p class="partc-hint">No findings across the book.</p>'); return; }
    say('ps-plan-note', 'Every finding grouped by what would clear it, the material ones first.');
    setHtml('ps-plan', `
      <div class="ps-scroll"><table class="partc-table">
        <thead><tr><th></th><th>Finding</th><th>Holdings</th><th>Sovereigns</th><th>What clears it</th></tr></thead>
        <tbody>${plan.map(r => `<tr>
          <td>${sevChip(r.severity)}</td>
          <td>${esc(r.code.replace(/_/g, ' ').toLowerCase())}</td>
          <td class="num">${r.count}</td>
          <td>${esc((r.sovereigns || []).join(', '))}</td>
          <td>${esc(r.remedy)}</td>
        </tr>`).join('')}</tbody></table></div>`);
  }

  function renderRows() {
    say('ps-rows-note', rows.length ? `${rows.length} shown. Open a row for its trace and findings.` : '');
    setHtml('ps-rows', rows.length === 0
      ? '<p class="partc-hint">No sovereign holdings recorded in this year.</p>'
      : `<div class="ps-scroll"><table class="partc-table">
          <thead><tr><th>Sovereign</th><th>Instrument</th><th>Outstanding</th><th>AF</th><th>Scope 1 excl.</th><th>Scope 1 incl.</th><th>Score</th><th>Checks</th></tr></thead>
          <tbody>${rows.map(r => {
            const x = r.result || {};
            const inv = x.inventory || {};
            const s1 = inv.scope1 || {};
            const af = x.attribution && Number.isFinite(x.attribution.value) ? x.attribution.value.toFixed(6) : '—';
            const dq = inv.dataQuality || {};
            const v = (x.validation || {});
            const n = (v.findings || []).length;
            const material = (v.findings || []).some(f => f.severity === 'material');
            const incl = s1.inclLULUCF && !s1.inclLULUCF.absent ? fmt(s1.inclLULUCF.value, 2) : '—';
            return `<tr class="ps-row${r.exposureId === openId ? ' is-open' : ''}" data-id="${esc(r.exposureId)}">
              <td>${esc(r.country && (r.country.name || r.country.code))}</td>
              <td>${esc(((x.sovereign && x.sovereign.instrument) || '').replace(/-/g, ' '))}</td>
              <td class="num">${fmt(r.input && r.input.exposure && r.input.exposure.amount, 0)}</td>
              <td class="num">${af}</td>
              <td class="num">${fmt(s1.exclLULUCF && s1.exclLULUCF.value, 2)}</td>
              <td class="num">${incl}</td>
              <td class="num">${dqBadge(dq.score, dq.option ? 'Option ' + dq.option : null)}</td>
              <td><span class="ps-verdict ${n === 0 ? 'ps-verdict-clean' : material ? 'ps-verdict-material' : ''}">${n === 0 ? 'clean' : `${n} finding${n === 1 ? '' : 's'}`}</span></td>
            </tr>`;
          }).join('')}</tbody></table></div>`);
    for (const tr of document.querySelectorAll('#ps-rows .ps-row')) {
      tr.addEventListener('click', () => openDetail(tr.getAttribute('data-id')));
    }
  }

  // ── one holding ────────────────────────────────────────────

  async function openDetail(id) {
    openId = id;
    let exposure;
    try { ({ exposure } = await call(`/sovereign/exposures/${encodeURIComponent(id)}`)); }
    catch (err) { say('ps-status', err.message); return; }
    renderDetail(exposure);
    renderRows();
    show('ps-detail', true);
    $('ps-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeDetail() { openId = null; show('ps-detail', false); renderRows(); }

  function renderDetail(e) {
    const x = e.result;
    const inv = x.inventory;
    const s1 = inv.scope1;
    say('ps-detail-title', (e.country && (e.country.name || e.country.code)) || 'Holding');
    say('ps-detail-status', '');
    const line = (label, l) => `<dt>${label}</dt><dd>${l && !l.absent && Number.isFinite(l.value) ? fmt(l.value, 2) + ' tCO₂e' : (l && l.reason ? esc(l.reason) : '—')}</dd>`;
    const dq = inv.dataQuality;
    const findings = (x.validation && x.validation.findings) || [];
    setHtml('ps-detail-body', `
      <div class="partc-panels">
        <div class="partc-panel">
          <h5 class="partc-subhead">Financed lines</h5>
          <dl class="ps-kv">
            ${line('Scope 1 — excl. LULUCF', s1.exclLULUCF)}
            ${line('Scope 1 — incl. LULUCF', s1.inclLULUCF)}
            ${line('Scope 2', inv.scope2)}
            ${line('Scope 3', inv.scope3)}
          </dl>
          <p class="partc-hint">${esc(s1.note)}</p>
          <p class="partc-hint">${esc(x.removalsNote)}</p>
        </div>
        <div class="partc-panel">
          <h5 class="partc-subhead">Data quality</h5>
          <p>${dqBadge(dq.score, 'Option ' + dq.option)}${dq.reference ? ` <span class="partc-hint">${esc(dq.reference)}</span>` : ''}</p>
          <p class="partc-hint">${esc(dq.scale)}</p>
          <h5 class="partc-subhead">Attribution</h5>
          <p class="ps-eq">${esc(x.attribution.equation)}</p>
          <dl class="ps-kv"><dt>Factor</dt><dd>${x.attribution.value}</dd>
            <dt>PPP-adjusted GDP ($M)</dt><dd>${fmt(x.attribution.inputs && x.attribution.inputs.pppGdpMillionUsd, 0)}</dd></dl>
          ${inv.productionIntensity ? `<h5 class="partc-subhead">Production intensity</h5>
            <p class="partc-hint">${fmt(inv.productionIntensity.value, 2)} ${esc(inv.productionIntensity.unit)}</p>` : ''}
        </div>
      </div>
      <h5 class="partc-subhead">What the data says about itself</h5>
      ${findings.length === 0
        ? `<p class="partc-hint">${esc((x.validation && x.validation.note) || 'No findings.')}</p>`
        : findings.map(f => `<div class="ps-finding partc-sev-${f.severity === 'material' ? 'material' : 'info'}">
            <div>${sevChip(f.severity)}</div>
            <div class="ps-finding-body">
              <p>${esc(f.statement)}</p>
              <p class="partc-hint">${esc(f.effect)}</p>
              <p><strong>What clears it.</strong> ${esc(f.remedy)}</p>
              <span class="partc-hint">${esc(f.reference)}</span>
            </div>
          </div>`).join('')}
      <p class="partc-hint">Consumption view: ${esc(x.consumption && x.consumption.reason)}</p>
      <p class="partc-hint">Computed ${esc(e.computedAt)} · ${esc(e.standard)}</p>`);
    for (const el of document.querySelectorAll('#ps-detail [data-writes]')) el.hidden = preview();
  }

  async function recompute() {
    if (!openId) return;
    say('ps-detail-status', 'Recomputing…');
    try {
      const { movement } = await post(`/sovereign/exposures/${encodeURIComponent(openId)}/recompute`);
      await load();
      if (openId) await openDetail(openId);
      /* After the re-open, not before: openDetail() resets the status line. */
      say('ps-detail-status', movement.note);
    } catch (err) { say('ps-detail-status', err.message); }
  }

  async function remove() {
    if (!openId) return;
    if (!window.confirm('Remove this sovereign holding from the register?')) return;
    try {
      await del(`/sovereign/exposures/${encodeURIComponent(openId)}`);
      closeDetail();
      await load();
    } catch (err) { say('ps-detail-status', err.message); }
  }

  // ── recording ──────────────────────────────────────────────

  const num = id => { const v = $(id) && $(id).value; return v === '' || v === undefined || v === null ? undefined : Number(v); };
  const str = id => { const v = $(id) && $(id).value; return v ? String(v).trim() : undefined; };

  /** The request the engine takes, read from the form and nothing else. */
  function collect() {
    const country = str('ps-f-country');
    const body = {
      reportingYear: Number(year),
      instrument: $('ps-f-instrument').value,
      exposure: { amount: num('ps-f-amount'), currency: 'USD' },
      dataQualityOption: str('ps-f-dq'),
    };
    const ref = str('ps-f-ref');
    if (ref) body.identifiers = { accountNumber: ref };
    if (country) {
      body.country = country;
    } else {
      body.sovereign = {
        name: str('ps-f-name'),
        scope1ExclLULUCF: num('ps-f-s1-excl'),
        scope1InclLULUCF: num('ps-f-s1-incl'),
        pppGdp: num('ps-f-ppp'),
        emissionsYear: num('ps-f-year'),
        basis: str('ps-f-basis'),
      };
    }
    return prune(body);
  }

  /* Undefined keys never reach the wire: the schema is closed and a key set to
     undefined is a key the server would refuse by name. */
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

  function applyCountryMode() {
    show('ps-custom', !str('ps-f-country'));
  }

  async function submitForm(ev) {
    ev.preventDefault();
    say('ps-form-status', 'Recording…');
    try {
      const { exposure } = await post('/sovereign/exposures', collect());
      say('ps-form-status', `Recorded ${(exposure.country && (exposure.country.name || exposure.country.code)) || 'holding'}. ${exposure.result.validation.note}`);
      $('ps-form').reset();
      applyCountryMode();
      show('ps-record', false);
      await load();
      await openDetail(exposure.exposureId);
    } catch (err) {
      say('ps-form-status', err.message);
    }
  }

  async function submitBook(ev) {
    ev.preventDefault();
    say('ps-book-status', 'Stating…');
    try {
      await put('/book', prune({ reportingYear: Number(year), totalLoansAndInvestments: num('ps-book-total'),
        currency: str('ps-book-currency'), statedBy: str('ps-book-by') }));
      say('ps-book-status', 'Stated.');
      await load();
    } catch (err) { say('ps-book-status', err.message); }
  }

  // ── lifecycle ──────────────────────────────────────────────

  /* Everything that changes what the first request says — the year, the
     preview state, the listeners — is wired before load() is called. */
  async function init() {
    on('ps-refresh', 'click', load);
    on('ps-year', 'change', () => { closeDetail(); load(); });
    on('ps-record-toggle', 'click', () => { show('ps-record', $('ps-record').hidden); applyCountryMode(); });
    on('ps-form-cancel', 'click', () => show('ps-record', false));
    on('ps-form', 'submit', submitForm);
    on('ps-book-form', 'submit', submitBook);
    on('ps-detail-close', 'click', closeDetail);
    on('ps-detail-recompute', 'click', recompute);
    on('ps-detail-remove', 'click', remove);
    on('ps-f-country', 'change', applyCountryMode);
    for (const el of document.querySelectorAll('.parta-sovereign [data-writes]')) el.hidden = preview();
    await loadCountries();
    await loadYears();
    await load();
  }

  function refresh() {
    return load();
  }

  return { init, refresh, load, collect, prune };
})();
