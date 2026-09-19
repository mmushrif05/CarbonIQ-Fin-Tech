// @ts-check
/* ============================================================
   GCF Pipeline — the sections held as structured facts
   ============================================================
   The eight sections a concept note and a funding proposal are written
   from, each a read of the project record with an inline form beneath it
   that writes back through the same PATCH the rest of the project page
   uses: the risk register, the implementation arrangements and timetable,
   sustainability and exit, the stakeholder consultations, the adaptation
   climate rationale, the financial terms, monitoring and evaluation, and
   post-approval reporting. Every figure and every word shown is the
   record's own; nothing here is computed, and the readiness checklist and
   the Concept Note package read the same blocks. A sibling of
   gcf-pipeline.js so that file stays readable; it is handed the helpers it
   needs and holds no state of its own. */

const GCFSections = (() => {
  'use strict';

  /** @param {any} p @param {any} ctx */
  function render(p, ctx) {
    const { write, $, esc, setHtml, on, vocab, words, patch, usd } = ctx;
    const dash = v => (v === null || v === undefined || v === '' ? '—' : esc(v));
    const opts = (key, current) => vocab(key).map(o => `<option value="${o}" ${o === current ? 'selected' : ''}>${esc(words(o))}</option>`).join('');
    const val = id => { const el = $(id); return el ? String(el.value || '').trim() : ''; };
    const numVal = id => { const v = val(id); return v === '' ? null : Number(v); };
    const field = (id, label, control, wide) => `<div class="gcf-field${wide ? ' gcf-field-wide' : ''}"><label for="${id}">${esc(label)}</label>${control}</div>`;
    const text = (id, value, rows) => `<textarea id="${id}" rows="${rows || 2}">${esc(value || '')}</textarea>`;
    const input = (id, value, type) => `<input type="${type || 'text'}" id="${id}" value="${esc(value ?? '')}"${type === 'number' ? ' step="any"' : ''}>`;
    const select = (id, key, current) => `<select id="${id}">${opts(key, current)}</select>`;
    const removeButtons = (attr, apply) => document.querySelectorAll(`[${attr}]`).forEach(b => b.addEventListener('click', () => apply(Number(b.getAttribute(attr)))));
    const form = (inner, buttonId, buttonLabel) => `<div class="gcf-inline-form">${inner}<div class="gcf-actions"><button class="btn btn-secondary btn-sm" id="${buttonId}">${esc(buttonLabel)}</button></div></div>`;

    /* Risk register — funding proposal F. */
    const risks = p.risks || [];
    setHtml('gcfProjectRisks', risks.length ? `<div class="gcf-scroll"><table class="gcf-table"><thead><tr><th>Category</th><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th><th>Owner</th>${write ? '<th></th>' : ''}</tr></thead>
      <tbody>${risks.map((r, i) => `<tr><td>${esc(words(r.category))}</td><td>${esc(r.description)}</td><td>${esc(r.likelihood)}</td><td>${esc(r.impact)}</td><td>${dash(r.mitigation)}</td><td>${dash(r.owner)}</td>${write ? `<td><button class="gcf-remove" data-risk-remove="${i}">remove</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : '<span class="gcf-hint">No risk recorded.</span>');
    setHtml('gcfProjectRisksForm', write ? form(
      field('gcfSec-risk-category', 'Category', select('gcfSec-risk-category', 'riskCategories'))
      + field('gcfSec-risk-description', 'Risk', input('gcfSec-risk-description'), true)
      + field('gcfSec-risk-likelihood', 'Likelihood', select('gcfSec-risk-likelihood', 'riskLevels', 'medium'))
      + field('gcfSec-risk-impact', 'Impact', select('gcfSec-risk-impact', 'riskLevels', 'medium'))
      + field('gcfSec-risk-mitigation', 'Mitigation', input('gcfSec-risk-mitigation'), true)
      + field('gcfSec-risk-owner', 'Owner', input('gcfSec-risk-owner')), 'gcfSec-risk-add', 'Add risk') : '');
    on('gcfSec-risk-add', 'click', () => {
      const description = val('gcfSec-risk-description');
      if (!description) return ctx.hint('A risk needs a description.');
      patch(p.id, { risks: [...risks, { category: val('gcfSec-risk-category'), description, likelihood: val('gcfSec-risk-likelihood'), impact: val('gcfSec-risk-impact'), mitigation: val('gcfSec-risk-mitigation') || undefined, owner: val('gcfSec-risk-owner') || undefined }] });
    });
    removeButtons('data-risk-remove', i => patch(p.id, { risks: risks.filter((_, k) => k !== i) }));

    /* Implementation arrangements and timetable — funding proposal B.4. */
    const impl = p.implementation || {};
    const tt = impl.timetable || [];
    setHtml('gcfProjectImpl', `<dl class="gcf-facts">${[['Arrangements', dash(impl.arrangements)], ['Governance', dash(impl.governance)], ['Procurement approach', dash(impl.procurementApproach)]].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`
      + (tt.length ? `<div class="gcf-scroll"><table class="gcf-table"><thead><tr><th>Milestone</th><th>Start</th><th>End</th><th>Note</th>${write ? '<th></th>' : ''}</tr></thead>
      <tbody>${tt.map((m, i) => `<tr><td>${esc(m.milestone)}</td><td class="gcf-date">${dash(m.start)}</td><td class="gcf-date">${dash(m.end)}</td><td>${dash(m.note)}</td>${write ? `<td><button class="gcf-remove" data-tt-remove="${i}">remove</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
        : '<span class="gcf-hint">No timetable milestone recorded.</span>'));
    setHtml('gcfProjectImplForm', write ? form(
      field('gcfSec-impl-arrangements', 'Arrangements — who implements, and how', text('gcfSec-impl-arrangements', impl.arrangements, 3), true)
      + field('gcfSec-impl-governance', 'Governance and oversight', text('gcfSec-impl-governance', impl.governance), true)
      + field('gcfSec-impl-procurement', 'Procurement approach', text('gcfSec-impl-procurement', impl.procurementApproach), true), 'gcfSec-impl-save', 'Save arrangements')
      + form(field('gcfSec-tt-milestone', 'Milestone', input('gcfSec-tt-milestone'), true)
      + field('gcfSec-tt-start', 'Start', input('gcfSec-tt-start', '', 'date'))
      + field('gcfSec-tt-end', 'End', input('gcfSec-tt-end', '', 'date'))
      + field('gcfSec-tt-note', 'Note', input('gcfSec-tt-note')), 'gcfSec-tt-add', 'Add milestone') : '');
    on('gcfSec-impl-save', 'click', () => patch(p.id, { implementation: { arrangements: val('gcfSec-impl-arrangements') || null, governance: val('gcfSec-impl-governance') || null, procurementApproach: val('gcfSec-impl-procurement') || null } }));
    on('gcfSec-tt-add', 'click', () => {
      const milestone = val('gcfSec-tt-milestone');
      if (!milestone) return ctx.hint('A milestone needs a name.');
      patch(p.id, { implementation: { timetable: [...tt, { milestone, start: val('gcfSec-tt-start') || undefined, end: val('gcfSec-tt-end') || undefined, note: val('gcfSec-tt-note') || undefined }] } });
    });
    removeButtons('data-tt-remove', i => patch(p.id, { implementation: { timetable: tt.filter((_, k) => k !== i) } }));

    /* Sustainability and exit — funding proposal B.6. */
    const sus = p.sustainability || {};
    const SUS = [['strategy', 'Sustainability strategy'], ['exitStrategy', 'Exit strategy'], ['ownershipAfterClosure', 'Ownership after closure'], ['financialSustainability', 'Financial sustainability']];
    setHtml('gcfProjectSustain', `<dl class="gcf-facts">${SUS.map(([k, l]) => `<div><dt>${esc(l)}</dt><dd>${dash(sus[k])}</dd></div>`).join('')}</dl>`);
    setHtml('gcfProjectSustainForm', write ? form(SUS.map(([k, l]) => field(`gcfSec-sus-${k}`, l, text(`gcfSec-sus-${k}`, sus[k]), true)).join(''), 'gcfSec-sus-save', 'Save') : '');
    on('gcfSec-sus-save', 'click', () => { const body = { sustainability: {} }; for (const [k] of SUS) body.sustainability[k] = val(`gcfSec-sus-${k}`) || null; patch(p.id, body); });

    /* Stakeholder consultations — funding proposal annex. */
    const sh = p.stakeholders || [];
    setHtml('gcfProjectStakeholders', sh.length ? `<div class="gcf-scroll"><table class="gcf-table"><thead><tr><th>Who</th><th>Group</th><th>Date</th><th>How</th><th>Outcome</th>${write ? '<th></th>' : ''}</tr></thead>
      <tbody>${sh.map((s, i) => `<tr><td>${esc(s.name)}</td><td>${esc(words(s.group))}</td><td class="gcf-date">${dash(s.date)}</td><td>${esc(words(s.mode || 'consultation'))}</td><td>${dash(s.outcome)}</td>${write ? `<td><button class="gcf-remove" data-sh-remove="${i}">remove</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : '<span class="gcf-hint">No consultation recorded.</span>');
    setHtml('gcfProjectStakeholdersForm', write ? form(
      field('gcfSec-sh-name', 'Who was consulted', input('gcfSec-sh-name'), true)
      + field('gcfSec-sh-group', 'Group', select('gcfSec-sh-group', 'stakeholderGroups'))
      + field('gcfSec-sh-date', 'Date', input('gcfSec-sh-date', '', 'date'))
      + field('gcfSec-sh-mode', 'How', select('gcfSec-sh-mode', 'consultationModes'))
      + field('gcfSec-sh-outcome', 'Outcome', input('gcfSec-sh-outcome'), true), 'gcfSec-sh-add', 'Add consultation') : '');
    on('gcfSec-sh-add', 'click', () => {
      const name = val('gcfSec-sh-name');
      if (!name) return ctx.hint('A consultation needs who was consulted.');
      patch(p.id, { stakeholders: [...sh, { name, group: val('gcfSec-sh-group'), date: val('gcfSec-sh-date') || undefined, mode: val('gcfSec-sh-mode'), outcome: val('gcfSec-sh-outcome') || undefined }] });
    });
    removeButtons('data-sh-remove', i => patch(p.id, { stakeholders: sh.filter((_, k) => k !== i) }));

    /* Climate rationale — concept note B.1, asked of an adaptation project. */
    const cr = p.climateRationale || {};
    const hazards = cr.hazards || [];
    const CR = [['vulnerability', 'Vulnerability'], ['exposure', 'Exposure'], ['adaptiveCapacity', 'Adaptive capacity'], ['evidenceSource', 'Evidence source'], ['scenario', 'Climate scenario']];
    setHtml('gcfProjectClimate', `<dl class="gcf-facts"><div><dt>Hazards</dt><dd>${hazards.length ? hazards.map(h => `<span class="gcf-pill gcf-pill-tier">${esc(words(h))}</span>`).join(' ') : '—'}</dd></div>${CR.map(([k, l]) => `<div><dt>${esc(l)}</dt><dd>${dash(cr[k])}</dd></div>`).join('')}</dl>`
      + (p.stream !== 'adaptation' ? '<span class="gcf-hint">Asked of an adaptation project; for a mitigation project the baseline and counterfactual carry the rationale.</span>' : ''));
    setHtml('gcfProjectClimateForm', write ? form(
      `<div class="gcf-field gcf-field-wide"><label>Hazards</label><div class="gcf-checks-row">${vocab('climateHazards').map(h => `<label class="gcf-check-label"><input type="checkbox" data-hazard="${h}" ${hazards.includes(h) ? 'checked' : ''}> ${esc(words(h))}</label>`).join('')}</div></div>`
      + CR.map(([k, l]) => field(`gcfSec-cr-${k}`, l, text(`gcfSec-cr-${k}`, cr[k]), true)).join(''), 'gcfSec-cr-save', 'Save rationale') : '');
    on('gcfSec-cr-save', 'click', () => {
      const boxes = /** @type {HTMLInputElement[]} */ (Array.from(document.querySelectorAll('[data-hazard]')));
      const body = { climateRationale: { hazards: boxes.filter(c => c.checked).map(c => c.getAttribute('data-hazard')) } };
      for (const [k] of CR) body.climateRationale[k] = val(`gcfSec-cr-${k}`) || null;
      patch(p.id, body);
    });

    /* Financial terms — funding proposal C.2 and C.3. */
    const ft = p.financialTerms || {};
    const tr = ft.disbursements || [];
    setHtml('gcfProjectTerms', `<dl class="gcf-facts">${[['Currency', dash(ft.currency)], ['Tenor (years)', dash(ft.tenorYears)], ['Grace period (years)', dash(ft.gracePeriodYears)], ['Rate (% p.a.)', dash(ft.interestRatePct)], ['Repayment profile', ft.repaymentProfile ? esc(words(ft.repaymentProfile)) : '—'], ['Security package', dash(ft.securityPackage)], ['On-lending terms', dash(ft.onLendingTerms)]].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`
      + (tr.length ? `<div class="gcf-scroll"><table class="gcf-table"><thead><tr><th>Tranche</th><th class="num">Amount</th><th>Condition</th><th>Date</th>${write ? '<th></th>' : ''}</tr></thead>
      <tbody>${tr.map((t, i) => `<tr><td>${esc(t.tranche)}</td><td class="num">${usd(t.amount)}</td><td>${dash(t.condition)}</td><td class="gcf-date">${dash(t.date)}</td>${write ? `<td><button class="gcf-remove" data-tr-remove="${i}">remove</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
        : '<span class="gcf-hint">No disbursement tranche recorded.</span>'));
    setHtml('gcfProjectTermsForm', write ? form(
      field('gcfSec-ft-currency', 'Currency', input('gcfSec-ft-currency', ft.currency || 'USD'))
      + field('gcfSec-ft-tenor', 'Tenor (years)', input('gcfSec-ft-tenor', ft.tenorYears, 'number'))
      + field('gcfSec-ft-grace', 'Grace period (years)', input('gcfSec-ft-grace', ft.gracePeriodYears, 'number'))
      + field('gcfSec-ft-rate', 'Rate (% p.a.)', input('gcfSec-ft-rate', ft.interestRatePct, 'number'))
      + field('gcfSec-ft-profile', 'Repayment profile', select('gcfSec-ft-profile', 'repaymentProfiles', ft.repaymentProfile || 'annuity'))
      + field('gcfSec-ft-security', 'Security package', text('gcfSec-ft-security', ft.securityPackage), true)
      + field('gcfSec-ft-onlending', 'On-lending terms', text('gcfSec-ft-onlending', ft.onLendingTerms), true), 'gcfSec-ft-save', 'Save terms')
      + form(field('gcfSec-tr-tranche', 'Tranche', input('gcfSec-tr-tranche'))
      + field('gcfSec-tr-amount', 'Amount (USD)', input('gcfSec-tr-amount', '', 'number'))
      + field('gcfSec-tr-condition', 'Condition', input('gcfSec-tr-condition'), true)
      + field('gcfSec-tr-date', 'Date', input('gcfSec-tr-date', '', 'date')), 'gcfSec-tr-add', 'Add tranche') : '');
    on('gcfSec-ft-save', 'click', () => patch(p.id, { financialTerms: { currency: val('gcfSec-ft-currency') || 'USD', tenorYears: numVal('gcfSec-ft-tenor'), gracePeriodYears: numVal('gcfSec-ft-grace'), interestRatePct: numVal('gcfSec-ft-rate'), repaymentProfile: val('gcfSec-ft-profile') || null, securityPackage: val('gcfSec-ft-security') || null, onLendingTerms: val('gcfSec-ft-onlending') || null } }));
    on('gcfSec-tr-add', 'click', () => {
      const tranche = val('gcfSec-tr-tranche');
      if (!tranche) return ctx.hint('A tranche needs a name.');
      patch(p.id, { financialTerms: { disbursements: [...tr, { tranche, amount: numVal('gcfSec-tr-amount'), condition: val('gcfSec-tr-condition') || undefined, date: val('gcfSec-tr-date') || undefined }] } });
    });
    removeButtons('data-tr-remove', i => patch(p.id, { financialTerms: { disbursements: tr.filter((_, k) => k !== i) } }));

    /* Monitoring and evaluation — funding proposal annex. */
    const me = p.monitoring || {};
    const ind = me.indicators || [];
    setHtml('gcfProjectMonitoring', `<dl class="gcf-facts">${[['Arrangements', dash(me.arrangements)], ['Evaluation plan', dash(me.evaluationPlan)], ['Reporting schedule', dash(me.reportingSchedule)]].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`
      + (ind.length ? `<div class="gcf-scroll"><table class="gcf-table"><thead><tr><th>Indicator</th><th>Frequency</th><th>Method</th><th>Responsible</th><th>Verification</th>${write ? '<th></th>' : ''}</tr></thead>
      <tbody>${ind.map((x, i) => `<tr><td>${esc(x.indicator)}</td><td>${esc(words(x.frequency))}</td><td>${dash(x.method)}</td><td>${dash(x.responsible)}</td><td>${dash(x.verification)}</td>${write ? `<td><button class="gcf-remove" data-ind-remove="${i}">remove</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
        : '<span class="gcf-hint">No indicator recorded.</span>'));
    setHtml('gcfProjectMonitoringForm', write ? form(
      field('gcfSec-me-arrangements', 'Arrangements — who measures, and how', text('gcfSec-me-arrangements', me.arrangements, 3), true)
      + field('gcfSec-me-evaluation', 'Evaluation plan', text('gcfSec-me-evaluation', me.evaluationPlan), true)
      + field('gcfSec-me-schedule', 'Reporting schedule', input('gcfSec-me-schedule', me.reportingSchedule), true), 'gcfSec-me-save', 'Save arrangements')
      + form(field('gcfSec-ind-indicator', 'Indicator', input('gcfSec-ind-indicator'), true)
      + field('gcfSec-ind-frequency', 'Frequency', select('gcfSec-ind-frequency', 'monitoringFrequencies', 'annual'))
      + field('gcfSec-ind-responsible', 'Responsible', input('gcfSec-ind-responsible'))
      + field('gcfSec-ind-method', 'Method', input('gcfSec-ind-method'), true)
      + field('gcfSec-ind-verification', 'Verification', input('gcfSec-ind-verification'), true), 'gcfSec-ind-add', 'Add indicator') : '');
    on('gcfSec-me-save', 'click', () => patch(p.id, { monitoring: { arrangements: val('gcfSec-me-arrangements') || null, evaluationPlan: val('gcfSec-me-evaluation') || null, reportingSchedule: val('gcfSec-me-schedule') || null } }));
    on('gcfSec-ind-add', 'click', () => {
      const indicator = val('gcfSec-ind-indicator');
      if (!indicator) return ctx.hint('An indicator needs a name.');
      patch(p.id, { monitoring: { indicators: [...ind, { indicator, frequency: val('gcfSec-ind-frequency'), responsible: val('gcfSec-ind-responsible') || undefined, method: val('gcfSec-ind-method') || undefined, verification: val('gcfSec-ind-verification') || undefined }] } });
    });
    removeButtons('data-ind-remove', i => patch(p.id, { monitoring: { indicators: ind.filter((_, k) => k !== i) } }));

    /* Post-approval reporting — project cycle stage 8. */
    const rp = p.reporting || {};
    const aprs = rp.aprs || [];
    const mtr = rp.midTermReview || {}; const fe = rp.finalEvaluation || {};
    setHtml('gcfProjectReporting', `<dl class="gcf-facts">${[['Mid-term review', mtr.completedAt ? `Complete ${esc(mtr.completedAt)}` : mtr.plannedAt ? `Planned ${esc(mtr.plannedAt)}` : '—'], ['Final evaluation', fe.completedAt ? `Complete ${esc(fe.completedAt)}` : fe.plannedAt ? `Planned ${esc(fe.plannedAt)}` : '—']].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`
      + (aprs.length ? `<div class="gcf-scroll"><table class="gcf-table"><thead><tr><th>Year</th><th>Status</th><th>Filed</th><th>Reference</th>${write ? '<th></th>' : ''}</tr></thead>
      <tbody>${aprs.map((a, i) => `<tr><td>${esc(a.year)}</td><td>${esc(words(a.status))}</td><td class="gcf-date">${dash(a.submittedAt)}</td><td>${dash(a.reference)}</td>${write ? `<td><button class="gcf-remove" data-apr-remove="${i}">remove</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
        : '<span class="gcf-hint">No annual performance report recorded.</span>'));
    setHtml('gcfProjectReportingForm', write ? form(
      field('gcfSec-rp-mtrPlanned', 'Mid-term review planned', input('gcfSec-rp-mtrPlanned', mtr.plannedAt, 'date'))
      + field('gcfSec-rp-mtrDone', 'Mid-term review completed', input('gcfSec-rp-mtrDone', mtr.completedAt, 'date'))
      + field('gcfSec-rp-fePlanned', 'Final evaluation planned', input('gcfSec-rp-fePlanned', fe.plannedAt, 'date'))
      + field('gcfSec-rp-feDone', 'Final evaluation completed', input('gcfSec-rp-feDone', fe.completedAt, 'date')), 'gcfSec-rp-save', 'Save reviews')
      + form(field('gcfSec-apr-year', 'Year', input('gcfSec-apr-year', '', 'number'))
      + field('gcfSec-apr-status', 'Status', select('gcfSec-apr-status', 'aprStatuses', 'due'))
      + field('gcfSec-apr-filed', 'Filed on', input('gcfSec-apr-filed', '', 'date'))
      + field('gcfSec-apr-ref', 'Reference', input('gcfSec-apr-ref')), 'gcfSec-apr-add', 'Add annual report') : '');
    on('gcfSec-rp-save', 'click', () => patch(p.id, { reporting: { midTermReview: { plannedAt: val('gcfSec-rp-mtrPlanned') || null, completedAt: val('gcfSec-rp-mtrDone') || null }, finalEvaluation: { plannedAt: val('gcfSec-rp-fePlanned') || null, completedAt: val('gcfSec-rp-feDone') || null } } }));
    on('gcfSec-apr-add', 'click', () => {
      const year = numVal('gcfSec-apr-year');
      if (!year) return ctx.hint('An annual report needs its year.');
      patch(p.id, { reporting: { aprs: [...aprs, { year, status: val('gcfSec-apr-status'), submittedAt: val('gcfSec-apr-filed') || undefined, reference: val('gcfSec-apr-ref') || undefined }] } });
    });
    removeButtons('data-apr-remove', i => patch(p.id, { reporting: { aprs: aprs.filter((_, k) => k !== i) } }));
  }

  return { render };
})();
