/* ============================================================
   CarbonIQ — the GCF pipeline screen

   Seven sub-tabs over one set of records. The Pipeline tab — the
   portfolio, the cycle and one project at a time — lives in
   gcf-pipeline.js; this module is the shell, the six other panels
   and the intake form. Three rules the renderer is responsible
   for, each of which is a way to draw a confident screen that is
   wrong:

     Never combine two carbon boundaries. Mitigation, embodied and
     financed appear as separate figures and no total on this page
     adds two of them.

     Never let an adaptation co-benefit read as a mitigation claim.
     It is on its own line, labelled, and never in the headline.

     Never show a figure without its evidence tier. A benchmark and
     a measured value look identical once they are both just a
     number on a card.

   And one mechanical rule learned the hard way: anything that
   changes what the first request says must be loaded BEFORE that
   request is sent. The weighting overlay is read in init() ahead
   of the first fetch, not when its panel is first opened.
   ============================================================ */

const GCFPage = (() => {

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const num = (n, d = 0) => (n === null || n === undefined || n === '' || !Number.isFinite(Number(n)))
    ? '—'
    : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd = n => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : `$${num(n)}`);
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const words = s => String(s ?? '').replace(/_/g, ' ');

  const WEIGHT_KEY = 'carboniq.gcf.weights';
  const TIERS = ['measured', 'modelled', 'benchmark', 'declared'];

  const state = { reference: null, pipeline: [], weights: {}, defaults: {}, sample: false };

  /* A preview session holds `read`; the server is the control and the
     screen withholds the buttons it would refuse. */
  const preview = () => {
    try { return typeof Auth !== 'undefined' && typeof Auth.isPreview === 'function' && Boolean(Auth.isPreview()); }
    catch (_) { return false; }
  };
  const canWrite = () => !preview();

  async function call(path, opts) {
    const res = await window.CARBONIQ_fetch('/v1/gcf' + path, opts);
    let data = {};
    try { data = await res.json(); } catch (_) { /* non-JSON body */ }
    if (!res.ok) {
      throw new Error([data.message, data.remedy].filter(Boolean).join(' ')
        || `Request failed (${res.status})`);
    }
    return data;
  }
  const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  /* ── The weighting overlay ─────────────────────────────────
     Held in the browser and never on the book: a weighting is one
     reader's question, and writing it down would make one person's
     view everybody's baseline. Reset REMOVES the override rather
     than writing the defaults back. */
  function loadWeights() {
    try {
      const raw = window.localStorage.getItem(WEIGHT_KEY);
      state.weights = raw ? JSON.parse(raw) : {};
    } catch (_) { state.weights = {}; }
  }
  function saveWeights() {
    try {
      if (Object.keys(state.weights).length) {
        window.localStorage.setItem(WEIGHT_KEY, JSON.stringify(state.weights));
      } else {
        window.localStorage.removeItem(WEIGHT_KEY);
      }
    } catch (_) { /* private window — the session still works */ }
  }
  const weightQuery = () => Object.entries(state.weights)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

  /* ── Sub-tab router ───────────────────────────────────────── */
  const PANELS = ['pipeline', 'emissions', 'decision', 'instruments', 'reporting', 'cn', 'intake'];
  const loaded = {};

  function show(panel) {
    if (!PANELS.includes(panel)) panel = 'pipeline';
    for (const p of PANELS) {
      const el = $(`gcfPanel-${p}`);
      if (el) el.hidden = p !== panel;
    }
    document.querySelectorAll('#gcfTabs .gcf-tab').forEach(t => {
      t.setAttribute('aria-selected', String(t.dataset.panel === panel));
    });
    try { window.location.hash = `#gcf/${panel}`; } catch (_) { /* ignore */ }
    if (!loaded[panel]) { loaded[panel] = true; LOADERS[panel](); }
  }

  /* The sample pill follows what the server says is showing: on while the
     shipped pipeline is, off the moment a record replaces it. */
  function onSample(sample, sampleNote) {
    state.sample = Boolean(sample);
    const b = $('gcfSampleBanner');
    if (b) { b.hidden = !sample; b.textContent = sample ? (sampleNote || '') : ''; }
  }

  /* ── 1. Pipeline — the portfolio, the cycle, one project ──── */
  async function loadPipeline() {
    try {
      const { pipeline } = await call('/pipeline');
      state.pipeline = pipeline.projects;
      onSample(pipeline.sample, pipeline.sampleNote);
    } catch (_) { /* the portfolio load reports the failure on screen */ }
    await GCFPipeline.load();
  }

  const figure = (label, value, note, unit) => `
    <div class="gcf-figure">
      <span class="gcf-figure-label">${esc(label)}</span>
      <span class="gcf-figure-value">${value}</span>
      ${unit ? `<span class="gcf-figure-unit">${esc(unit)}</span>` : ''}
      ${note ? `<span class="gcf-figure-note">${esc(note)}</span>` : ''}
    </div>`;

  /* ── 2. Emissions ─────────────────────────────────────────── */
  async function loadEmissions() {
    try {
      const [{ emissions }, { ndc }] = await Promise.all([call('/emissions'), call('/ndc')]);

      /* Three separate cards. Nothing here adds two of them, and the
         adaptation line is never folded into the headline. */
      setHtml('gcfEmissionFigures', [
        figure('Mitigation — annual', num(emissions.headline.annual_tCO2e),
          `${emissions.headline.projects} mitigation projects — GCF Core Indicator 1`, 'tCO₂e / year'),
        figure('Mitigation — lifetime', num(emissions.headline.lifetime_tCO2e),
          'reduced, avoided and removed, as GCF\'s indicator defines it', 'tCO₂e'),
        figure('Adaptation co-benefit', num(emissions.adaptationCoBenefit.annual_tCO2e),
          emissions.adaptationCoBenefit.note, 'tCO₂e / year'),
        figure('Embodied carbon (A1–A5)', num(emissions.embodiedCarbon.a1a5_tCO2e),
          `held for ${emissions.embodiedCarbon.projects} of ${emissions.projects}. Never netted against mitigation.`, 'tCO₂e'),
        figure('Financed emissions', 'in the capital book',
          emissions.financedEmissions.reason),
        figure('Weakest evidence', esc(emissions.evidence.weakestTier || '—'),
          emissions.evidence.note),
      ].join(''));

      say('gcfEmissionsRule', emissions.headline.note);

      const led = (title, l) => `
        <div style="margin-bottom:14px">
          <strong>${esc(title)}</strong>
          <div style="font-size:22px;font-weight:700;font-variant-numeric:tabular-nums">
            ${num(l.pipelineCumulative_tCO2e)} <span style="font-size:12px;font-weight:400;color:var(--gcf-muted)">tCO₂e, 2026–2035</span>
          </div>
          <div style="font-size:12px;color:var(--gcf-muted)">
            National commitment ${l.commitment.totalPct}% (${l.commitment.unconditionalPct}% unconditional
            + ${l.commitment.conditionalPct}% conditional)
          </div>
          <div style="font-size:12px;color:var(--gcf-muted);margin-top:4px">
            Share of the national target: ${l.share.available
              ? `${l.share.sharePct}%` : `<em>not stated — ${esc(l.share.reason)}</em>`}
          </div>
        </div>`;
      setHtml('gcfNdc',
        led('Reduction', ndc.reduction)
        + led('Removal', ndc.removal)
        + `<div class="gcf-rule">${esc(ndc.note)}</div>`);

      const rows = emissions.rows.flatMap(r => r.check.checks.map(c => ({ code: r.code, ...c })));
      setHtml('gcfChecks', `
        <thead><tr><th>Project</th><th>Figure</th><th class="num">Recorded</th>
          <th class="num">Recomputed</th><th>Outcome</th></tr></thead>
        <tbody>${rows.map(c => `<tr>
          <td>${esc(c.code)}</td>
          <td>${esc(String(c.figure).replace('mitigation.', ''))}</td>
          <td class="num">${num(c.recorded)}</td>
          <td class="num">${c.recomputed === null ? '—' : num(c.recomputed)}</td>
          <td>${c.recomputed === null
            ? `<span class="gcf-pill gcf-pill-tier">unverifiable</span>`
            : (c.agrees
              ? `<span class="gcf-pill gcf-pill-ok">agrees</span>`
              : `<span class="gcf-pill gcf-pill-stop">diverges ${c.divergencePct}%</span>`)}</td>
        </tr>`).join('')}</tbody>`);
    } catch (err) {
      setHtml('gcfEmissionFigures', `<div class="gcf-warn">${esc(err.message)}</div>`);
    }
  }

  /* ── 3. The decision ──────────────────────────────────────── */
  function renderWeightControls() {
    const keys = Object.keys(state.defaults);
    setHtml('gcfWeights', keys.map(k => `
      <div class="gcf-field">
        <label for="gcfW-${k}">${esc(k.replace(/([A-Z])/g, ' $1').toLowerCase())}</label>
        <input type="number" id="gcfW-${k}" min="0" step="0.05"
               value="${state.weights[k] ?? state.defaults[k]}">
      </div>`).join(''));
    const changed = Object.keys(state.weights).length;
    say('gcfWeightsHint', changed
      ? `${changed} weight${changed === 1 ? '' : 's'} changed from the default — only those are sent.`
      : 'Default weighting. Nothing is sent; the engine answers from its own defaults.');
  }

  async function loadDecision() {
    renderWeightControls();
    await refreshDecision();
  }

  async function refreshDecision() {
    try {
      const q = weightQuery();
      const { recommendation } = await call(`/recommendation${q ? `?${q}` : ''}`);

      setHtml('gcfSelected', recommendation.selected.map(s => `
        <div style="border:1px solid var(--gcf-line);border-radius:8px;padding:12px;margin-bottom:10px">
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:baseline">
            <strong>${esc(s.code)} — ${esc(s.name)}</strong>
            <span class="gcf-pill gcf-pill-ok">${esc(s.stream)}</span>
            <span class="gcf-hint">score ${s.score} · rank ${s.streamRank} in stream · ${usd(s.gcfAsk)} ask</span>
          </div>
          <p style="font-size:12.5px;margin:8px 0 6px">${esc(s.recordedReason)}</p>
          <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--gcf-muted)">
            ${s.computedBasis.map(b => `<li>${esc(b)}</li>`).join('')}
          </ul>
          ${s.toResolve.length ? `<div class="gcf-warn" style="margin-top:8px">${
            s.toResolve.map(esc).join('<br>')}</div>` : ''}
        </div>`).join('')
        + `<div class="gcf-rule">${esc(recommendation.streamBalance.note)}</div>`
        + `<div class="gcf-rule">${esc(recommendation.limits)}</div>`);

      const dv = $('gcfDivergence');
      if (dv) {
        dv.hidden = recommendation.divergence.agree;
        dv.innerHTML = `<strong>Recorded selection ${
          recommendation.divergence.recordedSelection.map(esc).join(' + ')}; this ranking reaches ${
          recommendation.divergence.computedSelection.map(esc).join(' + ')}.</strong><br>${
          esc(recommendation.divergence.note)}`;
      }

      const list = (title, l) => `
        <div style="margin-bottom:14px">
          <strong>${esc(title)}</strong>
          <div style="font-size:12px;color:var(--gcf-muted);margin-bottom:6px">${esc(l.note)}</div>
          ${l.projects.map(p => `
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;min-width:0">
              <span style="width:60px;flex:0 0 auto;font-size:12px"><strong>${esc(p.code)}</strong></span>
              <span style="flex:1 1 auto;min-width:0"><span class="gcf-bar"><i style="width:${
                Math.round((p.score || 0) * 100)}%"></i></span></span>
              <span style="width:44px;flex:0 0 auto;text-align:right;font-size:12px;font-variant-numeric:tabular-nums">${p.score}</span>
            </div>`).join('')}
        </div>`;
      setHtml('gcfRankings',
        list('Mitigation', recommendation.ranking.mitigation)
        + list('Adaptation', recommendation.ranking.adaptation)
        + `<div class="gcf-rule">${esc(recommendation.ranking.note)}</div>`);

      setHtml('gcfNotScored', recommendation.notScored.map(c => `
        <div style="margin-bottom:10px">
          <strong style="font-size:12.5px">${esc(c.name)}</strong>
          <div style="font-size:12px;color:var(--gcf-muted)">${esc(c.reason)}</div>
        </div>`).join('')
        + `<div class="gcf-rule">${esc(recommendation.ranking.criteria.note)}</div>`);
    } catch (err) {
      setHtml('gcfSelected', `<div class="gcf-warn">${esc(err.message)}</div>`);
    }
  }

  /* ── 4. Instruments ───────────────────────────────────────── */
  async function loadInstruments() {
    try {
      const { instruments } = await call('/instruments');

      const gapCard = $('gcfMandateCard');
      if (gapCard) gapCard.hidden = !instruments.mandateGap;
      if (instruments.mandateGap) {
        setHtml('gcfMandateGap', `
          ${instruments.mandateGap.barriers.map(b => `
            <p style="font-size:13px;margin:0 0 6px"><strong>${esc(b.label)}</strong> —
              ${b.projects.map(esc).join(', ')}</p>`).join('')}
          <div class="gcf-warn">${esc(instruments.mandateGap.note)}</div>`);
      }

      setHtml('gcfInstrumentTable', `
        <thead><tr><th>Project</th><th>Barriers</th><th>Recommended structure</th>
          <th class="num">Coverage</th><th>Left standing</th></tr></thead>
        <tbody>${instruments.projects.map(p => `<tr>
          <td><strong>${esc(p.code)}</strong></td>
          <td>${p.barriers.map(b => esc(b.label)).join('<br>') || '—'}</td>
          <td>${p.recommended ? esc(p.recommended.name)
            : `<em>${esc(p.recommendedNote)}</em>`}</td>
          <td class="num">${p.recommended ? `${Math.round(p.recommended.coverage * 100)}%` : '—'}</td>
          <td>${p.barriersLeftStanding.length
            ? p.barriersLeftStanding.map(b => `<span class="gcf-pill gcf-pill-flag">${esc(b.label)}</span>`).join(' ')
            : '<span class="gcf-pill gcf-pill-ok">none</span>'}</td>
        </tr>`).join('')}</tbody>`);

      setHtml('gcfConcessionality', instruments.projects.map(p => `
        <div style="margin-bottom:10px;font-size:12.5px">
          <strong>${esc(p.code)}</strong>
          ${p.concessionality.assessed === false
            ? `<span class="gcf-pill gcf-pill-flag">not assessed</span>`
            : (p.concessionality.needsSupport
              ? `<span class="gcf-pill gcf-pill-ok">support justified</span>`
              : `<span class="gcf-pill gcf-pill-stop">does not need GCF</span>`)}
          <div style="color:var(--gcf-muted);margin-top:2px">${esc(
            p.concessionality.finding || p.concessionality.reason || '')}</div>
        </div>`).join('')
        + `<div class="gcf-rule">${esc(instruments.minimumConcessionality.note)}</div>`);
    } catch (err) {
      setHtml('gcfInstrumentTable', `<tbody><tr><td class="gcf-warn">${esc(err.message)}</td></tr></tbody>`);
    }
  }

  /* ── 5. Reporting ─────────────────────────────────────────── */
  const ENTITY_FIELDS = [
    ['entityName', 'Reporting entity', 'input'],
    ['climateGovernance', 'Board oversight (SLFRS S2 §6(a))', 'textarea'],
    ['managementRole', "Management's role (§6(b))", 'textarea'],
    ['strategyNarrative', 'Climate opportunities and the response (§9)', 'textarea'],
    ['riskManagementProcess', 'Risk identification and monitoring (§25)', 'textarea'],
  ];
  const ACCREDITATION_FIELDS = [
    ['decision', 'Board decision', 'text'],
    ['sizeCategory', 'Size category', 'select', ['micro', 'small', 'medium', 'large']],
    ['ceiling', 'Ceiling per project (USD)', 'number'],
    ['essCategory', 'Environmental and social category', 'text'],
    ['grantModality', 'Grant modality', 'select', ['no', 'yes']],
    ['accreditedAt', 'Accredited on', 'date'],
    ['amaEffectiveAt', 'Accreditation master agreement effective', 'date'],
    ['modalities', 'Fiduciary standards held (comma-separated)', 'text'],
    ['source', 'Source', 'text'],
  ];
  const SIZE_CEILING = { micro: 10e6, small: 50e6, medium: 250e6, large: null };

  function control(id, kind, options, value = '') {
    if (kind === 'textarea') return `<textarea id="${id}" rows="2">${esc(value)}</textarea>`;
    if (kind === 'select') return `<select id="${id}">${options.map(o => `<option value="${o}" ${String(o) === String(value) ? 'selected' : ''}>${esc(words(o))}</option>`).join('')}</select>`;
    return `<input type="${kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'}" id="${id}" value="${esc(value)}">`;
  }

  async function loadReporting() {
    setHtml('gcfEntityForm', ENTITY_FIELDS.map(([k, label, kind]) => `
      <div class="gcf-field ${kind === 'textarea' ? 'gcf-field-wide' : ''}">
        <label for="gcfE-${k}">${esc(label)}</label>${control(`gcfE-${k}`, kind)}
      </div>`).join(''));

    let entity = null;
    try { entity = (await call('/entity')).entity; } catch (_) { /* nothing recorded yet — the form stands empty */ }
    if (entity) {
      for (const [k] of ENTITY_FIELDS) {
        const el = $(`gcfE-${k}`);
        if (el && entity[k]) el.value = entity[k];
      }
    }
    const acc = (entity && entity.accreditation) || (state.reference && state.reference.accreditation) || {};
    const current = {
      ...acc, ceiling: acc.sizeRange_usd ? acc.sizeRange_usd[1] : '', grantModality: acc.grantModality ? 'yes' : 'no',
      modalities: (acc.modalities || []).join(', '),
    };
    setHtml('gcfAccreditationForm', ACCREDITATION_FIELDS.map(([k, label, kind, options]) => `
      <div class="gcf-field"><label for="gcfA-${k}">${esc(label)}</label>${control(`gcfA-${k}`, kind, options, current[k] ?? '')}</div>`).join(''));
    say('gcfAccreditationHint', entity && entity.accreditation ? 'Recorded by the entity.' : 'Showing the shipped accreditation. Record the entity’s own to replace it.');
    on('gcfA-sizeCategory', 'change', () => { const c = SIZE_CEILING[$('gcfA-sizeCategory').value]; if (c) $('gcfA-ceiling').value = c; });

    for (const el of document.querySelectorAll('#gcfPanel-reporting [data-writes]')) el.hidden = !canWrite();
    await refreshReport();
  }

  async function saveEntity(extra) {
    const body = {};
    for (const [k] of ENTITY_FIELDS) {
      const v = ($(`gcfE-${k}`)?.value || '').trim();
      if (v) body[k] = v;
    }
    let entity = null;
    try { entity = (await call('/entity')).entity; } catch (_) { /* none yet */ }
    if (entity && entity.accreditation) body.accreditation = entity.accreditation;
    Object.assign(body, extra || {});
    await call('/entity', json('PUT', body));
  }

  async function refreshReport() {
    try {
      const { report } = await call('/report');
      const m = report.metricsAndTargets;
      setHtml('gcfReportSummary', `
        <div class="gcf-figures">
          ${figure('Climate opportunities (S2 §29(d))', usd(m.climateOpportunities.alignedAmount),
            `${m.climateOpportunities.alignedPctOfPipeline}% of the pipeline aligned to ${m.climateOpportunities.framework}`)}
          ${figure('Capital deployment (S2 §29(e))', usd(m.capitalDeployment.pipelineTotalCost),
            m.capitalDeployment.note)}
          ${figure('Avoided and reduced', num(m.avoidedAndReduced.annual_tCO2e),
            m.avoidedAndReduced.note, 'tCO₂e / year')}
        </div>
        <div class="gcf-warn">${esc(m.inventory.note)}</div>
        <div class="gcf-rule">${esc(report.basis.covers)}</div>
        <div class="gcf-scroll" style="margin-top:12px">
          <table class="gcf-table">
            <thead><tr><th>Checklist item</th><th>Clause</th><th>Answer</th></tr></thead>
            <tbody>${report.checklist.map(i => `<tr>
              <td>${esc(i.item)}</td>
              <td>${esc(i.standardRef || '')}</td>
              <td>${i.met
                ? '<span class="gcf-pill gcf-pill-ok">yes</span>'
                : `<span class="gcf-pill gcf-pill-flag">no</span> <span class="gcf-hint">${esc(i.basis)}</span>`}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="gcf-rule">${esc(report.completenessNote)}</div>`);

      setHtml('gcfGaps', report.gaps.length
        ? `<div class="gcf-scroll"><table class="gcf-table">
             <thead><tr><th>Where</th><th>What is missing</th><th>Clause</th></tr></thead>
             <tbody>${report.gaps.map(g => `<tr>
               <td>${esc(g.path)}</td><td>${esc(g.what)}</td><td>${esc(g.standardRef || '—')}</td>
             </tr>`).join('')}</tbody></table></div>`
        : '<p class="gcf-hint">Nothing outstanding.</p>');
    } catch (err) {
      setHtml('gcfReportSummary', `<div class="gcf-warn">${esc(err.message)}</div>`);
    }
  }

  /* ── 6. Concept Note ──────────────────────────────────────── */
  async function loadCn() {
    if (!state.pipeline.length) {
      try { state.pipeline = (await call('/pipeline')).pipeline.projects; }
      catch (_) { /* the select stays empty and the panel says so */ }
    }
    const sel = $('gcfCnProject');
    if (sel) {
      const was = sel.value;
      sel.innerHTML = state.pipeline.map(p =>
        `<option value="${esc(p.id)}">${esc(p.code)} — ${esc(p.name)}</option>`).join('');
      if (was && state.pipeline.some(p => p.id === was)) sel.value = was;
      /* One listener, however many times the panel reloads. */
      sel.onchange = renderCn;
    }
    await renderCn();
  }

  const STATUS_PILL = {
    held: '<span class="gcf-pill gcf-pill-ok">held</span>',
    partial: '<span class="gcf-pill gcf-pill-flag">partial</span>',
    external: '<span class="gcf-pill gcf-pill-stop">external</span>',
  };

  async function renderCn() {
    const id = $('gcfCnProject')?.value;
    if (!id) return;
    try {
      const { package: pkg } = await call(`/cn/${encodeURIComponent(id)}`);
      const r = pkg.readiness;
      setHtml('gcfCnReadiness', `
        <div class="gcf-figures">
          ${figure('Inputs held', `${r.held} of ${r.total}`, `${r.pctHeld}% of the package`)}
          ${figure('External', num(r.external), 'documents and legal instruments this system cannot produce')}
          ${figure('Partial', num(r.partial), 'held in part — not to be mistaken for complete')}
        </div>
        <div class="gcf-bar" style="margin:12px 0"><i style="width:${r.pctHeld}%"></i></div>
        <div class="gcf-warn">${esc(r.note)}</div>
        <div class="gcf-rule">${esc(pkg.limits)}</div>`);

      setHtml('gcfCnExternal', `
        <thead><tr><th>Input</th><th>What is needed</th><th>From</th></tr></thead>
        <tbody>${pkg.externalInputs.map(x => `<tr>
          <td><strong>${esc(x.input)}</strong></td>
          <td>${esc(x.needs)}</td>
          <td>${esc(x.from || '')}</td>
        </tr>`).join('')}</tbody>`);

      setHtml('gcfCnSections', pkg.sections.map(s => `
        <details style="margin-bottom:8px">
          <summary style="cursor:pointer;font-weight:600;font-size:13px;padding:6px 0">
            Section ${esc(s.id)} — ${esc(s.title)}
            <span class="gcf-hint">(${s.fields.filter(f => f.status === 'held').length} of ${s.fields.length} held)</span>
          </summary>
          <div class="gcf-scroll"><table class="gcf-table">
            <tbody>${s.fields.map(f => `<tr>
              <td style="width:96px">${STATUS_PILL[f.status]}</td>
              <td style="width:34%"><strong>${esc(f.label)}</strong></td>
              <td>${esc(f.value || f.needs || f.missing || '')}</td>
            </tr>`).join('')}</tbody>
          </table></div>
        </details>`).join(''));

      say('gcfCnHint', `${pkg.meta.code} — ${r.held} of ${r.total} inputs held`);
    } catch (err) {
      setHtml('gcfCnReadiness', `<div class="gcf-warn">${esc(err.message)}</div>`);
    }
  }

  /* Fetched as a blob rather than opened in a tab: the request carries the
     session in a header, and a plain link would arrive unauthenticated —
     which reads to a user as a broken download rather than a rejected one. */
  async function downloadCn(format) {
    const id = $('gcfCnProject')?.value;
    if (!id) return;
    const code = state.pipeline.find(p => p.id === id)?.code || id;
    say('gcfCnHint', `Building the ${format.toUpperCase()}…`);
    try {
      const res = await window.CARBONIQ_fetch(
        `/v1/gcf/cn/${encodeURIComponent(id)}?format=${format}`);
      if (!res.ok) {
        let data = {};
        try { data = await res.json(); } catch (_) { /* non-JSON error body */ }
        throw new Error(data.message || `Request failed (${res.status})`);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `gcf-concept-note-inputs-${code}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      say('gcfCnHint', `${code} — ${format.toUpperCase()} downloaded.`);
    } catch (err) {
      say('gcfCnHint', err.message);
    }
  }

  /* ── 7. Intake ────────────────────────────────────────────── */
  const tierSelect = id => `<select id="${id}">${
    TIERS.map(t => `<option value="${t}">${t}</option>`).join('')}</select>`;

  /* The record's vocabularies — stages, results areas, instruments, barriers,
     document kinds — come from the reference, so the form offers exactly what
     the schema accepts and labels it the way the screen does. */
  const refv = k => ((state.reference && state.reference.vocabulary) || {})[k] || [];
  const refStages = () => Object.entries((state.reference && state.reference.cycle && state.reference.cycle.recordStages) || {});
  const refAreas = () => ((state.reference && state.reference.resultsAreas) || {}).areas || [];
  const refInstruments = () => ((state.reference && state.reference.instruments) || {}).instruments || [];
  const refBarriers = () => ((state.reference && state.reference.instruments) || {}).barriers || [];

  const INTAKE = () => [
    { group: 'The project' },
    { id: 'code', label: 'Code', kind: 'text' },
    { id: 'name', label: 'Project name', kind: 'text' },
    { id: 'sector', label: 'Sector', kind: 'text' },
    { id: 'province', label: 'Province', kind: 'text' },
    { id: 'stream', label: 'Stream', kind: 'select', options: refv('streams').map(s => [s, s]) },
    { id: 'resultsArea', label: 'GCF results area', kind: 'select', options: refAreas().map(a => [a.code, `${a.code} — ${a.name}`]) },
    { id: 'stage', label: 'Stage on the project cycle', kind: 'select', options: refStages().map(([k, v]) => [k, v.label]) },
    { id: 'essCategory', label: 'Environmental and social category', kind: 'select', options: refv('essCategories').map(s => [s, s]) },
    { id: 'taxonomyBand', label: 'Sri Lanka taxonomy band', kind: 'select', options: [['green', 'green'], ['amber', 'amber'], ['red', 'red'], ['unclassified', 'unclassified']] },
    { id: 'ndcTargets', label: 'NDC 3.0 sector targets (comma-separated)', kind: 'text' },
    { group: 'Money' },
    { id: 'totalCost', label: 'Total cost (USD)', kind: 'number' },
    { id: 'gcfAsk', label: 'GCF ask (USD)', kind: 'number' },
    { id: 'dfcc', label: 'DFCC contribution (USD)', kind: 'number' },
    { id: 'other', label: 'Other co-financing (USD)', kind: 'number' },
    { id: 'instrument', label: 'GCF instrument', kind: 'select', options: refInstruments().map(i => [i.id, i.name]) },
    { id: 'viable', label: 'Viable without GCF support', kind: 'select', options: [['no', 'No'], ['yes', 'Yes']] },
    { id: 'viabilityReason', label: 'Viability without GCF — the reason', kind: 'wide' },
    { id: 'barriers', label: 'Barriers to commercial finance', kind: 'checks', options: refBarriers().map(b => [b.id, b.label]) },
    { group: 'Results — with the evidence tier on every figure' },
    { id: 'annual', label: 'Annual tCO₂e', kind: 'tiered' },
    { id: 'lifetime', label: 'Lifetime tCO₂e', kind: 'tiered' },
    { id: 'direct', label: 'Direct beneficiaries', kind: 'tiered' },
    { id: 'indirect', label: 'Indirect beneficiaries', kind: 'tiered' },
    { id: 'hectares', label: 'Hectares under improved management', kind: 'tiered' },
    { id: 'assets', label: 'Assets made resilient (USD)', kind: 'tiered' },
    { id: 'baselineType', label: 'Baseline type', kind: 'select', options: refv('baselineTypes').map(s => [s, s]) },
    { id: 'baselineDesc', label: 'Baseline', kind: 'wide' },
    { id: 'counterfactual', label: 'Counterfactual — what happens without the project', kind: 'wide' },
    { group: 'The case' },
    { id: 'selectionReason', label: 'Why this project (40 characters minimum)', kind: 'wide' },
  ];

  function renderIntake() {
    setHtml('gcfIntakeForm', INTAKE().map(f => {
      if (f.group) return `<div class="gcf-group">${esc(f.group)}</div>`;
      const wide = f.kind === 'wide' || f.kind === 'checks' ? ' gcf-field-wide' : '';
      let ctl;
      if (f.kind === 'select') {
        ctl = `<select id="gcfI-${f.id}">${f.options.map(([v, l]) =>
          `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
      } else if (f.kind === 'checks') {
        ctl = `<div class="gcf-checks" id="gcfI-${f.id}">${f.options.map(([v, l]) =>
          `<label><input type="checkbox" value="${esc(v)}"> ${esc(l)}</label>`).join('')}</div>`;
      } else if (f.kind === 'tiered') {
        /* A figure and its evidence tier are entered together, because the
           schema refuses the number without it. */
        ctl = `<div class="gcf-tiered">
          <input type="number" id="gcfI-${f.id}" step="any">
          ${tierSelect(`gcfI-${f.id}-tier`)}
        </div>`;
      } else if (f.kind === 'wide') {
        ctl = `<textarea id="gcfI-${f.id}" rows="2"></textarea>`;
      } else {
        ctl = `<input type="${f.kind === 'number' ? 'number' : 'text'}" id="gcfI-${f.id}">`;
      }
      return `<div class="gcf-field${wide}">
        <label for="gcfI-${f.id}">${esc(f.label)}</label>${ctl}</div>`;
    }).join(''));
  }

  const val = id => ($(`gcfI-${id}`)?.value ?? '').trim();
  const numVal = id => { const v = val(id); return v === '' ? null : Number(v); };
  const tiered = id => (numVal(id) === null ? null : { value: numVal(id), tier: $(`gcfI-${id}-tier`)?.value || 'declared' });
  const checked = id => Array.from(document.querySelectorAll(`#gcfI-${id} input:checked`)).map(i => i.value);

  async function saveIntake() {
    const err = $('gcfIntakeError');
    if (err) err.hidden = true;
    const code = val('code');
    const reason = val('selectionReason');
    if (reason.length < 40) {
      if (err) { err.hidden = false; err.textContent = 'The selection reasoning needs at least 40 characters.'; }
      return;
    }
    const adaptation = val('stream') === 'adaptation';
    const payload = {
      id: `gcf_${code.toLowerCase().replace(/[^a-z0-9]+/g, '_') || Date.now()}`,
      code,
      name: val('name'),
      location: { province: val('province'), districts: [], country: 'LK' },
      sector: val('sector'),
      resultsArea: val('resultsArea'),
      stream: val('stream'),
      stage: val('stage'),
      selectionReason: reason,
      essCategory: val('essCategory'),
      taxonomy: { framework: 'SLGFT', band: val('taxonomyBand') },
      ndcSectorTargets: val('ndcTargets').split(',').map(s => s.trim()).filter(Boolean),
      barriers: checked('barriers'),
      financing: {
        currency: 'USD',
        totalCost: numVal('totalCost'),
        gcfAsk: numVal('gcfAsk'),
        dfcc: numVal('dfcc'),
        other: numVal('other') ?? 0,
        instrument: val('instrument'),
        viabilityWithoutGcf: { viable: val('viable') === 'yes', reason: val('viabilityReason') },
      },
      mitigation: {
        annual_tCO2e: tiered('annual') || { value: null, tier: 'declared' },
        lifetime_tCO2e: tiered('lifetime') || { value: null, tier: 'declared' },
        baseline: {
          description: val('baselineDesc'),
          counterfactual: val('counterfactual'),
          type: val('baselineType'),
        },
        isCoBenefit: adaptation,
      },
      beneficiaries: {
        direct: tiered('direct') || { value: null, tier: 'declared' },
        indirect: tiered('indirect') || { value: null, tier: 'declared' },
      },
      area: tiered('hectares') ? { hectares: tiered('hectares') } : {},
      assets: tiered('assets') ? { valueProtected_usd: tiered('assets') } : {},
      timeline: { conceptStarted: new Date().toISOString().slice(0, 10) },
    };

    try {
      await call('/pipeline', json('POST', payload));
      say('gcfIntakeHint', `${code} recorded.`);
      /* A new record changes every panel, so they are all re-read rather than
         showing what they said before the write. */
      refreshAll();
      GCFPipeline.openProject(payload.id);
      show('pipeline');
    } catch (e) {
      if (err) { err.hidden = false; err.textContent = e.message; }
      say('gcfIntakeHint', '');
    }
  }

  async function loadIntake() {
    renderIntake();
    for (const el of document.querySelectorAll('#gcfPanel-intake [data-writes]')) el.hidden = !canWrite();
    try {
      const { pipeline } = await call('/pipeline');
      const s = pipeline.storage || {};
      setHtml('gcfStorage', `
        <p style="font-size:12.5px;margin:0">
          Mode <strong>${esc(s.mode || 'unknown')}</strong> —
          ${s.writable ? 'writes persist' : 'writes are refused rather than accepted and lost'}${
            s.durable ? ' and survive a cold start' : ''}.
        </p>`);
    } catch (_) { setHtml('gcfStorage', '<p class="gcf-hint">Storage mode unavailable.</p>'); }
  }

  const LOADERS = {
    pipeline: loadPipeline,
    emissions: loadEmissions,
    decision: loadDecision,
    instruments: loadInstruments,
    reporting: loadReporting,
    cn: loadCn,
    intake: loadIntake,
  };

  function refreshAll() {
    for (const p of PANELS) if (loaded[p]) LOADERS[p]();
  }

  /* ── Wiring ───────────────────────────────────────────────── */
  async function init() {
    /* Read the overlay BEFORE the first request. This is the fourth instance
       of this shape in this codebase: state loaded after the first fetch is
       state that vanishes on reload. */
    loadWeights();

    try {
      const ref = await call('/reference');
      state.reference = ref;
      state.defaults = ref.defaultWeights || {};
    } catch (_) { /* the banner keeps its static text */ }

    GCFPipeline.init({
      call, canWrite, onSample, refreshAll,
      reference: () => state.reference,
    });

    document.querySelectorAll('#gcfTabs .gcf-tab').forEach(t => {
      t.addEventListener('click', () => show(t.dataset.panel));
    });

    on('gcfRecompute', 'click', () => {
      state.weights = {};
      for (const k of Object.keys(state.defaults)) {
        const v = Number($(`gcfW-${k}`)?.value);
        if (Number.isFinite(v) && v !== state.defaults[k]) state.weights[k] = v;
      }
      saveWeights();
      renderWeightControls();
      refreshDecision();
    });

    on('gcfWeightsReset', 'click', () => {
      /* Removes the override rather than writing the defaults back — a reset
         that wrote them back would reintroduce the drift it exists to clear. */
      state.weights = {};
      saveWeights();
      renderWeightControls();
      refreshDecision();
    });

    on('gcfEntitySave', 'click', async () => {
      try {
        await saveEntity();
        say('gcfEntityHint', 'Recorded. The gaps that depend on these are now closed.');
        refreshReport();
      } catch (e) { say('gcfEntityHint', e.message); }
    });

    on('gcfAccreditationSave', 'click', async () => {
      const g = id => ($(`gcfA-${id}`)?.value || '').trim();
      const ceiling = Number(g('ceiling'));
      const accreditation = {
        decision: g('decision'), sizeCategory: g('sizeCategory'),
        sizeRange_usd: [0, Number.isFinite(ceiling) && ceiling > 0 ? ceiling : (SIZE_CEILING[g('sizeCategory')] || 0)],
        essCategory: g('essCategory'), grantModality: g('grantModality') === 'yes',
        modalities: g('modalities').split(',').map(s => s.trim()).filter(Boolean),
        accreditedAt: g('accreditedAt') || undefined, amaEffectiveAt: g('amaEffectiveAt') || undefined,
        source: g('source') || undefined,
      };
      try {
        await saveEntity({ accreditation });
        say('gcfAccreditationHint', 'Recorded. Every gate now reads the entity’s own accreditation.');
        refreshAll();
      } catch (e) { say('gcfAccreditationHint', e.message); }
    });

    on('gcfExport', 'click', async () => {
      try {
        const pkg = await call('/export');
        const url = URL.createObjectURL(new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url; a.download = `gcf-period-package-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        say('gcfExportHint', `${pkg.projects.length} projects — checksum ${pkg.checksum.slice(0, 12)}… downloaded.`);
      } catch (e) { say('gcfExportHint', e.message); }
    });

    on('gcfCnPdf', 'click', () => downloadCn('pdf'));
    on('gcfCnDocx', 'click', () => downloadCn('docx'));
    on('gcfIntakeSave', 'click', saveIntake);
    on('gcfInstallStarter', 'click', async () => {
      try {
        const r = await call('/pipeline/install-starter', { method: 'POST' });
        say('gcfIntakeHint', `${r.installed} starter projects loaded — they are recorded and yours to edit.`);
        refreshAll();
        show('pipeline');
      } catch (e) { say('gcfIntakeHint', e.message); }
    });
    on('gcfAdopt', 'click', async () => {
      try {
        const r = await call('/pipeline/adopt', { method: 'POST' });
        say('gcfIntakeHint', `${r.adopted} projects adopted — they are now yours to edit.`);
        refreshAll();
        show('pipeline');
      } catch (e) { say('gcfIntakeHint', e.message); }
    });

    const fromHash = (window.location.hash.match(/^#gcf\/(\w+)/) || [])[1];
    show(fromHash || 'pipeline');
  }

  return { init, refresh: refreshAll };
})();
