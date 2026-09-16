/* ============================================================
   CarbonIQ — the Bank Overview
   ============================================================

   The bank's own landing: its whole PCAF Part A position for a reporting
   year, class by class, what to fix first, the baselines in force and what
   the disclosure still needs. Every figure is one a route returned — the
   consolidated position, each class's own position, the baseline registry.
   The page holds no arithmetic: no sum, no share, no average.

   Two rules the render carries. A score is a category on a scale where 1 is
   best, never a fraction of five. Scope 3 is its own line and is never added
   to scope 1 and 2.
   ============================================================ */

const BankPage = (() => {

  const $ = id => document.getElementById(id);
  const fmt = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—'
    : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const show = (id, yes) => { const el = $(id); if (el) el.hidden = !yes; };

  const dqBadge = (v, dp = 2) => v === null || v === undefined
    ? '<span class="dqb dqb-na">no score</span>'
    : `<span class="dqb dqb-${Math.round(v)}"><b>${Number(v).toFixed(dp)}</b></span>`;

  const preview = () => {
    try { return typeof Auth !== 'undefined' && typeof Auth.isPreview === 'function' && Boolean(Auth.isPreview()); }
    catch (_) { return false; }
  };

  let year = null;
  let position = null;

  async function call(path, opts = {}) {
    const res = await window.CARBONIQ_fetch(path, opts);
    let data = {};
    try { data = await res.json(); } catch (_) { /* empty */ }
    if (!res.ok) {
      const err = new Error([data.message, data.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }
  const partA = (path, opts) => call('/v1/pcaf/part-a' + path, opts);

  // ── years ──────────────────────────────────────────────────

  async function loadYears() {
    let a = [], b = [];
    try { ({ years: a } = await partA('/years')); } catch (_) { a = []; }
    try { ({ years: b } = await partA('/sovereign/years')); } catch (_) { b = []; }
    const list = [...new Set([...a, ...b].map(y => String(y.reportingYear)))].sort();
    const chosen = $('bk-year') ? $('bk-year').value : '';
    if (!list.length) list.push(String(new Date().getFullYear()));
    setHtml('bk-year', list.map(y => `<option value="${esc(y)}">${esc(y)}</option>`).join(''));
    $('bk-year').value = list.includes(chosen) ? chosen : list[list.length - 1];
    year = $('bk-year').value;
  }

  // ── the position ───────────────────────────────────────────

  async function load() {
    year = $('bk-year').value;
    say('bk-status', 'Reading the book…');
    try {
      position = await partA(`/financed-emissions/${encodeURIComponent(year)}`);
    } catch (err) {
      show('bk-body', false); show('bk-figures', false);
      say('bk-status', err.message);
      return;
    }
    render(position);
    show('bk-figures', true);
    show('bk-body', true);
    const recorded = position.classes.filter(c => c.status === 'recorded');
    say('bk-status', recorded.length
      ? `${position.exposures} exposure(s) across ${recorded.length} asset class(es) in FY${position.reportingYear}.`
      : `No asset class holds exposures for FY${position.reportingYear} yet.${preview() ? '' : ' Load the starter book, or record exposures in the lending book.'}`);
    /* The two panels read other routes; each renders on its own so a slow
       one never holds the position back. */
    renderPlan(position).catch(err => setHtml('bk-plan', `<p class="partc-hint">${esc(err.message)}</p>`));
    renderBaselines().catch(err => setHtml('bk-baselines', `<p class="partc-hint">${esc(err.message)}</p>`));
  }

  function render(p) {
    const e = p.entity || {};
    say('bk-entity', e.reportingEntity || 'Reporting entity not stated');
    say('bk-subtitle', `FY${p.reportingYear}${p.currency ? ` · ${p.currency}` : ''} · ${p.exposures} exposure(s) · consolidation: ${e.consolidationApproach ? String(e.consolidationApproach).replace(/_/g, ' ') : 'not stated'} · fiscal year-end ${e.fiscalYearEnd || 'not stated'}`);

    const t = p.totals || {};
    say('bk-headline', t.headline && t.headline.value !== null ? fmt(t.headline.value, 2) : '—');
    say('bk-headline-basis', t.headline ? t.headline.basis : '');
    say('bk-s3', t.scope3 && t.scope3.value !== null ? fmt(t.scope3.value, 2) : '—');

    const c = p.coverage || {};
    if (c.sharePct === null || c.sharePct === undefined) {
      say('bk-coverage', '—');
      say('bk-coverage-unit', c.remedy || 'book total not stated');
      if ($('bk-coverage-bar')) $('bk-coverage-bar').style.width = '0%';
    } else {
      say('bk-coverage', `${Number(c.sharePct).toFixed(2)}%`);
      say('bk-coverage-unit', `of ${esc(c.currency)} ${fmt(c.totalLoansAndInvestments, 0)} total loans and investments — Disclosure Checklist Part A, p.124`);
      if ($('bk-coverage-bar')) $('bk-coverage-bar').style.width = `${Math.min(100, Math.max(0, Number(c.sharePct)))}%`;
    }

    const i = p.intensity || {};
    say('bk-intensity', i.value === null || i.value === undefined ? '—' : fmt(i.value, 2));
    say('bk-intensity-unit', i.unit ? i.unit.replace('tCO2e', 'tCO₂e') : (i.basis || 'tCO₂e per million'));

    const items = p.outstandingItems || [];
    say('bk-ready', items.length === 0 ? 'Yes' : String(items.length));
    say('bk-ready-unit', items.length === 0 ? 'every Chapter 6 item the bank must state is on the record' : 'items Chapter 6 still asks the bank for');

    renderClasses(p);
    renderReadiness(p);
  }

  const STATE = {
    'not-recorded': 'Not recorded this year', 'engine-only': 'Engine built, no register', 'not-built': 'Not built',
  };

  function renderClasses(p) {
    const rows = p.classes || [];
    setHtml('bk-classes', rows.map(c => {
      if (c.status !== 'recorded') {
        return `<div class="bank-tile bank-tile-absent">
          <div class="bank-tile-head"><span class="bank-tile-title">${esc(c.label)}</span><span class="bank-tile-section">${esc(c.section)}</span></div>
          <span class="partc-hint">${esc(STATE[c.status] || c.status)}${c.reasonStatedBy === 'entity' ? ' — stated by the bank' : ''}</span>
          <span class="partc-hint">${esc(c.reason || '')}</span>
        </div>`;
      }
      const dq = c.dataQuality || {};
      return `<button type="button" class="bank-tile" data-class="${esc(c.assetClass)}">
        <div class="bank-tile-head"><span class="bank-tile-title">${esc(c.label)}</span><span class="bank-tile-section">${esc(c.section)}</span></div>
        <span class="bank-tile-value">${fmt(c.headline && c.headline.value, 2)} <span class="bank-figure-unit">tCO₂e</span></span>
        <div class="bank-tile-row"><span>Data quality</span><b>${dqBadge(dq.score)}</b></div>
        <div class="bank-tile-row"><span>Exposures</span><b>${fmt(c.exposures, 0)}</b></div>
        <div class="bank-tile-row"><span>Outstanding</span><b>${esc(c.currency || '')} ${fmt(c.outstanding, 0)}</b></div>
        <div class="bank-tile-row"><span>Scope 3, apart</span><b>${c.scope3 && c.scope3.value !== null && c.scope3.value !== undefined ? fmt(c.scope3.value, 2) : '—'}</b></div>
        <div class="bank-tile-row"><span>Coverage</span><b>${c.coveragePct === null || c.coveragePct === undefined ? '—' : `${Number(c.coveragePct).toFixed(2)}%`}</b></div>
        <span class="partc-hint">${esc(dq.table || '')}</span>
      </button>`;
    }).join(''));
    for (const el of document.querySelectorAll('#bk-classes .bank-tile[data-class]')) {
      el.addEventListener('click', () => openClass(el.getAttribute('data-class')));
    }
  }

  /* Opens the book the class is recorded in, at that class. The lending book
     reads the choice before its first request. */
  function openClass(assetClass) {
    const go = typeof window !== 'undefined' && typeof window.CARBONIQ_navigateTo === 'function' ? window.CARBONIQ_navigateTo : null;
    if (assetClass === 'sovereign-debt') { if (go) go('parta-sovereign'); return; }
    try { localStorage.setItem('carboniq.parta.class', assetClass); } catch (_) { /* a courtesy */ }
    if (go) go('parta-register');
  }

  /* Per class, the one step worth the most — the first row of each class's
     own improvement plan, read from its own position. */
  async function renderPlan(p) {
    const recorded = (p.classes || []).filter(c => c.status === 'recorded' && c.assetClass !== 'sovereign-debt');
    if (!recorded.length) { setHtml('bk-plan', '<p class="partc-hint">No class recorded yet.</p>'); return; }
    const rows = [];
    for (const c of recorded) {
      let pos;
      try { pos = await partA(`/position/${encodeURIComponent(p.reportingYear)}?assetClass=${encodeURIComponent(c.assetClass)}`); }
      catch (_) { continue; }
      const plan = pos.improvementPlan || {};
      const step = (plan.steps || [])[0];
      const remedy = (plan.byRemedy || [])[0];
      rows.push({ c, plan, step, remedy });
    }
    setHtml('bk-plan', `<div class="bk-scroll"><table class="partc-table">
      <thead><tr><th>Class</th><th>Score now</th><th>Largest step</th><th>Scenario score</th><th>Most exposures need</th></tr></thead>
      <tbody>${rows.map(({ c, plan, step, remedy }) => `<tr>
        <td>${esc(c.label)}<br><span class="partc-hint">${esc(c.section)}</span></td>
        <td class="num">${dqBadge(plan.reportedScore ? plan.reportedScore.score : null)}</td>
        <td>${step ? `Option ${esc(step.option)} → score ${esc(step.ifTheseReachedScore)} on ${step.exposures} exposure(s), ${esc(step.shareOfBook === null ? '—' : (step.shareOfBook * 100).toFixed(1) + '%')} of the class` : 'At or above the target'}</td>
        <td class="num">${step && step.scenarioScore !== null ? `${Number(step.scenarioScore).toFixed(2)} <span class="partc-hint">scenario</span>` : '—'}</td>
        <td>${remedy ? `${esc(remedy.remedy)} <span class="partc-hint">(${remedy.exposures})</span>` : '<span class="partc-hint">No findings</span>'}</td>
      </tr>`).join('')}</tbody></table></div>
      <p class="partc-hint">Target score 2 on every class; every projected score is a scenario run through the weighting the disclosure uses, never the reported score.</p>`);
  }

  /* The baselines in force for this bank, as the registry answers them. */
  async function renderBaselines() {
    const { effective } = await call('/v1/baselines/effective');
    const rows = Object.entries(effective || {}).filter(([, r]) => r && r.resolved);
    const absent = Object.entries(effective || {}).filter(([, r]) => r && !r.resolved);
    setHtml('bk-baselines', `<dl class="bk-kv">${rows.map(([key, r]) => `
      <dt>${esc(r.label || key)}</dt>
      <dd>${esc(summary(r))}<span class="bk-pill${r.scope && r.scope !== 'seed' ? ' bk-pill-released' : ''}">${esc(r.scope === 'seed' ? 'shipped, provisional' : `${r.scope || ''} baseline${r.version ? ` v${r.version}` : ''}`)}</span></dd>`).join('')}</dl>
      ${absent.length ? `<p class="partc-hint">Absent, with what each needs: ${absent.map(([key, r]) => `${esc(r.label || key)}${r.needs ? ` — ${esc(r.needs)}` : ''}`).join('; ')}.</p>` : ''}
      <p class="partc-hint">Each figure resolves from the master baseline table — global, country, then this bank's own — and a released baseline replaces the shipped set entirely.</p>`);
  }

  function summary(r) {
    const v = r.values || {};
    if (v.value !== undefined) return `${v.value} ${r.unit || ''}`.trim();
    const keys = Object.keys(v).filter(k => Number.isFinite(v[k]));
    if (!keys.length) return r.unit || '';
    return `${keys.slice(0, 4).map(k => `${k.replace(/_/g, ' ')} ${v[k]}`).join(' · ')}${keys.length > 4 ? ` · +${keys.length - 4} more` : ''} ${r.unit ? `(${r.unit})` : ''}`.trim();
  }

  function renderReadiness(p) {
    const items = p.outstandingItems || [];
    setHtml('bk-readiness', items.length === 0
      ? '<p class="partc-hint">Every Chapter 6 item the bank must state is on the record.</p>'
      : `<div class="bk-scroll"><table class="partc-table">
          <thead><tr><th>What</th><th>Why</th><th>Clause</th></tr></thead>
          <tbody>${items.map(x => `<tr><td>${esc(x.what)}</td><td class="partc-hint">${esc(x.why || '')}</td><td>${esc(x.clause || '')}</td></tr>`).join('')}</tbody></table></div>`);
  }

  // ── actions ────────────────────────────────────────────────

  async function download(path, filename, label) {
    say('bk-status', `Preparing the ${label}…`);
    try {
      const res = await window.CARBONIQ_fetch('/v1/pcaf/part-a' + path);
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
      say('bk-status', `${label} downloaded.`);
    } catch (err) { say('bk-status', err.message); }
  }

  async function loadStarter() {
    const nameEl = $('bk-starter-name');
    const name = nameEl ? nameEl.value.trim() : '';
    const body = name ? { reportingEntity: name } : {};
    if (!window.confirm('Load the illustrative starter book into this organisation? Every figure is a placeholder to edit.')) return;
    say('bk-status', 'Loading the starter book…');
    try {
      const r = await partA('/starter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      document.dispatchEvent(new CustomEvent('carboniq:entity'));
      say('bk-status', `Starter book loaded: ${r.installed.exposures} exposures and ${r.installed.sovereign} sovereign holdings across ${r.installed.classes} classes for FY${r.reportingYear}.`);
      await loadYears();
      if ($('bk-year')) $('bk-year').value = String(r.reportingYear);
      await load();
    } catch (err) { say('bk-status', err.message); }
  }

  // ── lifecycle ──────────────────────────────────────────────

  /* Everything that changes what the first request says — the year, the
     preview state, the listeners — is wired before load() is called. */
  async function init() {
    on('bk-refresh', 'click', load);
    on('bk-year', 'change', load);
    on('bk-pdf', 'click', () => download(`/financed-emissions/${encodeURIComponent(year)}/disclosure?format=pdf`,
      `part-a-financed-emissions-fy${year}.pdf`, 'disclosure (PDF)'));
    on('bk-starter', 'click', loadStarter);
    for (const el of document.querySelectorAll('.bank [data-writes]')) el.hidden = preview() || el.hidden;
    await loadYears();
    await load();
  }

  function refresh() {
    return load();
  }

  return { init, refresh, load };
})();
