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
  /* The class in focus, and each recorded class's own position as read for
     the improvement plan — the focus panel reads the same answer rather than
     asking again. */
  let focus = null;
  const positions = new Map();
  /* The disclosure's own lineage for this year — document identity, factor
     sets, assurance — read once on demand and dropped on every reload, so a
     drawer never shows the lineage of a book that has since changed. */
  let lineage = null;
  /* The baselines in force, as the registry answered them, kept for the drawer. */
  let baselinesInForce = null;

  const SHORT = {
    'business-loans-unlisted-equity': 'Business loans', 'listed-equity-corporate-bonds': 'Listed equity & bonds',
    'project-finance': 'Project finance', 'commercial-real-estate': 'Commercial real estate', 'mortgages': 'Mortgages',
    'motor-vehicle-loans': 'Motor vehicles', 'sovereign-debt': 'Sovereign debt',
  };
  const short = c => SHORT[c.assetClass] || c.label;
  const CLASS_COLOR = k => `var(--cls-${k}, var(--p-accent, #0a7a4c))`;
  const DQ_COLOR = score => `var(--dq${Math.round(score)}, #999)`;
  /* Absence is checked before the number is: Number(null) is 0. */
  const val = v => (v === null || v === undefined || v === '' ? null : Number(v));

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
    lineage = null;
    show('bk-behind', false);
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

    const ap = p.approval || {};
    say('bk-approved', val(ap.total) ? `${fmt(ap.approved, 0)} of ${fmt(ap.total, 0)}` : '—');
    say('bk-approved-unit', val(ap.total)
      ? `exposures approved${val(ap.underReview) ? ` · ${fmt(ap.underReview, 0)} under review` : ''} — frozen until reopened with a reason`
      : 'no exposure in a register class yet');

    renderClasses(p);
    renderChips(p);
    renderCharts(p);
    renderFocus(p);
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
      return `<button type="button" class="bank-tile${focus && focus !== c.assetClass ? ' is-dim' : ''}" data-class="${esc(c.assetClass)}" style="--swatch:${CLASS_COLOR(c.assetClass)}">
        <div class="bank-tile-head"><span class="bank-tile-title">${esc(c.label)}</span><span class="bank-tile-section">${esc(c.section)}</span></div>
        <span class="bank-tile-value">${fmt(c.headline && c.headline.value, 2)} <span class="bank-figure-unit">tCO₂e</span></span>
        <div class="bank-tile-row"><span>Data quality</span><b>${dqBadge(dq.score)}</b></div>
        <div class="bank-tile-row"><span>Exposures</span><b>${fmt(c.exposures, 0)}</b></div>
        <div class="bank-tile-row"><span>Outstanding</span><b>${esc(c.currency || '')} ${fmt(c.outstanding, 0)}</b></div>
        <div class="bank-tile-row"><span>Scope 3, apart</span><b>${c.scope3 && c.scope3.value !== null && c.scope3.value !== undefined ? fmt(c.scope3.value, 2) : '—'}</b></div>
        <div class="bank-tile-row"><span>Coverage</span><b>${c.coveragePct === null || c.coveragePct === undefined ? '—' : `${Number(c.coveragePct).toFixed(2)}%`}</b></div>
        <div class="bank-tile-row"><span>Approved</span><b>${c.approval && val(c.approval.total) ? `${fmt(c.approval.approved, 0)} of ${fmt(c.approval.total, 0)}` : '—'}</b></div>
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
    positions.clear();
    await Promise.all(recorded.map(async c => {
      try { positions.set(c.assetClass, await partA(`/position/${encodeURIComponent(p.reportingYear)}?assetClass=${encodeURIComponent(c.assetClass)}`)); }
      catch (_) { /* that class's plan is left out, and the focus panel says so */ }
    }));
    renderFocus(p);
    const rows = [];
    for (const c of recorded) {
      const pos = positions.get(c.assetClass);
      if (!pos) continue;
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

  // ── the class in focus ─────────────────────────────────────

  function renderChips(p) {
    const rec = (p.classes || []).filter(c => c.status === 'recorded');
    setHtml('bk-chips', rec.length
      ? rec.map(c => `<button type="button" class="bank-chip${focus === c.assetClass ? ' is-on' : ''}" data-class="${esc(c.assetClass)}"><i style="background:${CLASS_COLOR(c.assetClass)}"></i>${esc(short(c))}</button>`).join('')
        + `<button type="button" class="bank-chip${focus ? '' : ' is-on'}" data-class="">All classes</button>`
      : '<span class="partc-hint">No class recorded yet.</span>');
    for (const el of document.querySelectorAll('#bk-chips .bank-chip')) {
      el.addEventListener('click', () => setFocus(el.getAttribute('data-class') || null));
    }
  }

  function setFocus(assetClass) {
    focus = focus === assetClass ? null : assetClass;
    if (!position) return;
    renderChips(position); renderClasses(position); renderCharts(position); renderFocus(position);
  }

  /* The class's own figures, every one read off the consolidated row or its
     own position; the panel opens the book at that class. */
  function renderFocus(p) {
    const el = $('bk-focus');
    if (!el) return;
    const c = (p.classes || []).find(x => x.assetClass === focus && x.status === 'recorded');
    if (!c) { el.hidden = true; setHtml('bk-focus', ''); return; }
    const pos = positions.get(c.assetClass);
    const plan = pos ? (pos.improvementPlan || {}) : {};
    const lines = pos && pos.total ? (pos.total.lines || {}) : {};
    const line = (k, label) => (lines[k] && val(lines[k].value) !== null
      ? `<div class="bank-tile-row"><span>${esc(label)}</span><b>${fmt(lines[k].value, 2)} tCO₂e</b></div>` : '');
    const step = (plan.steps || [])[0];
    const dq = c.dataQuality || {};
    setHtml('bk-focus', `
      <div class="bank-focus-head"><i style="background:${CLASS_COLOR(c.assetClass)}"></i>
        <div><b>${esc(c.label)}</b> <span class="partc-hint">${esc(c.section)}${dq.table ? ` · ${esc(dq.table)}` : ''}</span></div>
        <button type="button" class="btn btn-primary bank-focus-open">Open in the book</button>
        <button type="button" class="bank-behind-btn bank-focus-behind">Behind this class</button></div>
      <div class="bank-focus-grid">
        <div><span class="bank-figure-label">${esc(c.headline && c.headline.label ? c.headline.label : 'Headline')}</span><span class="bank-tile-value">${fmt(c.headline && c.headline.value, 2)} <span class="bank-figure-unit">tCO₂e</span></span></div>
        <div><span class="bank-figure-label">Data quality</span><span class="bank-tile-value">${dqBadge(dq.score)}</span><span class="partc-hint">weighted by outstanding amount</span></div>
        <div><span class="bank-figure-label">Exposures</span><span class="bank-tile-value">${fmt(c.exposures, 0)}</span><span class="partc-hint">${esc(c.currency || '')} ${fmt(c.outstanding, 0)} outstanding</span></div>
        <div><span class="bank-figure-label">Coverage</span><span class="bank-tile-value">${c.coveragePct === null || c.coveragePct === undefined ? '—' : `${Number(c.coveragePct).toFixed(2)}%`}</span><span class="partc-hint">of the stated book</span></div>
      </div>
      ${pos ? `<div class="bank-focus-lines">${line('scope1', 'Scope 1')}${line('scope2', 'Scope 2')}${line('scope3', 'Scope 3 — apart')}${line('removals', 'Removals — apart')}</div>` : ''}
      ${step ? `<p class="partc-hint">Largest step: Option ${esc(step.option)} → score ${esc(step.ifTheseReachedScore)} on ${step.exposures} exposure(s); score ${step.scenarioScore === null ? '—' : Number(step.scenarioScore).toFixed(2)} <span class="partc-hint">scenario</span></p>` : ''}
    `);
    el.hidden = false;
    const open = el.querySelector('.bank-focus-open');
    if (open) open.addEventListener('click', () => openClass(c.assetClass));
    const behind = el.querySelector('.bank-focus-behind');
    if (behind) behind.addEventListener('click', () => openBehind('class', c.assetClass));
  }

  // ── the charts ─────────────────────────────────────────────

  /* Every bar is a figure the consolidated route returned for that class;
     the chart module scales it to a width and nothing else. Scope 3 is drawn
     as a bar of its own, in grey, beneath the class it belongs to. */
  function renderCharts(p) {
    if (typeof Charts === 'undefined') return;
    const rec = (p.classes || []).filter(c => c.status === 'recorded');
    const dim = c => Boolean(focus && focus !== c.assetClass);
    if (!rec.length) {
      for (const id of ['bk-chart-emissions', 'bk-chart-dq', 'bk-chart-outstanding', 'bk-chart-intensity']) setHtml(id, '<p class="partc-hint">No class recorded yet.</p>');
      setHtml('bk-ring-coverage', '');
      setHtml('bk-ring-approval', '');
      return;
    }

    const emissions = [];
    for (const c of rec) {
      const split = c.headline && c.headline.label === 'Financed scope 1 and 2';
      emissions.push({
        key: c.assetClass, label: short(c), value: val(c.headline && c.headline.value), color: CLASS_COLOR(c.assetClass), dim: dim(c),
        segments: split ? [
          { label: 'Scope 1', value: val(c.scope1 && c.scope1.value), color: CLASS_COLOR(c.assetClass) },
          { label: 'Scope 2', value: val(c.scope2 && c.scope2.value), color: `color-mix(in srgb, ${CLASS_COLOR(c.assetClass)} 55%, white)` },
        ] : [],
      });
      emissions.push({ key: c.assetClass, label: `${short(c)} — scope 3, apart`, value: val(c.scope3 && c.scope3.value), color: 'var(--cls-scope3, #a3a3a3)', dim: dim(c) });
    }
    setHtml('bk-chart-emissions', Charts.hbars(emissions, { label: 'Financed emissions by asset class, tCO2e, scope 3 apart', decimals: 0 })
      + Charts.legend([{ label: 'Scope 1', color: 'var(--p-label, #1c1c1e)' }, { label: 'Scope 2 (lighter)', color: 'color-mix(in srgb, var(--p-label, #1c1c1e) 45%, white)' }, { label: 'Scope 3 — apart', color: 'var(--cls-scope3, #a3a3a3)' }]));

    const dq = rec.map(c => {
      const dist = (c.optionDistribution || []).filter(o => val(o.shareOfBook) !== null && val(o.score) !== null)
        .sort((a, b) => a.score - b.score)
        .map(o => ({ label: `Option ${o.option} · score ${o.score} · ${o.exposures} exposure(s)`, share: Number(o.shareOfBook), color: DQ_COLOR(o.score) }));
      const one = c.dataQuality && val(c.dataQuality.score) !== null ? c.dataQuality.score : null;
      const segments = dist.length ? dist : (one !== null ? [{ label: `Score ${one} — ${c.dataQuality.table || 'one score for the class'}`, share: 1, color: DQ_COLOR(one) }] : []);
      return { key: c.assetClass, label: short(c), segments, dim: dim(c) };
    });
    setHtml('bk-chart-dq', Charts.shares(dq, { label: 'Share of outstanding at each PCAF data-quality score, by asset class' })
      + Charts.legend([1, 2, 3, 4, 5].map(s => ({ label: `Score ${s}${s === 1 ? ' — highest quality' : s === 5 ? ' — lowest' : ''}`, color: DQ_COLOR(s) }))));

    setHtml('bk-chart-outstanding', Charts.hbars(rec.map(c => ({
      key: c.assetClass, label: `${short(c)}${c.currency ? ` (${c.currency})` : ''}`, value: val(c.outstanding), color: CLASS_COLOR(c.assetClass), dim: dim(c),
    })), { label: 'Assessed outstanding by asset class', decimals: 0 }));
    const cov = p.coverage || {};
    setHtml('bk-ring-coverage', Charts.ring(val(cov.sharePct), { label: 'Coverage of the book', color: 'var(--p-accent, #0a7a4c)' })
      + `<div class="bank-ring-caption">${val(cov.sharePct) === null ? esc(cov.remedy || 'book total not stated') : 'of total loans and investments'}</div>`);
    const ap = p.approval || {};
    setHtml('bk-ring-approval', Charts.ring(val(ap.approvedPct), { label: 'Exposures approved', color: 'var(--approved, #1d7a3a)' })
      + `<div class="bank-ring-caption">${val(ap.total) ? 'of exposures approved' : 'no exposure to approve'}</div>`);

    setHtml('bk-chart-intensity', Charts.hbars(rec.map(c => ({
      key: c.assetClass, label: short(c), value: val(c.intensity && c.intensity.value), color: CLASS_COLOR(c.assetClass), dim: dim(c),
    })), { label: 'Economic intensity by asset class, tCO2e per million outstanding', decimals: 2 }));
  }

  // ── what stands behind a figure ─────────────────────────────

  async function readLineage() {
    if (lineage) return lineage;
    const { report } = await partA(`/financed-emissions/${encodeURIComponent(year)}/disclosure?format=json`);
    lineage = report;
    return lineage;
  }

  /* Opens the lineage behind one figure: the drawer prints what the
     disclosure prints, read from the document's own facts. */
  async function openBehind(kind, key) {
    const el = $('bk-behind');
    if (!el || !position) return;
    setHtml('bk-behind-body', '<p class="partc-hint">Reading the document lineage…</p>');
    el.hidden = false;
    let rep = null;
    try { rep = await readLineage(); } catch (err) { rep = { error: err.message }; }
    renderBehind(kind, key, rep);
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const kv = pairs => `<dl class="bk-kv">${pairs.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const releaseRow = r => (r ? kv([
    ['Set', esc(r.name || r.table || '')], ['Version', esc(r.version || '')], ['Effective from', esc(r.effectiveFrom || '')],
    ['Status', esc(r.status || '')], ['SHA-256', r.checksum ? `<code>${esc(r.checksum)}</code>` : null],
  ]) : '');

  function renderBehind(kind, key, rep) {
    const p = position;
    const t = p.totals || {};
    const cover = rep && rep.cover ? rep.cover : null;
    const facts = rep && rep.facts ? rep.facts : null;
    const recorded = (p.classes || []).filter(c => c.status === 'recorded');
    const ap = p.approval || {};
    const parts = [];
    const TITLE = {
      headline: 'Behind the headline — financed scope 1 and 2', s3: 'Behind the scope 3 line', coverage: 'Behind the coverage figure',
      intensity: 'Behind the economic intensity', approved: 'Behind the approval count', class: 'Behind this class',
    };
    say('bk-behind-title', TITLE[kind] || 'What stands behind this figure');

    if (kind === 'headline') {
      parts.push(`<h5>What the figure is</h5>${kv([['Category', esc(t.category || '')], ['Boundaries summed', esc(t.headline && t.headline.basis || '')], ['Rule', esc(t.headline && t.headline.note || '')]])}`);
    }
    if (kind === 's3') {
      parts.push(`<h5>What the figure is</h5>${kv([['Rule', esc(t.scope3 && t.scope3.note || '')], ['Per class', recorded.map(c => `${esc(short(c))}: ${esc(c.scope3 && c.scope3.note || '')}`).join('<br>')]])}`);
    }
    if (kind === 'coverage') {
      const cov = p.coverage || {};
      parts.push(`<h5>What the figure is</h5>${kv([
        ['Assessed outstanding', cov.assessedOutstanding !== undefined && cov.assessedOutstanding !== null ? `${esc(cov.currency || '')} ${fmt(cov.assessedOutstanding, 0)}` : null],
        ['Total loans and investments', cov.totalLoansAndInvestments !== undefined && cov.totalLoansAndInvestments !== null ? `${esc(cov.currency || '')} ${fmt(cov.totalLoansAndInvestments, 0)}${cov.statedBy ? ` — stated by ${esc(cov.statedBy)}` : ''}` : null],
        ['Share', cov.sharePct !== undefined && cov.sharePct !== null ? `${Number(cov.sharePct).toFixed(2)}%` : esc(cov.remedy || 'not stated')],
        ['Clause', 'Disclosure Checklist Part A, p.124'], ['Note', esc(cov.note || '')],
        ['Excluded from the share', recorded.filter(c => !c.combinable).map(c => `${esc(short(c))} (${esc(c.currency || '')})`).join(', ') || null],
      ])}`);
    }
    if (kind === 'intensity') {
      const i = p.intensity || {};
      parts.push(`<h5>What the figure is</h5>${kv([['Value', i.value === null || i.value === undefined ? '—' : `${fmt(i.value, 2)} ${esc(i.unit || '')}`], ['Basis', esc(i.basis || '')], ['Per class', recorded.map(c => `${esc(short(c))}: ${c.intensity && c.intensity.value !== null && c.intensity.value !== undefined ? fmt(c.intensity.value, 2) : '—'} ${esc(c.intensity && c.intensity.unit || '')}`).join('<br>')]])}`);
    }
    if (kind === 'approved' || kind === 'headline') {
      parts.push(`<h5>Who stands behind the figures</h5>${kv([
        ['Approved', val(ap.total) ? `${fmt(ap.approved, 0)} of ${fmt(ap.total, 0)} exposure(s)` : 'no exposure in a register class'],
        ['Under review', val(ap.underReview) ? fmt(ap.underReview, 0) : null], ['Recorded, not yet reviewed', val(ap.recorded) ? fmt(ap.recorded, 0) : null],
        ['Rule', esc(ap.note || '')], ['Authority', 'Approving needs the lock scope — a different authority from recording, as a Part C lock is'],
      ])}`);
    }
    if (kind === 'class' && key) {
      const c = recorded.find(x => x.assetClass === key);
      if (c) {
        const dq = c.dataQuality || {};
        const idx = recorded.indexOf(c);
        const release = facts && Array.isArray(facts.releases) ? facts.releases[idx] : null;
        parts.push(`<h5>${esc(c.label)} — ${esc(c.section)}</h5>${kv([
          ['Headline', `${fmt(c.headline && c.headline.value, 2)} tCO₂e — ${esc(c.headline && c.headline.label || '')}`], ['Boundary', esc(c.headline && c.headline.basis || '')],
          ['Data quality', `${dqBadge(dq.score)} on ${esc(dq.table || 'its own table')}, weighted by ${esc(dq.weighting || 'outstanding amount')}`],
          ['Options used', (c.optionDistribution || []).map(o => `Option ${esc(o.option)} → score ${esc(o.score)} on ${o.exposures} exposure(s)`).join('<br>') || null],
          ['Exposures', `${fmt(c.exposures, 0)} · ${esc(c.currency || '')} ${fmt(c.outstanding, 0)} outstanding`],
          ['Approved', c.approval && val(c.approval.total) ? `${fmt(c.approval.approved, 0)} of ${fmt(c.approval.total, 0)}` : 'no review lifecycle on this register yet'],
        ])}${release ? `<h5>The factor set this class rests on</h5>${releaseRow(release)}` : ''}`);
      }
    }
    if (kind !== 'class' && facts && Array.isArray(facts.releases) && facts.releases.length) {
      parts.push(`<h5>The factor sets the figures rest on</h5>${facts.releases.map(releaseRow).join('')}`);
    }
    if (baselinesInForce) {
      const rows = Object.entries(baselinesInForce).filter(([, r]) => r && r.resolved);
      parts.push(`<h5>The baselines in force</h5>${kv(rows.map(([k, r]) => [r.label || k, `${esc(r.scope === 'seed' ? 'shipped, provisional' : `${r.scope || ''} baseline${r.version ? ` v${r.version}` : ''}`)}${r.provisional && r.scope !== 'seed' ? ' — provisional' : ''}`]))}`);
    }
    if (cover) {
      parts.push(`<h5>The document this lineage prints in</h5>${kv([
        ['Reference', cover.reportId ? `<code>${esc(cover.reportId)}</code>` : null], ['Standard', esc(cover.standard || '')],
        ['Identity', Array.isArray(cover.identity) ? cover.identity.map(esc).join('<br>') : null],
        ['Assurance', `${esc(cover.assuranceLabel || cover.assuranceMode || '')}${cover.assuranceStatement ? ` — ${esc(cover.assuranceStatement)}` : ''}`],
        ['Conformance', facts && facts.conformanceStatement ? esc(facts.conformanceStatement) : null],
      ])}`);
    } else if (rep && rep.error) {
      parts.push(`<p class="partc-hint">The document could not be read: ${esc(rep.error)}</p>`);
    }
    setHtml('bk-behind-body', parts.join('') || '<p class="partc-hint">Nothing to show for this figure.</p>');
  }

  /* The baselines in force for this bank, as the registry answers them. */
  async function renderBaselines() {
    const { effective } = await call('/v1/baselines/effective');
    baselinesInForce = effective || null;
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
    on('bk-docx', 'click', () => download(`/financed-emissions/${encodeURIComponent(year)}/disclosure?format=docx`,
      `part-a-financed-emissions-fy${year}.docx`, 'disclosure (Word)'));
    on('bk-csv', 'click', () => download(`/financed-emissions/${encodeURIComponent(year)}/register.csv`,
      `part-a-exposure-register-fy${year}.csv`, 'exposure register (CSV)'));
    on('bk-starter', 'click', loadStarter);
    on('bk-behind-close', 'click', () => show('bk-behind', false));
    for (const b of document.querySelectorAll('.bank [data-behind]')) b.addEventListener('click', () => openBehind(b.getAttribute('data-behind')));
    for (const el of document.querySelectorAll('.bank [data-writes]')) el.hidden = preview() || el.hidden;
    await loadYears();
    await load();
  }

  function refresh() {
    return load();
  }

  return { init, refresh, load };
})();
