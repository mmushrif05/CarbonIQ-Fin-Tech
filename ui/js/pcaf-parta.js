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

  /* Whether the operator typed the generation figure themselves. A preset does
     not count, and neither does the engine writing its own estimate back into
     the field — only a keystroke does. This was the bug: the preset supplied
     90,600, the engine correctly classified it as user-supplied, so it froze
     across every country and technology AND claimed a better data quality
     option than it had earned. */
  let _userSuppliedGeneration = false;
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
      /* In projected mode the engine owns this field unless the operator has
         taken it. Sending back the engine's own estimate would make every run
         look "supplied" and quietly inflate the data quality option. */
      if (g.basis !== 'metered' && !_userSuppliedGeneration) delete g.annualGeneration_MWh;
      /* Sent once both fields that decide the answer are present. Asking with
         a country but no generation would draw a validation error while the
         user is still typing the generation. */
      /* Attach on what the mode actually needs. Requiring a generation figure
         here meant the block was never sent once the preset stopped supplying
         one — and the entire result panel stayed hidden. */
      const enough = g.basis === 'metered'
        ? Number.isFinite(g.annualGeneration_MWh)
        : Number.isFinite(g.installedCapacity_MW) || Number.isFinite(g.annualGeneration_MWh);
      if (g.country && enough) body.generation = g;
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

    if (!body.generation) {
      return Number.isFinite(body.projectScope1_tCO2e)
        && Number.isFinite(body.projectScope2_tCO2e)
        && Boolean(body.dataQualityOption);
    }

    /* The two modes need different things, which is the point of there being
       two. Projected derives generation from capacity, so demanding a
       generation figure here would keep the whole result panel hidden — which
       is exactly what it did. Metered reports what the plant produced, so the
       figure is required and never derived. */
    const g = body.generation;
    if (!g.country) return false;
    return g.basis === 'metered'
      ? Number.isFinite(g.annualGeneration_MWh)
      : Number.isFinite(g.installedCapacity_MW) || Number.isFinite(g.annualGeneration_MWh);
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

    if (r.generation) _syncGenerationField(r.generation.annualGeneration);
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

    _renderHero(r);
    _renderDqScale(r.inventory.dataQuality);
    _renderLifetimeChart(r);
    _renderImpact(r.impact);
    _renderSummary(r);
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
  /* The engine's estimate goes back into the field so it stays editable, and
     the field says which of the two it is holding. */
  function _syncGenerationField(g) {
    const node = el('pa-gen-annualGeneration_MWh');
    if (!node) return;
    const derived = g.source === 'derived';
    if (derived) node.value = g.value;
    node.dataset.derived = derived ? 'true' : 'false';
    el('pa-genDerivedTag').hidden = !derived;
    el('pa-genOverrideTag').hidden = !(g.source === 'supplied');
    el('pa-genReset').hidden = !(g.source === 'supplied');
  }

  /** Hand the field back to the engine. */
  function resetGenerationToDerived() {
    _userSuppliedGeneration = false;
    writeField('pa-gen-annualGeneration_MWh', '');
    recompute();
  }

  /** The chain, rendered as steps a client can follow with a pencil. */
  function _renderDerivation(g) {
    const box = el('pa-derivationBox');
    const d = g && g.derivation;
    if (!d) {
      box.hidden = !(g && g.overrideNote);
      if (g && g.overrideNote) {
        el('pa-derivationChain').innerHTML = '';
        el('pa-derivationResult').textContent = fmt(g.value, 0);
        el('pa-derivationScope').textContent = 'Entered';
        el('pa-derivationScope').className = 'parta-tag parta-tag-typed';
        el('pa-derivationWhy').textContent = g.overrideNote;
      }
      return;
    }
    box.hidden = false;
    el('pa-derivationScope').textContent = d.cfIsGlobal ? 'Global capacity factor' : 'National capacity factor';
    el('pa-derivationScope').className = 'parta-tag ' + (d.cfIsGlobal ? 'parta-tag-global' : 'parta-tag-derived');
    el('pa-derivationChain').innerHTML = d.steps.map(st => `
      <li>
        <span class="parta-chain-label">${esc(st.label)}</span>
        <span class="parta-chain-value">${esc(st.pct !== undefined ? st.pct + '%' : fmt(st.value, st.unit === 'ratio' ? 3 : 0))}
          <em>${esc(st.unit === 'ratio' ? '' : st.unit)}</em></span>
        ${st.source ? `<span class="parta-chain-source">${esc(st.source)}</span>` : ''}
      </li>`).join('');
    el('pa-derivationResult').textContent = fmt(d.result, 0);
    el('pa-derivationWhy').textContent = d.whyUnchangedNote;
  }

  function _renderGeneration(g) {
    _renderDerivation(g && g.annualGeneration);
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
    _renderGridCompare(g);

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
    _renderCfGauge(p);

    const list = g.assumptions || [];
    el('paAssumptionsBox').hidden = !list.length;
    el('paAssumptions').innerHTML = list.map(a => `<li>${esc(a)}</li>`).join('');
    el('paAssumptionCount').textContent = String(list.length);
  }

  const _basisName = b => (b === 'combinedMargin' ? 'CDM combined margin' : 'Grid average');
  const _titleCase = s2 => (s2 ? s2.charAt(0).toUpperCase() + s2.slice(1) : '');


  /* ── Hero, attribution, chart, summary ──────────────────────────────────
     Everything here is read off the response. The chart plots the per-year
     series the engine actually summed, so it cannot drift from the total
     printed above it. */

  const _round = (n, dp) => Number(n).toLocaleString('en-GB',
    { minimumFractionDigits: dp, maximumFractionDigits: dp });


  /* ── Visual encodings ───────────────────────────────────────────────────
     Each of these replaces a paragraph that was carrying a number. The rule
     is the same as everywhere else on this screen: they are drawn from the
     response, never from a second calculation done here. */

  /**
   * This country's displaced factor against every other one held.
   *
   * One series, so no legend — each bar is labelled. The selected country is
   * emphasised rather than given its own hue, because colour here would be
   * encoding selection, not data.
   */
  function _renderGridCompare(g) {
    const box = el('paGridCompare');
    const cov = _reference.countryConfig && _reference.countryConfig.coverage;
    if (!g || !cov) { box.innerHTML = ''; return; }

    const here = g.countryCode;
    const rows = cov.map(c => ({
      code: c.code, name: c.name,
      /* The displacement factor where held, else the average that stands in
         for it — the same value the engine used, flagged the same way. */
      value: c.combined_margin != null ? c.combined_margin : c.grid_average,
      isGlobal: c.avoidedIsGlobal || c.combined_margin == null,
      absent: c.combined_margin == null && c.grid_average == null,
    })).filter(r => r.value != null);

    if (!rows.length) { box.innerHTML = ''; return; }
    const max = Math.max(...rows.map(r => r.value));

    box.innerHTML = `
      <div class="parta-compare-head">Displaced factor by country
        <span>tCO<sub>2</sub>e/MWh</span></div>
      ${rows.map(r => `
        <div class="parta-compare-row${r.code === here ? ' is-here' : ''}">
          <span class="parta-compare-name">${esc(r.name)}</span>
          <span class="parta-compare-track">
            <span class="parta-compare-fill" style="width:${((r.value / max) * 100).toFixed(1)}%"></span>
          </span>
          <span class="parta-compare-value">${esc(r.value)}${r.isGlobal ? '<i>*</i>' : ''}</span>
        </div>`).join('')}
      <p class="parta-compare-foot">${rows.some(r => r.isGlobal)
        ? '* no combined margin held — the grid average stands in, and the data quality option drops.'
        : ''}</p>`;
  }

  /** Where this plant sits between nothing and the technology's ceiling. */
  function _renderCfGauge(pl) {
    const gauge = el('paCfGauge');
    if (!pl || !pl.ran || !pl.limits) { gauge.hidden = true; return; }
    gauge.hidden = false;
    const ceiling = pl.limits.ceiling;
    const pos = Math.max(0, Math.min(1, pl.capacityFactor / ceiling)) * 100;
    const ref = Math.max(0, Math.min(1, pl.referenceCf / ceiling)) * 100;
    el('paGaugeFill').style.width = `${pos.toFixed(1)}%`;
    el('paGaugeRef').style.left = `${ref.toFixed(1)}%`;
    el('paGaugeRef').firstElementChild.textContent = `${(pl.referenceCf * 100).toFixed(1)}%`;
    el('paGaugeRefLabel').textContent = `reference ${(pl.referenceCf * 100).toFixed(1)}%`;
    el('paGaugeMax').textContent = `${(ceiling * 100).toFixed(0)}% ceiling`;
  }

  /** The five bands, with this run's marked. 1 is best; the scale says so. */
  function _renderDqScale(dq) {
    const scale = el('paDqScale5');
    if (!scale) return;
    scale.setAttribute('aria-label',
      `Data quality band ${dq.score} of 5, where 1 is the strongest evidence`);
    for (const band of scale.children) {
      band.classList.toggle('is-here', Number(band.dataset.band) === dq.score);
    }
  }

  /**
   * Count up to a new value.
   *
   * The screen recomputes on every keystroke, and a number that simply
   * replaces itself gives no sign it moved. Short, eased, and skipped
   * entirely under prefers-reduced-motion.
   */
  const _reduceMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function _countTo(node, to, dp) {
    const from = Number(String(node.textContent).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(from) || from === to || _reduceMotion()) {
      node.textContent = fmt(to, dp); return;
    }
    const start = performance.now(), dur = 380;
    cancelAnimationFrame(node._raf);
    const step = now => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = fmt(from + (to - from) * eased, dp);
      if (t < 1) node._raf = requestAnimationFrame(step);
    };
    node._raf = requestAnimationFrame(step);
  }

  function _renderHero(r) {
    const inv = r.inventory;
    _countTo(el('paHeroValue'), inv.scope1And2.value, 2);
    el('paHeroDq').textContent = inv.dataQuality.label;
    el('paHeroDq').className = 'parta-chip ' + (inv.dataQuality.score <= 2
      ? 'parta-chip-good' : inv.dataQuality.score <= 3 ? 'parta-chip-mid' : 'parta-chip-weak');

    const yieldChip = el('paHeroYield');
    const g = r.generation && r.generation.annualGeneration;
    const showYield = Boolean(g && g.yieldBasis);
    yieldChip.hidden = !showYield;
    if (showYield) yieldChip.textContent = `${g.yieldBasis} · ${g.source === 'derived' ? 'estimated' : g.source}`;

    /* Attribution drawn as the share it is. 0.3000 is a ratio; a bar is a share. */
    const af = r.attribution.value;
    const pct = Math.max(0, Math.min(1, af)) * 100;
    el('paAttribLender').style.width = `${pct.toFixed(1)}%`;
    el('paAttribPct').textContent = `${_round(pct, 1)}%`;
    el('paAttribRestPct').textContent = `${_round(100 - pct, 1)}%`;
    el('paAttribDesc').textContent =
      `Of the project's own scope 1 and 2 emissions, ${_round(pct, 1)}% is attributed to this `
      + `lender — the outstanding amount over the total project equity plus debt. The other `
      + `${_round(100 - pct, 1)}% belongs to whoever else financed it, and is not this bank's to report.`;

    el('paMeansInventory').textContent =
      `This is the ${fmt(inv.scope1And2.value)} tCO2e the bank puts in its own scope 3 Category 15 `
      + `inventory for this exposure — not the project's total, but the ${_round(pct, 1)}% share its `
      + `lending attributes to it. ${inv.dataQuality.label}, on a scale where 1 is the best `
      + `evidence and 5 the weakest. `
      + (inv.dataQuality.score >= 4
        ? 'At this level the figure rests on defaults rather than project data, and an assurance '
          + 'provider will ask what would strengthen it.'
        : 'That is a defensible level for a disclosure, provided the inputs behind it hold up.');
  }

  /**
   * Avoided emissions year by year.
   *
   * One series, so no legend — the title names it. The first and last years
   * are labelled directly rather than every bar, and the axis is recessive.
   */
  function _renderLifetimeChart(r) {
    const fig = el('paLifetimeChart');
    const life = r.generation && r.generation.lifetime;
    const series = life && life.series;
    if (!series || series.length < 2) { fig.hidden = true; return; }
    fig.hidden = false;

    const W = 640, H = 190, PAD_L = 8, PAD_R = 8, PAD_T = 26, PAD_B = 26;
    const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
    const max = Math.max(...series.map(d => d.avoided_tCO2e));
    const gap = 2;
    const bw = Math.max(2, (plotW - gap * (series.length - 1)) / series.length);

    const bars = series.map((d, i) => {
      const h = Math.max(1, (d.avoided_tCO2e / max) * plotH);
      const x = PAD_L + i * (bw + gap);
      const y = PAD_T + (plotH - h);
      return `<rect class="parta-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}"
        height="${h.toFixed(1)}" rx="2"><title>${d.year}: ${fmt(d.avoided_tCO2e)} tCO2e</title></rect>`;
    }).join('');

    const first = series[0], last = series[series.length - 1];
    el('paChartBody').innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="none"
           aria-label="Avoided emissions declining from ${fmt(first.avoided_tCO2e)} to ${fmt(last.avoided_tCO2e)} tCO2e over ${series.length} years">
        <line class="parta-axis" x1="${PAD_L}" y1="${PAD_T + plotH}" x2="${W - PAD_R}" y2="${PAD_T + plotH}"/>
        ${bars}
        <text class="parta-bar-label" x="${PAD_L}" y="${PAD_T - 9}">${fmt(first.avoided_tCO2e, 0)}</text>
        <text class="parta-bar-label parta-bar-label-end" x="${W - PAD_R}" y="${PAD_T - 9}">${fmt(last.avoided_tCO2e, 0)}</text>
        <text class="parta-axis-label" x="${PAD_L}" y="${H - 8}">${first.year}</text>
        <text class="parta-axis-label parta-bar-label-end" x="${W - PAD_R}" y="${H - 8}">${last.year}</text>
      </svg>`;

    const declinePct = (1 - last.avoided_tCO2e / first.avoided_tCO2e) * 100;
    /* In metered mode the headline is what actually happened, so a 25-year
       curve beside it has to say plainly that it is a projection FROM that
       year — otherwise ex-post and ex-ante sit together unlabelled. */
    const metered = r.generation && r.generation.mode === 'metered';
    el('paChartSub').textContent =
      `${fmt(life.value, 0)} tCO2e over ${life.years} years · financed share`
      + (metered ? ' · projected forward from the metered year' : '');
    el('paChartNote').textContent =
      `Output falls ${life.degradationPct}% a year, so the final year avoids ${_round(declinePct, 1)}% `
      + `less than the first. ${life.trajectory === 'flat'
        ? 'The grid factor is held flat across the whole life, which is conservative in one '
          + 'direction only: on a grid that is decarbonising this OVERSTATES the later years.'
        : 'A declining grid factor has been applied year by year.'}`;

    el('paMeansImpact').textContent =
      `Avoided emissions are what the grid did not emit because this plant generated instead. They `
      + `are NOT part of the ${fmt(r.inventory.scope1And2.value)} tCO2e above and are never added to `
      + `it — PCAF requires them reported separately, and they rest on supplemental guidance rather `
      + `than on Part A itself. A lender may cite them alongside the inventory, never inside it.`;
  }

  function _renderSummary(r) {
    const inv = r.inventory;
    const g = r.generation && r.generation.annualGeneration;
    const items = [];
    const pct = _round(r.attribution.value * 100, 1);

    items.push(`This bank reports <b>${fmt(inv.scope1And2.value)} tCO2e</b> of financed scope 1 and 2 `
      + `for this exposure, being its <b>${pct}%</b> share of the project.`);

    if (g) {
      items.push(`Based on <b>${fmt(g.value, 0)} MWh</b> a year, `
        + `${g.source === 'metered' ? '<b>metered</b> from the plant'
          : g.source === 'supplied' ? '<b>entered</b> by the user'
          : '<b>estimated</b> from installed capacity and a capacity factor'}.`);
    }

    const impact = (r.impact.metrics || [])[0];
    if (impact) {
      items.push(`Separately, it finances <b>${fmt(impact.figure.value)} ${esc(impact.figure.unit)}</b> `
        + `of avoided emissions — reported apart from the figure above, never added to it.`);
    } else if (r.generation && r.generation.avoided && r.generation.avoided.absent) {
      items.push('Avoided emissions <b>cannot be stated</b> for this country: '
        + esc(r.generation.avoided.reason || ''));
    }

    items.push(`Data quality is <b>${esc(inv.dataQuality.label)}</b>, where 1 is the strongest `
      + `evidence and 5 the weakest.`);

    el('paSummaryList').innerHTML = items.map(t => `<li>${t}</li>`).join('');

    const weak = [];
    if (g && g.derivation && g.derivation.cfIsGlobal) weak.push('a global capacity factor rather than a national one');
    const f = r.generation && r.generation.factors;
    if (f && (f.consumption.isGlobalDefault || f.displacement.isGlobalDefault)) {
      weak.push('a global grid emission factor');
    }
    if (inv.dataQuality.score >= 4) weak.push('no project-specific generation data');
    el('paSummaryCaveat').textContent = weak.length
      ? `Before this supports a disclosure, the weakest links are: ${weak.join('; ')}. `
        + 'Each is a place evidence would move the score.'
      : 'No global defaults were used in this run.';
  }

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
          ${(m.counterfactual || notes || f.reference) ? `
            <details class="parta-basis">
              <summary>Basis and sources</summary>
              ${m.counterfactual ? `<p class="parta-metric-cf"><strong>Counterfactual:</strong> ${esc(m.counterfactual)}<br>
                 <strong>Source:</strong> ${esc(m.counterfactualSource)}</p>` : ''}
              ${notes ? `<p class="parta-metric-note">${notes}</p>` : ''}
              <p class="parta-ref">${esc(f.reference || '')}</p>
            </details>` : ''}
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

    /* Every field, not just the ones this preset names. Writing only the keys a
       preset owns left the previous preset's values standing — switching from
       Cement to Solar carried 480,000 tCO2e of scope 1 across with it. */
    for (const [field] of FIELDS) {
      writeField('pa-' + field, Object.prototype.hasOwnProperty.call(p, field) ? p[field] : '');
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
    _userSuppliedGeneration = false;
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
    /* A keystroke in the generation field — and only that — takes ownership. */
    el('pa-gen-annualGeneration_MWh').addEventListener('input', () => {
      _userSuppliedGeneration = true;
    });
    el('pa-genReset').addEventListener('click', resetGenerationToDerived);

    /* Country, technology and yield basis all feed the estimate, so each one
       re-derives it — which is what "90,600 never changes" was reporting. */
    for (const id of ['pa-gen-country', 'pa-gen-technology', 'pa-gen-yieldBasis']) {
      const node = el(id);
      if (!node) continue;
      node.addEventListener('change', () => {
        if (!_userSuppliedGeneration) writeField('pa-gen-annualGeneration_MWh', '');
        if (id === 'pa-gen-country') _describeCountry();
        schedule();
      });
    }
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
