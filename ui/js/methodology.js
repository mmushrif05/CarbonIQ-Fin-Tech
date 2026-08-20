/* ============================================================
   CarbonIQ — Methodology & Evidence

   Renders what the engine reports about itself. Every figure,
   equation, factor and count comes from a live execution over
   the API — nothing is written into the page by hand, so the
   page cannot describe a method the engine does not run.
   ============================================================ */

const MethodologyPage = (() => {

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US',
    { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = v => typeof v === 'number' ? fmt(v, v !== 0 && Math.abs(v) < 1 ? 6 : 2) : esc(v);
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

  const TIER_CLASS = { Local: 'tier-local', Regional: 'tier-regional', Global: 'tier-global' };
  const SECTIONS = [
    ['sec-scope', 'Scope & boundary'],
    ['sec-chain', 'The calculation chain'],
    ['sec-factors', 'Factors & sources'],
    ['sec-limits', 'Limits & open items'],
    ['sec-quality', 'Data quality'],
    ['sec-conformance', 'Conformance'],
    ['sec-labour', 'Division of labour']
  ];

  let _data = null;
  let _tierFilter = 'all';

  // ── Data ───────────────────────────────────────────────────
  async function load() {
    say('mthStatus', 'Reading the engine…');
    try {
      const res = await window.CARBONIQ_fetch('/v1/pcaf/part-c/methodology');
      let d = {};
      try { d = await res.json(); } catch (_) { /* empty */ }
      if (!res.ok) throw new Error([d.message, d.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
      _data = d.methodology;
      render(_data);
      $('mthBody').hidden = false;
      say('mthStatus', 'Generated from a live execution.');
    } catch (err) {
      say('mthStatus', err.message);
    }
  }

  // ── Render ─────────────────────────────────────────────────
  function render(m) {
    setHtml('mthChips', [
      [m.provenance.auditSteps, 'traced steps'],
      [m.factorStore.rowCount, 'factors'],
      [m.factorStore.tables, 'factor tables'],
      [m.conformance.summary.total, 'conformance rules'],
      [m.openItems.total, 'open items']
    ].map(([n, l]) => `<span class="mth-chip"><b>${n}</b> ${esc(l)}</span>`).join(''));

    say('mthProvClaim', m.provenance.claim);
    say('mthProvWhy', m.provenance.why);

    renderScope(m);
    renderGate(m.policyGate);
    renderChain(m.calculationChain);
    renderWorked(m.workedExample);
    renderFactors(m);
    renderLimits(m);
    renderQuality(m.dataQuality);
    renderConformance(m.conformance);
    renderLabour(m.divisionOfLabour);
    buildToc();
  }

  /* The tier diagram carries the argument of the whole page, so it is drawn
     rather than tabulated: tier 3 sits below a dashed boundary because it
     genuinely cannot reach the reported figure. */
  function renderScope(m) {
    const cls = ['tier-1', 'tier-2', 'tier-3'];
    setHtml('mthTiers', m.scope.tiers.map((t, i) => `
      ${i === 2 ? '<div class="mth-tier-break" aria-hidden="true"><span>excluded from the PCAF figure</span></div>' : ''}
      <div class="mth-tier ${cls[i]}">
        <div class="mth-tier-label">
          <span class="mth-tier-name">${esc(t.tier)}</span>
          <span class="mth-tier-mods">${esc(t.modules)}</span>
        </div>
        <p>${esc(t.treatment)}</p>
      </div>`).join(''));

    say('mthScopeExclusion', m.scope.exclusion);
    say('mthGateRule', m.scope.policyGate.rule);
    say('mthGateConsequence', m.scope.policyGate.consequence);
    say('mthGateOverrideRule', m.scope.policyGate.override);
    setHtml('mthGuarantee', `<strong>Structural guarantee</strong><p>${esc(m.scope.structuralEnforcement)}</p>`);
    say('mthGateCite', `${m.standard} — §5.3.`);
  }

  function renderGate(g) {
    say('mthGateDesign', g.design);
    setHtml('mthGate', `
      <table class="mth-table">
        <thead><tr><th scope="col">Measure</th><th scope="col">CAR — construction cover</th>
                   <th scope="col">IDI — cover into occupation</th><th scope="col"></th></tr></thead>
        <tbody>${g.rows.map(r => `
          <tr>
            <td>${esc(r.measure)}${r.note ? `<span class="mth-src">${esc(r.note)}</span>` : ''}</td>
            <td class="num">${num(r.CAR)}</td>
            <td class="num">${num(r.IDI)}</td>
            <td>${r.identical ? '<span class="badge badge-same">identical</span>'
                              : '<span class="badge badge-diff">differs</span>'}</td>
          </tr>`).join('')}
        </tbody></table>`);

    setHtml('mthGateOverride', `
      <p>${esc(g.overrideTest.description)}</p>
      <table class="mth-table mth-mini"><tbody>
        <tr><td>Use-stage years the gate admits</td><td class="num">${g.overrideTest.useStageYears}</td></tr>
        <tr><td>Use stage computed</td><td class="num">${fmt(g.overrideTest.useStage_kgCO2e)} kgCO₂e</td></tr>
      </tbody></table>
      <p class="mth-feature">${esc(g.overrideTest.conclusion)}</p>`);

    setHtml('mthGateSens', `
      <table class="mth-table">
        <thead><tr><th scope="col">Cover entered</th><th scope="col">Gate admits</th>
                   <th scope="col">B1</th><th scope="col">B4</th><th scope="col">B7</th>
                   <th scope="col">Use stage</th></tr></thead>
        <tbody>${g.coverSensitivity.map(c => `
          <tr><td class="num">${c.yearsOfCover} y</td><td class="num">${c.gateYears} y</td>
              <td class="num">${fmt(c.b1)}</td>
              <td class="num${c.b4 > 0 ? ' mth-step' : ''}">${fmt(c.b4)}</td>
              <td class="num">${fmt(c.b7)}</td>
              <td class="num">${fmt(c.useStage)}</td></tr>`).join('')}
        </tbody></table>`);
    say('mthGateSensNote', g.sensitivityNote);
  }

  /* Module cards. Bodies render lazily on first open: the full trace is 58
     rows of tables and building them all up front costs a visible pause on
     a phone for content most readers never expand. */
  function renderChain(chain) {
    setHtml('mthChain', chain.map((c, i) => `
      <article class="mth-card" data-mod="${i}">
        <h3>
          <button type="button" class="mth-card-btn" aria-expanded="false" aria-controls="modbody-${i}">
            <span class="mth-chev" aria-hidden="true"></span>
            <span class="mono mth-code">${esc(c.module)}</span>
            <span class="mth-card-title">${esc(firstSentence(c.narrative) || 'Calculation step')}</span>
            <span class="mth-card-val">${c.value !== null ? `${fmt(c.value)} <small>${esc(c.unit || '')}</small>` : ''}</span>
          </button>
        </h3>
        ${c.equations.map(e => `
          <div class="mth-eqrow">
            <pre class="mth-eq">${esc(e)}</pre>
            <button type="button" class="mth-copy" data-copy="${esc(e)}" aria-label="Copy equation">copy</button>
          </div>`).join('')}
        <p class="mth-traced"><span class="dot" aria-hidden="true"></span>traced from execution · ${c.stepCount} step${c.stepCount === 1 ? '' : 's'}</p>
        <div class="mth-card-body" id="modbody-${i}" hidden></div>
      </article>`).join(''));

    $('mthChain').querySelectorAll('.mth-card-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleModule(btn, chain));
    });
    $('mthChain').querySelectorAll('.mth-copy').forEach(b => {
      b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'copied'; }
        catch (_) { b.textContent = 'select it'; }
        setTimeout(() => { b.textContent = 'copy'; }, 1600);
      });
    });
  }

  function toggleModule(btn, chain) {
    const card = btn.closest('.mth-card');
    const body = card.querySelector('.mth-card-body');
    const open = btn.getAttribute('aria-expanded') === 'true';

    if (!open && !body.dataset.rendered) {
      const c = chain[Number(card.dataset.mod)];
      body.innerHTML = `
        ${c.narrative ? `<p class="mth-narr">${esc(c.narrative)}</p>` : ''}
        <div class="mth-scroll">
        <table class="mth-table">
          <thead><tr><th scope="col">#</th><th scope="col">Quantity</th><th scope="col">Inputs used</th>
                     <th scope="col">Result</th><th scope="col">Factor &amp; source</th></tr></thead>
          <tbody>${c.steps.map(s => `
            <tr>
              <td class="num">${s.step}</td>
              <td>${esc(s.label)}</td>
              <td class="mono mth-inputs">${esc(Object.entries(s.inputs || {}).map(([k, v]) => `${k}=${v}`).join(', ')) || '—'}</td>
              <td class="num">${fmt(s.value)} <small>${esc(s.unit || '')}</small></td>
              <td>${s.factors.length ? s.factors.map(f => `
                    <div class="mth-fac"><span class="mono">${esc(f.key)}</span> = ${esc(f.value)} ${esc(f.unit || '')}
                    <span class="badge ${TIER_CLASS[f.tier] || ''}">${esc(f.tier)}</span>
                    ${f.fallback ? '<span class="badge badge-fallback">fallback</span>' : ''}
                    ${f.reference ? `<span class="mth-src">${esc(f.reference)}</span>` : ''}</div>`).join('') : '—'}</td>
            </tr>`).join('')}
          </tbody></table></div>`;
      body.dataset.rendered = '1';
    }

    btn.setAttribute('aria-expanded', String(!open));
    body.hidden = open;
    card.classList.toggle('is-open', !open);
  }

  function renderWorked(w) {
    say('mthWorkedNote', w.note);
    setHtml('mthWorked', `
      <table class="mth-table mth-mini"><tbody>
        <tr><td>Construction A4 + A5 — the PCAF figure</td><td class="num">${fmt(w.construction_kgCO2e)} kgCO₂e</td></tr>
        <tr><td>Use stage B1 + B4 + B7 — separate line</td><td class="num">${fmt(w.useStage_kgCO2e)} kgCO₂e</td></tr>
        <tr><td>Attribution factor</td><td class="num">${w.attributionFactor.toFixed(6)}</td></tr>
        <tr class="is-total"><td>Insurer's attributed share</td><td class="num">${w.insurerIAE_tCO2e.toFixed(4)} tCO₂e</td></tr>
        <tr><td>Per-m² construction factor</td><td class="num">${fmt(w.perM2Factor_kgCO2e_m2)} kgCO₂e/m²</td></tr>
      </tbody></table>
      <p class="mth-feature">${esc(w.scopeWarning)}</p>`);
  }

  function renderFactors(m) {
    say('mthFactorNote', m.factorStore.note);
    const tiers = ['all', ...Object.keys(m.factorStore.byTier).sort()];
    setHtml('mthTierSeg', tiers.map(t => `
      <button type="button" class="mth-seg-btn${t === _tierFilter ? ' is-on' : ''}" data-tier="${esc(t)}"
              aria-pressed="${t === _tierFilter}">
        ${t === 'all' ? 'All' : esc(t)}${t !== 'all' ? ` <b>${m.factorStore.byTier[t]}</b>` : ''}
      </button>`).join(''));
    $('mthTierSeg').querySelectorAll('.mth-seg-btn').forEach(b =>
      b.addEventListener('click', () => { _tierFilter = b.dataset.tier; renderFactors(_data); }));
    drawFactorTable();
  }

  function drawFactorTable() {
    const q = (($('mthFactorFilter') || {}).value || '').toLowerCase().trim();
    let rows = _data.factorStore.rows;
    if (_tierFilter !== 'all') rows = rows.filter(r => r.tier === _tierFilter);
    if (q) rows = rows.filter(r =>
      String(r.key).toLowerCase().includes(q) ||
      String(r.reference || '').toLowerCase().includes(q) ||
      String(r.table).toLowerCase().includes(q));

    say('mthFactorCount', `${rows.length} of ${_data.factorStore.rowCount} factors shown`);

    // Grouped by the module each table feeds, so a reviewer can read the
    // evidence in the same order as the calculation chain.
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.module)) groups.set(r.module, []);
      groups.get(r.module).push(r);
    }

    setHtml('mthFactors', rows.length === 0
      ? '<p class="mth-hint">No factor matched.</p>'
      : [...groups.entries()].map(([mod, rs]) => `
          <h3 class="mth-grouphead">${esc(mod)} <small>${rs.length}</small></h3>
          <div class="mth-scroll">
          <table class="mth-table">
            <thead><tr><th scope="col">Factor</th><th scope="col">Value</th>
                       <th scope="col">Tier</th><th scope="col">Source</th></tr></thead>
            <tbody>${rs.map(r => `
              <tr><td class="mono">${esc(r.key)}<span class="mth-src">${esc(r.table)}</span></td>
                  <td class="num">${esc(r.value)} <small>${esc(r.unit || '')}</small></td>
                  <td><span class="badge ${TIER_CLASS[r.tier] || ''}">${esc(r.tier)}</span></td>
                  <td>${esc(r.reference || '—')}</td></tr>`).join('')}
            </tbody></table></div>`).join(''));
  }

  function renderLimits(m) {
    setHtml('mthLimits', m.limits.map(l => `
      <article class="mth-limit">
        <h3>${esc(l.area)}</h3>
        <p class="mth-limit-what">${esc(l.limit)}</p>
        <p class="mth-hint">${esc(l.effect)}</p>
      </article>`).join(''));

    setHtml('mthOpenItems', m.openItems.entries.map(o => `
      <article class="mth-open">
        <div class="mth-open-head">
          <span class="badge badge-mod">${esc(o.module)}</span>
          <span class="mono">${esc(o.item)}</span>
        </div>
        <p class="mth-hint"><b>Why it is a limit.</b> ${esc(o.why)}</p>
        <p class="mth-hint"><b>Intended resolution.</b> ${esc(o.resolution)}</p>
      </article>`).join(''));
  }

  function renderQuality(dq) {
    setHtml('mthDq', `
      <div class="mth-scroll">
      <table class="mth-table">
        <thead><tr><th scope="col">PCAF option</th><th scope="col">Score</th><th scope="col">Meaning</th></tr></thead>
        <tbody>${dq.options.map(o => `
          <tr><td class="mono">${esc(o.option)}</td><td class="num">${o.score}</td>
              <td>${esc(o.label || '')}</td></tr>`).join('')}
        </tbody></table></div>
      <p class="mth-hint">${esc(dq.scale)}</p>
      <h3>Across a book</h3>
      <pre class="mth-eq">${esc(dq.aggregation)}</pre>
      <p>${esc(dq.whyWeighted)}</p>
      <p class="mth-hint">${esc(dq.tierRule)}</p>`);
  }

  function renderConformance(c) {
    say('mthConfLede', c.statement);
    setHtml('mthConfAntiRot', `<strong>The claim cannot rot</strong><p>${esc(c.antiRot)}</p>`);
    say('mthConfDisclaimer', c.disclaimer);
    setHtml('mthConformance', c.rules.map(r => `
      <article class="mth-rule">
        <div class="mth-rule-head">
          <span class="mth-tick ${r.status === 'implemented' ? 'is-pass' : 'is-part'}" aria-hidden="true"></span>
          <span class="mono mth-code">${esc(r.id)}</span>
          <span class="mth-rule-clause">${esc(r.clause)}</span>
          <span class="badge ${r.status === 'implemented' ? 'badge-pass' : 'badge-part'}">${esc(r.status)}</span>
        </div>
        <p>${esc(r.rule)}</p>
        <p class="mth-src"><b>Enforced in</b> ${esc(r.implementation)}</p>
        <p class="mth-src"><b>Proven by</b> ${esc(r.provingTest)}</p>
      </article>`).join(''));
  }

  function renderLabour(d) {
    setHtml('mthLabour', `
      <div class="mth-labour">
        <article><h3>The calculation engine</h3><p>${esc(d.engine)}</p></article>
        <article><h3>The language model</h3><p>${esc(d.model)}</p></article>
      </div>
      <p class="mth-feature">${esc(d.rule)}</p>`);
  }

  // ── Contents, scroll-spy and progress ──────────────────────
  function buildToc() {
    const present = SECTIONS.filter(([id]) => $(id));
    setHtml('mthTocList', present.map(([id, label], i) =>
      `<li><a href="#${id}" data-sec="${id}"><span>${i + 1}</span>${esc(label)}</a></li>`).join(''));
    setHtml('mthTocSelect', present.map(([id, label], i) =>
      `<option value="${id}">${i + 1}. ${esc(label)}</option>`).join(''));

    on('mthTocSelect', 'change', e => {
      const el = $(e.target.value);
      if (el) el.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto', block: 'start' });
    });

    if ('IntersectionObserver' in window) {
      const spy = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          document.querySelectorAll('#mthTocList a').forEach(a =>
            a.classList.toggle('is-current', a.dataset.sec === en.target.id));
          const sel = $('mthTocSelect');
          if (sel && sel.value !== en.target.id) sel.value = en.target.id;
        });
      }, { rootMargin: '-20% 0px -70% 0px' });
      present.forEach(([id]) => spy.observe($(id)));
    }

    // Reveal on scroll-in, unless the reader has asked for less motion.
    if (motionOK() && 'IntersectionObserver' in window) {
      const reveal = new IntersectionObserver((entries, obs) => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          en.target.classList.add('is-in');
          obs.unobserve(en.target);
        });
      }, { rootMargin: '0px 0px -8% 0px' });
      document.querySelectorAll('.mth-section').forEach(s => { s.classList.add('will-reveal'); reveal.observe(s); });
    }
  }

  const motionOK = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Which element scrolls depends on the shell: in this app the document
     scrolls, but a shell that gives its main column its own overflow would
     scroll that instead. Resolve it at read time and take whichever is
     actually scrollable, rather than assuming one and reporting 0%. */
  function _scroller() {
    const main = document.querySelector('.main');
    if (main && main.scrollHeight > main.clientHeight + 2) return main;
    return document.scrollingElement || document.documentElement;
  }

  function trackProgress() {
    const bar = $('mthProgress');
    if (!bar) return;
    const update = () => {
      const el = _scroller();
      const max = el.scrollHeight - el.clientHeight;
      bar.style.width = `${max > 0 ? Math.min(100, Math.max(0, (el.scrollTop / max) * 100)) : 0}%`;
    };
    // Listen on both: a document scroll surfaces on window, a container
    // scroll only on the container itself.
    window.addEventListener('scroll', update, { passive: true });
    const main = document.querySelector('.main');
    if (main) main.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // ── Theme ──────────────────────────────────────────────────
  const THEME_KEY = 'carboniq_theme';
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (_) { /* private mode */ }
  }
  function initTheme() {
    let t = null;
    try { t = localStorage.getItem(THEME_KEY); } catch (_) { /* private mode */ }
    if (t) document.documentElement.setAttribute('data-theme', t);
    on('mthTheme', 'click', () => {
      const cur = document.documentElement.getAttribute('data-theme')
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
  }

  // ── Downloads ──────────────────────────────────────────────
  /* Streamed as a blob: the request carries the API key in a header, so a
     plain link would arrive unauthenticated. */
  async function download(format) {
    say('mthStatus', 'Building the methodology statement…');
    try {
      const res = await window.CARBONIQ_fetch(`/v1/pcaf/part-c/methodology?format=${format}`);
      if (!res.ok) {
        let d = {}; try { d = await res.json(); } catch (_) { /* empty */ }
        throw new Error(d.message || `Request failed (${res.status})`);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `pcaf-part-c-methodology.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      say('mthStatus', 'Methodology statement downloaded.');
    } catch (err) {
      say('mthStatus', err.message);
    }
  }

  /* Module bodies render on first open, so a print of an untouched page
     would emit empty cards. Render them all before the print dialog opens. */
  function renderAllForPrint() {
    if (!_data) return;
    document.querySelectorAll('#mthChain .mth-card-btn').forEach(btn => {
      if (btn.getAttribute('aria-expanded') !== 'true') toggleModule(btn, _data.calculationChain);
    });
  }

  async function init() {
    initTheme();
    trackProgress();
    window.addEventListener('beforeprint', renderAllForPrint);
    if (window.matchMedia) {
      const mq = window.matchMedia('print');
      if (mq.addEventListener) mq.addEventListener('change', e => { if (e.matches) renderAllForPrint(); });
    }
    on('mthRefresh', 'click', load);
    on('mthPdfBtn', 'click', () => download('pdf'));
    on('mthDocxBtn', 'click', () => download('docx'));
    on('mthFactorFilter', 'input', () => _data && drawFactorTable());
    await load();
  }

  const firstSentence = t => t ? String(t).split(/(?<=\.)\s/)[0] : '';

  return { init, refresh: load, renderAllForPrint };
})();
