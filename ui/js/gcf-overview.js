/* ============================================================
   CarbonIQ — the GCF Overview
   ============================================================
   The accredited entity's own landing over its Green Climate Fund
   candidate pipeline, in the order a chief executive asks: where we stand
   (the money, the gate, the cycle), what is blocking and who holds the
   key, who has signed, the results on their separate boundaries, and the
   file the pipeline yields. The Pipeline tab is the working screen with
   every record on it; this is the one screen read in a meeting.

   Every figure here is one the portfolio route, the gap register or the
   report returned. The page draws and adds nothing: a count is a count the
   server made, a share is a share the server made, and a drawing is a
   value scaled to a width. The one hue per stream, per gate verdict, per
   owner and per assessment state is a token in the stylesheet, read here
   through var() and never chosen in the module.

   Everything that changes what the first request says — the listeners,
   the preview state — is wired before load() is called.
   ============================================================ */

'use strict';

const GCFOverviewPage = (() => {

  const $ = id => document.getElementById(id);
  const fmt = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—'
    : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, ccy) => (window.CARBONIQ_money ? window.CARBONIQ_money.moneyShort(n, ccy || 'USD') : `${ccy || 'USD'} ${fmt(n, 0)}`);
  const moneyLong = (n, ccy) => (window.CARBONIQ_money ? window.CARBONIQ_money.annotated(n, ccy || 'USD') : `${ccy || 'USD'} ${fmt(n, 0)}`);
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const show = (id, yes) => { const el = $(id); if (el) el.hidden = !yes; };
  const nav = page => { if (typeof window.CARBONIQ_navigateTo === 'function') window.CARBONIQ_navigateTo(page); };
  const remember = (key, value) => { try { localStorage.setItem(key, value); } catch (_) { /* a courtesy */ } };
  const day = s => (s ? String(s).slice(0, 10) : '—');
  /* Absence is checked before the number is: Number(null) is 0. */
  const val = v => (v === null || v === undefined || v === '' ? null : Number(v));

  const preview = () => {
    try { return typeof Auth !== 'undefined' && typeof Auth.isPreview === 'function' && Boolean(Auth.isPreview()); }
    catch (_) { return false; }
  };

  /* One hue per stream, gate verdict, owner, assessment state, money source
     and cycle stage — each a token in gcf-overview.css, defined for both
     themes and read here, never chosen here. */
  const STREAM_COLOR = s => `var(--go-${s}, var(--p-accent, #0a5c3a))`;
  const GATE_COLOR = g => `var(--go-gate-${g}, var(--p-label-3, #98a19c))`;
  const OWNER_COLOR = o => `var(--go-owner-${String(o).replace(/_/g, '-')}, var(--p-accent, #0a5c3a))`;
  const STATE_COLOR = s => `var(--go-state-${String(s).replace(/_/g, '-')}, var(--p-label-3, #98a19c))`;
  const CYCLE_COLOR = n => `var(--go-cycle-${n}, var(--p-accent, #0a5c3a))`;
  const MONEY_COLOR = k => `var(--go-money-${k}, var(--p-accent, #0a5c3a))`;
  const BEN_COLOR = k => `var(--go-ben-${k}, var(--p-accent, #0a5c3a))`;
  const APART = 'var(--go-apart, #a9ada6)';

  const GATE_WORD = { eligible: 'Eligible', flagged: 'Flagged', excluded: 'Excluded' };
  const GATE_MARK = { eligible: '✓', flagged: '!', excluded: '✕' };
  const STATE_WORD = { draft: 'Draft', under_review: 'Under review', validated: 'Validated' };

  let portfolio = null;
  let register = null;
  let report = null;
  let source = 'seed';
  let sample = true;
  let focus = null;
  /* The conformance matrix, read once on demand for the drawer and dropped
     on every reload. */
  let matrix = null;

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
  const gcf = (path, opts) => call('/v1/gcf' + path, opts);

  // ── load ───────────────────────────────────────────────────

  async function load() {
    matrix = null;
    show('go-behind', false);
    say('go-status', 'Reading the pipeline…');
    try {
      const [p, g, r] = await Promise.all([gcf('/portfolio'), gcf('/gaps'), gcf('/report')]);
      portfolio = p.portfolio; source = p.source; sample = Boolean(p.sample);
      register = g.register;
      report = r.report;
    } catch (err) {
      show('go-body', false); show('go-figures', false); show('go-sample', false);
      say('go-status', err.message);
      return;
    }
    render();
    show('go-figures', true);
    show('go-body', true);
    /* The illustrative set is shown until the organisation records a book;
       the offer to load one is never made to a preview visitor. */
    show('go-sample', sample);
    const starter = $('go-starter'); if (starter) starter.hidden = preview() || !sample;
    say('go-status', `${fmt(portfolio.count)} candidate(s) on the ${sample ? 'shipped illustrative pipeline' : 'recorded pipeline'} · ${register.totals.now} item(s) blocking now · ${portfolio.assessment.validated} assessment(s) signed.`);
    applyIntent();
  }

  /* The Walkthrough hands over what it wants this screen to show — a
     candidate in focus, or the lineage behind a figure — one key, read once
     the pipeline is on screen, then forgotten. */
  function applyIntent() {
    let intent = null;
    try { intent = localStorage.getItem('carboniq.gcf-overview.intent'); if (intent) localStorage.removeItem('carboniq.gcf-overview.intent'); } catch (_) { intent = null; }
    if (!intent) return;
    const [kind, key] = intent.split(':');
    const cue = id => { if (typeof window.CARBONIQ_cue === 'function') window.CARBONIQ_cue(id); };
    if (kind === 'focus' && key) {
      if (focus !== key) setFocus(key);
      const el = $('go-focus'); if (el && !el.hidden) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (kind === 'behind' && key) openBehind(key).catch(() => {});
    if (kind === 'file') { openBehind('file').catch(() => {}); cue('go-pdf'); }
  }

  // ── the hero ───────────────────────────────────────────────

  const placeholder = v => Boolean(v) && typeof v === 'object' && typeof v._status === 'string';
  const stated = v => (v === null || v === undefined || placeholder(v) ? null : v);

  function render() {
    const env = portfolio.envelope || {};
    say('go-entity', stated(report.basis.entity) || 'Reporting entity not stated');
    say('go-subtitle', `Direct Access Entity · Board decision ${env.decision || '—'} · ${env.sizeCategory || '—'} · environmental and social category ${env.essCategory || '—'} · ${fmt(portfolio.count)} candidate(s) · ${sample ? 'illustrative pipeline' : 'recorded pipeline'}`);
    renderFigures();
    renderChips();
    renderFocus();
    renderCharts();
    renderGapsByProject();
    renderUpcoming();
    renderS2();
    renderProjects();
    renderEntityGaps();
  }

  function renderFigures() {
    const charts = typeof Charts !== 'undefined';
    const m = portfolio.money || {};
    say('go-ask', money(m.gcfAsk, m.currency));
    say('go-ask-unit', `${m.currency || 'USD'}, at the ask recorded on each candidate`);
    const moneyRows = [
      { key: 'ask', label: 'GCF ask', value: val(m.gcfAsk), color: MONEY_COLOR('ask') },
      { key: 'dfcc', label: 'Entity commitment', value: val(m.dfcc), color: MONEY_COLOR('dfcc') },
      { key: 'other', label: 'Other sources', value: val(m.other), color: MONEY_COLOR('other') },
    ];
    setHtml('go-money-chart', charts ? Charts.hbars(moneyRows, { label: 'Pipeline financing by source', decimals: 0, compact: true, unit: m.currency || 'USD' }) : '');
    say('go-cost', money(m.totalCost, m.currency));
    say('go-cost-unit', val(m.mobilisation) === null ? 'across the pool — no ask recorded' : `total cost over the GCF ask: ${fmt(m.mobilisation, 2)}× — a ratio, not a threshold`);

    const g = portfolio.gate || {};
    say('go-gate', `${fmt(g.eligible)} eligible`);
    say('go-gate-unit', `${fmt(g.flagged)} flagged · ${fmt(g.excluded)} excluded — Board decision ${env().decision || 'B.36/10'}`);
    const gateRows = ['eligible', 'flagged', 'excluded'].map(k => ({ key: k, label: `${GATE_MARK[k]} ${GATE_WORD[k]}`, value: val(g[k]), color: GATE_COLOR(k) }));
    setHtml('go-gate-chart', charts ? Charts.hbars(gateRows, { label: 'Candidates by accreditation gate', decimals: 0, compact: true, unit: 'candidates' }) : '');

    const t = register.totals || {};
    say('go-blocking', fmt(t.now));
    say('go-blocking-unit', `${fmt(t.project)} on ${fmt(t.blocked)} of ${fmt(t.projects)} candidate(s) · ${fmt(t.entity)} on the entity’s own statements · ${fmt(t.next)} more at the next stage`);
    const owners = (register.byOwner || []).filter(o => val(o.now) !== null && o.now > 0).slice(0, 4);
    setHtml('go-blocking-owners', owners.map(o => `<span class="gov-chip-soft"><i style="background:${OWNER_COLOR(o.owner)}"></i>${esc(o.label)} · ${fmt(o.now)}</span>`).join(''));

    const a = portfolio.assessment || {};
    say('go-signed', `${fmt(a.validated)} of ${fmt(portfolio.count)}`);
    say('go-signed-unit', `validated by a named assessor · ${fmt(a.draft)} draft · ${fmt(a.underReview)} under review`);
    const stateRows = [
      { key: 'draft', label: 'Draft', value: val(a.draft), color: STATE_COLOR('draft') },
      { key: 'under_review', label: 'Under review', value: val(a.underReview), color: STATE_COLOR('under_review') },
      { key: 'validated', label: 'Validated', value: val(a.validated), color: STATE_COLOR('validated') },
    ];
    setHtml('go-signed-chart', charts ? Charts.hbars(stateRows, { label: 'Assessments by state', decimals: 0, compact: true, unit: 'candidates' }) : '');

    const r = portfolio.results || {};
    say('go-mitigation', fmt(r.mitigation && r.mitigation.lifetime_tCO2e));
    const cb = r.adaptationCoBenefit || {};
    say('go-cobenefit', val(cb.lifetime_tCO2e) === null ? 'Adaptation co-benefit apart: none recorded' : `Adaptation co-benefit, apart: ${fmt(cb.lifetime_tCO2e)} tCO₂e over ${fmt(cb.projects)} project(s) — never in the headline`);
  }
  const env = () => (portfolio && portfolio.envelope) || {};

  // ── candidate in focus ─────────────────────────────────────

  const rows = () => (portfolio && portfolio.rows) || [];
  const gapsOf = id => ((register && register.byProject) || []).find(p => p.id === id) || null;

  function renderChips() {
    setHtml('go-chips', rows().length
      ? rows().map(r => `<button type="button" class="gov-chip${focus === r.id ? ' is-on' : ''}" data-id="${esc(r.id)}"><i style="background:${STREAM_COLOR(r.stream)}"></i>${esc(r.code)}</button>`).join('')
        + `<button type="button" class="gov-chip${focus ? '' : ' is-on'}" data-id="">All candidates</button>`
      : '<span class="partc-hint">No candidate recorded yet.</span>');
    for (const el of document.querySelectorAll('#go-chips .gov-chip')) {
      el.addEventListener('click', () => setFocus(el.getAttribute('data-id') || null));
    }
  }

  function setFocus(id) {
    focus = focus === id ? null : id;
    if (!portfolio) return;
    renderChips(); renderFocus(); renderCharts(); renderGapsByProject(); renderProjects();
  }

  /* Every figure on the panel is the candidate's own row on the portfolio
     and its own entry on the register; the panel opens the Pipeline tab on
     that candidate. */
  function renderFocus() {
    const el = $('go-focus');
    if (!el) return;
    const r = rows().find(x => x.id === focus);
    if (!r) { el.hidden = true; setHtml('go-focus', ''); return; }
    const g = gapsOf(r.id) || { items: [], now: 0, next: 0 };
    const a = r.assessment || {};
    el.style.setProperty('--swatch', STREAM_COLOR(r.stream));
    setHtml('go-focus', `
      <div class="gov-focus-head"><i style="background:${STREAM_COLOR(r.stream)}"></i>
        <div><b>${esc(r.name)}</b> <span class="partc-hint">${esc(r.code)} · ${esc(r.stream)} · ${esc(r.resultsAreaLabel || r.resultsArea || '')}</span></div>
        <button type="button" class="btn btn-primary gov-focus-open">Open in the pipeline</button>
        <button type="button" class="btn btn-secondary gov-focus-report">Assessment report — PDF</button>
        <button type="button" class="btn btn-secondary gov-focus-cn">Concept Note package — PDF</button></div>
      <div class="gov-focus-grid">
        <div><span class="gov-figure-label">On the cycle</span><span class="gov-tile-value">${esc(r.stageLabel)}</span><span class="partc-hint">${val(r.daysInStage) === null ? '' : `${fmt(r.daysInStage)} day(s) in stage`}</span></div>
        <div><span class="gov-figure-label">Gate</span><span class="gov-tile-value"><span class="gov-pill gov-pill-gate" style="--pill:${GATE_COLOR(r.gate)}">${esc(GATE_MARK[r.gate] || '')} ${esc(GATE_WORD[r.gate] || r.gate)}</span></span><span class="partc-hint">${esc((r.gateReasons || [])[0] || 'nothing to resolve')}</span></div>
        <div><span class="gov-figure-label">GCF ask</span><span class="gov-tile-value">${esc(money(r.gcfAsk))}</span><span class="partc-hint">of ${esc(money(r.totalCost))} total cost</span></div>
        <div><span class="gov-figure-label">Assessment</span><span class="gov-tile-value"><span class="gov-pill" style="--pill:${STATE_COLOR(a.state)}">${esc(a.stateLabel || STATE_WORD[a.state] || a.state)}</span></span><span class="partc-hint">${a.validatedBy ? `signed by ${esc(a.validatedBy)} on ${esc(day(a.validatedAt))}` : 'not yet signed'}</span></div>
        <div><span class="gov-figure-label">Weakest evidence</span><span class="gov-tile-value">${esc(r.weakestTier || '—')}</span><span class="partc-hint">the tier a reviewer asks about first</span></div>
        <div><span class="gov-figure-label">Blocking</span><span class="gov-tile-value">${fmt(g.now)}</span><span class="partc-hint">now · ${fmt(g.next)} at the next stage</span></div>
      </div>
      ${g.items.filter(i => i.horizon === 'now').length ? `<ul class="gov-items">${g.items.filter(i => i.horizon === 'now').slice(0, 6).map(i => `<li><span class="gov-owner" style="--pill:${OWNER_COLOR(i.owner)}">${esc(i.ownerLabel)}</span><span><b>${esc(i.what)}</b> <span class="partc-hint">${esc(i.clause)}</span><br><span class="partc-hint">${esc(i.remedy)}</span></span></li>`).join('')}</ul>` : '<p class="partc-hint">Nothing blocks the next step.</p>'}
    `);
    el.hidden = false;
    const open = el.querySelector('.gov-focus-open');
    if (open) open.addEventListener('click', () => openProject(r.id));
    const rep = el.querySelector('.gov-focus-report');
    if (rep) rep.addEventListener('click', () => download(`/pipeline/${encodeURIComponent(r.id)}/assessment-report?format=pdf`, `gcf-assessment-${r.code}.pdf`, 'assessment report (PDF)'));
    const cn = el.querySelector('.gov-focus-cn');
    if (cn) cn.addEventListener('click', () => download(`/cn/${encodeURIComponent(r.id)}?format=pdf`, `gcf-concept-note-${r.code}.pdf`, 'Concept Note package (PDF)'));
  }

  /* The Pipeline tab reads this once its own load is done and opens the
     candidate; until it does, the tab opens on the board. */
  function openProject(id) {
    remember('carboniq.gcf.intent', `open:${id}`);
    nav('gcf');
  }

  // ── the charts ─────────────────────────────────────────────

  /* Every bar is a figure the portfolio or the register returned; the chart
     module scales it to a width and nothing else. */
  function renderCharts() {
    if (typeof Charts === 'undefined') return;
    const dim = r => Boolean(focus && focus !== r.id);
    if (!rows().length) {
      for (const id of ['go-chart-stages', 'go-chart-gate', 'go-chart-owners', 'go-chart-results', 'go-chart-beneficiaries']) setHtml(id, '<p class="partc-hint">No candidate recorded yet.</p>');
      return;
    }

    const stages = (portfolio.byStage || []).filter(s => val(s.count) !== null && s.count > 0).map(s => ({
      key: s.stage, label: s.label, value: val(s.count), color: CYCLE_COLOR(s.cycle), dim: Boolean(focus && !(s.ids || []).includes(focus)),
    }));
    setHtml('go-chart-stages', Charts.figure(
      Charts.hbars(stages, { label: 'Candidates by stage of the GCF project activity cycle', decimals: 0, unit: 'candidates' }),
      stages, { title: 'Candidates by stage', head: 'Stage', unit: 'Candidates',
        caption: (portfolio.byStage || []).filter(s => s.count > 0).map(s => `${s.label}: GCF ask ${money(s.gcfAsk)}`).join(' · ') }));

    const g = portfolio.gate || {};
    const gate = ['eligible', 'flagged', 'excluded'].map(k => ({ key: k, label: `${GATE_MARK[k]} ${GATE_WORD[k]}`, value: val(g[k]), color: GATE_COLOR(k) }));
    setHtml('go-chart-gate', Charts.figure(
      Charts.hbars(gate, { label: 'Candidates by accreditation gate', decimals: 0, unit: 'candidates' }),
      gate, { title: 'The accreditation gate', head: 'Verdict', unit: 'Candidates',
        legend: gate.map(x => ({ label: x.label, color: x.color })) }));
    const reasons = rows().filter(r => r.gate !== 'eligible' && (r.gateReasons || []).length);
    setHtml('go-gate-reasons', reasons.length
      ? `<ul class="gov-items">${reasons.map(r => `<li><span class="gov-pill gov-pill-gate" style="--pill:${GATE_COLOR(r.gate)}">${esc(GATE_MARK[r.gate])} ${esc(GATE_WORD[r.gate])}</span><span><b>${esc(r.code)} — ${esc(r.name)}</b><br><span class="partc-hint">${esc(r.gateReasons.join(' '))}</span></span></li>`).join('')}</ul>`
      : `<p class="partc-hint">${esc(g.note || 'Every candidate is within the accreditation.')}</p>`);

    const owners = (register.byOwner || []).map(o => ({
      key: o.owner, label: o.label, value: val(o.now), color: OWNER_COLOR(o.owner),
      dim: Boolean(focus && !(o.projects || []).includes((rows().find(r => r.id === focus) || {}).code)),
    }));
    setHtml('go-chart-owners', Charts.figure(
      Charts.hbars(owners, { label: 'Open items now, by who closes them', decimals: 0, unit: 'items' }),
      owners, { title: 'Open items now, by who closes them', head: 'Who closes it', unit: 'Items',
        caption: (register.byOwner || []).filter(o => o.now > 0).map(o => `${o.label} — ${o.who}`).join(' · ') }));

    const res = [];
    for (const r of rows()) {
      if (r.stream === 'mitigation') res.push({ key: r.id, label: r.code, value: val(r.mitigationLifetime_tCO2e), color: STREAM_COLOR('mitigation'), dim: dim(r) });
    }
    for (const r of rows()) {
      if (r.stream === 'adaptation') res.push({ key: r.id, label: `${r.code} — co-benefit, apart`, value: val(r.coBenefitLifetime_tCO2e), color: APART, dim: dim(r) });
    }
    setHtml('go-chart-results', Charts.figure(
      Charts.hbars(res, { label: 'Lifetime mitigation by candidate, tCO2e, adaptation co-benefit apart', decimals: 0, unit: 'tCO₂e' }),
      res, { title: 'Lifetime tCO₂e, co-benefit apart', head: 'Candidate', unit: 'tCO₂e',
        legend: [{ label: 'Mitigation — Core Indicator 1', color: STREAM_COLOR('mitigation') }, { label: 'Adaptation co-benefit — apart', color: APART }] }));
    const em = (portfolio.results || {}).embodiedCarbon || {};
    const fe = (portfolio.results || {}).financedEmissions || {};
    say('go-results-note', `Embodied carbon A1–A5, a separate boundary: ${val(em.a1a5_tCO2e) === null ? 'not held' : `${fmt(em.a1a5_tCO2e)} tCO₂e over ${fmt(em.projects)} project(s)`}${(em.notHeld || []).length ? `; not held for ${em.notHeld.join(', ')}` : ''}. ${fe.note || 'Financed emissions are the bank’s own attributed exposure and live on the capital book.'}`);

    const ben = [];
    for (const r of rows()) {
      ben.push({ key: `${r.id}-d`, label: `${r.code} — direct`, value: val(r.directBeneficiaries), color: BEN_COLOR('direct'), dim: dim(r) });
      ben.push({ key: `${r.id}-i`, label: `${r.code} — indirect`, value: val(r.indirectBeneficiaries), color: BEN_COLOR('indirect'), dim: dim(r) });
    }
    setHtml('go-chart-beneficiaries', Charts.figure(
      Charts.hbars(ben, { label: 'Direct and indirect beneficiaries by candidate, never summed', decimals: 0, unit: 'people' }),
      ben, { title: 'People, two indicators never summed', head: 'Candidate', unit: 'People',
        legend: [{ label: 'Direct', color: BEN_COLOR('direct') }, { label: 'Indirect', color: BEN_COLOR('indirect') }] }));
  }

  function renderGapsByProject() {
    const list = (register.byProject || []).filter(p => !focus || p.id === focus);
    setHtml('go-gaps-projects', list.length ? list.map(p => `
      <div class="gov-gap-row" data-id="${esc(p.id)}">
        <div class="gov-gap-head"><i style="background:${STREAM_COLOR(p.stream)}"></i><b>${esc(p.code)}</b> <span>${esc(p.name)}</span>
          <span class="partc-hint">${esc(p.stageLabel)} · ${fmt(p.now)} now · ${fmt(p.next)} next</span></div>
        ${p.items.filter(i => i.horizon === 'now').length
          ? `<ul class="gov-items gov-items-tight">${p.items.filter(i => i.horizon === 'now').slice(0, focus ? 20 : 3).map(i => `<li><span class="gov-owner" style="--pill:${OWNER_COLOR(i.owner)}">${esc(i.ownerLabel)}</span><span>${esc(i.what)}</span></li>`).join('')}</ul>`
          : '<p class="partc-hint">Nothing blocks the next step.</p>'}
      </div>`).join('') : '<p class="partc-hint">No candidate recorded yet.</p>');
    for (const el of document.querySelectorAll('#go-gaps-projects .gov-gap-row')) {
      el.addEventListener('click', () => { const id = el.getAttribute('data-id'); if (focus !== id) setFocus(id); });
    }
  }

  function renderUpcoming() {
    const up = portfolio.upcoming || [];
    setHtml('go-upcoming', up.length
      ? `<ul class="gov-items">${up.slice(0, 8).map(u => `<li><span class="gov-date${u.projected ? ' is-projected' : ''}">${esc(day(u.date))}</span><span><b>${esc(u.milestone)}</b> — ${esc(u.code)} ${esc(u.name)}<br><span class="partc-hint">${u.projected ? `Projected — ${esc(u.basis)}` : esc(u.basis || 'Target set by the bank')}</span></span></li>`).join('')}</ul>`
      : '<p class="partc-hint">No target date is set and no submission is recorded yet, so the Fund’s service standards have nothing to project from.</p>');
  }

  function renderS2() {
    const m = report.metricsAndTargets || {};
    const co = m.climateOpportunities || {};
    const cd = m.capitalDeployment || {};
    const av = m.avoidedAndReduced || {};
    const yes = (report.checklist || []).filter(i => i.met).length;
    setHtml('go-s2', `
      <div class="gov-s2-grid">
        <div><span class="gov-figure-label">Aligned with climate-related opportunities</span><span class="gov-tile-value">${esc(money(co.alignedAmount))}</span><span class="partc-hint">SLFRS S2 §29(d) · ${val(co.alignedPctOfPipeline) === null ? '—' : `${fmt(co.alignedPctOfPipeline, 1)}%`} of the pipeline · ${esc(co.framework || '')}</span></div>
        <div><span class="gov-figure-label">Capital deployment</span><span class="gov-tile-value">${esc(money(cd.pipelineTotalCost))}</span><span class="partc-hint">SLFRS S2 §29(e) · GCF ask ${esc(money(cd.gcfAsk))} · entity ${esc(money(cd.dfccCommitment))}</span></div>
        <div><span class="gov-figure-label">Avoided and reduced, apart</span><span class="gov-tile-value">${fmt(av.annual_tCO2e)} <span class="gov-figure-unit">tCO₂e a year</span></span><span class="partc-hint">${fmt(av.lifetime_tCO2e)} tCO₂e lifetime · never netted against an inventory</span></div>
        <div><span class="gov-figure-label">Scope 1, 2 and 3 — §29(a)</span><span class="gov-tile-value">Absent</span><span class="partc-hint">by rule: the entity’s own inventory comes from the capital book, not from a pipeline</span></div>
      </div>
      <p class="partc-hint">${esc(report.completenessNote || '')} ${fmt(yes)} of ${fmt((report.checklist || []).length)} checklist items answered Yes.</p>`);
  }

  function renderProjects() {
    const list = rows();
    if (!list.length) { setHtml('go-projects', '<tbody><tr><td class="partc-hint">No candidate recorded yet.</td></tr></tbody>'); return; }
    setHtml('go-projects', `
      <thead><tr><th>Code</th><th>Candidate</th><th>Stream</th><th>Stage</th><th>Gate</th><th class="num">GCF ask</th><th>Weakest tier</th><th>Assessment</th><th class="num">Blocking</th><th></th></tr></thead>
      <tbody>${list.map(r => {
        const g = gapsOf(r.id) || { now: 0 };
        const a = r.assessment || {};
        return `<tr data-id="${esc(r.id)}" class="${focus && focus !== r.id ? 'is-dim' : ''}">
          <td><i class="gov-dot" style="background:${STREAM_COLOR(r.stream)}"></i>${esc(r.code)}</td>
          <td>${esc(r.name)}</td>
          <td>${esc(r.stream)}</td>
          <td>${esc(r.stageLabel)}</td>
          <td><span class="gov-pill gov-pill-gate" style="--pill:${GATE_COLOR(r.gate)}">${esc(GATE_MARK[r.gate] || '')} ${esc(GATE_WORD[r.gate] || r.gate)}</span></td>
          <td class="num">${esc(money(r.gcfAsk))}</td>
          <td>${esc(r.weakestTier || '—')}</td>
          <td><span class="gov-pill" style="--pill:${STATE_COLOR(a.state)}">${esc(a.stateLabel || a.state || '—')}</span></td>
          <td class="num">${fmt(g.now)}</td>
          <td class="gov-row-actions"><button type="button" class="btn btn-secondary btn-sm" data-doc="report" data-id="${esc(r.id)}" data-code="${esc(r.code)}">Report</button> <button type="button" class="btn btn-secondary btn-sm" data-doc="cn" data-id="${esc(r.id)}" data-code="${esc(r.code)}">Concept Note</button></td>
        </tr>`;
      }).join('')}</tbody>`);
    for (const tr of document.querySelectorAll('#go-projects tbody tr')) {
      tr.addEventListener('click', ev => {
        const b = ev.target && ev.target.closest ? ev.target.closest('[data-doc]') : null;
        if (b) {
          ev.stopPropagation();
          const id = b.getAttribute('data-id'); const code = b.getAttribute('data-code');
          if (b.getAttribute('data-doc') === 'report') download(`/pipeline/${encodeURIComponent(id)}/assessment-report?format=pdf`, `gcf-assessment-${code}.pdf`, 'assessment report (PDF)');
          else download(`/cn/${encodeURIComponent(id)}?format=pdf`, `gcf-concept-note-${code}.pdf`, 'Concept Note package (PDF)');
          return;
        }
        const id = tr.getAttribute('data-id'); if (focus !== id) setFocus(id);
      });
    }
  }

  function renderEntityGaps() {
    const items = (register.entity && register.entity.items) || [];
    setHtml('go-entity-gaps', items.length
      ? `<ul class="gov-items">${items.map(i => `<li><span class="gov-owner" style="--pill:${OWNER_COLOR(i.owner)}">${esc(i.ownerLabel)}</span><span><b>${esc(i.what)}</b> <span class="partc-hint">${esc(i.clause)}</span></span></li>`).join('')}</ul>
         <button type="button" class="btn btn-secondary" id="go-entity-open">Record the entity’s facts on the Pipeline tab</button>`
      : '<p class="partc-hint">Every statement the disclosure asks of the reporting entity is on the record.</p>');
    on('go-entity-open', 'click', () => { remember('carboniq.gcf.intent', 'panel:reporting'); nav('gcf'); });
  }

  // ── what stands behind a figure ─────────────────────────────

  async function readMatrix() {
    if (matrix) return matrix;
    matrix = await gcf('/conformance');
    return matrix;
  }
  const rulesWith = (mx, prefix) => ((mx && mx.rules) || []).filter(r => String(r.id).startsWith(prefix));
  const ruleList = (mx, prefixes) => {
    const rs = prefixes.flatMap(p => rulesWith(mx, p));
    return rs.length ? `<ul class="gov-rules">${rs.map(r => `<li><b>${esc(r.id)}</b> ${esc(r.rule)}<br><span class="partc-hint">${esc(r.clause)} · proved by ${esc(String(r.test || '').split('›')[0].trim())}</span></li>`).join('')}</ul>` : '';
  };
  const kv = (rows_) => `<dl class="gov-kv">${rows_.filter(r => r).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

  async function openBehind(kind) {
    show('go-behind', true);
    say('go-behind-title', 'What stands behind this figure');
    setHtml('go-behind-body', '<p class="partc-hint">Reading…</p>');
    let mx = null;
    try { mx = await readMatrix(); } catch (_) { mx = null; }
    renderBehind(kind, mx);
    const el = $('go-behind'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderBehind(kind, mx) {
    const e = env();
    const m = portfolio.money || {};
    const r = portfolio.results || {};
    let html = '';
    if (kind === 'money') {
      say('go-behind-title', 'Behind the money');
      html = kv([
        ['Total project cost', moneyLong(m.totalCost, m.currency)], ['GCF ask', moneyLong(m.gcfAsk, m.currency)],
        ['Entity commitment', moneyLong(m.dfcc, m.currency)], ['Other sources', moneyLong(m.other, m.currency)],
        ['Mobilisation', val(m.mobilisation) === null ? 'no ask recorded' : `${fmt(m.mobilisation, 2)}× — ${m.mobilisationNote || ''}`],
        ['Size ceiling', e.ceiling_usd ? `${moneyLong(e.ceiling_usd)} per project — ${e.note || ''}` : 'not stated'],
        e.largestProject ? ['Largest candidate', `${e.largestProject.code} at ${moneyLong(e.largestProject.totalCost)}${val(e.largestProject.shareOfCeiling) === null ? '' : ` — ${fmt(e.largestProject.shareOfCeiling * 100, 1)}% of the ceiling`}`] : null,
        ['Over the ceiling', (e.overCeiling || []).length ? e.overCeiling.join(', ') : 'none'],
      ]) + ruleList(mx, ['G-LOT2-06', 'G-ACCR-02']);
    } else if (kind === 'gate') {
      say('go-behind-title', 'Behind the gate');
      html = kv([
        ['Accreditation', `Board decision ${e.decision || '—'}${(portfolio.envelope && portfolio.envelope.recorded) ? ', as recorded by the entity' : ' — as shipped; record the entity’s own on the Pipeline tab'}`],
        ['Size category', `${e.sizeCategory || '—'}${e.ceiling_usd ? ` — up to ${moneyLong(e.ceiling_usd)} per project` : ''}`],
        ['Environmental and social category', e.essCategory || '—'],
        ['Grant award modality', e.grantModality === false ? 'Not held — a fact to verify with the entity or the NDA' : e.grantModality === true ? 'Held' : 'not stated'],
        ['Verdicts', `${fmt((portfolio.gate || {}).eligible)} eligible · ${fmt((portfolio.gate || {}).flagged)} flagged · ${fmt((portfolio.gate || {}).excluded)} excluded`],
        ['Rule', (portfolio.gate || {}).note || ''],
      ]) + ruleList(mx, ['G-ACCR']);
    } else if (kind === 'gaps') {
      say('go-behind-title', 'Behind the register');
      const owners = Object.entries(register.owners || {});
      html = `<p class="partc-hint">${esc(register.note || '')}</p>` + kv(owners.map(([k, o]) => [o.label, o.who])) + ruleList(mx, ['G-GAP', 'G-CYCLE-04']);
    } else if (kind === 'assess') {
      say('go-behind-title', 'Behind the sign-off');
      const a = portfolio.assessment || {};
      html = `<p class="partc-hint">${esc(a.note || '')}</p>` + kv([
        ['Unsigned', (a.unsigned || []).length ? a.unsigned.join(', ') : 'none'],
        ...rows().filter(x => x.assessment && x.assessment.state === 'validated').map(x => [x.code, `${x.assessment.stateLabel} — ${x.assessment.validatedBy || 'assessor'} on ${day(x.assessment.validatedAt)}${x.assessment.recommendation ? ` · ${String(x.assessment.recommendation).replace(/_/g, ' ')}` : ''}`]),
      ]) + ruleList(mx, ['G-VAL', 'G-RPT-01', 'G-RET']);
    } else if (kind === 'results') {
      say('go-behind-title', 'Behind the results');
      const ev = r.evidence || {};
      html = kv([
        ['Indicator', (r.mitigation || {}).indicator || 'GCF Mitigation Core Indicator 1'],
        ['Annual', `${fmt((r.mitigation || {}).annual_tCO2e)} tCO₂e`], ['Lifetime', `${fmt((r.mitigation || {}).lifetime_tCO2e)} tCO₂e`],
        ['Adaptation co-benefit, apart', `${fmt((r.adaptationCoBenefit || {}).lifetime_tCO2e)} tCO₂e — ${(r.adaptationCoBenefit || {}).note || ''}`],
        ['Embodied carbon, apart', (r.embodiedCarbon || {}).note || ''],
        ['Financed emissions', (r.financedEmissions || {}).note || 'On the capital book, on PCAF Part A attribution'],
        ['Weakest evidence tier', ev.weakestTier || '—'],
        ...Object.entries(ev.byTier || {}).map(([k, v]) => [`Figures at tier ${k}`, fmt(v)]),
        ['Evidence tiers', ev.note || ''],
      ]) + ruleList(mx, ['G-CARBON', 'G-DATA-01', 'G-DATA-02']);
    } else if (kind === 'file') {
      say('go-behind-title', 'Behind the file');
      html = `<p class="partc-hint">${esc((report.basis || {}).covers || '')}</p>
        <div class="gov-scroll"><table class="partc-table"><thead><tr><th>Checklist item</th><th>Clause</th><th>Answer</th></tr></thead>
        <tbody>${(report.checklist || []).map(i => `<tr><td>${esc(i.item)}</td><td>${esc(i.standardRef || '')}</td><td>${i.met ? 'Yes' : `No — ${esc(i.basis || '')}`}</td></tr>`).join('')}</tbody></table></div>`
        + ruleList(mx, ['G-REPORT', 'G-RPT-02', 'G-NDC']);
    } else if (kind === 'method') {
      say('go-behind-title', 'The rules this pipeline is held to');
      const s = (mx && mx.summary) || {};
      html = `<p class="partc-hint">${esc((mx && mx.disclaimer) || '')}</p>` + kv([
        ['Source', (mx && mx.source) || ''],
        ['Rules', `${fmt(s.total)} — ${fmt(s.implemented)} implemented, ${fmt(s.partial)} partial, ${fmt(s.excluded)} out of scope, each proved by its own test`],
      ]) + ruleList(mx, ['G-']);
    }
    setHtml('go-behind-body', html || '<p class="partc-hint">Nothing to show.</p>');
  }

  // ── actions ────────────────────────────────────────────────

  async function download(path, filename, label) {
    say('go-status', `Preparing the ${label}…`);
    try {
      const res = await window.CARBONIQ_fetch('/v1/gcf' + path);
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
      say('go-status', `${label} downloaded.`);
    } catch (err) { say('go-status', err.message); }
  }

  async function loadStarter() {
    if (!window.confirm('Load the starter projects into this organisation? They are recorded, not sample, and every figure is a starting value to edit.')) return;
    say('go-status', 'Loading the starter projects…');
    try {
      const r = await gcf('/pipeline/install-starter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      say('go-status', `${fmt(r.installed)} starter project(s) recorded. ${r.note || ''}`);
      await load();
    } catch (err) { say('go-status', err.message); }
  }

  // ── lifecycle ──────────────────────────────────────────────

  /* Everything that changes what the first request says — the listeners,
     the preview state — is wired before load() is called. */
  async function init() {
    on('go-refresh', 'click', load);
    on('go-pdf', 'click', () => download('/report?format=pdf', 'gcf-disclosure.pdf', 'GCF disclosure (PDF)'));
    on('go-docx', 'click', () => download('/report?format=word', 'gcf-disclosure.docx', 'GCF disclosure (Word)'));
    on('go-starter', 'click', loadStarter);
    on('go-behind-close', 'click', () => show('go-behind', false));
    for (const b of document.querySelectorAll('.gov [data-behind]')) b.addEventListener('click', () => openBehind(b.getAttribute('data-behind')));
    for (const el of document.querySelectorAll('.gov [data-writes]')) el.hidden = preview() || el.hidden;
    await load();
  }

  /* A return visit re-reads the position. A walkthrough step landing on the
     screen already shown (`shown`, from the shell) carries a hand-over for a
     drawer over the position already read, and re-reading three routes for
     it is what put a walkthrough over the hundred requests a minute a
     session is allowed — that hand-over is applied over what is on screen;
     every other refresh is load. */
  function refresh({ shown = false } = {}) {
    let held = null;
    try { held = localStorage.getItem('carboniq.gcf-overview.intent'); } catch (_) { held = null; }
    if (shown && held && portfolio && register && report) { applyIntent(); return Promise.resolve(); }
    return load();
  }

  return { init, refresh, load };
})();
