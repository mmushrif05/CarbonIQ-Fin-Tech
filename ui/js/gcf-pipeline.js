/* ============================================================
   CarbonIQ — the GCF pipeline: the portfolio, the cycle, and one
   project at a time.

   The Pipeline sub-tab of the GCF screen. It reads three routes
   and computes nothing: GET /v1/gcf/portfolio for the whole book,
   GET /v1/gcf/pipeline/:id and /readiness for one project. Every
   figure on screen is one an engine returned; the renderer lays
   them side by side and never adds two of them.

   Three rules the renderer carries:

     A projected date is marked as one. The Fund's service
     standards imply dates; the record holds dates. They are
     drawn in different colours and never in the same list
     without the label.

     Direct and indirect beneficiaries are two figures. Mitigation
     and the adaptation co-benefit are two figures. Nothing here
     sums either pair.

     The shipped sample is read-only and the screen says so where
     a write control would be, rather than offering a button the
     server refuses.

   Writes go through PATCH (a merge, revalidated by the server)
   and POST /stage (a dated move into the history). After any
   write the project is re-read and every open panel of the
   screen refreshed, so no stale row survives a change.
   ============================================================ */

const GCFPipeline = (() => {

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const num = (n, d = 0) => (n === null || n === undefined || n === '' || !Number.isFinite(Number(n)))
    ? '—'
    : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd = n => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : `USD ${num(n)}`);
  const musd = n => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : window.CARBONIQ_money.moneyShort(n, 'USD'));
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const words = s => String(s ?? '').replace(/_/g, ' ');

  let deps = null;
  const view = { portfolio: null, filterStage: null, project: null, readiness: null, criteria: null, validation: null, source: null };

  const ref = () => (deps && deps.reference()) || {};
  const stageLabel = s => (ref().cycle && ref().cycle.recordStages && ref().cycle.recordStages[s] ? ref().cycle.recordStages[s].label : words(s));
  const areaLabel = code => { const a = ((ref().resultsAreas || {}).areas || []).find(x => x.code === code); return a ? a.name : code; };
  const instrumentLabel = id => { const i = ((ref().instruments || {}).instruments || []).find(x => x.id === id); return i ? i.name : words(id); };
  const barrierLabel = id => { const b = ((ref().instruments || {}).barriers || []).find(x => x.id === id); return b ? b.label : words(id); };
  const vocab = k => ((ref().vocabulary || {})[k]) || [];

  const canWrite = () => Boolean(deps && deps.canWrite()) && view.source === 'recorded';
  /* The assessor's sign-off controls: shown only to a caller the server would
     let validate, and never on the shipped sample. The server's validate scope
     is the control; this is the courtesy of not drawing a button it refuses. */
  const canValidate = () => Boolean(deps && deps.canValidate && deps.canValidate()) && view.source === 'recorded';

  const tierPill = t => (t ? `<span class="gcf-pill gcf-pill-tier">${esc(t)}</span>` : '');
  const gatePill = s => {
    const cls = s === 'excluded' ? 'stop' : (s === 'flagged' ? 'flag' : 'ok');
    return `<span class="gcf-pill gcf-pill-${cls}">${esc(s)}</span>`;
  };
  const heldPill = s => ({
    held: '<span class="gcf-pill gcf-pill-ok">held</span>',
    evidenced: '<span class="gcf-pill gcf-pill-ok">evidenced</span>',
    partial: '<span class="gcf-pill gcf-pill-flag">partial</span>',
    missing: '<span class="gcf-pill gcf-pill-stop">missing</span>',
    absent: '<span class="gcf-pill gcf-pill-stop">absent</span>',
  })[s] || `<span class="gcf-pill gcf-pill-tier">${esc(s)}</span>`;
  const traced = f => (f && typeof f === 'object' && Number.isFinite(f.value) ? `${num(f.value)} ${tierPill(f.tier)}` : '—');

  const figure = (label, value, note, unit, cls = '') => `
    <div class="gcf-figure ${cls}">
      <span class="gcf-figure-label">${esc(label)}</span>
      <span class="gcf-figure-value">${value}</span>
      ${unit ? `<span class="gcf-figure-unit">${esc(unit)}</span>` : ''}
      ${note ? `<span class="gcf-figure-note">${esc(note)}</span>` : ''}
    </div>`;

  /* ── The portfolio ────────────────────────────────────────── */
  /* `reopen: false` is for a write that has just re-read the project it
     changed: the board's re-read then leaves the project as it is, rather
     than reading the same four routes a second time. */
  async function load({ reopen = true } = {}) {
    try {
      const r = await deps.call('/portfolio');
      view.portfolio = r.portfolio;
      view.source = r.source;
      deps.onSample(r.sample, r.sampleNote);
      renderEnvelope(r.portfolio.envelope);
      renderPortfolio(r.portfolio);
      if (view.project && reopen) await openProject(view.project.id, { quiet: true });
    } catch (err) {
      setHtml('gcfMoney', `<div class="gcf-warn">${esc(err.message)}</div>`);
    }
  }

  function renderEnvelope(env) {
    if (!env) return;
    say('gcfSubtitle', `Direct Access Entity, Board decision ${env.decision || '—'}${env.recorded ? '' : ' — accreditation as shipped'}`);
    setHtml('gcfEnvelope', [
      ['Size category', `${esc(env.sizeCategory || '—')} — up to ${musd(env.ceiling_usd)} per project`],
      ['Environmental and social', esc(env.essCategory || '—')],
      ['Grant modality', env.grantModality === false ? 'Not held' : env.grantModality ? 'Held' : '—'],
      ['Largest candidate', env.largestProject
        ? `${esc(env.largestProject.code)} — ${musd(env.largestProject.totalCost)}, ${Math.round((env.largestProject.shareOfCeiling || 0) * 100)}% of the ceiling`
        : '—'],
    ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join(''));
  }

  function renderPortfolio(p) {
    const m = p.money;
    setHtml('gcfMoney', [
      figure('Candidates', num(p.count), `${p.byStream.map(s => `${s.count} ${s.stream}`).join(' · ')}`),
      figure('Total project cost', musd(m.totalCost), 'across the pool', 'USD'),
      figure('GCF ask', musd(m.gcfAsk), m.mobilisation === null ? 'no ask recorded' : `${m.mobilisation}× total cost to GCF money — a ratio, not a threshold`, 'USD'),
      figure('Co-financing', musd((m.dfcc || 0) + (m.other || 0)), `DFCC ${musd(m.dfcc)} · other ${musd(m.other)}`, 'USD'),
    ].join(''));

    const r = p.results;
    setHtml('gcfResults', [
      figure('Mitigation — lifetime', num(r.mitigation && r.mitigation.lifetime_tCO2e),
        `${r.mitigation ? r.mitigation.projects : 0} mitigation projects — Core Indicator 1. Adaptation co-benefit apart: ${num(r.adaptationCoBenefit && r.adaptationCoBenefit.lifetime_tCO2e)} tCO₂e`, 'tCO₂e'),
      figure('Direct beneficiaries', num(r.beneficiaries.direct), `indirect ${num(r.beneficiaries.indirect)} — Core Indicator 2, two figures`, 'people'),
      figure('Assets made resilient', musd(r.assetsProtected_usd), `${num(r.hectares)} hectares under improved management — Core Indicators 3 and 4`, 'USD'),
      figure('Weakest evidence', esc((r.evidence && r.evidence.weakestTier) || '—'), 'the tier a reviewer should ask about first'),
    ].join(''));

    renderRail(p);
    setHtml('gcfGate', [
      figure('Eligible', num(p.gate.eligible), 'within DFCC’s accreditation, nothing to resolve', '', 'gcf-figure-gate'),
      figure('Flagged', num(p.gate.flagged), 'eligible with something to verify', '', 'gcf-figure-gate flag'),
      figure('Excluded', num(p.gate.excluded), 'outside the accreditation envelope', '', 'gcf-figure-gate stop'),
    ].join(''));

    setHtml('gcfActions', p.actions.length ? p.actions.map(a => `
      <li>
        <div class="gcf-list-title"><a data-open="${esc(a.id)}">${esc(a.code)} — ${esc(a.name)}</a>
          <span class="gcf-pill gcf-pill-tier">${esc(a.stageLabel)}</span>
          ${a.daysInStage !== null ? `<span class="gcf-list-meta">${num(a.daysInStage)} days in stage</span>` : ''}</div>
        <div>${esc(a.what)}</div>
        <div class="gcf-list-meta">${esc(a.who)}${a.document ? ` · ${esc(a.document)}` : ''}${a.nextMissing ? ` · ${num(a.nextMissing)} item(s) still needed for the next stage` : ''}</div>
      </li>`).join('') : '<li class="gcf-hint">Nothing outstanding.</li>');

    setHtml('gcfUpcoming', p.upcoming.length ? p.upcoming.map(u => `
      <li>
        <div class="gcf-list-title"><span class="gcf-date">${esc(u.date)}</span>
          ${u.projected ? '<span class="gcf-pill gcf-pill-project">projected</span>' : '<span class="gcf-pill gcf-pill-tier">target</span>'}
          <a data-open="${esc(u.id)}">${esc(u.code)}</a></div>
        <div>${esc(u.milestone)}</div>
        <div class="gcf-list-meta">${esc(u.basis)}</div>
      </li>`).join('') : '<li class="gcf-hint">No dated milestone ahead. Record a target date on a project to see it here.</li>');

    const rd = p.readiness;
    setHtml('gcfEligibility', [
      `Average readiness for the current stage: ${rd.averagePct === null ? '—' : `${rd.averagePct}%`}.`,
      `Simplified Approval Process: ${rd.sapEligible.length ? rd.sapEligible.join(', ') : 'none'} (up to USD 25 million, category C or I-3, decision B.32/05).`,
      `Project Preparation Facility: ${rd.ppfEligible.length ? rd.ppfEligible.join(', ') : 'none'} (up to 10% of the ask, at most USD 1.5 million).`,
      `Selected for a Concept Note: ${rd.selectedForCN.length ? rd.selectedForCN.join(', ') : 'none yet'}.`,
    ].map(esc).join('<br>'));

    renderBoard(p);
    const flagged = p.rows.filter(r => r.gate !== 'eligible' && r.gateReasons.length);
    const card = $('gcfFlagsCard');
    if (card) card.hidden = flagged.length === 0;
    setHtml('gcfFlags', flagged.map(r => `
      <div style="margin-bottom:12px">
        <strong>${esc(r.code)} — ${esc(r.name)}</strong> ${gatePill(r.gate)}
        <ul style="margin:6px 0 0;padding-left:18px;font-size:12.5px;color:var(--gcf-muted)">
          ${r.gateReasons.map(f => `<li>${esc(f)}</li>`).join('')}
        </ul>
      </div>`).join(''));
  }

  function renderRail(p) {
    const stages = (ref().cycle && ref().cycle.stages) || p.byCycle;
    setHtml('gcfRail', stages.map(c => {
      const here = p.byCycle.find(x => x.n === c.n) || { count: 0, gcfAsk: 0 };
      return `<button type="button" class="gcf-rail-step ${here.count ? '' : 'empty'}" data-cycle="${c.n}"
                aria-pressed="${String(view.filterStage === c.n)}" title="${esc(c.actor)}">
        <span class="gcf-rail-n">Stage ${c.n}</span>
        <span class="gcf-rail-label">${esc(c.label)}</span>
        <span class="gcf-rail-count">${num(here.count)}</span>
        <span class="gcf-rail-ask">${here.count ? `${musd(here.gcfAsk)} ask` : '—'}</span>
      </button>`;
    }).join(''));
    say('gcfRailHint', view.filterStage ? `Showing stage ${view.filterStage}. Select it again to clear.` : `${p.count} candidates across ${p.byCycle.filter(c => c.count).length} stages.`);
  }

  function renderBoard(p) {
    const rows = view.filterStage ? p.rows.filter(r => r.cycle === view.filterStage) : p.rows;
    setHtml('gcfPoolTable', `
      <thead><tr>
        <th>Code</th><th>Project</th><th>Stream</th><th>Results area</th><th>Stage</th><th class="num">Days</th>
        <th>Gate</th><th>Readiness</th><th class="num">Cost</th><th class="num">GCF ask</th><th>No-objection</th><th>Weakest evidence</th>
      </tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr class="gcf-row" tabindex="0" data-open="${esc(r.id)}">
        <td><strong>${esc(r.code)}</strong>${r.selectedForCN ? ' <span class="gcf-pill gcf-pill-ok">CN</span>' : ''}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.stream)}</td>
        <td>${esc(r.resultsAreaLabel)}</td>
        <td>${esc(r.stageLabel)}</td>
        <td class="num">${num(r.daysInStage)}</td>
        <td>${gatePill(r.gate)}</td>
        <td><span class="gcf-bar-row"><span class="gcf-bar"><i style="width:${r.readinessPct || 0}%"></i></span><span>${r.readinessPct === null ? '—' : `${r.readinessPct}%`}</span></span></td>
        <td class="num">${musd(r.totalCost)}</td>
        <td class="num">${musd(r.gcfAsk)}</td>
        <td>${esc(words(r.nda))}</td>
        <td>${tierPill(r.weakestTier)}</td>
      </tr>`).join('') : '<tr><td colspan="12" class="gcf-hint">No candidate on this stage.</td></tr>'}</tbody>`);
  }

  function downloadCsv() {
    const p = view.portfolio;
    if (!p) return;
    const cols = ['code', 'name', 'stream', 'resultsAreaLabel', 'stageLabel', 'cycle', 'daysInStage', 'gate', 'readinessPct',
      'totalCost', 'gcfAsk', 'dfcc', 'other', 'instrument', 'mitigationLifetime_tCO2e', 'coBenefitLifetime_tCO2e',
      'directBeneficiaries', 'indirectBeneficiaries', 'hectares', 'assetsProtected_usd', 'weakestTier', 'nda', 'essCategory', 'selectedForCN'];
    const cell = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.join(','), ...p.rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `gcf-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  /* ── One project ──────────────────────────────────────────── */
  async function openProject(id, { quiet = false } = {}) {
    try {
      const [one, rd, val, ret] = await Promise.all([
        deps.call(`/pipeline/${encodeURIComponent(id)}`),
        deps.call(`/pipeline/${encodeURIComponent(id)}/readiness`),
        deps.call(`/pipeline/${encodeURIComponent(id)}/validation`),
        deps.call(`/pipeline/${encodeURIComponent(id)}/return`),
      ]);
      view.project = one.project; view.source = one.source;
      view.readiness = rd.readiness; view.criteria = rd.criteria; view.logframe = rd.logframe;
      view.validation = val.validation; view.returnState = ret;
      renderProject(one, rd, val);
      renderReturn(one.project, ret);
      $('gcfPortfolio').hidden = true;
      $('gcfProject').hidden = false;
      if (!quiet) { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { /* ignore */ } }
    } catch (err) {
      const e = $('gcfProjectError');
      if (e) { e.hidden = false; e.textContent = err.message; }
    }
  }

  function closeProject() {
    view.project = null; view.readiness = null;
    $('gcfProject').hidden = true;
    $('gcfPortfolio').hidden = false;
    say('gcfProjectHint', '');
  }

  /* The results logframe — baseline, current and target per indicator, from
     the readiness route. Every figure is one the route returned; this only
     lays the rows out. Rows the project does not touch are left out. */
  function renderLogframe(lf) {
    const rows = ((lf && lf.rows) || []).filter(r => r.present);
    if (!rows.length) {
      setHtml('gcfProjectLogframe', '<p class="gcf-hint">No baseline or target recorded yet. Record them on the Intake form.</p>');
      return;
    }
    const cell = f => (f && typeof f === 'object' && Number.isFinite(f.value) ? `${num(f.value)} ${tierPill(f.tier)}` : '—');
    setHtml('gcfProjectLogframe', `<div class="gcf-scroll"><table class="gcf-table">
      <thead><tr><th>Indicator</th><th>Baseline</th><th>Current</th><th>Target</th><th>By</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${esc(r.name)}${r.unit ? ` <span class="gcf-hint">(${esc(r.unit)})</span>` : ''}</td>
        <td>${cell(r.baseline)}</td><td>${cell(r.current)}</td><td>${cell(r.target)}</td>
        <td>${r.targetYear ? esc(String(r.targetYear)) : '—'}</td>
      </tr>`).join('')}</tbody></table></div>`);
  }

  function renderProject(one, rd, val) {
    const p = one.project; const r = rd.readiness; const c = rd.criteria;
    const write = canWrite();
    const gate = (view.portfolio && view.portfolio.rows.find(x => x.id === p.id)) || {};
    say('gcfProjectTitle', `${p.code} — ${p.name}`);
    setHtml('gcfProjectPills', `${gatePill(gate.gate || 'eligible')} <span class="gcf-pill gcf-pill-tier">${esc(p.stream)}</span> ${p.selectedForCN ? '<span class="gcf-pill gcf-pill-ok">selected for a concept note</span>' : ''} ${one.sample ? '<span class="gcf-pill gcf-pill-tier">illustrative</span>' : ''}`);
    const e = $('gcfProjectError'); if (e) e.hidden = true;

    const f = p.financing || {};
    setHtml('gcfProjectFigures', [
      figure('Total cost', musd(f.totalCost), `${esc(areaLabel(p.resultsArea))} · ${esc(p.location && p.location.province || '')}`, 'USD'),
      figure('GCF ask', musd(f.gcfAsk), instrumentLabel(f.instrument), 'USD'),
      figure('Readiness for this stage', r.pctReady === null ? '—' : `${r.pctReady}%`, `${r.blockers.length} item(s) open · ${r.next ? `${r.next.missing} needed for ${r.next.stageLabel.toLowerCase()}` : 'final stage'}`),
      figure('Criteria evidenced', `${c.evidenced} of 6`, `${c.partial} partial · ${c.absent} absent`),
    ].join(''));

    /* The cycle */
    say('gcfProjectStageLine', `${r.stageLabel} — stage ${r.cycle ? r.cycle.n : '—'} of the project cycle, ${r.cycle ? r.cycle.label.toLowerCase() : ''} (${r.cycle ? r.cycle.actor : ''}).`);
    say('gcfProjectDays', r.daysInStage === null ? 'Entry date not recorded' : `${num(r.daysInStage)} days in this stage`);
    const stages = Object.keys((ref().cycle && ref().cycle.recordStages) || {});
    const idx = stages.indexOf(p.stage);
    const dated = {};
    for (const h of (p.stageHistory || [])) dated[h.stage] = h.at;
    setHtml('gcfProjectSteps', stages.map((s, i) => `
      <div class="gcf-step ${i < idx ? 'done' : ''} ${i === idx ? 'current' : ''}">
        <span class="gcf-step-label">${esc(stageLabel(s))}</span>
        <span class="gcf-step-date">${dated[s] ? esc(dated[s]) : ''}</span>
      </div>`).join(''));

    setHtml('gcfProjectNext', r.nextStep ? `
      <div style="font-size:12.5px"><strong>${esc(r.nextStep.what)}</strong></div>
      <div class="gcf-list-meta">${esc(r.nextStep.who)}${r.nextStep.document ? ` · ${esc(r.nextStep.document)}` : ''}</div>
      <div class="gcf-list-meta" style="margin-top:6px">${esc(r.sap.eligible ? 'Eligible for the Simplified Approval Process.' : `Not eligible for the Simplified Approval Process: ${r.sap.reasons.join(' ')}`)}
        ${r.ppf.eligible ? ` Project Preparation Facility available, up to ${usd(r.ppf.maxSupport_usd)}.` : ''}</div>` : '<span class="gcf-hint">Closed.</span>');

    setHtml('gcfProjectMove', write ? `
      <div class="gcf-inline-form">
        <div class="gcf-field"><label for="gcfMoveStage">Move to</label>
          <select id="gcfMoveStage">${stages.map(s => `<option value="${s}" ${s === (r.next ? r.next.stage : p.stage) ? 'selected' : ''}>${esc(stageLabel(s))}</option>`).join('')}</select></div>
        <div class="gcf-field"><label for="gcfMoveAt">On</label><input type="date" id="gcfMoveAt" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="gcf-field gcf-field-wide"><label for="gcfMoveNote">Note</label><input type="text" id="gcfMoveNote" placeholder="What happened — submitted through the NDA, feedback received…"></div>
        <div class="gcf-actions"><button class="btn btn-primary btn-sm" id="gcfMoveGo">Record the move</button></div>
      </div>` : readOnlyNote(one));
    on('gcfMoveGo', 'click', () => moveStage(p.id));

    const t = r.timeline;
    setHtml('gcfProjectTimeline', (t.recorded.length || t.projected.length) ? [
      ...t.recorded.map(m => `<li><div class="gcf-list-title"><span class="gcf-date ${m.overdue ? 'gcf-overdue' : ''}">${esc(m.date)}</span> ${m.target ? '<span class="gcf-pill gcf-pill-tier">target</span>' : ''} ${esc(m.label)}${m.overdue ? ' — overdue' : ''}</div></li>`),
      ...t.projected.map(m => `<li><div class="gcf-list-title"><span class="gcf-date">${esc(m.date)}</span> <span class="gcf-pill gcf-pill-project">projected</span> ${esc(m.milestone)}</div><div class="gcf-list-meta">${esc(m.basis)}</div></li>`),
    ].join('') : '<li class="gcf-hint">No dates recorded yet.</li>');

    /* Readiness */
    say('gcfProjectReadyPct', r.pctReady === null ? '' : `${r.pctReady}% held`);
    const check = i => `<div class="gcf-check">${heldPill(i.status)}<div><span class="gcf-check-label">${esc(i.label)}</span> <span class="gcf-check-clause">${esc(i.clause)}</span></div>${i.status !== 'held' ? `<div class="gcf-check-remedy">${esc(i.remedy)}</div>` : ''}</div>`;
    setHtml('gcfProjectChecklist', r.items.map(check).join(''));
    setHtml('gcfProjectNextChecklist', r.next && r.next.items.length ? r.next.items.map(check).join('') : `<span class="gcf-hint">${r.next ? 'Nothing beyond what this stage needs.' : 'This is the final stage.'}</span>`);

    setHtml('gcfProjectCriteria', c.criteria.map(cr => `
      <div class="gcf-crit">
        <div class="gcf-crit-head">${heldPill(cr.status)} ${esc(cr.label)} <span class="gcf-hint">${cr.scoredByEngine ? 'scored by the screening engine' : 'not scored — judgement'}</span></div>
        <ul>${cr.sub.map(s => `<li>${heldPill(s.status)}<span>${esc(s.label)}</span></li>`).join('')}</ul>
      </div>`).join('') + `<div class="gcf-rule">${esc(c.note || '')}</div>`);

    renderValidation(p, (val && val.validation) || null, c);

    /* Money */
    const v = f.viabilityWithoutGcf || {};
    setHtml('gcfProjectMoney', facts([
      ['Total cost', usd(f.totalCost)], ['GCF ask', `${usd(f.gcfAsk)} — ${esc(instrumentLabel(f.instrument))}`],
      ['DFCC', usd(f.dfcc)], [f.otherLabel || 'Other co-financing', usd(f.other)],
      ['Instrument detail', esc(f.gcfInstrumentDetail || '—')],
      ['Viable without GCF', `${v.viable === true ? 'Yes' : v.viable === false ? 'No' : '—'}${v.reason ? ` — ${esc(v.reason)}` : ''}`],
      ['Barriers', (p.barriers || []).length ? p.barriers.map(b => esc(barrierLabel(b))).join('; ') : '—'],
      ['Taxonomy', p.taxonomy ? `${esc(p.taxonomy.framework)} — ${esc(p.taxonomy.band)}` : '—'],
    ]));
    const cof = p.coFinancing || [];
    setHtml('gcfProjectCofin', cof.length ? `<div class="gcf-scroll"><table class="gcf-table"><thead><tr><th>Financier</th><th>Role</th><th class="num">Amount</th><th>Status</th><th>Reference</th>${write ? '<th></th>' : ''}</tr></thead>
      <tbody>${cof.map((x, i) => `<tr><td>${esc(x.name)}</td><td>${esc(x.role)}</td><td class="num">${esc(x.currency)} ${num(x.amount)}</td><td>${esc(words(x.status))}</td><td>${esc(x.reference || '')}</td>${write ? `<td><button class="gcf-remove" data-cofin-remove="${i}">remove</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : '<span class="gcf-hint">No co-financier recorded.</span>');
    setHtml('gcfProjectCofinForm', write ? `
      <div class="gcf-inline-form">
        <div class="gcf-field"><label for="gcfCofName">Financier</label><input type="text" id="gcfCofName"></div>
        <div class="gcf-field"><label for="gcfCofRole">Role</label><select id="gcfCofRole">${['sponsor', 'lender', 'dfi', 'government', 'grant', 'other'].map(o => `<option value="${o}">${o}</option>`).join('')}</select></div>
        <div class="gcf-field"><label for="gcfCofAmount">Amount (USD)</label><input type="number" id="gcfCofAmount" step="any"></div>
        <div class="gcf-field"><label for="gcfCofStatus">Status</label><select id="gcfCofStatus">${vocab('coFinancingStatuses').map(o => `<option value="${o}">${words(o)}</option>`).join('')}</select></div>
        <div class="gcf-field gcf-field-wide"><label for="gcfCofRef">Reference (letter, term sheet)</label><input type="text" id="gcfCofRef"></div>
        <div class="gcf-actions"><button class="btn btn-secondary btn-sm" id="gcfCofAdd">Add co-financier</button></div>
      </div>` : '');
    on('gcfCofAdd', 'click', () => {
      const name = ($('gcfCofName').value || '').trim(); const amount = Number($('gcfCofAmount').value);
      if (!name || !Number.isFinite(amount)) return hint('A financier needs a name and an amount.');
      patch(p.id, { coFinancing: [...cof, { name, role: $('gcfCofRole').value, amount, currency: 'USD', status: $('gcfCofStatus').value, reference: ($('gcfCofRef').value || '').trim() || undefined }] });
    });
    document.querySelectorAll('[data-cofin-remove]').forEach(b => b.addEventListener('click', () => {
      patch(p.id, { coFinancing: cof.filter((_, i) => i !== Number(b.dataset.cofinRemove)) });
    }));

    /* Results */
    const mit = p.mitigation || {}; const ben = p.beneficiaries || {};
    setHtml('gcfProjectImpact', facts([
      [mit.isCoBenefit ? 'Mitigation co-benefit — annual' : 'Mitigation — annual (Core Indicator 1)', traced(mit.annual_tCO2e)],
      [mit.isCoBenefit ? 'Mitigation co-benefit — lifetime' : 'Mitigation — lifetime', traced(mit.lifetime_tCO2e)],
      ['Direct beneficiaries (Core Indicator 2)', traced(ben.direct)], ['Indirect beneficiaries (Core Indicator 2)', traced(ben.indirect)],
      ['Women among beneficiaries', ben.womenPct && Number.isFinite(ben.womenPct.value) ? `${num(ben.womenPct.value)}% ${tierPill(ben.womenPct.tier)}` : '—'],
      ['Assets made resilient (Core Indicator 3)', p.assets && p.assets.valueProtected_usd ? `USD ${traced(p.assets.valueProtected_usd)}` : '—'],
      ['Hectares under improved management (Core Indicator 4)', traced(p.area && p.area.hectares)],
      ['Embodied carbon A1–A5', p.embodiedCarbon ? `${traced(p.embodiedCarbon.a1a5_tCO2e)} tCO₂e — a payback, never netted` : 'not held'],
    ]));
    say('gcfProjectBaseline', mit.baseline ? `Baseline: ${mit.baseline.description}. Counterfactual: ${mit.baseline.counterfactual}. Type: ${mit.baseline.type}.${mit.isCoBenefit ? ' Reported apart from the mitigation headline.' : ''}` : 'No baseline recorded.');
    renderLogframe(rd.logframe);

    /* NDA and executing entity */
    const nda = p.nda || { status: 'not_requested' }; const ex = p.executingEntity || {};
    setHtml('gcfProjectNda', facts([
      ['No-objection', words(nda.status)], ['Reference', esc(nda.reference || '—')],
      ['Requested', esc(nda.requestedAt || '—')], ['Issued', esc(nda.issuedAt || '—')],
      ['Executing entity', esc(ex.name || '—')], ['Role', esc(ex.role || '—')],
      ['Track record', esc(ex.trackRecord || '—')], ['NDC 3.0 sector targets', (p.ndcSectorTargets || []).map(esc).join(', ') || '—'],
    ]));
    setHtml('gcfProjectNdaForm', write ? `
      <div class="gcf-inline-form">
        <div class="gcf-field"><label for="gcfNdaStatus">No-objection status</label><select id="gcfNdaStatus">${vocab('ndaStatuses').map(o => `<option value="${o}" ${o === nda.status ? 'selected' : ''}>${words(o)}</option>`).join('')}</select></div>
        <div class="gcf-field"><label for="gcfNdaRef">Reference</label><input type="text" id="gcfNdaRef" value="${esc(nda.reference || '')}"></div>
        <div class="gcf-field"><label for="gcfNdaReq">Requested on</label><input type="date" id="gcfNdaReq" value="${esc(nda.requestedAt || '')}"></div>
        <div class="gcf-field"><label for="gcfNdaIss">Issued on</label><input type="date" id="gcfNdaIss" value="${esc(nda.issuedAt || '')}"></div>
        <div class="gcf-field"><label for="gcfExName">Executing entity</label><input type="text" id="gcfExName" value="${esc(ex.name || '')}"></div>
        <div class="gcf-field"><label for="gcfExRole">Role</label><input type="text" id="gcfExRole" value="${esc(ex.role || '')}"></div>
        <div class="gcf-field gcf-field-wide"><label for="gcfExTrack">Track record</label><textarea id="gcfExTrack" rows="2">${esc(ex.trackRecord || '')}</textarea></div>
        <div class="gcf-actions"><button class="btn btn-primary btn-sm" id="gcfNdaSave">Save</button></div>
      </div>` : '');
    on('gcfNdaSave', 'click', () => {
      const body = { nda: { status: $('gcfNdaStatus').value, reference: $('gcfNdaRef').value.trim() || null,
        requestedAt: $('gcfNdaReq').value || undefined, issuedAt: $('gcfNdaIss').value || undefined } };
      const name = $('gcfExName').value.trim();
      if (name) body.executingEntity = { name, role: $('gcfExRole').value.trim() || null, trackRecord: $('gcfExTrack').value.trim() || null };
      patch(p.id, body);
    });

    /* Safeguards */
    const sg = p.safeguards || {}; const fp = sg.fpic || {};
    const SG = [['esia', 'Environmental and social impact assessment'], ['esmp', 'Environmental and social management plan'], ['esap', 'Environmental and social action plan'],
      ['genderAssessment', 'Gender assessment'], ['genderActionPlan', 'Gender action plan'], ['stakeholderConsultation', 'Stakeholder consultation'], ['grm', 'Grievance redress mechanism']];
    setHtml('gcfProjectSafeguards', facts([
      ['Category', `${esc(p.essCategory)}${(p.essFlags || []).length ? ` — ${p.essFlags.map(x => esc(words(x))).join(', ')}` : ''}`],
      ...SG.map(([k, l]) => [l, words((sg[k] && sg[k].status) || 'not started')]),
      ['Free, prior and informed consent', fp.required ? `required — ${words(fp.status || 'not started')}${fp.communities ? ` (${esc(fp.communities)})` : ''}` : 'not required'],
    ]));
    setHtml('gcfProjectSafeguardsForm', write ? `
      <div class="gcf-inline-form">
        ${SG.map(([k, l]) => `<div class="gcf-field"><label for="gcfSg-${k}">${esc(l)}</label><select id="gcfSg-${k}">${['not_started', 'in_progress', 'complete'].map(o => `<option value="${o}" ${o === ((sg[k] && sg[k].status) || 'not_started') ? 'selected' : ''}>${words(o)}</option>`).join('')}</select></div>`).join('')}
        <div class="gcf-field"><label for="gcfFpicStatus">Free, prior and informed consent</label><select id="gcfFpicStatus">${['not_required', 'not_started', 'in_progress', 'obtained'].map(o => `<option value="${o}" ${o === (fp.required ? fp.status : 'not_required') ? 'selected' : ''}>${words(o)}</option>`).join('')}</select></div>
        <div class="gcf-field gcf-field-wide"><label for="gcfFpicComm">Communities concerned</label><input type="text" id="gcfFpicComm" value="${esc(fp.communities || '')}"></div>
        <div class="gcf-actions"><button class="btn btn-primary btn-sm" id="gcfSgSave">Save</button></div>
      </div>` : '');
    on('gcfSgSave', 'click', () => {
      const body = { safeguards: {} };
      for (const [k] of SG) body.safeguards[k] = { status: $(`gcfSg-${k}`).value };
      const fs = $('gcfFpicStatus').value;
      body.safeguards.fpic = { required: fs !== 'not_required', status: fs, communities: $('gcfFpicComm').value.trim() || null };
      patch(p.id, body);
    });

    /* Documents */
    const docs = p.documents || [];
    setHtml('gcfProjectDocs', docs.length ? `<div class="gcf-scroll"><table class="gcf-table"><thead><tr><th>Kind</th><th>Title</th><th>Reference</th><th>Date</th>${write ? '<th></th>' : ''}</tr></thead>
      <tbody>${docs.map((d, i) => `<tr><td>${esc(words(d.kind))}</td><td>${esc(d.title)}</td><td>${esc(d.reference || '')}${d.version ? ` v${esc(d.version)}` : ''}</td><td class="gcf-date">${esc(d.date || '')}</td>${write ? `<td><button class="gcf-remove" data-doc-remove="${i}">remove</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : '<span class="gcf-hint">No document recorded.</span>');
    setHtml('gcfProjectDocsForm', write ? `
      <div class="gcf-inline-form">
        <div class="gcf-field"><label for="gcfDocKind">Kind</label><select id="gcfDocKind">${vocab('documentKinds').map(o => `<option value="${o}">${words(o)}</option>`).join('')}</select></div>
        <div class="gcf-field"><label for="gcfDocTitle">Title</label><input type="text" id="gcfDocTitle"></div>
        <div class="gcf-field"><label for="gcfDocRef">Reference</label><input type="text" id="gcfDocRef"></div>
        <div class="gcf-field"><label for="gcfDocDate">Date</label><input type="date" id="gcfDocDate"></div>
        <div class="gcf-actions"><button class="btn btn-secondary btn-sm" id="gcfDocAdd">Add document</button></div>
      </div>` : '');
    on('gcfDocAdd', 'click', () => {
      const title = $('gcfDocTitle').value.trim();
      if (!title) return hint('A document needs a title.');
      patch(p.id, { documents: [...docs, { kind: $('gcfDocKind').value, title, reference: $('gcfDocRef').value.trim() || undefined, date: $('gcfDocDate').value || undefined }] });
    });
    document.querySelectorAll('[data-doc-remove]').forEach(b => b.addEventListener('click', () => {
      patch(p.id, { documents: docs.filter((_, i) => i !== Number(b.dataset.docRemove)) });
    }));

    /* Narrative */
    const nar = p.narrative || {};
    const NAR = [['paradigmShift', 'Paradigm shift — scale, replication, market change'], ['enablingEnvironment', 'Contribution to the enabling environment'],
      ['sustainableDevelopment', 'Sustainable development co-benefits'], ['needsOfRecipient', 'Needs of the recipient — vulnerability and alternatives'], ['theoryOfChange', 'Theory of change']];
    setHtml('gcfProjectNarrative', facts(NAR.map(([k, l]) => [l, esc(nar[k] || '—')])));
    setHtml('gcfProjectNarrativeForm', write ? `
      <div class="gcf-inline-form">
        ${NAR.map(([k, l]) => `<div class="gcf-field gcf-field-wide"><label for="gcfNar-${k}">${esc(l)}</label><textarea id="gcfNar-${k}" rows="2">${esc(nar[k] || '')}</textarea></div>`).join('')}
        <div class="gcf-actions"><button class="btn btn-primary btn-sm" id="gcfNarSave">Save</button></div>
      </div>` : '');
    on('gcfNarSave', 'click', () => {
      const body = { narrative: {} };
      for (const [k] of NAR) body.narrative[k] = $(`gcfNar-${k}`).value.trim() || null;
      patch(p.id, body);
    });

    /* The sections held as structured facts — rendered by the sibling
       module, handed the helpers it needs; every block it shows is the
       record's own and every form writes through the same patch. */
    if (typeof GCFSections !== 'undefined') GCFSections.render(p, { write, $, esc, setHtml, on, vocab, words, patch, hint, usd });

    /* Dates */
    const ms = (ref().cycle && ref().cycle.milestones) || [];
    const tl = p.timeline || {};
    setHtml('gcfProjectDatesView', facts(ms.map(m => [m.label, esc(tl[m.key] || '—')])));
    setHtml('gcfProjectDatesForm', write ? `
      <div class="gcf-inline-form">
        ${ms.map(m => `<div class="gcf-field"><label for="gcfTl-${m.key}">${esc(m.label)}</label><input type="date" id="gcfTl-${m.key}" value="${esc(tl[m.key] || '')}"></div>`).join('')}
        <div class="gcf-actions"><button class="btn btn-primary btn-sm" id="gcfTlSave">Save dates</button></div>
      </div>` : '');
    on('gcfTlSave', 'click', () => {
      const timeline = {};
      for (const m of ms) { const val = $(`gcfTl-${m.key}`).value; if (val) timeline[m.key] = val; }
      /* Arrays replace and objects merge on the server, so a cleared date is
         sent as null to remove it. */
      for (const m of ms) if (!timeline[m.key] && tl[m.key]) timeline[m.key] = null;
      patch(p.id, { timeline });
    });

    /* Selection and record */
    const admin = $('gcfProjectAdmin');
    if (admin) admin.hidden = !write;
    setHtml('gcfProjectAdminForm', write ? `
      <div class="gcf-form">
        <div class="gcf-field"><label for="gcfAdmSel">Put forward for a Concept Note</label><select id="gcfAdmSel"><option value="no" ${p.selectedForCN ? '' : 'selected'}>No</option><option value="yes" ${p.selectedForCN ? 'selected' : ''}>Yes</option></select></div>
        <div class="gcf-field"><label for="gcfAdmEss">Environmental and social category</label><select id="gcfAdmEss">${vocab('essCategories').map(o => `<option value="${o}" ${o === p.essCategory ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div class="gcf-field gcf-field-wide"><label for="gcfAdmReason">Why this project — the selection reasoning</label><textarea id="gcfAdmReason" rows="3">${esc(p.selectionReason || '')}</textarea></div>
        <div class="gcf-actions gcf-field-wide">
          <button class="btn btn-primary btn-sm" id="gcfAdmSave">Save</button>
          <button class="btn btn-secondary btn-sm gcf-danger" id="gcfAdmDelete">Remove this project</button>
        </div>
      </div>` : '');
    on('gcfAdmSave', 'click', () => patch(p.id, { selectedForCN: $('gcfAdmSel').value === 'yes', essCategory: $('gcfAdmEss').value, selectionReason: $('gcfAdmReason').value.trim() }));
    on('gcfAdmDelete', 'click', () => removeProject(p.id, p.code));

    for (const el of document.querySelectorAll('#gcfProject [data-writes]')) el.hidden = !write && el.id !== 'gcfProjectMove';
    for (const el of document.querySelectorAll('#gcfProject [data-validates]')) el.hidden = !canValidate();
  }

  /* ── The assessor's validation ────────────────────────────────
     State, the six criteria with the assessor's rating beside the engine's
     evidence coverage, the recommendation and the dated history. The rating is
     the assessor's word (strong/adequate/weak), never a number — the evidence
     pill beside it is what the record holds. Sign-off controls appear only for
     a caller holding validate; the server is the control either way. */
  const STATE_LABEL = { draft: 'Draft', under_review: 'Under review', validated: 'Validated' };
  const RATING_LABEL = { strong: 'Strong', adequate: 'Adequate', weak: 'Weak' };
  const REC_LABEL = {
    recommend: 'Recommend', recommend_with_conditions: 'Recommend with conditions', not_recommend: 'Do not recommend',
  };
  const statePill = s => `<span class="gcf-pill gcf-pill-${s === 'validated' ? 'ok' : s === 'under_review' ? 'flag' : 'tier'}">${esc(STATE_LABEL[s] || s)}</span>`;
  const ratingPill = r => (r ? `<span class="gcf-pill gcf-pill-${r === 'strong' ? 'ok' : r === 'adequate' ? 'flag' : 'stop'}">${esc(RATING_LABEL[r] || r)}</span>` : '<span class="gcf-hint">not rated</span>');

  function renderValidation(p, v, c) {
    const val = v || { state: 'draft', ratings: {}, recommendation: null, recommendationNote: null, validatedBy: null, validatedAt: null, history: [] };
    const can = canValidate();
    const frozen = val.state === 'validated';

    const signoff = frozen
      ? ` — ${esc(REC_LABEL[val.recommendation] || val.recommendation || '')}, signed off by ${esc(val.validatedBy || '—')}${val.validatedAt ? ` on ${esc(String(val.validatedAt).slice(0, 10))}` : ''}`
      : (val.recommendation ? ` — recommendation: ${esc(REC_LABEL[val.recommendation] || val.recommendation)}` : '');
    setHtml('gcfValidationState', `<p>${statePill(val.state)}${signoff}${val.recommendationNote ? `<span class="gcf-hint"> — ${esc(val.recommendationNote)}</span>` : ''}</p>`);

    /* The assessment report — a read anyone may take, so it is not gated by the
       validate scope. The document's own sign-off block tells a draft apart
       from a validated one, so downloading before sign-off is honest. */
    setHtml('gcfValidationDownload', view.source === 'recorded'
      ? `<span class="gcf-hint">Assessment report:</span>
         <button class="btn btn-secondary btn-sm" data-report="pdf">PDF</button>
         <button class="btn btn-secondary btn-sm" data-report="word">Word</button>
         <button class="btn btn-secondary btn-sm" data-report="json">JSON</button>`
      : '');
    document.querySelectorAll('#gcfValidationDownload [data-report]').forEach(btn =>
      btn.addEventListener('click', () => downloadReport(p.id, p.code, btn.dataset.report)));

    /* One row per criterion: the engine's evidence coverage, then the
       assessor's rating (a select when editable, the word otherwise). */
    const critRows = (c.criteria || []).map(cr => {
      const rated = val.ratings[cr.id] || {};
      const control = (can && !frozen)
        ? `<select data-rate="${esc(cr.id)}"><option value="">—</option>${['strong', 'adequate', 'weak'].map(o => `<option value="${o}" ${rated.rating === o ? 'selected' : ''}>${RATING_LABEL[o]}</option>`).join('')}</select>`
        : ratingPill(rated.rating);
      return `<tr><td>${esc(cr.label)}</td><td>${heldPill(cr.status)}</td><td>${control}</td></tr>`;
    }).join('');
    setHtml('gcfValidationCriteria', `<div class="gcf-scroll"><table class="gcf-table">
      <thead><tr><th>Criterion</th><th>Evidence on the record</th><th>Assessor rating</th></tr></thead>
      <tbody>${critRows}</tbody></table></div>`);

    if (!can) {
      setHtml('gcfValidationForm', `<p class="gcf-hint">${view.source !== 'recorded'
        ? 'This is the shipped illustrative pipeline — adopt it to validate a recorded project.'
        : 'Validation is the assessor’s. Sign in as an assessor to rate and sign off.'}</p>`);
    } else {
      const recSel = `<select id="gcfValRec"><option value="">—</option>${Object.entries(REC_LABEL).map(([k, l]) => `<option value="${k}" ${val.recommendation === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
      const buttons = [];
      if (val.state === 'draft') buttons.push('<button class="btn btn-secondary btn-sm" id="gcfValStart">Start review</button>');
      if (val.state === 'under_review') {
        buttons.push('<button class="btn btn-secondary btn-sm" id="gcfValSaveRatings">Save ratings</button>');
        buttons.push('<button class="btn btn-primary btn-sm" id="gcfValValidate">Validate and sign off</button>');
      }
      if (val.state === 'validated') buttons.push('<button class="btn btn-secondary btn-sm" id="gcfValReopen">Reopen</button>');
      setHtml('gcfValidationForm', `
        <div class="gcf-inline-form">
          <div class="gcf-field"><label for="gcfValRec">Recommendation</label>${frozen ? ratingPill(null) : recSel}</div>
          <div class="gcf-field gcf-field-wide"><label for="gcfValNote">Note</label><textarea id="gcfValNote" rows="2" ${frozen ? 'disabled' : ''}>${esc(val.recommendationNote || '')}</textarea></div>
          <div class="gcf-actions gcf-field-wide">${buttons.join(' ')}</div>
        </div>`);
      on('gcfValStart', 'click', () => validateChange(p.id, { to: 'under_review', ...gatherRatings() }));
      on('gcfValSaveRatings', 'click', () => validateChange(p.id, gatherRatings()));
      on('gcfValValidate', 'click', () => validateChange(p.id, { to: 'validated', ...gatherRatings() }));
      on('gcfValReopen', 'click', () => validateChange(p.id, { to: 'under_review', note: 'Reopened for re-assessment.' }));
    }

    const hist = (val.history || []).slice().reverse();
    setHtml('gcfValidationHistory', hist.length
      ? `<h5>History</h5><ul class="gcf-history">${hist.map(h => `<li>${statePill(h.to)} <span class="gcf-hint">${esc(String(h.at).slice(0, 10))}${h.by ? ` · ${esc(h.by)}` : ''}${h.note ? ` · ${esc(h.note)}` : ''}</span></li>`).join('')}</ul>`
      : '');
  }

  /* The ratings and recommendation as the form holds them now, so a state move
     carries the assessor's latest edits in the same request. Only a chosen
     rating is sent; an untouched select is left as the record has it. */
  function gatherRatings() {
    const ratings = {};
    document.querySelectorAll('#gcfValidationCriteria [data-rate]').forEach(sel => {
      if (sel.value) ratings[sel.dataset.rate] = { rating: sel.value };
    });
    const rec = $('gcfValRec');
    const note = $('gcfValNote');
    const out = {};
    if (Object.keys(ratings).length) out.ratings = ratings;
    if (rec && rec.value) out.recommendation = rec.value;
    if (note) out.recommendationNote = note.value.trim() || null;
    return out;
  }

  /* Fetch the assessment report and save it. JSON opens as text; PDF and Word
     save as the binary the server rendered. Authenticated through the app's
     own fetch, so the session token travels with it. */
  async function downloadReport(id, code, format) {
    const ext = format === 'word' ? 'docx' : format;
    hint(`Preparing the assessment report (${format.toUpperCase()})…`);
    try {
      const res = await window.CARBONIQ_fetch(`/v1/gcf/pipeline/${encodeURIComponent(id)}/assessment-report?format=${format}`);
      if (!res.ok) {
        let data = {};
        try { data = await res.json(); } catch (_) { /* non-JSON */ }
        throw new Error([data.message, data.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
      }
      const blob = format === 'json'
        ? new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' })
        : await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `gcf-assessment-${String(code || id).replace(/[^A-Za-z0-9_-]/g, '')}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      hint('Assessment report downloaded.');
    } catch (err) {
      hint(''); const e = $('gcfProjectError'); if (e) { e.hidden = false; e.textContent = err.message; }
    }
  }

  async function validateChange(id, change) {
    hint('Recording the validation…');
    try {
      await deps.call(`/pipeline/${encodeURIComponent(id)}/validation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change),
      });
      hint('Recorded.');
      await openProject(id, { quiet: true });
      deps.refreshAll({ reopen: false });
    } catch (err) {
      hint(''); const e = $('gcfProjectError'); if (e) { e.hidden = false; e.textContent = err.message; }
    }
  }

  /* ── The return-to-sponsor loop ───────────────────────────────
     The gap list (a read anyone sees), the return control (the assessor's, so
     validate-gated and shown only when the assessment is returnable), the
     return-letter download (a read), and the resubmission comparison once a
     return exists. The whole block is shown only when the loop is relevant —
     a non-clean recommendation, or a return already made. */
  function gapList(items) {
    if (!items.length) return '<p class="gcf-hint">No specific gaps recorded.</p>';
    return `<ul class="gcf-gaps">${items.map(g => `<li>${heldPill(g.kind === 'rating' ? 'partial' : g.status)}<span><strong>${esc(g.criterion)}</strong> — ${esc(g.remedy)}</span></li>`).join('')}</ul>`;
  }

  function renderReturn(p, ret) {
    const block = $('gcfReturnBlock');
    if (!block) return;
    const g = ret.gaps || { items: [], count: 0, returnable: false, recommendation: null };
    const cmp = ret.comparison || { hasReturn: false };
    const relevant = view.source === 'recorded'
      && (g.returnable || (ret.returns && ret.returns.length) || (g.recommendation && g.recommendation !== 'recommend'));
    block.hidden = !relevant;
    if (!relevant) return;

    setHtml('gcfReturnGaps', `<p class="gcf-hint">${g.count} point${g.count === 1 ? '' : 's'} for the sponsor to address — each drawn from the assessment, with the step that clears it.</p>${gapList(g.items)}`);

    const actions = [];
    if (canValidate() && g.returnable) actions.push('<button class="btn btn-primary btn-sm" id="gcfReturnDo">Return to sponsor</button>');
    actions.push('<span class="gcf-hint">Return letter:</span>'
      + '<button class="btn btn-secondary btn-sm" data-letter="pdf">PDF</button>'
      + '<button class="btn btn-secondary btn-sm" data-letter="word">Word</button>'
      + '<button class="btn btn-secondary btn-sm" data-letter="json">JSON</button>');
    setHtml('gcfReturnActions', actions.join(' '));
    on('gcfReturnDo', 'click', () => returnToSponsor(p.id));
    document.querySelectorAll('#gcfReturnActions [data-letter]').forEach(btn =>
      btn.addEventListener('click', () => downloadLetter(p.id, p.code, btn.dataset.letter)));

    if (cmp.hasReturn) {
      const section = (title, arr) => `<div><span class="gcf-check-label">${title} (${arr.length})</span>${arr.length ? gapList(arr) : '<p class="gcf-hint">None.</p>'}</div>`;
      setHtml('gcfReturnComparison', `<h5>Since the return of ${esc(String(cmp.returnedAt).slice(0, 10))}</h5>
        <p class="gcf-hint">${esc(cmp.note)}</p>
        ${section('Resolved', cmp.resolved)}
        ${section('Still outstanding', cmp.outstanding)}
        ${section('Newly raised', cmp.raised)}`);
    } else {
      setHtml('gcfReturnComparison', '');
    }
  }

  async function returnToSponsor(id) {
    hint('Returning to the sponsor…');
    try {
      await deps.call(`/pipeline/${encodeURIComponent(id)}/return`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      hint('Returned to the sponsor. The gap list has been snapshotted for the comparison.');
      await openProject(id, { quiet: true });
      deps.refreshAll({ reopen: false });
    } catch (err) {
      hint(''); const e = $('gcfProjectError'); if (e) { e.hidden = false; e.textContent = err.message; }
    }
  }

  async function downloadLetter(id, code, format) {
    const ext = format === 'word' ? 'docx' : format;
    hint(`Preparing the return letter (${format.toUpperCase()})…`);
    try {
      const res = await window.CARBONIQ_fetch(`/v1/gcf/pipeline/${encodeURIComponent(id)}/return-letter?format=${format}`);
      if (!res.ok) {
        let data = {};
        try { data = await res.json(); } catch (_) { /* non-JSON */ }
        throw new Error([data.message, data.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
      }
      const blob = format === 'json'
        ? new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' })
        : await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `gcf-return-letter-${String(code || id).replace(/[^A-Za-z0-9_-]/g, '')}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      hint('Return letter downloaded.');
    } catch (err) {
      hint(''); const e = $('gcfProjectError'); if (e) { e.hidden = false; e.textContent = err.message; }
    }
  }

  const facts = pairs => pairs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('');
  const readOnlyNote = one => `<div class="gcf-hint" style="margin-top:8px">${one.sample
    ? 'Illustrative record — adopt the shipped pipeline on the Intake tab to edit it.'
    : 'Read-only session.'}</div>`;
  const hint = t => say('gcfProjectHint', t);

  /* ── Writes ───────────────────────────────────────────────── */
  async function patch(id, body) {
    hint('Saving…');
    try {
      await deps.call(`/pipeline/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      hint('Saved.');
      await openProject(id, { quiet: true });
      deps.refreshAll({ reopen: false });
    } catch (err) {
      hint(''); const e = $('gcfProjectError'); if (e) { e.hidden = false; e.textContent = err.message; }
    }
  }

  async function moveStage(id) {
    const stage = $('gcfMoveStage').value; const at = $('gcfMoveAt').value; const note = $('gcfMoveNote').value.trim();
    /* The date that usually travels with a move lands on the timeline in the
       same write, so a submission is dated where the projections read it. */
    const carries = { cn_submitted: 'cnSubmitted', fp_submitted: 'fpSubmitted', approved: 'boardDecision', faa: 'faaSigned', implementation: 'implementationStart', closed: 'completion' };
    const body = { stage, at: at || undefined, note: note || undefined };
    if (carries[stage] && at) body.timeline = { [carries[stage]]: at };
    hint('Recording the move…');
    try {
      await deps.call(`/pipeline/${encodeURIComponent(id)}/stage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      hint(`Moved to ${stageLabel(stage).toLowerCase()}.`);
      await openProject(id, { quiet: true });
      deps.refreshAll({ reopen: false });
    } catch (err) {
      hint(''); const e = $('gcfProjectError'); if (e) { e.hidden = false; e.textContent = err.message; }
    }
  }

  async function removeProject(id, code) {
    if (!window.confirm(`Remove ${code} from the pipeline? The record is deleted; the shipped sample is unaffected.`)) return;
    try {
      await deps.call(`/pipeline/${encodeURIComponent(id)}`, { method: 'DELETE' });
      closeProject();
      deps.refreshAll();
    } catch (err) { const e = $('gcfProjectError'); if (e) { e.hidden = false; e.textContent = err.message; } }
  }

  /* ── Wiring ───────────────────────────────────────────────── */
  function init(d) {
    deps = d;
    on('gcfProjectBack', 'click', closeProject);
    on('gcfBoardCsv', 'click', downloadCsv);
    const panel = $('gcfPanel-pipeline');
    if (!panel) return;
    panel.addEventListener('click', ev => {
      const step = ev.target.closest('.gcf-rail-step');
      if (step && view.portfolio) {
        const n = Number(step.dataset.cycle);
        view.filterStage = view.filterStage === n ? null : n;
        renderRail(view.portfolio); renderBoard(view.portfolio);
        return;
      }
      const open = ev.target.closest('[data-open]');
      if (open) { ev.preventDefault(); openProject(open.dataset.open); }
    });
    panel.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter') return;
      const row = ev.target.closest('tr[data-open]');
      if (row) openProject(row.dataset.open);
    });
  }

  return { init, load, openProject, closeProject };
})();
