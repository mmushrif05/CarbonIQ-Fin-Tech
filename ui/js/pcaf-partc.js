/* ============================================================
   CarbonIQ — PCAF Part C (Insurance-Associated Emissions)

   Separate from the PCAF Calculator page, which handles A1-A3
   financed emissions for lending. The two scopes are never merged.

   The screen stays clean: assumptions, data gaps and the audit
   trail sit behind their own tabs rather than interrupting.
   ============================================================ */

const PCAFPartCPage = (() => {

  let lastPayload = null;
  let lastResult  = null;

  const $  = id => document.getElementById(id);

  /** Read a File as base64, without the data: prefix the API doesn't want. */
  const toBase64 = file => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });

  /** Agents return prose around their JSON; pull the object out. */
  function extractJson(text) {
    const m = String(text || '').match(/\{[\s\S]*\}/);
    if (!m) throw new Error('The agent returned no structured result');
    return JSON.parse(m[0]);
  }
  const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US',
    { minimumFractionDigits: d, maximumFractionDigits: d });

  // ── Worked example — the Fisheries reference project ──────
  const DEMO_BOQ = [
    'Providing and laying 1:2:4 cement concrete in foundations and floors ...... 18.65 m3',
    'Rubble masonry in 1:5 cement mortar ...................................... 6 m3',
    'Supplying and fixing timber doors and windows ............................ 32.3 m2',
    'Supplying and laying ceramic/porcelain floor tiles ....................... 22 m2',
    'Timber cupboards and fitted joinery ...................................... 0.5 m3',
    'Mild steel grills to windows ............................................. 12 m2',
    'Aluminium doors and cladding panels ...................................... 8.8 m2',
    'High tensile reinforcement steel (Tor) ................................... 0.05 MT',
    'PVC pipe 110mm diameter .................................................. 22.8 m',
    'PVC pipe 63mm diameter ................................................... 14 m'
  ].join('\n');

  const DEMO_MATERIALS = [
    { id: 'concrete',   name: 'Concrete (all grades)',      quantity: 18.65, unit: 'm3', densityKey: 'concrete_normal',   wasteCategory: 'Concrete in situ',                              serviceLifeCategory: 'Structure',      confidence: 'high' },
    { id: 'rubble',     name: 'Rubble masonry (stone)',     quantity: 6,     unit: 'm3', densityKey: 'rubble_masonry',    wasteCategory: 'Stone (cladding)',                               serviceLifeCategory: 'Structure',      confidence: 'medium' },
    { id: 'timber_dw',  name: 'Timber doors/windows',       quantity: 32.3,  unit: 'm2', massFactorKey: 'timber_door',    wasteCategory: 'Timber frames (beams, columns, joists, braces)', serviceLifeCategory: 'Timber joinery', confidence: 'high' },
    { id: 'tiles',      name: 'Ceramic/porcelain tiles',    quantity: 22,    unit: 'm2', massFactorKey: 'ceramic_tile',   wasteCategory: 'Floor finish (tile)',                            serviceLifeCategory: 'Ceramic tile',   confidence: 'high' },
    { id: 'timber_cup', name: 'Timber cupboards',           quantity: 0.5,   unit: 'm3', densityKey: 'timber',            wasteCategory: 'Timber frames (beams, columns, joists, braces)', serviceLifeCategory: 'Timber joinery', confidence: 'medium' },
    { id: 'ms_grills',  name: 'MS grills (mild steel)',     quantity: 12,    unit: 'm2', massFactorKey: 'ms_grill',       wasteCategory: 'Steel frame (beams, columns, braces)',            serviceLifeCategory: 'MS grills',      confidence: 'high' },
    { id: 'aluminium',  name: 'Aluminium (doors/cladding)', quantity: 8.8,   unit: 'm2', massFactorKey: 'aluminium_sheet',wasteCategory: 'Aluminium extruded profiles/frames',              serviceLifeCategory: 'Aluminium',      confidence: 'high' },
    { id: 'rebar',      name: 'Reinforcement steel (Tor)',  quantity: 0.05,  unit: 'MT', massFactorKey: 'steel_mt',       wasteCategory: 'Steel reinforcement',                            serviceLifeCategory: 'Structure',      confidence: 'high' },
    { id: 'pvc110',     name: 'PVC pipe 110mm',             quantity: 22.8,  unit: 'm',  massFactorKey: 'pvc_110mm',      wasteCategory: 'PVC pipework (not in T18)',                      serviceLifeCategory: 'PVC pipework',   confidence: 'medium' },
    { id: 'pvc63',      name: 'PVC pipe 63mm',              quantity: 14,    unit: 'm',  massFactorKey: 'pvc_63mm',       wasteCategory: 'PVC pipework (not in T18)',                      serviceLifeCategory: 'PVC pipework',   confidence: 'medium' }
  ];

  const DEMO_DISTANCES = {
    concrete: { road: 25 }, rubble: { road: 25 }, timber_dw: { road: 60 },
    tiles: { road: 130, sea: 3000 }, timber_cup: { road: 60 }, ms_grills: { road: 40 },
    aluminium: { road: 130, sea: 3500 }, rebar: { road: 130, sea: 3000 },
    pvc110: { road: 40 }, pvc63: { road: 40 }
  };

  const DEMO_DEMOLITION = [
    { name: 'Concrete (demolished)',          quantity: 6,   unit: 'm3', densityKey: 'concrete_normal' },
    { name: 'Brickwork (demolished)',         quantity: 3,   unit: 'm3', densityKey: 'brickwork' },
    { name: 'Brick-paved floor (demolished)', quantity: 130, unit: 'm2', massFactor: 100 },
    { name: 'Glazed tiles (demolished)',      quantity: 32,  unit: 'm2', massFactor: 20 }
  ];

  let materials  = [];
  let distances  = {};
  let demolition = [];

  /** Point the segmented control at a value and mirror it into the select. */
  function setPolicyType(value) {
    $('partcPolicyType').value = value;
    document.querySelectorAll('#partcPolicySeg button').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.value === value)));
    applyGate();
  }

  // ── Policy gate: show or hide the use-stage card ──────────
  function applyGate() {
    const type = $('partcPolicyType').value;
    const hasUseStage = type === 'IDI' || type === 'Property';
    $('partcUseStageCard').style.display = hasUseStage ? '' : 'none';
    $('partcYears').disabled = !hasUseStage;
    $('partcGateNote').innerHTML = hasUseStage
      ? `<span class="partc-gate-on">Use stage applies.</span> B1, B4 and B7 will be computed over the cover period and reported as a separate line.`
      : `<span class="partc-gate-off">Construction cover only.</span> A ${type} policy has no use stage, so B1, B4 and B7 are zero by scope rule — not by omission.`;

    document.querySelectorAll('#partcPolicySeg button').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.value === type)));
    refreshProgress();
  }

  /**
   * Mark each step done once it has what it needs. Quiet progress feedback —
   * the user can see how far along they are without being nagged.
   */
  function refreshProgress() {
    const cards = document.querySelectorAll('.partc .partc-card');
    const done = [
      () => !!($('partcPolicyText').value.trim() || $('partcPolicyFile').files[0]),
      () => materials.length > 0,
      () => Number($('partcPremium').value) > 0 && Number($('partcProjectCost').value) > 0,
      () => Number($('partcGifa').value) > 0,
      () => $('partcUseStageCard').style.display === 'none' || !!$('partcRefrigerant').value
    ];
    cards.forEach((card, i) => {
      if (i < done.length) card.classList.toggle('is-done', !!done[i]());
    });
  }

  // ── Populate dropdowns from the factor store ──────────────
  async function loadOptions() {
    try {
      const res = await window.CARBONIQ_fetch('/v1/pcaf/part-c/options');
      const { options } = await res.json();
      const eq = $('partcEquipment'), rf = $('partcRefrigerant');
      if (eq) eq.innerHTML = options.equipmentTypes.map(o =>
        `<option${o === 'Stationary AC (split/unitary)' ? ' selected' : ''}>${o}</option>`).join('');
      if (rf) rf.innerHTML = options.refrigerants.map(o =>
        `<option${o === 'R-410A' ? ' selected' : ''}>${o}</option>`).join('');
    } catch (_) { /* offline — dropdowns stay empty */ }
  }

  function renderMaterials() {
    const el = $('partcMaterials');
    if (!materials.length) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <table class="partc-table">
        <thead><tr><th>Material</th><th>Qty</th><th>Road km</th><th>Sea km</th><th>Rail km</th><th>Mapping</th></tr></thead>
        <tbody>${materials.map(m => {
          const d = distances[m.id] || {};
          return `<tr>
            <td>${m.name}</td>
            <td class="num">${m.quantity} ${m.unit}</td>
            <td><input type="number" class="partc-dist" data-id="${m.id}" data-mode="road" value="${d.road ?? ''}"></td>
            <td><input type="number" class="partc-dist" data-id="${m.id}" data-mode="sea"  value="${d.sea  ?? ''}"></td>
            <td><input type="number" class="partc-dist" data-id="${m.id}" data-mode="rail" value="${d.rail ?? ''}"></td>
            <td class="partc-map">${m.densityKey || m.massFactorKey || '—'}
              <span class="partc-conf partc-conf-${m.confidence || 'medium'}">${m.confidence || ''}</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    el.querySelectorAll('.partc-dist').forEach(inp => {
      inp.addEventListener('input', e => {
        const { id, mode } = e.target.dataset;
        distances[id] = distances[id] || {};
        distances[id][mode] = Number(e.target.value) || 0;
      });
    });
  }

  function loadDemo() {
    $('partcBoq').value = DEMO_BOQ;
    materials  = JSON.parse(JSON.stringify(DEMO_MATERIALS));
    distances  = JSON.parse(JSON.stringify(DEMO_DISTANCES));
    demolition = JSON.parse(JSON.stringify(DEMO_DEMOLITION));
    $('partcPremium').value     = 24448.16;
    $('partcProjectCost').value = 6499442;
    $('partcGifa').value        = 1000;
    renderMaterials();
    $('partcMapStatus').textContent = `${materials.length} materials loaded from the worked example.`;
    refreshProgress();
  }

  // ── Read the policy document with the intake agent ────────
  // Classification decides the whole scope, so this runs before anything else.
  async function readPolicy() {
    const file = $('partcPolicyFile').files[0];
    const text = $('partcPolicyText').value.trim();
    if (!file && !text) { Toast.show('Upload a policy PDF or paste the text.', 'warn'); return; }

    $('partcIntakeStatus').textContent = file ? 'Reading the PDF…' : 'Reading with agent…';
    try {
      const body = file ? { pdfBase64: await toBase64(file) } : { documentText: text };
      const res  = await window.CARBONIQ_fetch('/v1/pcaf/part-c/agent/intake', {
        method: 'POST', body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error([data.message, data.remedy].filter(Boolean).join(' ') || 'Intake failed');

      const parsed = extractJson(data.result);
      const p = parsed.policy || {};

      if (p.policyType) { $('partcPolicyType').value = p.policyType; applyGate(); }
      if (p.premium     > 0) $('partcPremium').value     = p.premium;
      if (p.projectCost > 0) $('partcProjectCost').value = p.projectCost;
      if (p.gifa_m2     > 0) $('partcGifa').value        = p.gifa_m2;
      if (p.yearsOfCover > 0) $('partcYears').value      = p.yearsOfCover;

      const missing = (parsed.extraction && parsed.extraction.missingFields) || [];
      const flags   = (parsed.extraction && parsed.extraction.flags) || [];
      $('partcIntakeStatus').textContent =
        `Read as ${p.policyType || 'unclassified'}` +
        (missing.length ? ` · ${missing.length} field(s) not found` : '') +
        (flags.length   ? ` · ${flags.length} flagged for review`   : '');
    } catch (err) {
      $('partcIntakeStatus').textContent = `Intake unavailable — ${err.message}`;
    }
  }

  // ── Map an arbitrary BOQ using the mapping agent ──────────
  async function mapBoq() {
    const file    = $('partcBoqFile').files[0];
    const content = $('partcBoq').value.trim();
    if (!file && !content) { Toast.show('Upload a BOQ PDF or paste one first.', 'warn'); return; }
    $('partcMapStatus').textContent = file ? 'Reading the PDF and mapping…' : 'Mapping with agent…';
    try {
      const body = file
        ? { pdfBase64: await toBase64(file) }
        : { boqContent: content, boqFormat: 'text' };
      const res = await window.CARBONIQ_fetch('/v1/pcaf/part-c/agent/map', {
        method: 'POST', body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error([data.message, data.remedy].filter(Boolean).join(' ') || 'Mapping failed');

      const parsed = extractJson(data.result);

      materials  = (parsed.materials || []).map((m, i) => ({ ...m, id: m.id || `m${i}` }));
      demolition = parsed.demolitionItems || [];
      distances  = {};
      renderMaterials();
      refreshProgress();
      $('partcMapStatus').textContent =
        `${materials.length} materials mapped, ${demolition.length} demolition items found.` +
        (parsed.summary?.lowConfidenceCount ? ` ${parsed.summary.lowConfidenceCount} need review.` : '');
    } catch (err) {
      $('partcMapStatus').textContent =
        `Mapping unavailable — ${err.message} Use "Load worked example" to explore the engine meanwhile.`;
    }
  }

  function buildPayload() {
    const type = $('partcPolicyType').value;
    return {
      projectName: 'Part C assessment',
      policy: {
        policyType: type,
        basis: 'project_specific',
        premium:     Number($('partcPremium').value)     || 0,
        projectCost: Number($('partcProjectCost').value) || 0,
        yearsOfCover: Number($('partcYears').value)      || 0
      },
      materials,
      distances,
      siteInputs: {
        gifa_m2:         Number($('partcGifa').value)    || 0,
        demolitionKm:    Number($('partcDemoKm').value)  || 0,
        wasteDisposalKm: Number($('partcWasteKm').value) || 0,
        demolitionItems: demolition,
        previousProject: (Number($('partcPrevArea').value) > 0) ? {
          area_m2:         Number($('partcPrevArea').value)   || 0,
          fuel_L:          Number($('partcPrevFuel').value)   || 0,
          electricity_kWh: Number($('partcPrevElec').value)   || 0,
          durationMonths:  Number($('partcPrevMonths').value) || 0
        } : null
      },
      useStage: {
        equipmentType:   $('partcEquipment').value || undefined,
        refrigerant:     $('partcRefrigerant').value || undefined,
        chargeKg:        Number($('partcCharge').value)    || undefined,
        occupants:       Number($('partcOccupants').value) || undefined
      },
      options: { evUsedOnSite: $('partcEv').checked }
    };
  }

  async function run() {
    if (!Number($('partcGifa').value)) { Toast.show('Project GIA is required.', 'warn'); return; }
    $('partcRunStatus').textContent = 'Computing…';
    lastPayload = buildPayload();
    try {
      const res = await window.CARBONIQ_fetch('/v1/pcaf/part-c/assess', {
        method: 'POST', body: JSON.stringify(lastPayload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Assessment failed');
      lastResult = data;
      render(data);
      $('partcResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('partcRunStatus').textContent = `Done — run ${data.runId}`;
      $('partcPdfBtn').disabled = false;
      $('partcDocxBtn').disabled = false;
    } catch (err) {
      $('partcRunStatus').textContent = `Failed: ${err.message}`;
    }
  }

  function render(d) {
    $('partcResult').style.display = '';
    $('partcConstruction').textContent = fmt(d.summary.construction_kgCO2e);
    $('partcUseStage').textContent     = fmt(d.summary.useStage_kgCO2e);
    $('partcIae').textContent          = fmt(d.summary.insurerIAE_tCO2e, 4);
    $('partcPerM2').textContent        = fmt(d.summary.perM2Factor_kgCO2e_m2);

    $('partcModules').innerHTML = `
      <table class="partc-table"><tbody>
        <tr><td>A4 Transport</td><td class="num">${fmt(d.modules.a4)}</td><td><span class="pill in">PCAF figure</span></td></tr>
        ${d.modules.a5Breakdown.map(b =>
          `<tr><td>${b.module} ${b.label.replace(/^A5\.\d\s*/, '')}</td><td class="num">${fmt(b.value)}</td><td><span class="pill in">PCAF figure</span></td></tr>`).join('')}
        <tr class="total"><td>A5 total</td><td class="num">${fmt(d.modules.a5)}</td><td><span class="pill in">PCAF figure</span></td></tr>
        <tr><td>B1 Refrigerant</td><td class="num">${fmt(d.modules.b1)}</td><td><span class="pill out">separate</span></td></tr>
        <tr><td>B4 Replacement (HVAC)</td><td class="num">${fmt(d.modules.b4)}</td><td><span class="pill out">separate</span></td></tr>
        <tr><td>B7 Operational water</td><td class="num">${fmt(d.modules.b7)}</td><td><span class="pill out">separate</span></td></tr>
      </tbody></table>`;

    $('partcDrivers').innerHTML = `
      <table class="partc-table"><tbody>${d.sensitivity.moduleContributions.map(m => `
        <tr><td>${m.module}</td><td class="num">${fmt(m.value)}</td>
        <td class="partc-share">
          <div class="partc-bar"><span data-w="${Math.min(100, m.sharePct)}"></span></div>
          <span class="partc-share-pct">${m.sharePct.toFixed(1)}%</span>
        </td></tr>`).join('')}
      </tbody></table>`;

    $('partcPareto').innerHTML = d.paretoVitalFew.length
      ? `<table class="partc-table"><tbody>${d.paretoVitalFew.map(v =>
          `<tr><td>${v.name}</td><td class="num">${fmt(v.value)}</td><td class="num">${(v.contributionPct * 100).toFixed(1)}%</td></tr>`).join('')}
        </tbody></table>`
      : '<p class="partc-hint">No materials assessed.</p>';

    // Grow the bars from zero on the next frame so the transition is visible.
    requestAnimationFrame(() => document.querySelectorAll('.partc-bar span')
      .forEach(el => { el.style.width = `${el.dataset.w}%`; }));

    $('partcBadgeA').textContent = d.registers.badges.assumptions;
    $('partcBadgeB').textContent = d.registers.badges.dataGaps;
    $('partcBadgeC').textContent = d.registers.badges.auditTrail;
    showRegister('assumptions');

    $('partcDisclosure').textContent = d.disclosureNote;
    $('partcDataQuality').innerHTML =
      `<strong>Option ${d.dataQuality.option}</strong> — ${d.dataQuality.optionLabel} · score ${d.dataQuality.score} ·
       weakest factor tier ${d.dataQuality.worstFactorTier || 'n/a'}`;

    const annexD = $('partcAnnexD');
    if (d.beyondPcafAnnex.total > 0) {
      annexD.style.display = '';
      $('partcAnnexDBody').innerHTML = `<table class="partc-table"><tbody>${
        d.beyondPcafAnnex.breakdown.map(b => `<tr><td>${b.module}</td><td>${b.label}</td><td class="num">${fmt(b.value)}</td></tr>`).join('')
      }</tbody></table>`;
    } else { annexD.style.display = 'none'; }
  }

  function showRegister(which) {
    if (!lastResult) return;
    const r = lastResult.registers;
    const body = $('partcRegisterBody');
    document.querySelectorAll('.partc-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.reg === which));

    if (which === 'assumptions') {
      body.innerHTML = `<p class="partc-hint">${r.assumptions.counts.material} material · ${r.assumptions.counts.notable} notable · ${r.assumptions.counts.info} informational</p>` +
        r.assumptions.entries.map(e =>
          `<div class="partc-entry partc-sev-${e.severity}"><span class="partc-sev">${e.severity}</span>
           <strong>${e.module || e.source}</strong><p>${e.message}</p></div>`).join('');
    } else if (which === 'dataGaps') {
      body.innerHTML =
        `<p class="partc-hint">${r.dataGaps.total} gaps — ${r.dataGaps.fallbacks} fallbacks, ${r.dataGaps.globalTier} Global-tier. Calculated silently, highlighted here.</p>
         <h5>Research priority</h5>
         <table class="partc-table"><tbody>${r.dataGaps.researchPriority.map(p =>
           `<tr><td>${p.rank}</td><td>${p.factorKey}</td><td class="num">${p.sharePct.toFixed(1)}%</td><td>${p.gap}</td></tr>`).join('')}
         </tbody></table>`;
    } else {
      body.innerHTML = `<p class="partc-hint">${r.auditTrail.total} traced calculation steps.</p>` +
        `<table class="partc-table"><thead><tr><th>#</th><th>Module</th><th>Quantity</th><th>Equation</th><th>Value</th></tr></thead><tbody>${
          r.auditTrail.entries.map(e =>
            `<tr><td>${e.step}</td><td>${e.module}</td><td>${e.label}</td><td class="mono">${e.equation}</td><td class="num">${fmt(e.value)} ${e.unit}</td></tr>`).join('')
        }</tbody></table>`;
    }
  }

  // ── Assessment history, with resume for parked runs ───────
  async function loadRuns() {
    $('partcRunsStatus').textContent = 'Loading…';
    try {
      const res  = await window.CARBONIQ_fetch('/v1/pcaf/part-c/runs?limit=15');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not load runs');
      const runs = data.runs || [];

      $('partcRuns').innerHTML = runs.length === 0
        ? '<p class="partc-hint">No assessments yet.</p>'
        : `<table class="partc-table">
             <thead><tr><th>Run</th><th>Project</th><th>Status</th><th>Construction</th><th></th></tr></thead>
             <tbody>${runs.map(r => `
               <tr>
                 <td class="mono">${r.runId}</td>
                 <td>${r.projectName || '—'}</td>
                 <td><span class="partc-status partc-status-${r.status}">${String(r.status).replace(/_/g, ' ')}</span></td>
                 <td class="num">${r.result ? fmt(r.result.construction_kgCO2e) : '—'}</td>
                 <td>${r.status === 'awaiting_inputs'
                       ? `<button class="btn btn-ghost partc-resume" data-run="${r.runId}">Resume</button>`
                       : ''}</td>
               </tr>`).join('')}
             </tbody></table>`;

      $('partcRuns').querySelectorAll('.partc-resume').forEach(b =>
        b.addEventListener('click', () => resumeRun(b.dataset.run)));

      $('partcRunsStatus').textContent =
        `${runs.length} run(s)` +
        (runs.some(r => r.status === 'awaiting_inputs') ? ' — some are waiting on client input.' : '');
    } catch (err) {
      $('partcRunsStatus').textContent = `Unavailable: ${err.message}`;
    }
  }

  /** Pick a parked run back up using whatever is currently on the form. */
  async function resumeRun(runId) {
    $('partcRunsStatus').textContent = `Resuming ${runId}…`;
    try {
      const p = buildPayload();
      const answers = {
        policyType: p.policy.policyType, yearsOfCover: p.policy.yearsOfCover,
        gifa_m2: p.siteInputs.gifa_m2,
        demolitionKm: p.siteInputs.demolitionKm, wasteDisposalKm: p.siteInputs.wasteDisposalKm,
        previousProject: p.siteInputs.previousProject,
        distances: Object.fromEntries(Object.entries(p.distances).map(([k, d]) =>
          [k, { road_km: d.road || 0, sea_km: d.sea || 0, rail_km: d.rail || 0 }])),
        ...p.useStage, evUsedOnSite: p.options.evUsedOnSite
      };
      const res  = await window.CARBONIQ_fetch(`/v1/pcaf/part-c/runs/${runId}/resume`, {
        method: 'POST', body: JSON.stringify({ answers })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Resume failed');
      lastPayload = p; lastResult = data;
      render(data);
      $('partcRunsStatus').textContent = `Resumed ${runId} — assessment complete.`;
      $('partcPdfBtn').disabled = false; $('partcDocxBtn').disabled = false;
      loadRuns();
    } catch (err) {
      $('partcRunsStatus').textContent = `Resume failed: ${err.message}`;
    }
  }

  async function download(format) {
    if (!lastPayload) return;
    const btn = format === 'pdf' ? $('partcPdfBtn') : $('partcDocxBtn');
    const label = btn.textContent;
    btn.textContent = 'Generating…'; btn.disabled = true;
    try {
      const res = await window.CARBONIQ_fetch('/v1/pcaf/part-c/report', {
        method: 'POST',
        body: JSON.stringify({ ...lastPayload, format, includeWlcaAnnex: $('partcWlca').checked })
      });
      if (!res.ok) throw new Error('Report generation failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `pcaf-part-c.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      Toast.show(err.message, 'error');
    } finally { btn.textContent = label; btn.disabled = false; }
  }

  function init() {
    loadOptions();
    applyGate();
    document.querySelectorAll('#partcPolicySeg button').forEach(b =>
      b.addEventListener('click', () => setPolicyType(b.dataset.value)));
    $('partcPolicyType').addEventListener('change', applyGate);
    ['partcPremium', 'partcProjectCost', 'partcGifa', 'partcPolicyText']
      .forEach(id => $(id).addEventListener('input', refreshProgress));
    $('partcPolicyFile').addEventListener('change', refreshProgress);
    $('partcDemoBtn').addEventListener('click', loadDemo);
    $('partcIntakeBtn').addEventListener('click', readPolicy);
    $('partcMapBtn').addEventListener('click', mapBoq);
    $('partcRunsBtn').addEventListener('click', loadRuns);
    $('partcPolicyFile').addEventListener('change', e =>
      $('partcPolicyFileName').textContent = e.target.files[0]
        ? e.target.files[0].name : 'or paste the text below');
    $('partcBoqFile').addEventListener('change', e =>
      $('partcBoqFileName').textContent = e.target.files[0]
        ? e.target.files[0].name : 'or paste the BOQ below');
    $('partcRunBtn').addEventListener('click', run);
    $('partcPdfBtn').addEventListener('click', () => download('pdf'));
    $('partcDocxBtn').addEventListener('click', () => download('docx'));
    document.querySelectorAll('.partc-tab').forEach(t =>
      t.addEventListener('click', () => showRegister(t.dataset.reg)));
    loadRuns();
  }

  return { init };
})();
