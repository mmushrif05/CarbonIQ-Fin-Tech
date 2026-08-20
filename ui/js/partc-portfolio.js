/* ============================================================
   CarbonIQ — PCAF Part C: the reporting-year position

   Everything here is a SUM of per-policy results. Construction
   and use-stage are shown as separate lines and never combined,
   and the voluntary whole-life annex is excluded entirely.
   ============================================================ */

const PartCPortfolio = (() => {

  const $ = id => document.getElementById(id);
  const fmt = (n, d = 0) => Number(n || 0).toLocaleString('en-US',
    { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

  let currency = 'LKR';

  async function call(path) {
    const res = await window.CARBONIQ_fetch('/v1/partc' + path);
    let data = {};
    try { data = await res.json(); } catch (_) { /* empty */ }
    if (!res.ok) throw new Error([data.message, data.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
    return data;
  }

  /** Offer the years the book actually contains, plus the settings year. */
  async function loadYears() {
    let years = [], settingsYear = null;
    try {
      const { settings } = await call('/settings');
      currency = settings.currency || 'LKR';
      say('pfInsurer', settings.insurerName || 'Reporting year');
      settingsYear = settings.reportingYear;
      years.push(settings.reportingYear);
    } catch (_) { /* defaults stand */ }
    try {
      const { policies } = await call('/policies');
      years.push(...policies.map(p => p.reportingYear).filter(Boolean));
    } catch (_) { /* none yet */ }

    const unique = [...new Set(years)].sort((a, b) => b - a);
    const chosen = $('pfYear') ? $('pfYear').value : '';
    setHtml('pfYear', unique.length
      ? unique.map(y => `<option value="${y}">FY${y}</option>`).join('')
      : `<option value="${new Date().getFullYear()}">FY${new Date().getFullYear()}</option>`);
    if (!$('pfYear')) return;

    const has = v => [...$('pfYear').options].some(o => o.value === String(v));

    // Rebuilding the list must not silently move the user off the year they
    // were reading, so their choice wins whenever the book still holds it.
    // Otherwise open on the insurer's own reporting year rather than on the
    // newest year in the book — a policy incepting next year is already in
    // the book, and landing there would show an empty position for a year
    // nobody is reporting yet.
    if (chosen && has(chosen))            $('pfYear').value = chosen;
    else if (settingsYear && has(settingsYear)) $('pfYear').value = String(settingsYear);
  }

  async function load() {
    const year = $('pfYear').value;
    say('pfStatus', 'Loading…');
    try {
      const [{ portfolio }, { plan }, { gaps }, { comparatives }] = await Promise.all([
        call(`/portfolio/${year}`),
        call(`/portfolio/${year}/dq-plan`),
        call(`/portfolio/${year}/factor-gaps`),
        call(`/portfolio/${year}/comparatives`)
      ]);
      render(portfolio, plan, gaps, comparatives);
      $('pfBody').hidden = false;
      say('pfStatus', `${portfolio.assessments.locked} locked assessment(s) in FY${portfolio.reportingYear}.`);
    } catch (err) {
      say('pfStatus', err.message);
    }
  }

  function render(p, plan, gaps, comp) {
    say('pfSubtitle', `FY${p.reportingYear} · ${p.currency} · ${p.premiumBasis} premium`);
    say('pfConstruction', fmt(p.construction.total_kgCO2e, 2));
    say('pfIae', fmt(p.construction.insurerIAE_tCO2e, 4));
    say('pfUseStage', fmt(p.useStage.total_kgCO2e, 2));
    say('pfDq', p.dataQuality.weighted === null ? '—' : p.dataQuality.weighted);
    say('pfDqBasis', p.dataQuality.simpleAverage === null
      ? 'by emissions'
      : `by emissions · simple avg ${p.dataQuality.simpleAverage}`);
    say('pfScopeNote', p.scopeNote);
    say('pfAggregationNote', p.aggregationNote);

    setHtml('pfCoverage', `
      <table class="partc-table"><tbody>
        <tr><td>Policies in force</td><td class="num">${p.coverage.policiesInYear}</td></tr>
        <tr><td>With a locked assessment</td><td class="num">${p.coverage.assessedPolicies}</td></tr>
        <tr class="total"><td>Coverage</td><td class="num">${p.coverage.coveragePct}%</td></tr>
      </tbody></table>
      ${p.coverage.unassessed.length ? `<h5 class="partc-subhead">Not yet assessed</h5>
        <table class="partc-table"><tbody>${p.coverage.unassessed.map(u =>
          `<tr><td>${esc(u.projectName)}</td><td>${esc(u.lineType)}</td>
               <td class="num">${currency} ${fmt(u.premium, 2)}</td></tr>`).join('')}
        </tbody></table>` : '<p class="partc-hint">Every policy in force carries a locked assessment.</p>'}`);

    setHtml('pfStates', `
      <table class="partc-table"><tbody>
        <tr><td>Locked <span class="partc-status partc-status-locked">in disclosure</span></td><td class="num">${p.assessments.locked}</td></tr>
        <tr><td>Under review</td><td class="num">${p.assessments.underReview}</td></tr>
        <tr><td>Draft</td><td class="num">${p.assessments.draft}</td></tr>
        <tr><td>Superseded</td><td class="num">${p.assessments.superseded}</td></tr>
        <tr><td>Restatements</td><td class="num">${p.assessments.restatements}</td></tr>
      </tbody></table>`);

    setHtml('pfRows', p.rows.length === 0
      ? '<p class="partc-hint">No locked assessments in this year. Only a locked assessment enters the disclosure.</p>'
      : `<table class="partc-table">
           <thead><tr><th>Project</th><th>Policy</th><th>Rev</th><th>Construction</th><th>Share</th><th>AF</th><th>IAE</th><th>DQ</th></tr></thead>
           <tbody>${p.rows.map(r => `
             <tr>
               <td>${esc(r.projectName)}<br><span class="partc-hint">${esc(r.clientName)}</span></td>
               <td>${esc(r.lineType)}${r.policyRef ? '<br><span class="partc-hint">' + esc(r.policyRef) + '</span>' : ''}
                   ${r.isRestatement ? '<span class="partc-conf partc-conf-medium">restated</span>' : ''}</td>
               <td><span class="pill in">${esc(r.boqRevision)}</span></td>
               <td class="num">${fmt(r.construction_kgCO2e, 2)}</td>
               <td class="num">${r.shareOfConstructionPct}%</td>
               <td class="num">${r.attributionFactor.toFixed(6)}</td>
               <td class="num">${fmt(r.insurerIAE_tCO2e, 4)}</td>
               <td class="num">${esc(r.dataQualityOption)} · ${r.dataQualityScore}</td>
             </tr>`).join('')}
           </tbody></table>`);

    say('pfPlanNote', plan.achievableNote || plan.ranking);
    setHtml('pfPlan', plan.items.length === 0
      ? `<p class="partc-hint">${esc(plan.unassessedNote)}</p>`
      : plan.items.map(i => `
          <div class="partc-entry partc-sev-${i.shareOfConstructionPct >= 50 ? 'material' : 'notable'}">
            <strong>${i.rank}. ${esc(i.projectName)}</strong>
            <span class="pill in">${i.shareOfConstructionPct}% of the figure</span>
            <span class="partc-conf partc-conf-medium">DQ ${i.currentScore} → ${i.achievableScore}</span>
            <p>${i.actions.map(a => esc(a)).join('<br>')}</p>
          </div>`).join('') + `<p class="partc-hint">${esc(plan.unassessedNote)}</p>`);

    setHtml('pfGaps', gaps.factors.length === 0
      ? `<p class="partc-hint">${esc(gaps.note)}</p>`
      : `<table class="partc-table">
           <thead><tr><th>#</th><th>Factor</th><th>Tier</th><th>Seen in</th><th>Avg share</th></tr></thead>
           <tbody>${gaps.factors.map(f => `
             <tr><td class="num">${f.rank}</td><td class="mono">${esc(f.factorKey)}</td>
                 <td>${esc(f.tier)}</td><td class="num">${f.occurrences}</td>
                 <td class="num">${f.avgSharePct.toFixed(1)}%</td></tr>`).join('')}
           </tbody></table>
         <p class="partc-hint">${esc(gaps.note)}</p>`);

    renderComparison(p, comp);
  }

  /* Year on year.

     The totals are shown because a reader will ask for them, but the note
     that a change of book is not a change in performance is shown with
     them, not below the fold — and intensity, the measure that survives a
     change of book, sits in the same table rather than in a footnote. */
  function renderComparison(p, comp) {
    const move = m => {
      if (!m || m.pct === null || m.pct === undefined) return '—';
      const sign = m.pct >= 0 ? '+' : '';
      return `<span class="pf-move pf-move-${m.direction}">${sign}${m.pct}%</span>`;
    };
    const num = (v, d = 2) => (v === null || v === undefined) ? '—' : fmt(v, d);

    say('pfCompareNote', comp.hasPrior
      ? `FY${comp.priorYear} against FY${comp.reportingYear}.`
      : `FY${comp.reportingYear} is the first reported year.`);

    if (!comp.hasPrior) {
      setHtml('pfCompare', `<p class="partc-hint">${esc(comp.comparabilityNote)}</p>`);
    } else {
      setHtml('pfCompare', `
        <table class="partc-table">
          <thead><tr><th>Measure</th><th>FY${comp.priorYear}</th><th>FY${comp.reportingYear}</th><th>Movement</th></tr></thead>
          <tbody>
            <tr><td>Construction kgCO₂e</td><td class="num">${num(comp.construction.prior)}</td>
                <td class="num">${num(comp.construction.current)}</td><td class="num">${move(comp.construction)}</td></tr>
            <tr><td>Insurer's IAE tCO₂e</td><td class="num">${num(comp.insurerIAE.prior, 4)}</td>
                <td class="num">${num(comp.insurerIAE.current, 4)}</td><td class="num">${move(comp.insurerIAE)}</td></tr>
            <tr class="total"><td>Intensity kgCO₂e/m²</td><td class="num">${num(comp.intensity.prior)}</td>
                <td class="num">${num(comp.intensity.current)}</td>
                <td class="num">${comp.intensity.movementPct === null ? '—'
                  : `<span class="pf-move pf-move-${comp.intensity.movementPct >= 0 ? 'up' : 'down'}">${comp.intensity.movementPct >= 0 ? '+' : ''}${comp.intensity.movementPct}%</span>`}</td></tr>
            <tr><td>Weighted data quality</td><td class="num">${comp.dataQuality.prior ?? '—'}</td>
                <td class="num">${comp.dataQuality.current ?? '—'}</td>
                <td class="num">${comp.dataQuality.movement === null ? '—' : comp.dataQuality.movement}</td></tr>
            <tr><td>Policies assessed</td><td class="num">${comp.composition.assessedPolicies.prior}</td>
                <td class="num">${comp.composition.assessedPolicies.current}</td><td class="num">—</td></tr>
            <tr><td>Insured area m²</td><td class="num">${num(comp.composition.insuredArea_m2.prior)}</td>
                <td class="num">${num(comp.composition.insuredArea_m2.current)}</td><td class="num">—</td></tr>
          </tbody>
        </table>
        <p class="partc-scope-warning">${esc(comp.comparabilityNote)}</p>`);
    }

    const r = comp.restatements;
    setHtml('pfRestatements', r.count === 0
      ? `<p class="partc-hint">${esc(r.note)}</p>`
      : `<table class="partc-table">
           <thead><tr><th>Policy</th><th>Project</th><th>As previously reported</th>
                      <th>As restated</th><th>Movement</th><th>Reason</th></tr></thead>
           <tbody>${r.entries.map(e => `
             <tr><td>${esc(e.policyRef || e.assessmentId)}</td><td>${esc(e.projectName)}</td>
                 <td class="num">${fmt(e.asPreviouslyReported_kgCO2e, 2)}</td>
                 <td class="num">${fmt(e.asRestated_kgCO2e, 2)}</td>
                 <td class="num"><span class="pf-move pf-move-${e.movementPct >= 0 ? 'up' : 'down'}">${e.movementPct >= 0 ? '+' : ''}${e.movementPct}%</span></td>
                 <td>${esc(e.reason || 'not recorded')}</td></tr>`).join('')}
           </tbody></table>
         <p class="partc-hint">${esc(r.note)}</p>`);
  }

  /* The annual disclosure download.

     Streamed as a blob rather than opened in a tab, because the request
     carries the API key in a header — a plain link would arrive
     unauthenticated. */
  async function downloadDisclosure(format) {
    const year = $('pfYear').value;
    say('pfStatus', `Building the FY${year} disclosure…`);
    try {
      const res = await window.CARBONIQ_fetch(`/v1/partc/disclosure/${year}?format=${format}`);
      if (!res.ok) {
        let data = {};
        try { data = await res.json(); } catch (_) { /* empty */ }
        throw new Error([data.message, data.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `iae-disclosure-fy${year}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      say('pfStatus', `FY${year} disclosure downloaded.`);
    } catch (err) {
      say('pfStatus', err.message);
    }
  }

  async function init() {
    await loadYears();
    on('pfRefresh', 'click', load);
    on('pfYear', 'change', load);
    on('pfDiscPdfBtn', 'click', () => downloadDisclosure('pdf'));
    on('pfDiscDocxBtn', 'click', () => downloadDisclosure('docx'));
    await load();
  }

  /* Locking an assessment on the Book screen moves these figures, so a
     return visit must re-read the period rather than show what was true
     the first time this page was opened. */
  async function refresh() {
    await loadYears();
    await load();
  }

  return { init, refresh };
})();
