/* ============================================================
   CarbonIQ — PCAF Part A (financed emissions), manual entry
   ============================================================

   Every figure on this screen comes from POST /v1/pcaf/part-a/assess. The
   page holds no arithmetic of its own — not the attribution factor, not the
   financed emissions, not the data-quality score. A number computed in the
   browser and a number computed by the engine would agree until the day they
   did not, and the disagreement would surface in a disclosure.

   So the loop is: read the form, ask the engine, render what came back.
   Typing re-asks after a short pause. The engine answers in single-digit
   milliseconds, so there is nothing to wait for.

   The engine's refusals are part of the product and are shown, not hidden.
   An attribution factor above 1, a missing counterfactual, a prohibited
   estimation basis — each returns the clause and the remedy, and this screen
   renders them where the result would have been.

   The AI layer is deliberately absent. Classification, extraction and
   narrative come later; the arithmetic never moves.
   ============================================================ */

const PCAFPartAPage = (() => {

  /* Every field that reaches the request, and how to read it. Kept as data so
     collect() and applyPreset() cannot fall out of step with each other. */
  const FIELDS = [
    ['projectName',                      'text'],
    ['counterparty',                     'text'],
    ['sector',                           'text'],
    ['reportingYear',                    'number'],
    ['assetClass',                       'text'],
    ['archetype',                        'text'],
    ['outstandingAmount',                'number'],
    ['totalProjectEquityPlusDebt',       'number'],
    ['currency',                         'text'],
    ['attributionOverrideJustification', 'text'],
    ['dataQualityOption',                'text'],
    ['projectScope1_tCO2e',              'number'],
    ['projectScope2_tCO2e',              'number'],
    ['projectScope3_tCO2e',              'number'],
    ['removals_tCO2e',                   'number'],
    ['scope3Relevant',                   'bool'],
  ];

  const REDUCTION_FIELDS = [
    ['baseYear',                   'number'],
    ['baseYearEmissions_tCO2e',    'number'],
    ['targetYear',                 'number'],
    ['targetYearEmissions_tCO2e',  'number'],
    ['asOfYear',                   'number'],
  ];

  const AVOIDED_FIELDS = [
    ['projectAvoided_tCO2e',           'number'],
    ['annualAvoided_tCO2e',            'number'],
    ['counterfactual',                 'text'],
    ['counterfactualSource',           'text'],
    ['estimationBasis',                'text'],
    ['years',                          'number'],
    ['reportingPeriod',                'text'],
    ['counterpartyEmissionsPeriod',    'text'],
  ];

  /* Bases offered for avoided emissions. The two PCAF forbids are listed on
     purpose: a guardrail nobody can see is a guardrail nobody trusts, and
     choosing one here returns the standard's own refusal. */
  const ESTIMATION_BASES = [
    { value: 'physical-activity', label: 'Physical activity data (generation output × displaced factor)' },
    { value: 'measured',          label: 'Measured / metered output' },
    { value: 'economic-intensity', label: 'Economic intensity — PCAF prohibits this' },
    { value: 'input-output',       label: 'Input-output / EEIO model — PCAF prohibits this' },
  ];

  /* Worked examples. Figures are illustrative, but each set is internally
     consistent so the arithmetic on screen can be checked by hand. */
  const PRESETS = {
    cement: {
      projectName: 'Cement Company 1 — kiln electrification',
      counterparty: 'Cement Company 1',
      sector: 'Cement manufacturing',
      reportingYear: 2026,
      assetClass: 'project-finance',
      archetype: 'efficiency-retrofit',
      outstandingAmount: 40000000,
      totalProjectEquityPlusDebt: 160000000,
      currency: 'USD',
      dataQualityOption: '1b',
      projectScope1_tCO2e: 480000,
      projectScope2_tCO2e: 60000,
      projectScope3_tCO2e: 95000,
      scope3Relevant: true,
      removals_tCO2e: '',
      attributionOverrideJustification: '',
      reduction: {
        baseYear: 2025,
        baseYearEmissions_tCO2e: 540000,
        targetYear: 2030,
        targetYearEmissions_tCO2e: 320000,
        asOfYear: 2027,
      },
    },
    solar: {
      projectName: 'Solar Project — 60 MW ground mount',
      counterparty: 'Solar Project SPV',
      sector: 'Renewable electricity generation',
      reportingYear: 2026,
      assetClass: 'project-finance',
      archetype: 'renewable-generation',
      outstandingAmount: 12000000,
      totalProjectEquityPlusDebt: 40000000,
      currency: 'USD',
      dataQualityOption: '2a',
      projectScope1_tCO2e: 60,
      projectScope2_tCO2e: 400,
      projectScope3_tCO2e: '',
      scope3Relevant: false,
      removals_tCO2e: '',
      attributionOverrideJustification: '',
      avoided: {
        projectAvoided_tCO2e: 44500,
        annualAvoided_tCO2e: 48000,
        counterfactual: 'Grid electricity that would otherwise have been supplied from the national system',
        counterfactualSource: 'CEB Long Term Generation Expansion Plan 2023-2042, published grid emission factor',
        estimationBasis: 'physical-activity',
        years: 25,
        reportingPeriod: '2026',
        counterpartyEmissionsPeriod: '2026',
      },
    },
    blank: {
      projectName: '',
      counterparty: '',
      sector: '',
      reportingYear: new Date().getFullYear(),
      assetClass: 'project-finance',
      archetype: 'general',
      outstandingAmount: '',
      totalProjectEquityPlusDebt: '',
      currency: 'USD',
      dataQualityOption: '2b',
      projectScope1_tCO2e: '',
      projectScope2_tCO2e: '',
      projectScope3_tCO2e: '',
      scope3Relevant: false,
      removals_tCO2e: '',
      attributionOverrideJustification: '',
    },
  };

  let _reference = null;
  let _timer = null;
  let _seq = 0;

  // ── small helpers ───────────────────────────────────────────
  const el = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmt = (n, dp = 2) => (Number.isFinite(n)
    ? n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })
    : '—');

  function readField(id, kind) {
    const node = el(id);
    if (!node) return undefined;
    if (kind === 'bool') return node.checked;
    const raw = node.value.trim();
    if (raw === '') return undefined;
    if (kind === 'number') {
      const v = Number(raw);
      return Number.isFinite(v) ? v : undefined;
    }
    return raw;
  }

  function writeField(id, value) {
    const node = el(id);
    if (!node) return;
    if (node.type === 'checkbox') node.checked = Boolean(value);
    else node.value = value === undefined || value === null ? '' : String(value);
  }

  // ── reference data drives every selector ────────────────────
  /* The options a form offers come from the engine's own tables, so a screen
     cannot present an option the engine would then reject. */
  async function _loadReference() {
    const res = await window.CARBONIQ_fetch('/v1/pcaf/part-a/reference');
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.message || `Reference data unavailable (${res.status}).`);
      err.code = body.error;
      throw err;
    }
    return body;
  }

  function _populateSelectors() {
    const ac = el('pa-assetClass');
    ac.innerHTML = _reference.assetClasses
      .map(c => `<option value="${esc(c.id)}">${esc(c.label)} — §${esc(c.section)}</option>`).join('');

    const arch = el('pa-archetype');
    arch.innerHTML = _reference.archetypes
      .map(a => `<option value="${esc(a.id)}">${esc(a.label)}</option>`).join('');

    const basis = el('pa-avoided-estimationBasis');
    basis.innerHTML = ESTIMATION_BASES
      .map(b => `<option value="${esc(b.value)}">${esc(b.label)}</option>`).join('');

    _populateDqOptions();
    _describeAssetClass();
  }

  function _currentAssetClass() {
    const id = el('pa-assetClass').value;
    return _reference.assetClasses.find(c => c.id === id) || _reference.assetClasses[0];
  }

  function _populateDqOptions() {
    const cls = _currentAssetClass();
    const sel = el('pa-dataQualityOption');
    const keep = sel.value;
    sel.innerHTML = cls.dataQualityOptions
      .map(o => `<option value="${esc(o.option)}">Option ${esc(o.option)} — score ${esc(o.score)} · ${esc(o.family)}</option>`)
      .join('');
    if (cls.dataQualityOptions.some(o => o.option === keep)) sel.value = keep;
    _describeDqOption();
  }

  function _describeDqOption() {
    const cls = _currentAssetClass();
    const row = cls.dataQualityOptions.find(o => o.option === el('pa-dataQualityOption').value);
    el('pa-dqWhen').textContent = row ? row.when : '';
    el('pa-dqTableNote').textContent =
      `${cls.dataQualityTable} for ${cls.label.toLowerCase()}. `
      + 'The option-to-score mapping differs between asset classes, so this table belongs to this class alone.';
  }

  function _describeAssetClass() {
    const cls = _currentAssetClass();
    el('pa-assetClassNote').textContent = cls.scopes;
    el('pa-denominatorNote').textContent =
      `The lender's share is the outstanding amount over the ${cls.denominator}.`;
    el('pa-denominatorField').childNodes[0].nodeValue =
      cls.denominator.charAt(0).toUpperCase() + cls.denominator.slice(1);
  }

  /* The project type decides which impact inputs exist. A user cannot pick
     freely: reporting a reduction as an avoidance is the confusion this
     gating exists to prevent. */
  function _applyArchetypeGate() {
    const id = el('pa-archetype').value;
    const a = _reference.archetypes.find(x => x.id === id) || {};
    el('pa-archetypeNote').textContent = a.description
      ? `${a.description}${a.comparedAgainst ? ` Measured against ${a.comparedAgainst}.` : ''}`
      : '';
    el('pa-reductionBox').hidden  = a.impact !== 'reduction';
    el('pa-avoidedBox').hidden    = a.impact !== 'avoided';
    el('pa-noImpactBox').hidden   = Boolean(a.impact);
  }

  // ── build the request ───────────────────────────────────────
  function collect() {
    const body = {};
    for (const [name, kind] of FIELDS) {
      const v = readField('pa-' + name, kind);
      if (v !== undefined) body[name] = v;
    }

    const archetype = body.archetype;
    const a = (_reference.archetypes || []).find(x => x.id === archetype) || {};

    if (a.impact === 'reduction') {
      const r = {};
      for (const [name, kind] of REDUCTION_FIELDS) {
        const v = readField('pa-reduction-' + name, kind);
        if (v !== undefined) r[name] = v;
      }
      /* Sent only when complete. A half-filled block would draw a refusal
         about a missing field while the user is still typing the field. */
      if (['baseYear', 'baseYearEmissions_tCO2e', 'targetYear', 'targetYearEmissions_tCO2e']
        .every(k => r[k] !== undefined)) body.reduction = r;
    }

    if (a.impact === 'avoided') {
      const v = {};
      for (const [name, kind] of AVOIDED_FIELDS) {
        const got = readField('pa-avoided-' + name, kind);
        if (got !== undefined) v[name] = got;
      }
      if (v.projectAvoided_tCO2e !== undefined || v.annualAvoided_tCO2e !== undefined) body.avoided = v;
    }

    return body;
  }

  /* The six fields the engine cannot proceed without. Asking before they are
     present would answer every keystroke with a validation error. */
  function _ready(body) {
    return Boolean(body.projectName)
      && Number.isFinite(body.outstandingAmount)
      && Number.isFinite(body.totalProjectEquityPlusDebt)
      && Boolean(body.dataQualityOption)
      && Number.isFinite(body.projectScope1_tCO2e)
      && Number.isFinite(body.projectScope2_tCO2e);
  }

  // ── ask the engine ──────────────────────────────────────────
  async function recompute() {
    const body = collect();

    if (!_ready(body)) {
      el('paOutput').hidden = true;
      el('paRefusal').hidden = true;
      el('paEmpty').hidden = false;
      return;
    }

    /* Out-of-order responses would render an older result over a newer one. */
    const mine = ++_seq;

    let res, data;
    try {
      res = await window.CARBONIQ_fetch('/v1/pcaf/part-a/assess', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      data = await res.json().catch(() => ({}));
    } catch (err) {
      if (mine !== _seq) return;
      return _renderRefusal({ error: 'NETWORK', message: err.message
        || 'The request did not reach the server.' });
    }

    if (mine !== _seq) return;

    if (!res.ok || data.error) return _renderRefusal(data, res.status);
    _render(data);
  }

  function schedule() {
    clearTimeout(_timer);
    _timer = setTimeout(recompute, 220);
  }

  // ── render a refusal ────────────────────────────────────────
  function _renderRefusal(data, status) {
    el('paEmpty').hidden = true;
    el('paOutput').hidden = true;
    el('paRefusal').hidden = false;
    el('paRefusalCode').textContent = data.error || `HTTP ${status || ''}`.trim();
    el('paRefusalMsg').textContent = data.message || 'The engine refused this input.';
    const remedy = el('paRefusalRemedy');
    remedy.textContent = data.remedy || '';
    remedy.hidden = !data.remedy;

    /* An override is offered only once the engine has actually refused the
       factor, and it is removed again as soon as the inputs are valid. */
    el('pa-overrideBox').hidden = data.error !== 'ATTRIBUTION_ABOVE_ONE';
  }

  // ── render a result ─────────────────────────────────────────
  function _render(r) {
    el('paRefusal').hidden = true;
    el('paEmpty').hidden = true;
    el('paOutput').hidden = false;

    const af = r.attribution;
    el('paAf').textContent = af.value.toFixed(4);
    el('paAfEq').textContent = af.equation;
    el('paAfRef').textContent = af.reference || '';
    const assumption = el('paAfAssumption');
    assumption.hidden = !(af.assumptions && af.assumptions.length);
    assumption.textContent = (af.assumptions || []).join(' ');
    if (af.assumptions && af.assumptions.length) el('pa-overrideBox').hidden = false;

    const inv = r.inventory;
    el('paCategory').textContent = inv.category;
    el('paScope12').textContent = fmt(inv.scope1And2.value);
    el('paScope1').textContent  = fmt(inv.scope1.value);
    el('paScope2').textContent  = fmt(inv.scope2.value);

    /* An unmeasured scope and a scope of nought are different claims, so an
       absent scope 3 is never drawn as a zero. */
    const s3 = inv.scope3;
    const s3absent = s3 && s3.absent;
    el('paScope3').textContent = s3absent ? 'Not reported' : fmt(s3.value);
    el('paScope3Unit').innerHTML = s3absent ? '' : 'tCO<sub>2</sub>e';
    el('paScope3Figure').classList.toggle('parta-figure-absent', Boolean(s3absent));
    const s3note = el('paScope3Absent');
    s3note.hidden = !s3absent;
    s3note.textContent = s3absent ? s3.reason : '';

    const rem = el('paRemovalsBox');
    rem.hidden = !inv.removals;
    if (inv.removals) {
      el('paRemovals').textContent = `${fmt(inv.removals.value)} tCO2e`;
      el('paRemovalsNote').textContent = inv.removalsNote || '';
    }

    el('paIntensity').textContent = inv.economicIntensity_tCO2e_per_M === null
      ? '—'
      : `${fmt(inv.economicIntensity_tCO2e_per_M)} tCO2e per million ${esc(r.project.currency || '')}`.trim();
    el('paIntensityNote').textContent = inv.economicIntensityNote || '';

    /* The label the engine composed — "Data quality score: 3 (Option 2b)" —
       with the scale beside it. Never restated as a fraction. */
    el('paDq').textContent      = inv.dataQuality.label;
    el('paDqScale').textContent = inv.dataQuality.scale;
    el('paDqRef').textContent   = inv.dataQuality.reference;

    _renderImpact(r.impact);
    _renderTrace(r);
    el('paStandardLine').textContent = r.standard;
  }

  function _renderImpact(impact) {
    const has = impact && impact.metrics && impact.metrics.length;
    el('paBreak').hidden     = !has;
    el('paImpactBox').hidden = !has;
    if (!has) return;

    el('paImpactArchetype').textContent = `${impact.archetype} — reported separately from the inventory above.`;
    el('paMetrics').innerHTML = impact.metrics.map(m => {
      const f = m.figure;
      const notes = [m.comparedAgainst ? `Compared against ${esc(m.comparedAgainst)}.` : '',
        esc(m.annualisedNote || ''), esc(m.achievedNote || ''), esc(m.scopeNote || '')]
        .filter(Boolean).join(' ');
      return `
        <div class="parta-metric">
          <span class="parta-metric-name">${esc(m.metric)}</span>
          <span class="parta-metric-value">${fmt(f.value)} <small>${esc(f.unit)}</small></span>
          <code class="parta-eq">${esc(f.equation)}</code>
          ${m.counterfactual ? `<p class="parta-metric-cf"><strong>Counterfactual:</strong> ${esc(m.counterfactual)}<br>
             <strong>Source:</strong> ${esc(m.counterfactualSource)}</p>` : ''}
          ${notes ? `<p class="parta-metric-note">${notes}</p>` : ''}
          <p class="parta-ref">${esc(f.reference || '')}</p>
        </div>`;
    }).join('');
    el('paNotComparable').textContent = impact.notComparable;
  }

  function _renderTrace(r) {
    const rows = [];
    const push = (label, t) => {
      if (!t || t.absent) return;
      rows.push(`
        <details class="parta-trace-row">
          <summary><span>${esc(label)}</span><b>${fmt(t.value)} ${esc(t.unit)}</b></summary>
          <code class="parta-eq">${esc(t.equation)}</code>
          <dl>${Object.entries(t.inputs).map(([k, v]) =>
            `<div><dt>${esc(k)}</dt><dd>${esc(typeof v === 'number' ? v.toLocaleString('en-GB') : v)}</dd></div>`).join('')}</dl>
          <p class="parta-ref">${esc(t.basis)}${t.reference ? ` — ${esc(t.reference)}` : ''}</p>
        </details>`);
    };

    push('Attribution factor', r.attribution);
    push('Financed scope 1', r.inventory.scope1);
    push('Financed scope 2', r.inventory.scope2);
    push('Financed scope 1 and 2', r.inventory.scope1And2);
    push('Financed scope 3', r.inventory.scope3);
    push('Removals', r.inventory.removals);
    (r.impact.metrics || []).forEach(m => push(m.metric, m.figure));

    el('paTrace').innerHTML = rows.join('');
  }

  // ── presets ─────────────────────────────────────────────────
  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;

    for (const [field] of FIELDS) {
      if (Object.prototype.hasOwnProperty.call(p, field)) writeField('pa-' + field, p[field]);
    }
    for (const [field] of REDUCTION_FIELDS) writeField('pa-reduction-' + field, p.reduction ? p.reduction[field] : '');
    for (const [field] of AVOIDED_FIELDS)   writeField('pa-avoided-' + field,   p.avoided   ? p.avoided[field]   : '');

    document.querySelectorAll('.parta-preset').forEach(b =>
      b.classList.toggle('active', b.dataset.preset === name));

    _populateDqOptions();
    writeField('pa-dataQualityOption', p.dataQualityOption);
    _describeDqOption();
    _describeAssetClass();
    _applyArchetypeGate();
    el('pa-overrideBox').hidden = true;
    recompute();
  }

  // ── wiring ──────────────────────────────────────────────────
  function _wire() {
    el('paForm').addEventListener('input', schedule);
    el('paForm').addEventListener('change', schedule);
    el('paForm').addEventListener('submit', e => e.preventDefault());

    el('pa-assetClass').addEventListener('change', () => {
      _populateDqOptions(); _describeAssetClass(); schedule();
    });
    el('pa-archetype').addEventListener('change', () => { _applyArchetypeGate(); schedule(); });
    el('pa-dataQualityOption').addEventListener('change', _describeDqOption);

    document.querySelectorAll('.parta-preset').forEach(btn =>
      btn.addEventListener('click', () => applyPreset(btn.dataset.preset)));
  }

  async function init() {
    try {
      _reference = await _loadReference();
    } catch (err) {
      /* Without the reference tables the form cannot honestly offer options,
         so it says so rather than falling back to a list of its own. */
      return _renderRefusal({
        error: err.code || 'REFERENCE_UNAVAILABLE',
        message: err.message,
        remedy: 'The screen needs GET /v1/pcaf/part-a/reference to populate the '
          + 'asset class, project types and the data-quality table. Check the API key '
          + 'in Settings, then reload.',
      });
    }

    el('paStandard').textContent = _reference.standard;
    _populateSelectors();
    _wire();
    applyPreset('cement');
  }

  return { init, recompute, applyPreset, collect, PRESETS };
})();
