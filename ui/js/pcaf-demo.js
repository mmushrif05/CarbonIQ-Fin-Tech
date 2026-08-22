/* ============================================================
   CarbonIQ — PCAF Part C: Live Walkthrough

   A guided console onto the Part C engine, built for a reader who has to
   decide whether to believe the figures. Three rules govern it:

     Every figure is fetched, never remembered. A call that fails leaves the
     panel empty with the cause on screen; no stale value is dressed as a
     live one.

     Every call is inspectable. The log drawer holds the request line, the
     status, the round trip and the raw response for every call the page has
     made — a claim a reviewer cannot check is one they are right to discount.

     This page computes nothing. It formats what the API returns. There is no
     arithmetic here that could disagree with the engine, because there is no
     arithmetic here at all.

   The walkthrough runs in six steps, and the fifth is the point of it: the
   engine is run twice, once as it stands and once with a single thing
   changed, and BOTH halves of the answer are reported. What did not move is
   as much a result as what did — a data-quality score that holds when an EPD
   is added is the standard working correctly, and it is the half that every
   other telling of this leaves out.
   ============================================================ */

const PCAFDemoPage = (() => {
  'use strict';

  /* ── The worked example ───────────────────────────────────
     A real Sri Lankan fisheries complex, the same input the acceptance
     tests run against. It is INPUT, not results: every figure on screen
     still comes back from the engine. */
  const PRESET = {
    "projectName": "Fisheries Complex — Sri Lanka",
    "policy": {
      "policyType": "CAR",
      "basis": "project_specific",
      "premium": 24448.16,
      "projectCost": 6499442
    },
    "materials": [
      {
        "id": "concrete",
        "name": "Concrete (all grades)",
        "quantity": 18.65,
        "unit": "m3",
        "densityKey": "concrete_normal",
        "wasteCategory": "Concrete in situ",
        "serviceLifeCategory": "Structure"
      },
      {
        "id": "rubble",
        "name": "Rubble masonry (stone)",
        "quantity": 6,
        "unit": "m3",
        "densityKey": "rubble_masonry",
        "wasteCategory": "Stone (cladding)",
        "serviceLifeCategory": "Structure"
      },
      {
        "id": "timber_dw",
        "name": "Timber doors/windows",
        "quantity": 32.3,
        "unit": "m2",
        "massFactorKey": "timber_door",
        "wasteCategory": "Timber frames (beams, columns, joists, braces)",
        "serviceLifeCategory": "Timber joinery"
      },
      {
        "id": "tiles",
        "name": "Ceramic/porcelain tiles",
        "quantity": 22,
        "unit": "m2",
        "massFactorKey": "ceramic_tile",
        "wasteCategory": "Floor finish (tile)",
        "serviceLifeCategory": "Ceramic tile"
      },
      {
        "id": "timber_cup",
        "name": "Timber cupboards",
        "quantity": 0.5,
        "unit": "m3",
        "densityKey": "timber",
        "wasteCategory": "Timber frames (beams, columns, joists, braces)",
        "serviceLifeCategory": "Timber joinery"
      },
      {
        "id": "ms_grills",
        "name": "MS grills (mild steel)",
        "quantity": 12,
        "unit": "m2",
        "massFactorKey": "ms_grill",
        "wasteCategory": "Steel frame (beams, columns, braces)",
        "serviceLifeCategory": "MS grills"
      },
      {
        "id": "aluminium",
        "name": "Aluminium (doors/cladding)",
        "quantity": 8.8,
        "unit": "m2",
        "massFactorKey": "aluminium_sheet",
        "wasteCategory": "Aluminium extruded profiles/frames",
        "serviceLifeCategory": "Aluminium"
      },
      {
        "id": "rebar",
        "name": "Reinforcement steel (Tor)",
        "quantity": 0.05,
        "unit": "MT",
        "massFactorKey": "steel_mt",
        "wasteCategory": "Steel reinforcement",
        "serviceLifeCategory": "Structure"
      },
      {
        "id": "pvc110",
        "name": "PVC pipe 110mm",
        "quantity": 22.8,
        "unit": "m",
        "massFactorKey": "pvc_110mm",
        "wasteCategory": "PVC pipework (not in T18)",
        "serviceLifeCategory": "PVC pipework"
      },
      {
        "id": "pvc63",
        "name": "PVC pipe 63mm",
        "quantity": 14,
        "unit": "m",
        "massFactorKey": "pvc_63mm",
        "wasteCategory": "PVC pipework (not in T18)",
        "serviceLifeCategory": "PVC pipework"
      }
    ],
    "distances": {
      "concrete": {
        "road": 25
      },
      "rubble": {
        "road": 25
      },
      "timber_dw": {
        "road": 60
      },
      "tiles": {
        "road": 130,
        "sea": 3000
      },
      "timber_cup": {
        "road": 60
      },
      "ms_grills": {
        "road": 40
      },
      "aluminium": {
        "road": 130,
        "sea": 3500
      },
      "rebar": {
        "road": 130,
        "sea": 3000
      },
      "pvc110": {
        "road": 40
      },
      "pvc63": {
        "road": 40
      }
    },
    "siteInputs": {
      "gifa_m2": 1000,
      "demolitionKm": 100,
      "wasteDisposalKm": 40,
      "demolitionItems": [
        {
          "name": "Concrete (demolished)",
          "quantity": 6,
          "unit": "m3",
          "densityKey": "concrete_normal"
        },
        {
          "name": "Brickwork (demolished)",
          "quantity": 3,
          "unit": "m3",
          "densityKey": "brickwork"
        },
        {
          "name": "Brick-paved floor (demolished)",
          "quantity": 130,
          "unit": "m2",
          "massFactor": 100
        },
        {
          "name": "Glazed tiles (demolished)",
          "quantity": 32,
          "unit": "m2",
          "massFactor": 20
        }
      ],
      "previousProject": {
        "area_m2": 1000,
        "fuel_L": 5000,
        "electricity_kWh": 2400,
        "durationMonths": 12
      }
    },
    "useStage": {},
    "hasEPD": false,
    "context": {
      "region": "Sri Lanka",
      "projectType": "Fisheries complex"
    }
  };

  const STEPS = 6;
  const $ = id => document.getElementById(id);

  const esc = t => String(t ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const num = (v, d = 2) => (v === null || v === undefined || !isFinite(v))
    ? '—'
    : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  const clone = o => JSON.parse(JSON.stringify(o));

  /* ── State ────────────────────────────────────────────────
     `input` is what the user has edited; `result` is the last answer the
     engine gave for it. They are never merged, so a stale result cannot be
     read as belonging to edited input. */
  let input   = null;
  let result  = null;
  let step    = 1;
  let calls   = [];
  let seq     = 0;
  let pending = 0;
  let debounce = null;

  // ─────────────────────────────────────────────────────────
  // The wire
  // ─────────────────────────────────────────────────────────

  /* A key is a credential, not a demonstration: only its prefix and length
     are ever drawn, so the log can be opened on a projector. */
  function maskKey(k) {
    const s = String(k || '');
    return s ? `${s.slice(0, 11)}… (${s.length} characters)` : '(none)';
  }

  function engine(state, text) {
    const el = $('pdEngine');
    if (el) el.className = 'pd-engine is-' + state;
    const t = $('pdEngineText');
    if (t) t.textContent = text;
  }

  function logCall(rec) {
    calls.unshift(rec);
    if (calls.length > 40) calls.pop();
    const c = $('pdLogCount');
    if (c) c.textContent = calls.length;
    if ($('pdLog') && !$('pdLog').hidden) renderLog();
  }

  /**
   * One instrumented call.
   *
   * Returns the parsed body and what it took to get it, so latency and
   * status are reported as facts rather than impressions. Binary responses
   * (a rendered PDF) are returned as a blob and logged by size.
   */
  async function api(path, opts = {}, want = 'json') {
    const started = performance.now();
    const rec = { n: ++seq, method: opts.method || 'GET', path, at: new Date() };

    pending += 1;
    engine('busy', 'calling…');

    try {
      const res = await window.CARBONIQ_fetch(path, opts);
      rec.ms = Math.round(performance.now() - started);
      rec.status = res.status;

      let body = null;
      if (want === 'blob' && res.ok) {
        body = await res.blob();
        rec.text = `‹ ${body.type || 'binary'} · ${body.size.toLocaleString()} bytes ›`;
      } else {
        const text = await res.text();
        try { body = JSON.parse(text); rec.text = JSON.stringify(body, null, 2); }
        catch (_) { rec.text = text; }
      }
      rec.body = body;
      logCall(rec);

      if (!res.ok) {
        const b = (body && typeof body === 'object') ? body : {};
        const err = new Error(b.message || b.error || `The engine answered ${res.status}.`);
        err.body = b;
        throw err;
      }
      return { body, rec };

    } catch (err) {
      if (!rec.status) { rec.ms = Math.round(performance.now() - started); rec.text = err.message; logCall(rec); }
      throw err;

    } finally {
      pending -= 1;
      if (pending === 0) engine(rec.status && rec.status < 400 ? 'live' : 'down',
        rec.status ? `live · ${rec.ms} ms` : 'unavailable');
    }
  }

  function renderLog() {
    const body = $('pdLogBody');
    if (!body) return;
    const base = window.CARBONIQ_API_BASE || window.location.origin;

    body.innerHTML = calls.length ? calls.map(c => `
      <details class="pd-log-item${(c.status && c.status < 400) ? '' : ' is-bad'}">
        <summary>
          <span class="pd-log-verb">${esc(c.method)}</span>
          <span class="pd-log-path">${esc(c.path)}</span>
          <span class="pd-log-meta">${c.status || 'failed'} · ${c.ms} ms</span>
        </summary>
        <pre class="pd-log-pre">${esc(
          `${c.method} ${base}${c.path}\n`
          + `x-api-key: ${maskKey(window.CARBONIQ_API_KEY)}\n`
          + `at ${c.at.toLocaleTimeString()}\n\n`
          + String(c.text || '').slice(0, 8000)
          + (String(c.text || '').length > 8000 ? '\n\n… truncated for display …' : '')
        )}</pre>
      </details>`).join('')
      : '<p class="pd-lede">No calls yet.</p>';
  }

  function showError(message, remedy) {
    const el = $('pdError');
    if (!el) return;
    el.innerHTML = `<strong>${esc(message)}</strong>`
      + (remedy ? `<span>${esc(remedy)}</span>` : '')
      + '<span>No figure on this page has been changed to hide it.</span>';
    el.hidden = false;
  }
  const clearError = () => { const e = $('pdError'); if (e) e.hidden = true; };

  // ─────────────────────────────────────────────────────────
  // The run
  // ─────────────────────────────────────────────────────────

  /** The request body for a given input. `persist:false` — a walkthrough
      leaves nothing behind in anyone's book. */
  const bodyFor = i => ({ ...clone(i), persist: false });

  async function assess(i) {
    const { body } = await api('/v1/pcaf/part-c/assess', {
      method: 'POST', body: JSON.stringify(bodyFor(i))
    });
    return body;
  }

  /** Re-run for the current input and repaint everything that depends on it. */
  async function run() {
    try {
      clearError();
      result = await assess(input);
      renderAll();
    } catch (err) {
      result = null;
      showError(err.message, (err.body && (err.body.remedy || err.body.diagnose)) || null);
      renderAll();
    }
  }

  const runSoon = () => { clearTimeout(debounce); debounce = setTimeout(run, 350); };

  // ─────────────────────────────────────────────────────────
  // Painting
  // ─────────────────────────────────────────────────────────

  function renderAll() {
    renderPolicy();
    renderBoqTotals();
    renderFigure();
    renderDq();
    renderGaps();
  }

  function renderPolicy() {
    const r = result;
    $('pdAF').textContent    = r ? Number(r.summary.attributionFactor).toFixed(6) : '—';
    $('pdAFEq').textContent  = r ? `${r.policy.basis} · premium ÷ total project cost` : '—';
    $('pdYears').textContent = r ? r.policy.useStageYears : '—';
    $('pdGate').textContent  = r ? r.policy.gateReason : '—';
  }

  function renderBoqTotals() {
    const r = result;
    $('pdA4').textContent    = r ? num(r.modules.a4) : '—';
    $('pdLines').textContent = input.materials.length;
    const a4 = r && (r.registers.auditTrail.entries || []).find(e => e.module === 'A4');
    $('pdMass').textContent = a4 && a4.inputs
      ? `${num(a4.inputs.totalMass_t)} tonnes carried` : 'tonnes carried';
  }

  function renderFigure() {
    const r = result;
    $('pdConstruction').textContent = r ? num(r.summary.construction_kgCO2e) : '—';
    $('pdIAE').textContent          = r ? num(r.summary.insurerIAE_tCO2e, 4) : '—';
    $('pdPerM2').textContent        = r ? num(r.summary.perM2Factor_kgCO2e_m2) : '—';
    $('pdUseStage').textContent     = r ? num(r.summary.useStage_kgCO2e) : '—';

    const bars = $('pdBars');
    if (!r) { bars.innerHTML = ''; return; }

    bars.innerHTML = (r.sensitivity.moduleContributions || []).map(m => `
      <div class="pd-bar-row">
        <span class="pd-bar-label">${esc(m.label)}</span>
        <span class="pd-bar-track"><span class="pd-bar-fill" style="width:${Math.max(0.6, m.sharePct).toFixed(2)}%"></span></span>
        <span class="pd-bar-val"><b>${num(m.value)}</b> · ${m.sharePct.toFixed(1)}%</span>
      </div>`).join('');

    $('pdTrail').innerHTML = (r.registers.auditTrail.entries || []).map(e => `
      <div class="pd-trail-step">
        <span class="pd-trail-n">${e.step}</span>
        <div>
          <div class="pd-trail-label">${esc(e.label)}</div>
          <div class="pd-trail-eq">${esc(e.equation)}</div>
          <div class="pd-trail-out">= ${num(e.value, Math.abs(e.value) < 1 ? 6 : 2)} ${esc(e.unit || '')}</div>
          ${(e.factors && e.factors.length) ? `<div class="pd-trail-fx">${
            e.factors.map(f => `${esc(f.key || f.label || '')} — ${esc(f.tier || 'tier not stated')}${
              f.reference ? ` · ${esc(f.reference)}` : ''}`).join('<br>')
          }</div>` : ''}
        </div>
      </div>`).join('');
  }

  /* One score per project, decided by the option used. The scale runs 1 to 5
     with 1 the best, so the direction is printed beside every score rather
     than left to the reader to assume. */
  function renderDq() {
    const el = $('pdDq');
    if (!result) { el.innerHTML = ''; return; }
    const d = result.dqScoring;
    const s = d.byGhgScope;

    const card = (label, o, headline) => `
      <div class="pd-dq-card${headline ? ' is-headline' : ''}">
        <span class="pd-dq-label">${esc(label)}</span>
        <span class="pd-dq-score">${o.score}<em>Option ${esc(o.option)}</em></span>
        <p class="pd-dq-desc">${esc(o.optionLabel)}</p>
      </div>`;

    el.innerHTML = `
      <div class="pd-dq-main">
        ${card('Project — the disclosed score', d.construction, true)}
        ${card(s.scope1and2.label, s.scope1and2, false)}
        ${card(s.scope3.label, s.scope3, false)}
      </div>
      <div class="pd-dq-scale">${esc(d.scale)} ${esc(d.direction)}</div>
      <div class="pd-dq-scale" style="border-left-color:var(--pd-slate);background:var(--pd-sage-l)">
        <strong>Use stage:</strong> ${esc(d.useStage.reason)}
        Table 5.3-2 covers construction emissions, and PCAF publishes no
        data-quality table for optional lifetime emissions on project
        insurance — so no number is invented to fill the gap.
      </div>
      <p class="pd-cite">${esc(d.standard)}</p>`;
  }

  function renderGaps() {
    const el = $('pdGaps');
    if (!result) { el.innerHTML = ''; return; }
    el.innerHTML = (result.sensitivity.topFactorGaps || []).map(g => `
      <div class="pd-gap">
        <div>
          <div class="pd-gap-key">${esc(g.key)} <span style="font-weight:500;color:var(--text-tertiary)">· ${esc(g.tier)} tier</span></div>
          <div class="pd-gap-note">${esc(g.gap)}<br>${esc(g.reference)}</div>
        </div>
        <span class="pd-gap-share">${g.sharePct.toFixed(1)}%</span>
      </div>`).join('');
  }

  // ─────────────────────────────────────────────────────────
  // Counterfactuals — the point of the walkthrough
  // ─────────────────────────────────────────────────────────

  /* Each entry changes exactly one thing. `rows` names the figures worth
     watching; the card marks each one moved or unchanged from the two
     answers, so neither half can be asserted rather than shown. */
  const CASES = [
    {
      id: 'idi',
      title: 'Switch the cover from CAR to IDI',
      sub: 'Construction all-risks covers the build. Inherent defects cover runs over the finished building.',
      action: 'Run it as IDI',
      apply: i => { i.policy.policyType = 'IDI'; i.policy.yearsOfCover = 10; },
      verdict: 'The use stage is not switched on by preference. <strong>CAR sets use-stage years to zero by scope rule</strong> — PCAF Part C §5.3 — so B1, B4 and B7 are zero because they are out of scope, not because they were left out. Change the cover and they appear.'
    },
    {
      id: 'epd',
      title: 'Obtain an EPD for the materials',
      sub: 'Better evidence behind the emission factors — the improvement every insurer is told to chase.',
      action: 'Add the EPD',
      apply: i => { i.hasEPD = true; },
      verdict: 'The engine records the EPD evidence and says so in its own note &mdash; and <strong>the data-quality score does not move</strong>. PCAF assigns the score from the <em>option</em> used to estimate the emissions (Table 5.3-2), and this is still declared quantities × emission factor — Option 2b. Most tools imply the number will shift. It does not, and saying so is the difference between reporting the standard and marketing against it.'
    },
    {
      id: 'energy',
      title: 'Withdraw the contractor’s site energy record',
      sub: 'The one input that genuinely changes which option the project sits in.',
      action: 'Remove the energy data',
      apply: i => { i.siteInputs.previousProject = null; },
      verdict: 'This is what a score responds to. With metered fuel and electricity, site energy is <strong>energy consumption × emission factor — Option 2a</strong>. Without it the engine falls back to a per-m² allowance, which is a declared quantity: Option 2b, and the scope 1 and 2 score worsens. One document, one band.'
    },
    {
      id: 'premium',
      title: 'Double the premium',
      sub: 'The insurer writes twice the line on the same building.',
      action: 'Double it',
      apply: i => { i.policy.premium = Number(i.policy.premium) * 2; },
      verdict: 'The attributed share doubles and <strong>the project’s emissions do not move at all</strong>. Attribution is the insurer’s slice of a building that emits what it emits — writing more of the risk cannot change what is being built.'
    }
  ];

  /** The figures each card watches. */
  const WATCH = [
    { label: 'Construction A4 + A5 (kgCO2e)',    get: r => num(r.summary.construction_kgCO2e) },
    { label: 'Use stage B1 + B4 + B7 (kgCO2e)',  get: r => num(r.summary.useStage_kgCO2e) },
    { label: 'Attribution factor',                get: r => Number(r.summary.attributionFactor).toFixed(6) },
    { label: 'Insurer attributed share (tCO2e)',  get: r => num(r.summary.insurerIAE_tCO2e, 4) },
    { label: 'Data quality — project',            get: r => `${r.dqScoring.construction.score} (Option ${r.dqScoring.construction.option})` },
    { label: 'Data quality — insured scope 1 & 2', get: r => `${r.dqScoring.byGhgScope.scope1and2.score} (Option ${r.dqScoring.byGhgScope.scope1and2.option})` },
    /* Reads the engine's own note rather than this page's opinion of it, so
       the EPD card can show that something was recorded without implying the
       score responded to it. */
    { label: 'Emission-factor evidence',          get: r => r.dataQuality.epdNote ? 'EPD recorded' : 'not recorded' }
  ];

  function renderCases() {
    $('pdCf').innerHTML = CASES.map(c => `
      <div class="pd-cf-card" id="pdCf-${c.id}">
        <div class="pd-cf-head">
          <div>
            <div class="pd-cf-title">${c.title}</div>
            <div class="pd-cf-sub">${esc(c.sub)}</div>
          </div>
          <button class="pd-switch" type="button" data-case="${c.id}">${esc(c.action)}</button>
        </div>
        <div class="pd-cf-body" hidden></div>
      </div>`).join('');

    $('pdCf').querySelectorAll('.pd-switch').forEach(b =>
      b.addEventListener('click', () => runCase(b.dataset.case, b)));
  }

  async function runCase(id, btn) {
    const c = CASES.find(x => x.id === id);
    if (!c || !result) return;

    btn.disabled = true;
    btn.textContent = 'running…';

    try {
      const variant = clone(input);
      c.apply(variant);
      const after = await assess(variant);

      const lines = WATCH.map(w => {
        const from = w.get(result), to = w.get(after);
        const same = from === to;
        return `<div class="pd-cf-line ${same ? 'is-same' : 'is-moved'}">
            <span class="pd-cf-what">${esc(w.label)}</span>
            <span class="pd-cf-from">${esc(from)}</span>
            <span class="pd-cf-arrow">${same ? '=' : '→'}</span>
            <span class="pd-cf-to">${esc(to)}</span>
          </div>`;
      }).join('');

      const body = document.querySelector(`#pdCf-${id} .pd-cf-body`);
      body.innerHTML = lines + `<div class="pd-cf-verdict">${c.verdict}</div>`;
      body.hidden = false;
      btn.textContent = 'run again';

    } catch (err) {
      showError(err.message, (err.body && err.body.remedy) || null);
      btn.textContent = c.action;
    } finally {
      btn.disabled = false;
    }
  }

  // ─────────────────────────────────────────────────────────
  // Documents and conformance
  // ─────────────────────────────────────────────────────────

  async function download(path, opts, filename, label) {
    const status = $('pdDocStatus');
    status.textContent = `rendering the ${label}…`;
    try {
      const { body, rec } = await api(path, opts, 'blob');
      const url = URL.createObjectURL(body);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      status.textContent = `${label} rendered in ${rec.ms} ms · ${(body.size / 1024).toFixed(0)} KB`;
    } catch (err) {
      status.textContent = '';
      showError(err.message, (err.body && err.body.remedy) || null);
    }
  }

  const reportBody = fmt => JSON.stringify({
    ...bodyFor(input), format: fmt,
    meta: { insurer: 'Demonstration insurer', insured: input.projectName, orgName: 'Datum Solutions' }
  });

  async function loadConformance() {
    try {
      const { body } = await api('/v1/pcaf/part-c/conformance');
      const rules = body.rules || [];
      $('pdStandardCite').textContent = `${body.standard} — ${body.disclaimer || body.statement || ''}`;

      const tally = rules.reduce((a, r) => {
        const k = r.status || (r.test ? 'proven by test' : 'implemented');
        a[k] = (a[k] || 0) + 1; return a;
      }, {});

      $('pdConf').innerHTML = `
        <div class="pd-conf-stat">
          <div class="pd-readout">
            <span class="pd-readout-label">Rules claimed</span>
            <span class="pd-readout-value">${rules.length}</span>
            <span class="pd-readout-sub">each cites its implementing file</span>
          </div>
          ${Object.entries(tally).slice(0, 3).map(([k, v]) => `
          <div class="pd-readout">
            <span class="pd-readout-label">${esc(k)}</span>
            <span class="pd-readout-value">${v}</span>
            <span class="pd-readout-sub">of ${rules.length}</span>
          </div>`).join('')}
        </div>
        <p class="pd-conf-note">Every rule names the file that enforces it and the
        test that proves it. A citation pointing at a file or a test that no longer
        exists fails the build, so the claim cannot quietly rot.</p>
        <p class="pd-conf-note">${esc(body.statement || '')}</p>`;

    } catch (err) {
      $('pdConf').innerHTML = `<p class="pd-conf-note">${esc(err.message)}</p>`;
    }
  }

  // ─────────────────────────────────────────────────────────
  // The bill of quantities
  // ─────────────────────────────────────────────────────────

  function renderBoq() {
    $('pdBoqBody').innerHTML = input.materials.map((m, ix) => {
      const d = (input.distances && input.distances[m.id]) || {};
      return `<tr>
        <td>${esc(m.name)}</td>
        <td class="pd-num"><input type="number" step="0.01" min="0" value="${m.quantity}" data-row="${ix}" data-k="quantity"></td>
        <td>${esc(m.unit)}</td>
        <td class="pd-num"><input type="number" step="1" min="0" value="${d.road || 0}" data-row="${ix}" data-k="road"></td>
        <td class="pd-num"><input type="number" step="1" min="0" value="${d.sea || 0}" data-row="${ix}" data-k="sea"></td>
      </tr>`;
    }).join('');

    $('pdBoqBody').querySelectorAll('input').forEach(el =>
      el.addEventListener('input', () => {
        const m = input.materials[Number(el.dataset.row)];
        const v = Number(el.value) || 0;
        if (el.dataset.k === 'quantity') m.quantity = v;
        else {
          input.distances[m.id] = input.distances[m.id] || {};
          input.distances[m.id][el.dataset.k] = v;
        }
        runSoon();
      }));
  }

  // ─────────────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────────────

  function goto(n) {
    step = Math.min(STEPS, Math.max(1, n));
    document.querySelectorAll('.pd-panel').forEach(p =>
      p.classList.toggle('is-active', Number(p.dataset.panel) === step));
    document.querySelectorAll('.pd-step').forEach(b => {
      const i = Number(b.dataset.step);
      b.classList.toggle('is-active', i === step);
      b.classList.toggle('is-done', i < step);
    });
    $('pdBack').disabled = step === 1;
    $('pdNext').disabled = step === STEPS;
    $('pdWhere').textContent = `Step ${step} of ${STEPS}`;
    document.querySelector('.pd-stage').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function reset() {
    input = clone(PRESET);
    calls = []; seq = 0;
    $('pdLogCount').textContent = '0';
    $('pdPolicyType').value  = input.policy.policyType;
    $('pdPremium').value     = input.policy.premium;
    $('pdProjectCost').value = input.policy.projectCost;
    $('pdGifa').value        = input.siteInputs.gifa_m2;
    renderBoq();
    renderCases();
    $('pdDocStatus').textContent = '';
    goto(1);
    run();
    loadConformance();
  }

  function init() {
    input = clone(PRESET);

    $('pdPolicyType').addEventListener('change', e => { input.policy.policyType = e.target.value; run(); });
    $('pdPremium')   .addEventListener('input',  e => { input.policy.premium = Number(e.target.value) || 0; runSoon(); });
    $('pdProjectCost').addEventListener('input', e => { input.policy.projectCost = Number(e.target.value) || 0; runSoon(); });
    $('pdGifa')      .addEventListener('input',  e => { input.siteInputs.gifa_m2 = Number(e.target.value) || 0; runSoon(); });

    document.querySelectorAll('.pd-step').forEach(b =>
      b.addEventListener('click', () => goto(Number(b.dataset.step))));
    $('pdBack').addEventListener('click', () => goto(step - 1));
    $('pdNext').addEventListener('click', () => goto(step + 1));

    $('pdLogBtn')  .addEventListener('click', () => { renderLog(); $('pdLog').hidden = false; });
    $('pdLogClose').addEventListener('click', () => { $('pdLog').hidden = true; });
    $('pdResetBtn').addEventListener('click', reset);

    $('pdPdfBtn').addEventListener('click', () => download('/v1/pcaf/part-c/report',
      { method: 'POST', body: reportBody('pdf') }, 'pcaf-part-c-report.pdf', 'report'));
    $('pdDocxBtn').addEventListener('click', () => download('/v1/pcaf/part-c/report',
      { method: 'POST', body: reportBody('docx') }, 'pcaf-part-c-report.docx', 'Word report'));
    $('pdMethodBtn').addEventListener('click', () => download('/v1/pcaf/part-c/methodology?format=pdf',
      {}, 'pcaf-part-c-methodology.pdf', 'methodology statement'));

    $('pdPremium').value     = input.policy.premium;
    $('pdProjectCost').value = input.policy.projectCost;
    $('pdGifa').value        = input.siteInputs.gifa_m2;
    $('pdPolicyType').value  = input.policy.policyType;

    renderBoq();
    renderCases();
    goto(1);
    run();
    loadConformance();
  }

  /* A return visit re-asks the engine rather than showing what it said last
     time — the page's first rule, applied to navigation. */
  return { init, refresh: run };
})();
