/* ============================================================
   CarbonIQ — Methodology & Evidence (visual build)

   The reasoning is carried by diagrams; prose survives only as
   a caption. Every value, curve and scenario is an engine
   execution delivered by the API — the controls read computed
   answers, they never interpolate a stored array.
   ============================================================ */

const MethodologyPage = (() => {

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (n, d = 0) => Number(n || 0).toLocaleString('en-US',
    { minimumFractionDigits: d, maximumFractionDigits: d });
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const motionOK = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TIER_CLASS = { Local: 'tier-local', Regional: 'tier-regional', Global: 'tier-global' };
  const SECTIONS = [
    ['sec-scope','Scope & boundary'], ['sec-compare','Same building, different cover'],
    ['sec-sensitivity','Cover length'], ['sec-chain','Calculation chain'],
    ['sec-factors','Factors & sources'], ['sec-limits','Limits & roadmap'],
    ['sec-quality','Data quality'], ['sec-conformance','Conformance'],
    ['sec-labour','Division of labour']
  ];

  let _d = null;                 // the methodology payload
  let _policy = 'CAR';
  let _years = 10;
  let _tier = 'all';
  let _mod = 'all';

  const scenarioFor = t => _d.scenarios.policies.find(p => p.policyType === t) || _d.scenarios.policies[0];
  const curveAt = y => _d.scenarios.curve.find(c => c.years === y) || _d.scenarios.curve[0];
  const hasUseStage = t => scenarioFor(t).gateYears > 0;

  // ── Load ───────────────────────────────────────────────────
  async function load() {
    say('mthStatus', 'Reading the engine…');
    try {
      const res = await window.CARBONIQ_fetch('/v1/pcaf/part-c/methodology');
      let d = {}; try { d = await res.json(); } catch (_) { /* empty */ }
      if (!res.ok) throw new Error([d.message, d.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
      _d = d.methodology;
      render();
      $('mthBody').hidden = false;
      say('mthStatus', `${_d.scenarios.executions} executions`);
    } catch (err) { say('mthStatus', err.message); }
  }

  function render() {
    setHtml('mthChips', [
      [_d.provenance.auditSteps, 'traced steps'],
      [_d.factorStore.rowCount, 'factors'],
      [_d.conformance.summary.total, 'rules asserted'],
      [_d.openItems.total, 'open items']
    ].map(([n, l]) => `<span class="mth-chip"><b>${n}</b> ${esc(l)}</span>`).join(''));

    buildPolicySeg();
    drawScope(); drawGate(); drawDiff();
    drawChart(); drawCurveTable();
    drawChain();
    buildFactorControls(); drawDonut(); drawFactors();
    drawLimits(); drawDqScoring(); drawQuality(); drawConformance(); drawLabour();
    buildToc();
    wireCitation();
  }

  // ══ 1 · Scope timeline ═════════════════════════════════════
  function buildPolicySeg() {
    setHtml('mthPolicySeg', _d.scenarios.policies.map(p => `
      <button type="button" class="mth-seg-btn${p.policyType === _policy ? ' is-on' : ''}"
              data-policy="${esc(p.policyType)}" aria-pressed="${p.policyType === _policy}">
        ${esc(p.policyType)}</button>`).join(''));
    $('mthPolicySeg').querySelectorAll('.mth-seg-btn').forEach(b =>
      b.addEventListener('click', () => {
        _policy = b.dataset.policy;
        buildPolicySeg(); drawScope(); drawGate(); drawDqScoring(); drawFactors();
      }));
  }

  /* Three cards, not three long tracks.

     A timeline forces most of the canvas to be empty, because construction
     is a short phase against a decade of cover — and emptiness is not the
     message. The message is the three magnitudes and which of them may
     enter the figure, so the result is the largest type on each card and a
     slim strip underneath carries the timing. Tier 3 is detached below the
     break because it cannot enter at all. */
  function drawScope() {
    const sc = scenarioFor(_policy);
    const live = sc.gateYears > 0;

    const cards = [
      { tier: 'Tier 1 · Mandatory', mods: 'A4 + A5', cls: 'tk-1', on: true,
        value: fmt(sc.construction, 2), unit: 'kgCO₂e', role: 'This is the PCAF figure',
        from: 0, to: 28 },
      { tier: 'Tier 2 · Optional', mods: 'B1 + B4 + B7', cls: 'tk-2', on: live,
        value: live ? fmt(sc.useStage, 2) : '0.00', unit: 'kgCO₂e',
        role: live ? `Separate line, over ${sc.gateYears} y of cover` : 'use_stage_years = 0 — by scope rule',
        from: 28, to: live ? 100 : 28 },
      { tier: 'Tier 3 · Beyond PCAF', mods: 'B2 + B5 + B8', cls: 'tk-3', on: false,
        value: '—', unit: 'voluntary annex', role: 'Never enters the figure', from: 0, to: 0 }
    ];

    const card = c => `
      <article class="tk ${c.cls}${c.on ? '' : ' is-off'}">
        <header><span class="tk-tier">${esc(c.tier)}</span>
          <span class="mono tk-mods">${esc(c.mods)}</span></header>
        <p class="tk-val">${esc(c.value)}<small>${esc(c.unit)}</small></p>
        <p class="tk-role">${esc(c.role)}</p>
        ${c.to > c.from ? `<div class="tk-phase" aria-hidden="true">
          <span style="margin-left:${c.from}%;width:${c.to - c.from}%"></span></div>`
        : '<div class="tk-phase is-none" aria-hidden="true"></div>'}
      </article>`;

    setHtml('mthScope', `
      <div class="tierset">${cards.slice(0, 2).map(card).join('')}</div>
      <div class="phasekey"><span>Construction begins</span>
        <span>Practical completion</span><span>End of cover</span></div>
      <div class="scope-break"><span>excluded from the PCAF figure</span></div>
      <div class="tierset tierset-out">${card(cards[2])}</div>`);
  }

  function drawGate() {
    const sc = scenarioFor(_policy);
    const open = sc.gateYears > 0;
    setHtml('mthGateFlow', `
      <div class="gate-flow${open ? ' is-open' : ' is-shut'}">
        <div class="gate-node"><small>policy</small><b>${esc(_policy)}</b></div>
        <div class="gate-wire" aria-hidden="true"></div>
        <div class="gate-valve" title="${esc(_d.scope.policyGate.override)}"
             role="img" aria-label="${open ? 'Gate open' : 'Gate closed'}">
          <span class="gate-lever"></span>
        </div>
        <div class="gate-wire" aria-hidden="true"></div>
        <div class="gate-node gate-years"><small>use_stage_years</small><b>${sc.gateYears}</b></div>
        <div class="gate-fan" aria-hidden="true"></div>
        <div class="gate-mods">
          ${['b1','b4','b7'].map(k => `
            <span class="gate-mod${open && sc[k] > 0 ? ' is-live' : ''}">
              <i>${k.toUpperCase()}</i>${fmt(sc[k], 2)}</span>`).join('')}
        </div>
      </div>`);
    say('mthGateCap', _d.scope.policyGate.consequence);
    tryYears();
  }

  function tryYears() {
    const el = $('mthTryYears'); if (!el) return;
    const entered = Number(el.value) || 0;
    const admits = hasUseStage(_policy) ? entered : 0;
    setHtml('mthTryOut', `→ gate admits <b>${admits}</b> y`
      + (hasUseStage(_policy) ? '' : ' <span class="mth-mini-note">entered value recorded, not applied</span>'));
  }

  // ══ 2 · CAR vs IDI diff ════════════════════════════════════
  function drawDiff() {
    const rows = _d.policyGate.rows.filter(r => typeof r.CAR === 'number' && typeof r.IDI === 'number');
    setHtml('mthDiff', rows.map((r, i) => {
      const max = Math.max(Math.abs(r.CAR), Math.abs(r.IDI)) || 1;
      const w = v => `${(Math.abs(v) / max) * 100}%`;
      return `
        <div class="diff-row${r.identical ? ' is-same' : ''}">
          <div class="diff-side diff-l">
            <span class="diff-bar${r.CAR === 0 ? ' is-zero' : ''}" style="width:${w(r.CAR)}"></span>
            <b>${fmt(r.CAR, r.CAR && Math.abs(r.CAR) < 1 ? 6 : 2)}</b></div>
          <div class="diff-mid">
            <span class="diff-label">${esc(r.measure)}</span>
            ${r.note ? `<button type="button" class="diff-info" title="${esc(r.note)}"
                        aria-label="${esc(r.note)}">i</button>` : ''}
            <span class="badge ${r.identical ? 'badge-same' : 'badge-diff'}">${r.identical ? 'identical' : 'differs'}</span>
          </div>
          <div class="diff-side diff-r"><b>${fmt(r.IDI, r.IDI && Math.abs(r.IDI) < 1 ? 6 : 2)}</b>
            <span class="diff-bar${r.IDI === 0 ? ' is-zero' : ''}" style="width:${w(r.IDI)}"></span></div>
        </div>`;
    }).join('')
    + `<div class="diff-legend"><span>CAR — construction cover</span><span>IDI — cover into occupation</span></div>`);
  }

  // ══ 3 · Sensitivity chart ══════════════════════════════════
  /* Hand-drawn SVG rather than a chart library: three stacked series and a
     few annotations do not justify a dependency, and this way the step
     markers sit exactly on the years the engine actually stepped at. */
  function drawChart() {
    const c = _d.scenarios.curve;
    const W = 720, H = 260, P = { l: 54, r: 16, t: 16, b: 30 };
    const maxY = Math.max(...c.map(p => p.useStage)) * 1.06 || 1;
    const maxX = _d.scenarios.maxYears;
    const x = y => P.l + ((y - 1) / (maxX - 1)) * (W - P.l - P.r);
    const y = v => H - P.b - (v / maxY) * (H - P.t - P.b);

    const band = (lo, hi) => c.map(p => `${x(p.years)},${y(hi(p))}`).join(' ')
      + ' ' + c.slice().reverse().map(p => `${x(p.years)},${y(lo(p))}`).join(' ');

    const b1 = p => p.b1;
    const b1b7 = p => p.b1 + p.b7;
    const all = p => p.useStage;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => {
      const v = maxY * f;
      return `<line x1="${P.l}" y1="${y(v)}" x2="${W - P.r}" y2="${y(v)}" class="ch-grid"/>
              <text x="${P.l - 8}" y="${y(v) + 4}" class="ch-ylab">${fmt(v)}</text>`;
    }).join('');

    const xticks = [1, 10, 20, 30, 45].map(t =>
      `<text x="${x(t)}" y="${H - 8}" class="ch-xlab">${t}y</text>`).join('');

    const steps = _d.scenarios.b4Steps.map(s => `
      <g class="ch-step">
        <line x1="${x(s.years)}" y1="${P.t}" x2="${x(s.years)}" y2="${H - P.b}"/>
        <circle cx="${x(s.years)}" cy="${y(curveAt(s.years).useStage)}" r="4"/>
        <text x="${x(s.years) + 6}" y="${P.t + 12}">${s.years}y · B4 enters</text>
      </g>`).join('');

    setHtml('mthChart', `
      <svg viewBox="0 0 ${W} ${H}" class="ch" role="img"
           aria-label="Use-stage emissions against cover period, with B4 step points">
        ${ticks}
        <polygon class="ch-b1" points="${band(() => 0, b1)}"/>
        <polygon class="ch-b7" points="${band(b1, b1b7)}"/>
        <polygon class="ch-b4" points="${band(b1b7, all)}"/>
        <polyline class="ch-total" points="${c.map(p => `${x(p.years)},${y(all(p))}`).join(' ')}"/>
        ${steps}
        <line class="ch-cursor" id="chCursor" x1="${x(_years)}" y1="${P.t}" x2="${x(_years)}" y2="${H - P.b}"/>
        ${xticks}
      </svg>
      <div class="ch-key">
        <span><i class="k-b1"></i>B1 refrigerant</span>
        <span><i class="k-b7"></i>B7 water</span>
        <span><i class="k-b4"></i>B4 replacement</span>
      </div>`);

    $('mthChart').dataset.x1 = x(1);
    $('mthChart').dataset.xn = x(maxX);
    updateReadout();
  }

  function updateReadout() {
    const p = curveAt(_years);
    say('mthYearsOut', `${_years} y`);
    const sl = $('mthYears'); if (sl && Number(sl.value) !== _years) sl.value = _years;

    const cur = $('chCursor');
    if (cur) {
      const x1 = Number($('mthChart').dataset.x1), xn = Number($('mthChart').dataset.xn);
      const px = x1 + ((_years - 1) / (_d.scenarios.maxYears - 1)) * (xn - x1);
      cur.setAttribute('x1', px); cur.setAttribute('x2', px);
    }

    setHtml('mthReadout', `
      <p class="ro-year">${_years} <small>years of cover</small></p>
      <dl class="ro-list">
        <div><dt>B1 refrigerant</dt><dd>${fmt(p.b1, 2)}</dd></div>
        <div><dt>B7 water</dt><dd>${fmt(p.b7, 2)}</dd></div>
        <div><dt>B4 replacement</dt><dd class="${p.b4 > 0 ? 'is-step' : ''}">${fmt(p.b4, 2)}</dd></div>
        <div class="ro-total"><dt>Use stage</dt><dd>${fmt(p.useStage, 2)}</dd></div>
      </dl>
      <p class="mth-prov">● engine · execution ${_years} of ${_d.scenarios.curve.length}</p>`);
  }

  function drawCurveTable() {
    setHtml('mthCurveTable', `
      <table class="mth-table">
        <thead><tr><th scope="col">Cover</th><th scope="col">Gate</th><th scope="col">B1</th>
                   <th scope="col">B4</th><th scope="col">B7</th><th scope="col">Use stage</th></tr></thead>
        <tbody>${_d.scenarios.curve.map(c => `
          <tr><td class="num">${c.years} y</td><td class="num">${c.gateYears} y</td>
              <td class="num">${fmt(c.b1, 2)}</td>
              <td class="num${c.b4 > 0 ? ' mth-step' : ''}">${fmt(c.b4, 2)}</td>
              <td class="num">${fmt(c.b7, 2)}</td><td class="num">${fmt(c.useStage, 2)}</td></tr>`).join('')}
        </tbody></table>`);
  }

  // ══ 4 · The chain ══════════════════════════════════════════
  function drawChain() {
    const total = Math.max(..._d.calculationChain.map(c => Math.abs(c.value || 0))) || 1;
    setHtml('mthChain', _d.calculationChain.map((c, i) => `
      <article class="mth-card" data-mod="${i}">
        <h3><button type="button" class="mth-card-btn" aria-expanded="false" aria-controls="mb-${i}">
          <span class="mth-chev" aria-hidden="true"></span>
          <span class="mono mth-code">${esc(c.module)}</span>
          <span class="mth-share" aria-hidden="true">
            <span style="width:${(Math.abs(c.value || 0) / total) * 100}%"></span></span>
          <span class="mth-card-val">${c.value !== null ? fmt(c.value, 2) : '—'}
            <small>${esc(c.unit || '')}</small></span>
        </button></h3>
        <div class="mth-card-body" id="mb-${i}" hidden></div>
      </article>`).join(''));

    $('mthChain').querySelectorAll('.mth-card-btn').forEach(b =>
      b.addEventListener('click', () => toggleModule(b)));
  }

  function toggleModule(btn) {
    const card = btn.closest('.mth-card');
    const body = card.querySelector('.mth-card-body');
    const open = btn.getAttribute('aria-expanded') === 'true';

    if (!open && !body.dataset.rendered) {
      const c = _d.calculationChain[Number(card.dataset.mod)];
      const facs = [];
      c.steps.forEach(s => s.factors.forEach(f => {
        if (!facs.some(x => x.key === f.key)) facs.push(f);
      }));
      body.innerHTML = `
        <p class="mth-cap">${esc(c.narrative || '')}</p>
        ${c.equations.map(e => `<div class="eq">${tokenise(e)}</div>`).join('')}
        <div class="trace-ribbon"><span>inputs</span><i></i><span>equation</span><i></i><span>result</span></div>
        ${facs.length ? `<div class="inputgrid">${facs.map(f => `
          <div class="ig-cell">
            <span class="mono ig-key">${esc(f.key)}</span>
            <span class="ig-val">${esc(f.value)} <small>${esc(f.unit || '')}</small></span>
            <span class="badge ${TIER_CLASS[f.tier] || ''}">${esc(f.tier)}</span>
            <span class="ig-src">${esc(f.reference || '—')}</span>
          </div>`).join('')}</div>` : ''}
        <details class="mth-data"><summary>${c.stepCount} traced steps</summary>
          <div class="mth-scroll"><table class="mth-table">
            <thead><tr><th scope="col">#</th><th scope="col">Quantity</th><th scope="col">Inputs</th>
                       <th scope="col">Result</th></tr></thead>
            <tbody>${c.steps.map(s => `
              <tr><td class="num">${s.step}</td><td>${esc(s.label)}</td>
                  <td class="mono ig-src">${esc(Object.entries(s.inputs || {}).map(([k, v]) => `${k}=${v}`).join(', ')) || '—'}</td>
                  <td class="num">${fmt(s.value, 2)}</td></tr>`).join('')}
            </tbody></table></div></details>`;
      body.dataset.rendered = '1';
    }
    btn.setAttribute('aria-expanded', String(!open));
    body.hidden = open;
    card.classList.toggle('is-open', !open);
  }

  /* Colour each term of the equation so the formula reads as parts rather
     than as a string of characters. */
  /* One pass, one replacer. Chained .replace() calls corrupted the markup:
     the operator class contains "/", so a later pass rewrote the closing
     </em> of a token inserted by an earlier one. */
  const TOKENS = /(EF_\w+|\bEF\b)|(\b(?:mass_t|quantity|GIFA|charge_kg|gwp|volume|premium|projectCost|emissions|score)\b|\b\w*_(?:km|years|t|L|kWh|m2|kg|rate|life)\b)|([×÷*+=−-]|(?<![a-zA-Z0-9_])\/(?![a-zA-Z0-9_]))/g;

  function tokenise(eq) {
    return esc(eq).replace(TOKENS, (m, factor, input, op) => {
      if (factor) return `<em class="t-factor">${m}</em>`;
      if (input)  return `<em class="t-input">${m}</em>`;
      if (op)     return `<em class="t-op">${m}</em>`;
      return m;
    });
  }

  // ══ 5 · Factors ════════════════════════════════════════════
  function buildFactorControls() {
    const tiers = ['all', ...Object.keys(_d.factorStore.byTier).sort()];
    setHtml('mthTierSeg', tiers.map(t => `
      <button type="button" class="mth-seg-btn${t === _tier ? ' is-on' : ''}" data-tier="${esc(t)}"
        aria-pressed="${t === _tier}">${t === 'all' ? 'All tiers' : esc(t)}${t !== 'all' ? ` <b>${_d.factorStore.byTier[t]}</b>` : ''}</button>`).join(''));
    $('mthTierSeg').querySelectorAll('.mth-seg-btn').forEach(b =>
      b.addEventListener('click', () => { _tier = b.dataset.tier; buildFactorControls(); drawFactors(); }));

    const mods = ['all', ...[...new Set(_d.factorStore.rows.map(r => r.module))].sort()];
    setHtml('mthModSeg', mods.map(m => `
      <button type="button" class="mth-seg-btn${m === _mod ? ' is-on' : ''}" data-mod="${esc(m)}"
        aria-pressed="${m === _mod}">${m === 'all' ? 'All modules' : esc(m)}</button>`).join(''));
    $('mthModSeg').querySelectorAll('.mth-seg-btn').forEach(b =>
      b.addEventListener('click', () => { _mod = b.dataset.mod; buildFactorControls(); drawFactors(); }));
  }

  function drawDonut() {
    const by = _d.factorStore.byTier;
    const total = Object.values(by).reduce((a, b) => a + b, 0) || 1;
    const order = ['Local', 'Regional', 'Global', 'n/a'].filter(t => by[t]);
    let acc = 0;
    const R = 52, C = 2 * Math.PI * R;
    const arcs = order.map(t => {
      const frac = by[t] / total;
      const seg = `<circle class="dn dn-${t.toLowerCase().replace('/', '')}" r="${R}" cx="70" cy="70"
        stroke-dasharray="${frac * C} ${C}" stroke-dashoffset="${-acc * C}"/>`;
      acc += frac;
      return seg;
    }).join('');
    setHtml('mthDonut', `
      <svg viewBox="0 0 140 140" role="img" aria-label="Factor mix by data-quality tier">
        ${arcs}<text x="70" y="66" class="dn-num">${total}</text>
        <text x="70" y="84" class="dn-lab">factors</text></svg>`);
    setHtml('mthMixKey', order.map(t =>
      `<span class="mixkey"><i class="dn-k dn-${t.toLowerCase().replace('/', '')}"></i>
        <b>${by[t]}</b> ${esc(t)}</span>`).join('')
      + `<p class="mth-cap">${esc(_d.factorStore.localisationNote || _d.factorStore.note)}</p>`);
  }

  function drawFactors() {
    const q = (($('mthFactorFilter') || {}).value || '').toLowerCase().trim();
    let rows = _d.factorStore.rows;
    if (_tier !== 'all') rows = rows.filter(r => r.tier === _tier);
    if (_mod !== 'all') rows = rows.filter(r => r.module === _mod);
    if (q) rows = rows.filter(r => `${r.key} ${r.reference || ''} ${r.table}`.toLowerCase().includes(q));

    say('mthFactorCount', `${rows.length} of ${_d.factorStore.rowCount} factors`);
    setHtml('mthFactors', rows.length === 0 ? '<p class="mth-cap">No factor matched.</p>' : `
      <div class="mth-scroll"><table class="mth-table">
        <thead><tr><th scope="col">Factor</th><th scope="col">Value</th><th scope="col">Module</th>
                   <th scope="col">Tier</th><th scope="col">Source</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr><td class="mono">${esc(r.key)}</td>
              <td class="num">${esc(r.value)} <small>${esc(r.unit || '')}</small></td>
              <td>${esc(r.module)}</td>
              <td><span class="badge ${TIER_CLASS[r.tier] || ''}">${esc(r.tier)}</span></td>
              <td class="ig-src">${esc(r.reference || '—')}</td></tr>`).join('')}
        </tbody></table></div>`);
  }

  // ══ 6-9 ════════════════════════════════════════════════════
  function drawLimits() {
    const chip = o => /Sri Lanka|placeholder/i.test(o.why) ? 'SL factor gap'
      : /DISABLED/i.test(o.why) ? 'no defined module'
      : /LITERATURE|INDICATIVE/i.test(o.why) ? 'awaiting standard'
      : /interim/i.test(o.why) ? 'interim factor' : 'pending design data';

    /* Tiles clamp to two lines and expand in place. The full text is always
       in the DOM — it is disclosed progressively, never truncated away. */
    setHtml('mthLimits', [
      ..._d.limits.map(l => ({ head: l.area, what: l.limit, why: l.effect, chip: 'scope' })),
      ..._d.openItems.entries.map(o => ({ head: o.module, what: o.item, why: o.resolution, chip: chip(o) }))
    ].map(t => `
      <article class="tile">
        <div class="tile-head"><span class="badge badge-mod">${esc(t.head)}</span>
          <span class="tile-chip">${esc(t.chip)}</span></div>
        <p class="tile-what clamp2">${esc(t.what)}</p>
        <p class="mth-cap clamp2">${esc(t.why)}</p>
        <button type="button" class="tile-more" aria-expanded="false">more</button>
      </article>`).join(''));

    $('mthLimits').querySelectorAll('.tile-more').forEach(b =>
      b.addEventListener('click', () => {
        const open = b.getAttribute('aria-expanded') === 'true';
        b.setAttribute('aria-expanded', String(!open));
        b.closest('.tile').classList.toggle('is-expanded', !open);
        b.textContent = open ? 'more' : 'less';
      }));
  }

  /* ══ 7 · Data quality ═══════════════════════════════════════

     PCAF assigns ONE score per project, and decides it by which option was
     used to estimate the emissions (Table 5.3-2). It is not an average of
     anything, and it is never written "3 / 5" — that reads as a mark out of
     five and inverts a scale on which 1 is the best. The optional use stage
     carries no score at all, because the standard publishes no table for it.

     The per-input table survives as an internal aid, in words, fenced off
     and labelled, so it can point effort without being mistaken for the
     score. */

  const dqData = () => {
    const sc = scenarioFor(_policy);
    return { s: (sc && sc.dq) || _d.dqScoring, t: (sc && sc.dqStatement) || _d.dqStatement };
  };

  const scoreChip = v => v === null || v === undefined
    ? '<span class="dq-badge sc-na">not scored</span>'
    : `<span class="dq-badge sc-${Math.round(v)}"><b>${v}</b></span>`;

  function drawDqScoring() {
    const { s, t } = dqData();
    if (!s) return;

    setHtml('mthDqHeads', `
      <article class="dq-head">
        <p class="dq-head-label">Construction (A4 + A5) — the PCAF figure</p>
        <p class="dq-head-fig">${s.construction.score}<span> data quality score</span></p>
        <p class="mth-cap"><b>Option ${esc(s.construction.option)}</b> — ${esc(s.construction.optionLabel)}</p>
        <p class="mth-cap">${esc(s.scale)}</p>
      </article>
      <article class="dq-head is-na">
        <p class="dq-head-label">Use stage (B1 + B4 + B7)</p>
        <p class="dq-head-fig">—<span> not scored</span></p>
        <p class="mth-cap">${esc(s.useStage.reason)}</p>
        ${s.useStage.statements.length
          ? `<p class="dq-improve is-done"><b>basis</b> ${esc(s.useStage.statements[0])}</p>` : ''}
      </article>`);

    setHtml('mthDqWeight', `
      <div class="dq-wblock">
        <p class="dq-wtitle">Scope 3, reported apart from scopes 1 and 2</p>
        <table class="mth-table dq-wtable">
          <thead><tr><th>Insured scope</th><th>Option</th><th>Score</th></tr></thead>
          <tbody>
            <tr><td>Scope 1 and 2</td><td class="mono">${esc(s.byGhgScope.scope1and2.option)}</td>
                <td class="num">${scoreChip(s.byGhgScope.scope1and2.score)}</td></tr>
            <tr><td>Scope 3</td><td class="mono">${esc(s.byGhgScope.scope3.option)}</td>
                <td class="num">${scoreChip(s.byGhgScope.scope3.score)}</td></tr>
          </tbody></table>
        <p class="mth-cap">${esc(s.byGhgScope.note)}</p>
      </div>
      <div class="dq-wblock">
        <p class="dq-wtitle">Across a book</p>
        <div class="eq">${tokenise('weighted_score = sum(premium x score) / sum(premium)')}</div>
        <p class="mth-cap">${esc(s.portfolioBasis)}</p>
      </div>`);

    say('mthDqWhy', s.direction);

    /* Wrapped, like every other wide table here. Unwrapped it set the page
       width on a 360px handset instead of scrolling inside its own box. */
    setHtml('mthDqRubric', `<div class="mth-scroll"><table class="mth-table dq-53-2">
      <thead><tr><th>Option</th><th>Score</th><th>Data used to estimate the emissions</th></tr></thead>
      <tbody>${s.table.map(r => `
        <tr class="${r.option === s.construction.option ? 'is-selected' : ''}">
          <td class="mono">${esc(r.option)}</td><td class="num">${r.score}</td><td>${esc(r.data)}</td>
        </tr>`).join('')}</tbody></table></div>
      <p class="mth-cap">${esc(s.standard)} The highlighted row is the one the worked example used.</p>`);

    setHtml('mthDqInputs', `
      <p class="dq-aid-warning"><b>${esc(s.internalAid.title)}.</b> ${esc(s.internalAid.note)}</p>
      <table class="mth-table dq-itable">
        <thead><tr><th>Stage</th><th>Input</th><th>Insured scope</th><th>Basis actually used</th><th>Evidence</th><th>Source</th></tr></thead>
        <tbody>${s.internalAid.rows.map(i => `<tr class="${i.applies === false ? 'is-na' : ''}">
          <td class="mono">${esc(i.stage)}</td>
          <td>${esc(i.input)}</td>
          <td>${i.ghgScope === 'scope1and2' ? 'Scope 1 &amp; 2' : i.ghgScope === 'scope3' ? 'Scope 3' : '—'}</td>
          <td>${esc(i.basis)}</td>
          <td><span class="dq-strength s-${String(i.strength || 'na').toLowerCase()}">${esc(i.strength || 'not evaluated')}</span></td>
          <td>${esc(i.source)}</td>
        </tr>`).join('')}</tbody></table>`);

    say('mthDqStatement', t || '');
  }

  /* The option scale used to be drawn here as a coloured strip. Table 5.3-2
     above says the same thing with its rows, so this is left as a no-op
     rather than showing the reader two versions of one rule. */
  function drawQuality() {}

  function drawConformance() {
    const c = _d.conformance;
    setHtml('mthConfHead', `
      <p class="conf-count"><b>${c.summary.implemented || 0}</b> / ${c.summary.total} asserted</p>
      <article class="conf-feature">
        <span class="badge badge-pass">structural</span>
        <p>${esc(_d.scope.structuralEnforcement)}</p>
      </article>`);
    setHtml('mthConfGrid', c.rules.map((r, i) => `
      <button type="button" class="conf-dot ${r.status === 'implemented' ? 'is-pass' : 'is-part'}"
              data-rule="${i}" aria-label="${esc(r.id)}: ${esc(r.rule)}">
        <span class="mono">${esc(r.id.replace(/^C-/, ''))}</span></button>`).join(''));
    $('mthConfGrid').querySelectorAll('.conf-dot').forEach(b => {
      const show = () => {
        const r = c.rules[Number(b.dataset.rule)];
        setHtml('mthRulePop', `<b class="mono">${esc(r.id)}</b> <span>${esc(r.clause)}</span>
          <p>${esc(r.rule)}</p>
          <p class="ig-src">Enforced in ${esc(r.implementation)}</p>
          <p class="ig-src">Proven by ${esc(r.provingTest)}</p>`);
        $('mthRulePop').hidden = false;
      };
      b.addEventListener('mouseenter', show);
      b.addEventListener('focus', show);
      b.addEventListener('click', show);
    });
    say('mthConfDisclaimer', c.disclaimer);
  }

  function drawLabour() {
    const d = _d.divisionOfLabour;
    setHtml('mthLabour', `
      <article class="lab lab-engine"><h3>Engine</h3><p class="mth-cap clamp2">${esc(d.engine)}</p>
        <button type="button" class="tile-more" aria-expanded="false">more</button></article>
      <article class="lab lab-model"><h3>Language model</h3><p class="mth-cap clamp2">${esc(d.model)}</p>
        <button type="button" class="tile-more" aria-expanded="false">more</button></article>
      <p class="lab-rule">${esc(d.rule)}</p>`);

    $('mthLabour').querySelectorAll('.tile-more').forEach(b =>
      b.addEventListener('click', () => {
        const open = b.getAttribute('aria-expanded') === 'true';
        b.setAttribute('aria-expanded', String(!open));
        b.closest('.lab').classList.toggle('is-expanded', !open);
        b.textContent = open ? 'more' : 'less';
      }));
  }

  function wireCitation() {
    on('mthCiteChip', 'click', () => {
      const pop = $('mthCitePop'), chip = $('mthCiteChip');
      const open = pop.hidden;
      setHtml('mthCitePop', `<b>${esc(_d.standard)} — §5.3</b>
        <p>${esc(_d.scope.policyGate.rule)}</p>
        <p>${esc(_d.scope.exclusion)}</p>
        <p class="ig-src">The scope rule as implemented. Quoted clause text is not reproduced here.</p>`);
      pop.hidden = !open;
      chip.setAttribute('aria-expanded', String(open));
    });
  }

  // ── Contents, progress, theme ──────────────────────────────
  function buildToc() {
    const present = SECTIONS.filter(([id]) => $(id));
    setHtml('mthTocList', present.map(([id, l], i) =>
      `<li><a href="#${id}" data-sec="${id}"><span>${i + 1}</span>${esc(l)}</a></li>`).join(''));
    setHtml('mthTocSelect', present.map(([id, l], i) =>
      `<option value="${id}">${i + 1}. ${esc(l)}</option>`).join(''));
    on('mthTocSelect', 'change', e => {
      const el = $(e.target.value);
      if (el) el.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto', block: 'start' });
    });
    if ('IntersectionObserver' in window) {
      const spy = new IntersectionObserver(es => es.forEach(en => {
        if (!en.isIntersecting) return;
        document.querySelectorAll('#mthTocList a').forEach(a =>
          a.classList.toggle('is-current', a.dataset.sec === en.target.id));
        const sel = $('mthTocSelect');
        if (sel && sel.value !== en.target.id) sel.value = en.target.id;
      }), { rootMargin: '-20% 0px -70% 0px' });
      present.forEach(([id]) => spy.observe($(id)));
    }
  }

  function _scroller() {
    const main = document.querySelector('.main');
    if (main && main.scrollHeight > main.clientHeight + 2) return main;
    return document.scrollingElement || document.documentElement;
  }
  function trackProgress() {
    const bar = $('mthProgress'); if (!bar) return;
    const update = () => {
      const el = _scroller();
      const max = el.scrollHeight - el.clientHeight;
      bar.style.width = `${max > 0 ? Math.min(100, Math.max(0, (el.scrollTop / max) * 100)) : 0}%`;
    };
    window.addEventListener('scroll', update, { passive: true });
    const main = document.querySelector('.main');
    if (main) main.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  const THEME_KEY = 'carboniq_theme';
  function initTheme() {
    let t = null; try { t = localStorage.getItem(THEME_KEY); } catch (_) { /* private */ }
    if (t) document.documentElement.setAttribute('data-theme', t);
    on('mthTheme', 'click', () => {
      const cur = document.documentElement.getAttribute('data-theme')
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* private */ }
    });
  }

  async function download(format) {
    say('mthStatus', 'Building the statement…');
    try {
      const res = await window.CARBONIQ_fetch(`/v1/pcaf/part-c/methodology?format=${format}`);
      if (!res.ok) { let d = {}; try { d = await res.json(); } catch (_) { /* empty */ }
        throw new Error(d.message || `Request failed (${res.status})`); }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `pcaf-part-c-methodology.${format}`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      say('mthStatus', 'Downloaded.');
    } catch (err) { say('mthStatus', err.message); }
  }

  function renderAllForPrint() {
    if (!_d) return;
    document.querySelectorAll('#mthChain .mth-card-btn').forEach(b => {
      if (b.getAttribute('aria-expanded') !== 'true') toggleModule(b);
    });
  }

  async function init() {
    initTheme(); trackProgress();
    window.addEventListener('beforeprint', renderAllForPrint);
    on('mthRefresh', 'click', load);
    on('mthPdfBtn', 'click', () => download('pdf'));
    on('mthDocxBtn', 'click', () => download('docx'));
    on('mthFactorFilter', 'input', () => _d && drawFactors());
    on('mthYears', 'input', e => { _years = Number(e.target.value); updateReadout(); });
    on('mthTryYears', 'input', () => _d && tryYears());
    await load();
  }

  return { init, refresh: load, renderAllForPrint };
})();
