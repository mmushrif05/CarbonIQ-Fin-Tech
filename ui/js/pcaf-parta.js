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
    ['dataQualityOverrideJustification', 'text'],
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

  /* The renewable-generation path. Two of these carry the whole assessment;
     the other three sharpen it. Nothing here is an emissions figure — the
     scopes, the displacement and the data quality option are all derived. */
  const GENERATION_FIELDS = [
    ['country',                   'text'],
    ['technology',                'text'],
    ['basis',                     'text'],
    ['installedCapacity_MW',      'number'],
    ['annualGeneration_MWh',      'number'],
    ['yieldBasis',                'text'],
    ['auxiliaryConsumption_MWh',  'number'],
    ['lifetimeYears',             'number'],
    ['degradationRatePct',        'number'],
  ];

  /* There is no table of avoided-emissions inputs any more. The counterfactual,
     its source and its estimation basis used to be typed — which meant the most
     consequential claim in an avoidance figure rested on free text. They now
     come out of the grid factor store, so the figure carries a named publisher
     and vintage, the basis is whatever the store holds for that country, and
     the estimation basis is physical activity by construction. The two bases
     PCAF prohibits are unreachable rather than merely discouraged. */

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
      dataQualityOptionChosen: '1b',
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
      projectScope3_tCO2e: '',
      scope3Relevant: false,
      removals_tCO2e: '',
      attributionOverrideJustification: '',
      /* 90,600 MWh from 60 MW is a 17.2% capacity factor — inside Sri Lanka's
         band, and outside Norway's, which is the point of switching country. */
      generation: {
        country: 'LK',
        technology: 'solar_pv',
        basis: 'projected',
        installedCapacity_MW: 60,
        annualGeneration_MWh: 90600,
        yieldBasis: 'P50',
        auxiliaryConsumption_MWh: '',
        lifetimeYears: 25,
        degradationRatePct: 0.5,
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
      dataQualityOptionChosen: '2b',
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

    const cfg = _reference.countryConfig;
    el('pa-gen-country').innerHTML = (cfg.countries || [])
      .map(c => `<option value="${esc(c.code)}">${esc(c.name)}</option>`).join('');
    el('pa-gen-technology').innerHTML = Object.values(cfg.technologies || {})
      .map(t => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('');

    _populateDqOptions();
    _describeAssetClass();
  }

  /** The country whose factors this run would use. */
  /** The asset class this run uses — its own data-quality table and denominator. */
  function _currentAssetClass() {
    const id = el('pa-assetClass').value;
    return _reference.assetClasses.find(c => c.id === id) || _reference.assetClasses[0];
  }

  const _cfg = () => _reference.countryConfig;

  function _currentCoverage() {
    const code = el('pa-gen-country').value;
    return (_cfg().coverage || []).find(c => c.code === code) || null;
  }

  /* Said before the engine is asked, because what the store holds is a fact
     about the country rather than about this particular project. */
  function _describeCountry() {
    const c = _currentCoverage();
    const note = el('pa-gen-countryNote');
    if (!c) { note.textContent = ''; note.className = 'parta-country-note'; return; }
    const parts = [];
    if (!c.canComputeAvoided) {
      parts.push(`No combined margin is held for ${c.name}, and a grid average must not stand in `
        + 'for one. Avoided emissions will be reported as absent.');
    } else if (c.avoidedIsGlobal) {
      parts.push('Displacement rests on a global default, so the data quality option drops.');
    }
    if (c.scope2IsGlobal) {
      parts.push(`No national grid average is held for ${c.name}, so the global average is used `
        + 'and the data quality option drops.');
    }
    note.textContent = parts.join(' ');
    note.className = 'parta-country-note' + (parts.length ? ' parta-country-note-warn' : '');
  }

  /* Which field drives which. The derived one must not look typed. */
  function _applyModeGate() {
    const metered = el('pa-gen-basis').value === 'metered';
    el('pa-gen-modeNote').textContent = metered
      ? 'Generation is primary and is never overwritten. Capacity is used only for the physical check.'
      : 'Capacity is primary. Generation is estimated from it and stays editable — type over it and it stops recomputing.';
    el('pa-yieldField').hidden = metered;
    el('pa-capacityField').classList.toggle('parta-field-primary', !metered);
    el('pa-generationField').classList.toggle('parta-field-primary', metered);
    el('pa-capacityRole').textContent = metered ? 'Plausibility check only.' : 'Drives the generation figure.';
    el('pa-generationRole').textContent = metered ? 'Metered output for the period.' : 'Derived — edit to override.';
  }

  function _populateDqOptions() {
    const cls = _currentAssetClass();
    const html = cls.dataQualityOptions
      .map(o => `<option value="${esc(o.option)}">Option ${esc(o.option)} — score ${esc(o.score)} · ${esc(o.family)}</option>`)
      .join('');
    for (const id of ['pa-dataQualityOption', 'pa-dataQualityOptionChosen']) {
      const sel = el(id);
      const keep = sel.value;
      sel.innerHTML = html;
      if (cls.dataQualityOptions.some(o => o.option === keep)) sel.value = keep;
    }
    _describeDqOption();
  }

  function _describeDqOption() {
    const cls = _currentAssetClass();
    const row = cls.dataQualityOptions.find(o => o.option === el('pa-dataQualityOptionChosen').value);
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
    /* An avoidance project is assessed from what it generates, so the typed
       scope boxes are not merely hidden — they are not the input path at all,
       and the data quality option stops being a choice. */
    const derives = a.impact === 'avoided';
    el('pa-generationBox').hidden = !derives;
    el('pa-emissionsBox').hidden  = derives;
    el('pa-dqDerived').hidden     = !derives;
    el('pa-dqChoose').hidden      = derives;
    el('pa-reductionBox').hidden  = a.impact !== 'reduction';
    el('pa-noImpactBox').hidden   = Boolean(a.impact);
    if (derives) { _describeCountry(); _applyModeGate(); }
  }

  /** True when this run derives its emissions rather than being told them. */
  const _derives = () => !el('pa-generationBox').hidden;

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
      const g = {};
      for (const [name, kind] of GENERATION_FIELDS) {
        const v = readField('pa-gen-' + name, kind);
        if (v !== undefined) g[name] = v;
      }
      /* Sent once both fields that decide the answer are present. Asking with
         a country but no generation would draw a validation error while the
         user is still typing the generation. */
      if (Number.isFinite(g.annualGeneration_MWh) && g.country) body.generation = g;
    }

    /* The option is derived unless the claim panel has been deliberately
       opened. Closed means "use what the evidence supports"; open means a
       claim is being made, and the engine decides whether it was earned. */
    if (_derives()) {
      const claim = el('pa-dqClaim');
      if (claim && claim.open) {
        const claimed = readField('pa-dataQualityOption', 'text');
        if (claimed) body.dataQualityOption = claimed;
      }
    } else {
      const chosen = readField('pa-dataQualityOptionChosen', 'text');
      if (chosen) body.dataQualityOption = chosen;
    }

    return body;
  }

  /* What the engine cannot proceed without. Asking before these are present
     would answer every keystroke with a validation error. The two paths need
     different things, which is the whole point of there being two. */
  function _ready(body) {
    if (!body.projectName
      || !Number.isFinite(body.outstandingAmount)
      || !Number.isFinite(body.totalProjectEquityPlusDebt)) return false;

    return body.generation
      ? Number.isFinite(body.generation.annualGeneration_MWh) && Boolean(body.generation.country)
      : Number.isFinite(body.projectScope1_tCO2e)
        && Number.isFinite(body.projectScope2_tCO2e)
        && Boolean(body.dataQualityOption);
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

    _renderGeneration(r.generation);

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

    /* Where the option was derived, the derivation is shown beside the form
       control rather than only in the result — the user needs to see why the
       score is what it is at the moment they might try to change it. */
    const derivedLabel = el('pa-dqDerivedLabel');
    const derivedWhy   = el('pa-dqDerivedReason');
    if (inv.dataQuality.derivationReason) {
      derivedLabel.textContent = `Option ${inv.dataQuality.derivedOption} — ${inv.dataQuality.label}`;
      derivedWhy.textContent   = inv.dataQuality.derivationReason;
    }

    const ovr = el('paDqOverride');
    ovr.hidden = !inv.dataQuality.overrideJustification;
    ovr.textContent = inv.dataQuality.overrideJustification
      ? `Option claimed above the derived ${inv.dataQuality.derivedOption} on the stated `
        + `justification: ${inv.dataQuality.overrideJustification}`
      : '';

    _renderImpact(r.impact);
    _renderTrace(r);
    el('paStandardLine').textContent = r.standard;
  }

  /**
   * The grid factor, the physical check and the assumptions.
   *
   * All three exist because the emissions were derived rather than typed. A
   * derived figure has to show its factor — publisher, vintage and basis — or
   * it is no more accountable than the text box it replaced.
   */
  function _renderGeneration(g) {
    const boxes = ['paGridBox', 'paCheckBox', 'paAssumptionsBox'];
    if (!g) { boxes.forEach(id => { el(id).hidden = true; }); return; }

    // ── the two factors, each labelled with the basis it actually is ──
    el('paGridBox').hidden = false;
    const d = g.factors.displacement, c = g.factors.consumption;
    el('paGridCountry').textContent =
      `${g.country} · ${g.technology} · generation ${g.annualGeneration.source}`;

    el('paGridDisplaced').textContent = d.absent ? 'Not held' : `${d.value} ${d.unit}`;
    el('paGridDisplacedBasis').textContent = d.absent
      ? 'Combined margin — avoided emissions cannot be computed'
      : `CDM combined margin${d.isGlobalDefault ? ' — global default' : ''}`;
    el('paGridDisplacedBasis').classList.toggle('parta-basis-warn', Boolean(d.absent || d.isGlobalDefault));

    el('paGridConsumed').textContent = `${c.value} ${c.unit}`;
    el('paGridConsumedBasis').textContent = `Grid average${c.isGlobalDefault ? ' — global default' : ''}`;
    el('paGridConsumedBasis').classList.toggle('parta-basis-warn', Boolean(c.isGlobalDefault));

    const cited = d.absent ? c : d;
    el('paGridSource').textContent = `${cited.publisher} — ${cited.source} (${cited.year})`;

    /* A figure resting on a global default is not wrong, but it is a weaker
       claim and PCAF scores it lower. Saying so beside the factor is the
       point of the fallback being allowed at all. */
    const anyGlobal = d.isGlobalDefault || c.isGlobalDefault;
    el('paGlobalFlag').hidden = !anyGlobal;
    el('paGlobalFlag').textContent = anyGlobal
      ? 'Global default in use — no national factor is held for this basis. The data quality '
        + 'option drops, because PCAF Option 2a requires a factor specific to the data.'
      : '';

    const sub = el('paGridSubstitution');
    sub.hidden = !d.absent;
    sub.textContent = d.absent ? d.reason : '';

    el('paGridFlag').hidden = true;

    // ── the physical check ──
    const p = g.plausibility;
    el('paCheckBox').hidden = false;
    if (!p.ran) {
      el('paCheckCf').textContent = 'Not run';
      el('paCheckBand').textContent = '';
      el('paSpecificYield').textContent = '—';
      el('paCheckEq').textContent = '';
      el('paCheckNote').textContent = p.reason;
      el('paCheckBox').className = 'parta-card parta-plaus';
    } else {
      el('paCheckCf').textContent = `${p.capacityFactorPct}%`;
      el('paSpecificYield').textContent = p.specificYield_kWh_per_kWp.toLocaleString('en-GB');
      el('paCheckBand').textContent = p.hasBand
        ? `band ${(p.band.low * 100).toFixed(0)}–${(p.band.high * 100).toFixed(0)}% · ${p.reference}`
        : `reference ${(p.referenceCf * 100).toFixed(1)}% · ${p.reference}`;
      el('paCheckEq').textContent = `${p.equation}\n${p.specificYieldEquation}`;
      el('paCheckNote').textContent = p.note;
      const tone = p.status === 'within_band' ? ' parta-check-ok'
        : p.status === 'no_band' ? ''
          : ' parta-check-warn';
      el('paCheckBox').className = 'parta-card parta-plaus' + tone;
    }

    const list = g.assumptions || [];
    el('paAssumptionsBox').hidden = !list.length;
    el('paAssumptions').innerHTML = list.map(a => `<li>${esc(a)}</li>`).join('');
  }

  const _basisName = b => (b === 'combinedMargin' ? 'CDM combined margin' : 'Grid average');
  const _titleCase = s2 => (s2 ? s2.charAt(0).toUpperCase() + s2.slice(1) : '');

  function _renderImpact(impact) {
    const has = impact && impact.metrics && impact.metrics.length;
    const absentClaim = impact && impact.absent;

    el('paBreak').hidden     = !(has || absentClaim);
    el('paImpactBox').hidden = !(has || absentClaim);
    if (!has && !absentClaim) return;

    el('paImpactArchetype').textContent =
      `${impact.archetype} — reported separately from the inventory above.`;

    /* A country with no combined margin reports the claim as absent rather
       than computing it from a factor that measures something else. */
    el('paImpactAbsent').hidden = !absentClaim;
    el('paImpactAbsent').textContent = absentClaim ? impact.absent.reason : '';

    el('paMetrics').innerHTML = !has ? '' : impact.metrics.map(m => {
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

    const lt = impact.lifetime;
    el('paLifetimeBox').hidden = !lt;
    if (lt) {
      el('paLifetimeLabel').textContent =
        `Lifetime, financed — ${lt.years} years at ${lt.degradationPct}% degradation`;
      el('paLifetime').textContent = `${fmt(lt.value)} tCO2e`;
      el('paLifetimeNote').textContent = `${lt.trajectoryNote} ${lt.degradationNote}`;
    }

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
    if (r.generation) {
      push('Project scope 1 (derived)', r.generation.projectScope1);
      push('Project scope 2 (derived)', r.generation.projectScope2);
      if (!r.generation.projectAvoided.absent) {
        push('Project avoided emissions (derived)', r.generation.projectAvoided);
      }
    }
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
    for (const [field] of REDUCTION_FIELDS)  writeField('pa-reduction-' + field,  p.reduction  ? p.reduction[field]  : '');
    for (const [field] of GENERATION_FIELDS) writeField('pa-gen-' + field,       p.generation ? p.generation[field] : '');

    document.querySelectorAll('.parta-preset').forEach(b =>
      b.classList.toggle('active', b.dataset.preset === name));

    _populateDqOptions();
    if (p.generation) { _describeCountry(); _applyModeGate(); }
    if (p.dataQualityOptionChosen) writeField('pa-dataQualityOptionChosen', p.dataQualityOptionChosen);
    /* A preset never arrives claiming an option it has not earned, so the
       claim panel is closed and its justification cleared on every switch. */
    if (el('pa-dqClaim')) el('pa-dqClaim').open = false;
    writeField('pa-dataQualityOverrideJustification', '');
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
    el('pa-dataQualityOptionChosen').addEventListener('change', _describeDqOption);
    el('pa-gen-country').addEventListener('change', () => { _describeCountry(); schedule(); });
    el('pa-gen-technology').addEventListener('change', schedule);
    el('pa-gen-basis').addEventListener('change', () => { _applyModeGate(); schedule(); });
    /* Opening or closing the claim panel changes what is sent, so it has to
       re-ask — a <details> toggle is not an input event. */
    if (el('pa-dqClaim')) el('pa-dqClaim').addEventListener('toggle', schedule);

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
