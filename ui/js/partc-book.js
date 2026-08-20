/* ============================================================
   CarbonIQ — PCAF Part C: the insurer's book

   Organisation → Client → Project (policies inline) → Assessment.

   Three panels, one at a time, so the hierarchy is walked rather
   than presented all at once: clients → that client's projects →
   one project's policies.
   ============================================================ */

const PartCBook = (() => {

  const $ = id => document.getElementById(id);
  const fmt = (n, d = 0) => Number(n || 0).toLocaleString('en-US',
    { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /**
   * Write a status line, tolerating a missing element.
   *
   * When the page itself fails to render, every error handler that reached
   * for a status element threw a second time — and that secondary
   * "Cannot set properties of null" masked the real cause.
   */
  const say = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  const setHtml = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

  /**
   * Bind a listener, tolerating a missing element.
   *
   * Wiring straight onto $(id) meant that removing one control from the
   * markup threw during init and took the ENTIRE page down with it — the
   * user saw "Page could not be loaded" rather than one absent button.
   */
  const on = (id, event, fn) => { const el = $(id); if (el) el.addEventListener(event, fn); };

  let clients = [];
  let currentClient = null;
  let currentProject = null;
  let policyType = 'CAR';
  let currency = 'LKR';
  let addingPolicyToProject = null;
  let revisions = [];
  let assessments = [];

  const api = (path, opts) => window.CARBONIQ_fetch('/v1/partc' + path, opts);

  async function call(path, opts) {
    const res = await api(path, opts);
    let data = {};
    try { data = await res.json(); } catch (_) { /* empty body */ }
    if (!res.ok) throw new Error([data.message, data.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
    return data;
  }

  // ── Storage honesty: say plainly what will persist ────────
  async function loadStorage() {
    try {
      const { storage } = await call('/storage');
      const el = $('bookStorageNotice');
      if (storage.durable) { el.innerHTML = ''; return; }
      el.innerHTML = `<div class="partc-gate">
        <span class="${storage.writable ? 'partc-gate-off' : 'partc-gate-off'}">
          ${storage.writable ? 'Demo storage.' : 'Storage unavailable.'}</span>
        ${esc(storage.reason)}${storage.remedy ? ' ' + esc(storage.remedy) : ''}</div>`;
    } catch (_) { /* offline */ }
  }

  async function loadSettings() {
    try {
      const { settings } = await call('/settings');
      currency = settings.currency || 'LKR';
      say('bookInsurer', settings.insurerName || 'Insurance book');
      $('bookSubtitle').textContent =
        `FY${settings.reportingYear} · ${currency} · ${settings.premiumBasis} premium · restates at ${settings.restatementThresholdPct}%`;
    } catch (_) { /* defaults stand */ }
  }

  // ── Clients ───────────────────────────────────────────────
  async function loadClients() {
    say('bookClientsStatus', 'Loading…');
    try {
      clients = (await call('/clients')).clients || [];
      $('bookClients').innerHTML = clients.length === 0
        ? '<p class="partc-hint">No clients yet. Create one, or load the demo book to see a worked example.</p>'
        : `<table class="partc-table">
             <thead><tr><th>Client</th><th>Sector</th><th>Projects</th><th>Policies</th><th></th></tr></thead>
             <tbody>${clients.map(c => `
               <tr><td>${esc(c.name)}</td><td>${esc(c.sector || '—')}</td>
                   <td class="num">${c.projectCount}</td><td class="num">${c.policyCount}</td>
                   <td><button class="btn btn-ghost book-open" data-id="${c.clientId}">Open</button></td></tr>`).join('')}
             </tbody></table>`;
      $('bookClients').querySelectorAll('.book-open').forEach(b =>
        b.addEventListener('click', () => openClient(b.dataset.id)));
      say('bookClientsStatus', `${clients.length} client(s)`);
    } catch (err) {
      say('bookClientsStatus', err.message);
    }
  }

  async function saveClient(e) {
    e.preventDefault();
    const name = $('bookClientName').value.trim();
    if (!name) { Toast.show('Client name is required.', 'warn'); return; }
    try {
      await call('/clients', { method: 'POST', body: JSON.stringify({
        name, sector: $('bookClientSector').value.trim(),
        country: $('bookClientCountry').value.trim() || 'Sri Lanka',
        contactName: $('bookClientContact').value.trim()
      }) });
      $('bookClientForm').hidden = true;
      $('bookClientForm').reset();
      await loadClients();
    } catch (err) { say('bookClientsStatus', err.message); }
  }

  // ── Projects for a client ─────────────────────────────────
  async function openClient(clientId) {
    try {
      const { client, projects } = await call(`/clients/${clientId}`);
      currentClient = client;
      say('bookProjectsFor', client.name);
      $('bookProjectsCard').hidden = false;
      $('bookClientsCard').hidden = true;
      $('bookProjectDetail').hidden = true;
      renderProjects(projects);
    } catch (err) { say('bookClientsStatus', err.message); }
  }

  function renderProjects(projects) {
    $('bookProjects').innerHTML = projects.length === 0
      ? '<p class="partc-hint">No projects for this client yet.</p>'
      : `<table class="partc-table">
           <thead><tr><th>Project</th><th>Type</th><th>GIA m²</th><th>Policies</th><th></th></tr></thead>
           <tbody>${projects.map(p => `
             <tr><td>${esc(p.name)}</td><td>${esc(p.projectType)}</td>
                 <td class="num">${fmt(p.gifa_m2)}</td>
                 <td>${(p.policies || []).map(pol =>
                   `<span class="pill ${pol.scope && pol.scope.useStageApplies ? 'out' : 'in'}">${esc(pol.lineType)} FY${pol.reportingYear}</span>`).join(' ') || '—'}</td>
                 <td><button class="btn btn-ghost book-proj" data-id="${p.projectId}">Open</button></td></tr>`).join('')}
           </tbody></table>`;
    $('bookProjects').querySelectorAll('.book-proj').forEach(b =>
      b.addEventListener('click', () => openProject(b.dataset.id)));
    say('bookProjectsStatus', `${projects.length} project(s)`);
  }

  function policyPayload() {
    const p = {
      lineType: policyType,
      reference: $('bookPolRef').value.trim(),
      premium: Number($('bookPolPremium').value) || 0,
      reinsuranceCeded: Number($('bookPolCeded').value) || 0,
      inception: $('bookPolInception').value ? new Date($('bookPolInception').value).toISOString() : null,
      expiry: $('bookPolExpiry').value ? new Date($('bookPolExpiry').value).toISOString() : null
    };
    if (policyType === 'IDI' || policyType === 'Property') p.yearsOfCover = Number($('bookPolYears').value) || 10;
    return p;
  }

  async function saveProject(e) {
    e.preventDefault();
    const policy = policyPayload();
    if (!policy.inception || !policy.expiry) { Toast.show('Policy inception and expiry are required.', 'warn'); return; }
    try {
      if (addingPolicyToProject) {
        await call(`/projects/${addingPolicyToProject}/policies`, { method: 'POST', body: JSON.stringify(policy) });
        const id = addingPolicyToProject;
        addingPolicyToProject = null;
        $('bookProjectForm').hidden = true;
        await openProject(id);
        return;
      }
      await call('/projects', { method: 'POST', body: JSON.stringify({
        clientId: currentClient.clientId,
        name: $('bookProjName').value.trim(),
        projectType: $('bookProjType').value,
        gifa_m2: Number($('bookProjGifa').value) || 0,
        projectCost: Number($('bookProjCost').value) || 0,
        location: $('bookProjLocation').value.trim(),
        policies: [policy]
      }) });
      $('bookProjectForm').hidden = true;
      $('bookProjectForm').reset();
      await openClient(currentClient.clientId);
    } catch (err) { say('bookProjectsStatus', err.message); }
  }

  // ── One project and its policies ──────────────────────────
  async function openProject(projectId) {
    try {
      const { project } = await call(`/projects/${projectId}`);
      currentProject = project;
      say('bookDetailName', project.name);
      $('bookDetailMeta').textContent =
        `${project.projectType} · ${fmt(project.gifa_m2)} m² · ${currency} ${fmt(project.projectCost)}` +
        (project.location ? ` · ${project.location}` : '');
      say('bookCrumbClient', currentClient ? currentClient.name : 'Client');
      say('bookCrumbProject', project.name);
      $('bookProjectDetail').hidden = false;
      $('bookProjectsCard').hidden = true;

      const policies = project.policies || [];
      $('bookPolicies').innerHTML = policies.length === 0
        ? '<p class="partc-hint">No policies on this project.</p>'
        : policies.map(p => `
            <div class="partc-entry ${p.scope.useStageApplies ? 'partc-sev-notable' : 'partc-sev-info'}">
              <strong>${esc(p.lineType)}${p.reference ? ' · ' + esc(p.reference) : ''}</strong>
              <span class="pill ${p.scope.useStageApplies ? 'out' : 'in'}">FY${p.reportingYear}</span>
              <p>${currency} ${fmt(p.premium, 2)} premium ·
                 ${new Date(p.inception).toISOString().slice(0,10)} → ${new Date(p.expiry).toISOString().slice(0,10)}<br>
                 Modules: ${p.scope.modules.join(' · ')}<br>${esc(p.scope.note)}</p>
              <div class="partc-actions">
                <button class="btn btn-secondary book-assess" data-p="${project.projectId}" data-pol="${p.policyId}">Run assessment</button>
                <button class="btn btn-ghost book-delpol" data-p="${project.projectId}" data-pol="${p.policyId}">Remove</button>
              </div>
            </div>`).join('');

      $('bookPolicies').querySelectorAll('.book-assess').forEach(b =>
        b.addEventListener('click', () => startAssessment(b.dataset.p, b.dataset.pol)));
      $('bookPolicies').querySelectorAll('.book-delpol').forEach(b =>
        b.addEventListener('click', async () => {
          try { await call(`/projects/${b.dataset.p}/policies/${b.dataset.pol}`, { method: 'DELETE' });
                await openProject(b.dataset.p); }
          catch (err) { say('bookDetailStatus', err.message); }
        }));
      say('bookDetailStatus', `${policies.length} polic${policies.length === 1 ? 'y' : 'ies'}`);
      $('bookBoqCard').hidden = false;
      $('bookAssessCard').hidden = false;
      await loadRevisions();
      await loadAssessments();
    } catch (err) { say('bookProjectsStatus', err.message); }
  }

  /**
   * How a revision got its mappings. "0 inherited" reads like a failure when
   * in fact the revision simply arrived already mapped, so say that instead.
   */
  function mappingLabel(r) {
    const cf = r.mappingCarryForward;
    if (!cf.fromRevision) return '<span class="pill out">original</span>';
    if (cf.inheritedLines === 0) {
      return cf.needsReview.length
        ? `<span class="pill out">no match in ${esc(cf.fromRevision)}</span>`
        : '<span class="pill in">fully mapped</span>';
    }
    return `<span class="pill in">${cf.inheritedLines} inherited from ${esc(cf.fromRevision)}</span>`;
  }

  // ── BOQ revisions ─────────────────────────────────────────
  async function loadRevisions() {
    say('bookBoqStatus', 'Loading…');
    try {
      const data = await call(`/projects/${currentProject.projectId}/boq`);
      revisions = data.revisions || [];
      $('bookBoqList').innerHTML = revisions.length === 0
        ? '<p class="partc-hint">No BOQ yet. Add the tender revision to begin.</p>'
        : `<table class="partc-table">
             <thead><tr><th>Rev</th><th>Note</th><th>Lines</th><th>Mapping</th><th>Created</th><th></th></tr></thead>
             <tbody>${revisions.map((r, i) => `
               <tr>
                 <td><strong>${esc(r.label)}</strong></td>
                 <td>${esc(r.note || '—')}</td>
                 <td class="num">${(r.materials || []).length}</td>
                 <td>${mappingLabel(r)}
                     ${r.mappingCarryForward.needsReview.length
                        ? `<span class="partc-conf partc-conf-medium">${r.mappingCarryForward.needsReview.length} need review</span>` : ''}</td>
                 <td>${new Date(r.createdAt).toISOString().slice(0, 10)}</td>
                 <td>${i > 0 ? `<button class="btn btn-ghost book-diff" data-to="${r.revisionId}">Diff vs ${esc(revisions[i-1].label)}</button>` : ''}</td>
               </tr>`).join('')}
             </tbody></table>`;

      $('bookBoqList').querySelectorAll('.book-diff').forEach(b =>
        b.addEventListener('click', () => compareRevisions(b.dataset.to)));

      $('bookAssessRev').innerHTML = revisions.length
        ? revisions.map((r, i) =>
            `<option value="${r.revisionId}"${i === revisions.length - 1 ? ' selected' : ''}>${esc(r.label)}${r.note ? ' — ' + esc(r.note) : ''}</option>`).join('')
        : '<option value="">No BOQ revision yet</option>';
      $('bookAssessPolicy').innerHTML = (currentProject.policies || []).map(p =>
        `<option value="${p.policyId}">${esc(p.lineType)}${p.reference ? ' · ' + esc(p.reference) : ''} — FY${p.reportingYear}</option>`).join('');
      $('bookRunAssessBtn').disabled = revisions.length === 0;

      $('bookDiffBtn').disabled = revisions.length < 2;
      $('bookBoqStatus').textContent =
        `${revisions.length} revision(s)` + (revisions.length ? ` · latest ${revisions[revisions.length-1].label}` : '');
    } catch (err) { say('bookBoqStatus', err.message); }
  }

  /** Parse a pasted BOQ into lines. Deliberately simple; the mapping agent
      handles the hard cases, and known lines inherit their mapping anyway. */
  function parseBoq(text) {
    const out = [];
    for (const raw of String(text || '').split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^(.*?)[\s.]*?([\d,]+(?:\.\d+)?)\s*(m3|m2|m|MT|kg|Nr)\s*$/i);
      if (!m) continue;
      const name = m[1].replace(/[.\s]+$/, '').trim();
      if (!name) continue;
      out.push({ name, sourceText: line, quantity: Number(m[2].replace(/,/g, '')), unit: m[3] });
    }
    return out;
  }

  async function saveRevision(e) {
    e.preventDefault();
    const materials = parseBoq($('bookBoqText').value);
    if (materials.length === 0) {
      say('bookBoqStatus', 'No lines recognised. Each line needs a description, a quantity and a unit (m3, m2, m, MT, kg, Nr).');
      return;
    }
    try {
      const prev = revisions.length ? revisions[revisions.length - 1] : null;
      const r = await call(`/projects/${currentProject.projectId}/boq`, {
        method: 'POST',
        body: JSON.stringify({
          note: $('bookBoqNote').value.trim(),
          materials,
          // Demolition scope carries forward unless the revision restates it.
          demolitionItems: prev ? prev.demolitionItems || [] : []
        })
      });
      $('bookBoqForm').hidden = true;
      $('bookBoqForm').reset();
      await loadRevisions();
      $('bookBoqStatus').textContent =
        `${r.revision.label} saved — ${r.revision.materials.length} lines, ` +
        `${r.revision.mappingCarryForward.inheritedLines} mapping(s) inherited.`;
    } catch (err) { say('bookBoqStatus', err.message); }
  }

  async function compareRevisions(toRevisionId) {
    say('bookBoqStatus', 'Comparing…');
    try {
      const { comparison } = await call(`/projects/${currentProject.projectId}/boq/compare`, {
        method: 'POST',
        body: JSON.stringify({
          toRevisionId,
          siteInputs: { gifa_m2: currentProject.gifa_m2, demolitionKm: 100, wasteDisposalKm: 40 },
          distances: {}
        })
      });
      renderDiff(comparison);
      say('bookBoqStatus', `${comparison.from.label} → ${comparison.to.label}`);
    } catch (err) { say('bookBoqStatus', err.message); }
  }

  function renderDiff(c) {
    const up = c.emissions.deltaPct >= 0;
    const sign = v => (v >= 0 ? '+' : '') + fmt(v, 2);
    const lineRows = [
      ...c.lines.added.map(l => ['added', l.name, `${l.quantity} ${l.unit}`, '']),
      ...c.lines.removed.map(l => ['removed', l.name, '', `${l.quantity} ${l.unit}`]),
      ...c.lines.changed.map(l => {
        const q = l.fields.find(f => f.field === 'quantity');
        return ['changed', l.name,
                q ? `${q.to}` : l.fields.map(f => f.field).join(', '),
                q ? `${q.from}` : ''];
      })
    ];

    $('bookDiff').innerHTML = `
      <div class="partc-diff">
        <h5 class="partc-subhead">${esc(c.from.label)} → ${esc(c.to.label)}${c.to.note ? ' · ' + esc(c.to.note) : ''}</h5>

        <div class="partc-figures partc-diff-figures">
          <div class="partc-figure">
            <span class="partc-figure-label">Before (${esc(c.from.label)})</span>
            <span class="partc-figure-value">${fmt(c.emissions.before, 2)}</span>
            <span class="partc-figure-unit">kgCO₂e</span>
          </div>
          <div class="partc-figure">
            <span class="partc-figure-label">After (${esc(c.to.label)})</span>
            <span class="partc-figure-value">${fmt(c.emissions.after, 2)}</span>
            <span class="partc-figure-unit">kgCO₂e</span>
          </div>
          <div class="partc-figure ${c.materiality.breaches ? 'partc-figure-breach' : 'partc-figure-ok'}">
            <span class="partc-figure-label">Movement</span>
            <span class="partc-figure-value">${up ? '+' : ''}${c.emissions.deltaPct.toFixed(2)}%</span>
            <span class="partc-figure-unit">${sign(c.emissions.deltaKg)} kgCO₂e</span>
          </div>
        </div>

        <div class="partc-gate">
          <span class="${c.materiality.breaches ? 'partc-gate-off' : 'partc-gate-on'}">
            ${c.materiality.breaches ? 'Restatement required.' : 'No restatement.'}</span>
          ${esc(c.materiality.verdict)}
        </div>

        <div class="partc-entry partc-sev-info">
          <strong>Why the figure moved as it did</strong>
          <p>${esc(c.explanation.headline)}<br>${esc(c.explanation.detail)}</p>
        </div>

        <h5 class="partc-subhead">Lines changed</h5>
        ${lineRows.length === 0
          ? '<p class="partc-hint">No line-level changes.</p>'
          : `<table class="partc-table">
               <thead><tr><th>Change</th><th>Line</th><th>New</th><th>Was</th></tr></thead>
               <tbody>${lineRows.map(([kind, name, to, from]) => `
                 <tr><td><span class="pill ${kind === 'removed' ? 'out' : 'in'}">${kind}</span></td>
                     <td>${esc(name)}</td><td class="num">${esc(to)}</td><td class="num">${esc(from)}</td></tr>`).join('')}
               </tbody></table>`}
        <p class="partc-hint">${c.lines.unchanged} line(s) unchanged.</p>

        <h5 class="partc-subhead">Where the change landed</h5>
        <table class="partc-table">
          <thead><tr><th>Module</th><th>Before</th><th>After</th><th>Delta</th><th>Share</th></tr></thead>
          <tbody>${c.byModule.map(m => `
            <tr><td>${esc(m.module)} ${esc(m.label)}</td>
                <td class="num">${fmt(m.before, 2)}</td>
                <td class="num">${fmt(m.after, 2)}</td>
                <td class="num">${Math.abs(m.delta) < 0.005 ? '—' : sign(m.delta)}</td>
                <td class="num">${m.shareOfFigure.toFixed(1)}%</td></tr>`).join('')}
          </tbody></table>
      </div>`;
    $('bookDiff').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Hand the policy's context to the assessment page. W3 binds the run to it;
   * for now the context pre-fills the form so nothing is asked twice.
   */
  async function startAssessment(projectId, policyId) {
    try {
      const { context } = await call(`/projects/${projectId}/policies/${policyId}/context`);
      sessionStorage.setItem('partc_assessment_context', JSON.stringify(context));
      $('bookDetailStatus').textContent =
        `Context ready — ${context.project.name}, ${context.policy.lineType} FY${context.reportingYear}. Opening the assessment…`;
      const nav = document.querySelector('.nav-item[data-page="pcaf-partc"]');
      if (nav) nav.click();
    } catch (err) { say('bookDetailStatus', err.message); }
  }

  // ── Policy type segmented control ─────────────────────────
  function setPolicyType(value) {
    policyType = value;
    document.querySelectorAll('#bookPolicySeg button').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.value === value)));
    const useStage = value === 'IDI' || value === 'Property';
    $('bookPolYearsRow').style.display = useStage ? '' : 'none';
    $('bookPolicyGate').innerHTML = useStage
      ? `<span class="partc-gate-on">Use stage applies.</span> Assessments will compute B1, B4 and B7 over the cover period and report them as a separate line.`
      : `<span class="partc-gate-off">Construction cover only.</span> A ${value} policy has no use stage, so B1, B4 and B7 are zero by scope rule — not by omission.`;
  }

  async function seedDemo() {
    say('bookClientsStatus', 'Loading demo book…');
    try {
      const r = await call('/demo/seed', { method: 'POST', body: JSON.stringify({ force: true }) });
      await loadSettings();
      await loadClients();
      $('bookClientsStatus').textContent =
        `Demo book loaded — ${r.seeded.clients} clients, ${r.seeded.projects} projects, ${r.seeded.policies} policies.`;
    } catch (err) { say('bookClientsStatus', err.message); }
  }

  // ── Assessments ───────────────────────────────────────────
  const STATUS_LABEL = { draft: 'Draft', under_review: 'Under review', locked: 'Locked', superseded: 'Superseded' };
  /** The single move offered from each state, so the control is never ambiguous. */
  const NEXT_ACTION = {
    draft:        { to: 'under_review', label: 'Submit for review' },
    under_review: { to: 'locked',       label: 'Lock' }
  };

  async function loadAssessments() {
    try {
      const data = await call(`/assessments?projectId=${currentProject.projectId}`);
      assessments = data.assessments || [];
      $('bookAssessList').innerHTML = assessments.length === 0
        ? '<p class="partc-hint">No assessments yet. Pick a policy and a BOQ revision above.</p>'
        : assessments.map(a => {
            const next = NEXT_ACTION[a.status];
            const rs = a.restatement;
            return `<div class="partc-entry partc-sev-${a.status === 'draft' ? 'notable' : 'info'}">
              <strong>${esc(a.lineType)} FY${a.reportingYear} · v${a.version}</strong>
              <span class="partc-status partc-status-${a.status}">${STATUS_LABEL[a.status] || a.status}</span>
              <span class="pill in">${esc(a.boqRevisionLabel)}</span>
              <p>
                Construction <strong>${fmt(a.summary.construction_kgCO2e, 2)}</strong> kgCO₂e ·
                IAE <strong>${fmt(a.summary.insurerIAE_tCO2e, 4)}</strong> tCO₂e ·
                per-m² ${fmt(a.summary.perM2Factor_kgCO2e_m2, 2)} ·
                DQ option ${esc(a.dataQuality.option)} score ${a.dataQuality.score}
                ${a.lockedAt ? `<br>Locked ${new Date(a.lockedAt).toISOString().slice(0, 10)} by ${esc(a.lockedBy || 'insurer')}` : ''}
                ${rs && rs.isRestatement ? `<br><span class="partc-gate-off">Restatement.</span> ${esc(rs.note)}${rs.reason ? ' — ' + esc(rs.reason) : ''}` : ''}
                ${rs && !rs.isRestatement ? `<br>${esc(rs.note)}` : ''}
              </p>
              <div class="partc-actions">
                ${next ? `<button class="btn btn-secondary book-status" data-id="${a.assessmentId}" data-to="${next.to}">${next.label}</button>` : ''}
                ${a.status === 'under_review' ? `<button class="btn btn-ghost book-status" data-id="${a.assessmentId}" data-to="draft">Return to draft</button>` : ''}
                ${a.status !== 'locked' ? `<button class="btn btn-ghost book-delassess" data-id="${a.assessmentId}">Delete</button>` : ''}
              </div>
            </div>`;
          }).join('');

      $('bookAssessList').querySelectorAll('.book-status').forEach(b =>
        b.addEventListener('click', () => setStatus(b.dataset.id, b.dataset.to)));
      $('bookAssessList').querySelectorAll('.book-delassess').forEach(b =>
        b.addEventListener('click', () => removeAssessment(b.dataset.id)));

      // A locked assessment for this policy-year means the next run may restate it.
      $('bookRestateRow').hidden = !assessments.some(a => a.status === 'locked');
    } catch (err) { say('bookAssessStatus', err.message); }
  }

  async function runAssessment(e) {
    e.preventDefault();
    const revisionId = $('bookAssessRev').value;
    const policyId   = $('bookAssessPolicy').value;
    if (!revisionId) { Toast.show('Add a BOQ revision first.', 'warn'); return; }

    say('bookAssessStatus', 'Computing…');
    const prevArea = Number($('bookAssessPrevArea').value) || 0;
    try {
      const { assessment } = await call('/assessments', {
        method: 'POST',
        body: JSON.stringify({
          projectId: currentProject.projectId, policyId, boqRevisionId: revisionId,
          siteInputs: {
            demolitionKm: Number($('bookAssessDemoKm').value) || 0,
            wasteDisposalKm: Number($('bookAssessWasteKm').value) || 0,
            previousProject: prevArea > 0 ? {
              area_m2: prevArea,
              fuel_L: Number($('bookAssessPrevFuel').value) || 0,
              electricity_kWh: Number($('bookAssessPrevElec').value) || 0
            } : null
          },
          restatementReason: $('bookRestateReason').value.trim()
        })
      });
      await loadAssessments();
      $('bookAssessStatus').textContent =
        `v${assessment.version} created against ${assessment.boqRevisionLabel} — ` +
        `${fmt(assessment.summary.construction_kgCO2e, 2)} kgCO₂e.`;
    } catch (err) { say('bookAssessStatus', err.message); }
  }

  async function setStatus(assessmentId, to) {
    say('bookAssessStatus', 'Updating…');
    try {
      const { assessment } = await call(`/assessments/${assessmentId}/status`, {
        method: 'POST', body: JSON.stringify({ status: to }) });
      await loadAssessments();
      $('bookAssessStatus').textContent =
        `v${assessment.version} is now ${STATUS_LABEL[assessment.status].toLowerCase()}` +
        (assessment.lockedBy ? ` — locked by ${assessment.lockedBy}` : '') + '.';
    } catch (err) { say('bookAssessStatus', err.message); }
  }

  async function removeAssessment(assessmentId) {
    try {
      await call(`/assessments/${assessmentId}`, { method: 'DELETE' });
      await loadAssessments();
      say('bookAssessStatus', 'Assessment deleted.');
    } catch (err) { say('bookAssessStatus', err.message); }
  }

  function showClients() {
    $('bookClientsCard').hidden = false;
    $('bookProjectsCard').hidden = true;
    $('bookProjectDetail').hidden = true;
    $('bookBoqCard').hidden = true;
    $('bookAssessCard').hidden = true;
    $('bookDiff').innerHTML = '';
  }

  function init() {
    loadStorage(); loadSettings(); loadClients(); setPolicyType('CAR');

    $('bookNewClientBtn').addEventListener('click', () => {
      $('bookClientForm').hidden = !$('bookClientForm').hidden; });
    on('bookClientCancel', 'click', () => { $('bookClientForm').hidden = true; });
    on('bookClientForm', 'submit', saveClient);
    on('bookSeedBtn', 'click', seedDemo);

    $('bookNewProjectBtn').addEventListener('click', () => {
      addingPolicyToProject = null;
      $('bookProjectForm').hidden = !$('bookProjectForm').hidden;
    });
    $('bookProjectCancel').addEventListener('click', () => {
      addingPolicyToProject = null; $('bookProjectForm').hidden = true; });
    on('bookProjectForm', 'submit', saveProject);
    on('bookBackToClients', 'click', showClients);
    const leaveProject = () => {
      $('bookBoqCard').hidden = true;
      $('bookAssessCard').hidden = true;
      setHtml('bookDiff', '');
    };
    on('bookBackToProjects', 'click', () => {
      leaveProject();
      if (currentClient) openClient(currentClient.clientId); });
    $('bookCrumbClient').addEventListener('click', () => {
      leaveProject();
      if (currentClient) openClient(currentClient.clientId); });
    on('bookCrumbClients', 'click', () => { leaveProject(); showClients(); });

    $('bookAddPolicyBtn').addEventListener('click', () => {
      addingPolicyToProject = currentProject.projectId;
      $('bookProjectsCard').hidden = false;
      $('bookProjectForm').hidden = false;
      $('bookProjectDetail').hidden = true;
      $('bookBoqCard').hidden = true;
      $('bookAssessCard').hidden = true;
    });

    $('bookNewBoqBtn').addEventListener('click', () => {
      $('bookBoqForm').hidden = !$('bookBoqForm').hidden; });
    on('bookBoqCancel', 'click', () => { $('bookBoqForm').hidden = true; });
    on('bookBoqForm', 'submit', saveRevision);
    on('bookAssessForm', 'submit', runAssessment);
    $('bookDiffBtn').addEventListener('click', () => {
      if (revisions.length >= 2) compareRevisions(revisions[revisions.length - 1].revisionId); });

    document.querySelectorAll('#bookPolicySeg button').forEach(b =>
      b.addEventListener('click', () => setPolicyType(b.dataset.value)));
  }

  return { init };
})();
