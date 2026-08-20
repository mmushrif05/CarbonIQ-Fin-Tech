/* ============================================================
   CarbonIQ — Methodology and Evidence

   Renders what the engine reports about itself: the scope rule
   applied, every equation executed, every factor consulted with
   its tier and source, how data quality is scored, which rules
   are claimed and what proves each one, and the limits.

   Nothing here is written into the page by hand. If the engine
   stops executing an equation, it stops appearing.
   ============================================================ */

const MethodologyPage = (() => {

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US',
    { minimumFractionDigits: d, maximumFractionDigits: d });
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

  let _data = null;

  const TIER_CLASS = { Local: 'mth-tier-local', Regional: 'mth-tier-regional', Global: 'mth-tier-global' };

  async function load() {
    say('mthStatus', 'Loading…');
    try {
      const res = await window.CARBONIQ_fetch('/v1/pcaf/part-c/methodology');
      let data = {};
      try { data = await res.json(); } catch (_) { /* empty */ }
      if (!res.ok) throw new Error([data.message, data.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
      _data = data.methodology;
      render(_data);
      $('mthBody').hidden = false;
      say('mthStatus', `${_data.provenance.auditSteps} traced steps · ${_data.factorStore.rowCount} factors · ${_data.conformance.summary.total} conformance rules`);
    } catch (err) {
      say('mthStatus', err.message);
    }
  }

  function render(m) {
    say('mthTitle', m.title);
    say('mthStandard', m.standard);
    say('mthClaim', m.provenance.claim);
    say('mthWhy', m.provenance.why);

    // 1 — scope
    setHtml('mthScope', `
      <table class="partc-table">
        <thead><tr><th>Tier</th><th>Modules</th><th>Treatment</th></tr></thead>
        <tbody>${m.scope.tiers.map(t => `
          <tr><td><span class="pill">${esc(t.tier)}</span></td>
              <td class="mono">${esc(t.modules)}</td><td>${esc(t.treatment)}</td></tr>`).join('')}
        </tbody></table>
      <p class="partc-hint">${esc(m.scope.exclusion)}</p>
      <h4 class="mth-sub">Policy gate</h4>
      <p>${esc(m.scope.policyGate.rule)}</p>
      <p>${esc(m.scope.policyGate.consequence)}</p>
      <p class="partc-hint">${esc(m.scope.policyGate.override)}</p>
      <p class="partc-scope-warning">${esc(m.scope.structuralEnforcement)}</p>`);

    /* 2 — the chain.
       The equation and what the module does are the summary, so they stay
       on the page. Only the step-by-step trace collapses: a reader should
       be able to read the whole method without clicking anything, and
       expand a module only to challenge a specific number. */
    setHtml('mthChain', m.calculationChain.map(c => `
      <div class="mth-module">
        <div class="mth-head">
          <span class="mth-mod">${esc(c.module)}</span>
          ${c.value !== null ? `<span class="mth-val">${fmt(c.value)} ${esc(c.unit || '')}</span>` : ''}
        </div>
        ${c.narrative ? `<p class="mth-narr">${esc(c.narrative)}</p>` : ''}
        ${c.equations.map(e => `<pre class="mth-eq">${esc(e)}</pre>`).join('')}
        <details class="mth-detail">
        <summary>Show the ${c.stepCount} traced step${c.stepCount === 1 ? '' : 's'}</summary>
        <table class="partc-table mth-trace">
          <thead><tr><th>#</th><th>Quantity</th><th>Inputs used</th><th>Result</th><th>Factor and source</th></tr></thead>
          <tbody>${c.steps.map(s => `
            <tr>
              <td class="num">${s.step}</td>
              <td>${esc(s.label)}</td>
              <td class="mono mth-inputs">${esc(Object.entries(s.inputs || {}).map(([k, v]) => `${k}=${v}`).join(', ')) || '—'}</td>
              <td class="num">${fmt(s.value)} ${esc(s.unit || '')}</td>
              <td>${s.factors.length ? s.factors.map(f => `
                    <div class="mth-fac"><span class="mono">${esc(f.key)}</span> = ${esc(f.value)} ${esc(f.unit || '')}
                    <span class="pill ${TIER_CLASS[f.tier] || ''}">${esc(f.tier)}</span>
                    ${f.fallback ? '<span class="pill mth-fallback">fallback</span>' : ''}
                    ${f.reference ? `<div class="mth-src">${esc(f.reference)}</div>` : ''}</div>`).join('') : '—'}</td>
            </tr>`).join('')}
          </tbody></table>
        </details>
      </div>`).join(''));

    /* 3 — the gate, demonstrated.
       A use stage of zero on a construction policy tells a reviewer nothing
       on its own: they cannot see whether the rule ran or the module is
       missing. Running the same project under both cover types, and showing
       both, is the difference between asserting the rule and proving it. */
    const g = m.policyGate;
    say('mthGateDesign', g.design);
    setHtml('mthGate', `
      <table class="partc-table">
        <thead><tr><th>Measure</th><th>CAR (construction cover)</th><th>IDI (cover into occupation)</th><th></th></tr></thead>
        <tbody>${g.rows.map(r => `
          <tr>
            <td>${esc(r.measure)}${r.note ? `<div class="mth-src">${esc(r.note)}</div>` : ''}</td>
            <td class="num">${typeof r.CAR === 'number' ? fmt(r.CAR, r.CAR < 1 && r.CAR > 0 ? 6 : 2) : esc(r.CAR)}</td>
            <td class="num">${typeof r.IDI === 'number' ? fmt(r.IDI, r.IDI < 1 && r.IDI > 0 ? 6 : 2) : esc(r.IDI)}</td>
            <td>${r.identical ? '<span class="pill mth-same">identical</span>' : '<span class="pill mth-differs">differs</span>'}</td>
          </tr>`).join('')}
        </tbody></table>`);

    setHtml('mthGateOverride', `
      <p>${esc(g.overrideTest.description)}</p>
      <table class="partc-table"><tbody>
        <tr><td>Use-stage years the gate admits</td><td class="num">${g.overrideTest.useStageYears}</td></tr>
        <tr class="total"><td>Use stage computed</td><td class="num">${fmt(g.overrideTest.useStage_kgCO2e)} kgCO₂e</td></tr>
      </tbody></table>
      <p class="partc-scope-warning">${esc(g.overrideTest.conclusion)}</p>`);

    setHtml('mthGateSens', `
      <table class="partc-table">
        <thead><tr><th>Cover entered</th><th>Gate admits</th><th>B1</th><th>B4</th><th>B7</th><th>Use stage</th></tr></thead>
        <tbody>${g.coverSensitivity.map(c => `
          <tr><td class="num">${c.yearsOfCover} y</td><td class="num">${c.gateYears} y</td>
              <td class="num">${fmt(c.b1)}</td>
              <td class="num${c.b4 > 0 ? ' mth-step' : ''}">${fmt(c.b4)}</td>
              <td class="num">${fmt(c.b7)}</td>
              <td class="num">${fmt(c.useStage)}</td></tr>`).join('')}
        </tbody></table>`);
    say('mthGateSensNote', g.sensitivityNote);

    // 4 — worked example
    say('mthWorkedNote', m.workedExample.note);
    setHtml('mthWorked', `
      <table class="partc-table"><tbody>
        <tr><td>Construction (A4 + A5) — the PCAF figure</td><td class="num">${fmt(m.workedExample.construction_kgCO2e)} kgCO₂e</td></tr>
        <tr><td>Use stage (B1 + B4 + B7) — separate line</td><td class="num">${fmt(m.workedExample.useStage_kgCO2e)} kgCO₂e</td></tr>
        <tr><td>Attribution factor</td><td class="num">${m.workedExample.attributionFactor.toFixed(6)}</td></tr>
        <tr class="total"><td>Insurer's attributed share</td><td class="num">${m.workedExample.insurerIAE_tCO2e.toFixed(4)} tCO₂e</td></tr>
        <tr><td>Per-m² construction factor</td><td class="num">${fmt(m.workedExample.perM2Factor_kgCO2e_m2)} kgCO₂e/m²</td></tr>
      </tbody></table>
      <p class="partc-scope-warning">${esc(m.workedExample.scopeWarning)}</p>`);

    // 4 — factors
    say('mthFactorNote', m.factorStore.note);
    renderFactors(m.factorStore.rows);

    // 5 — data quality
    setHtml('mthDq', `
      <table class="partc-table">
        <thead><tr><th>PCAF option</th><th>Score</th><th>Meaning</th></tr></thead>
        <tbody>${m.dataQuality.options.map(o => `
          <tr><td class="mono">${esc(o.option)}</td><td class="num">${o.score}</td><td>${esc(o.label || '')}</td></tr>`).join('')}
        </tbody></table>
      <p class="partc-hint">${esc(m.dataQuality.scale)}</p>
      <h4 class="mth-sub">Aggregating across a book</h4>
      <pre class="mth-eq">${esc(m.dataQuality.aggregation)}</pre>
      <p>${esc(m.dataQuality.whyWeighted)}</p>
      <p class="partc-hint">${esc(m.dataQuality.tierRule)}</p>`);

    // 6 — conformance
    say('mthConfNote', m.conformance.antiRot);
    setHtml('mthConformance', `
      <p>${esc(m.conformance.statement)}</p>
      <p class="partc-scope-warning">${esc(m.conformance.disclaimer)}</p>
      <table class="partc-table">
        <thead><tr><th>ID</th><th>Clause</th><th>Rule</th><th>Enforced in</th><th>Proven by</th></tr></thead>
        <tbody>${m.conformance.rules.map(r => `
          <tr><td class="mono">${esc(r.id)}</td><td>${esc(r.clause)}</td><td>${esc(r.rule)}</td>
              <td class="mono mth-src">${esc(r.implementation)}</td>
              <td class="mono mth-src">${esc(r.provingTest)}</td></tr>`).join('')}
        </tbody></table>`);

    // 7 — limits
    setHtml('mthLimits', m.limits.map(l => `
      <div class="mth-limit">
        <strong>${esc(l.area)}</strong>
        <p>${esc(l.limit)}</p>
        <p class="partc-hint">${esc(l.effect)}</p>
      </div>`).join(''));

    // 8 — division of labour
    setHtml('mthLabour', `
      <table class="partc-table">
        <thead><tr><th>Performed by</th><th>Responsibility</th></tr></thead>
        <tbody>
          <tr><td>The calculation engine</td><td>${esc(m.divisionOfLabour.engine)}</td></tr>
          <tr><td>The language model</td><td>${esc(m.divisionOfLabour.model)}</td></tr>
        </tbody></table>
      <p class="partc-scope-warning">${esc(m.divisionOfLabour.rule)}</p>`);
  }

  function renderFactors(rows) {
    say('mthFactorCount', `${rows.length} factor${rows.length === 1 ? '' : 's'} shown`);
    setHtml('mthFactors', rows.length === 0
      ? '<p class="partc-hint">No factors matched.</p>'
      : `<table class="partc-table">
           <thead><tr><th>Factor</th><th>Value</th><th>Tier</th><th>Source</th></tr></thead>
           <tbody>${rows.map(r => `
             <tr><td class="mono">${esc(r.key)}</td>
                 <td class="num">${esc(r.value)} ${esc(r.unit || '')}</td>
                 <td><span class="pill ${TIER_CLASS[r.tier] || ''}">${esc(r.tier)}</span></td>
                 <td class="mth-src">${esc(r.reference || '—')}</td></tr>`).join('')}
           </tbody></table>`);
  }

  function filterFactors() {
    if (!_data) return;
    const q = ($('mthFactorFilter').value || '').toLowerCase().trim();
    const rows = !q ? _data.factorStore.rows : _data.factorStore.rows.filter(r =>
      String(r.key).toLowerCase().includes(q) || String(r.reference || '').toLowerCase().includes(q));
    renderFactors(rows);
  }

  /* Streamed as a blob rather than opened in a tab: the request carries the
     API key in a header, so a plain link would arrive unauthenticated. */
  async function download(format) {
    say('mthStatus', `Building the methodology statement…`);
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

  async function init() {
    on('mthRefresh', 'click', load);
    on('mthPdfBtn', 'click', () => download('pdf'));
    on('mthDocxBtn', 'click', () => download('docx'));
    on('mthFactorFilter', 'input', filterFactors);
    await load();
  }

  return { init };
})();
