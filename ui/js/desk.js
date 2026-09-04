/* ============================================================
   CarbonIQ — the Fund Desk

   The GCF Pipeline tab is the research and stays exactly as it
   was. This screen is the bank's own view over two books, and it
   answers the questions a credit committee arrives with: what
   have we completed, what have we financed, what will the book
   emit fully drawn, what does it carry against the payments
   actually made, and what is still waiting.

   Four rules the renderer is responsible for. Each is a way to
   draw a confident screen that is wrong:

     Never present three claims as one number. At full
     commitment, carried today and still to arrive are three
     different statements about the same book.

     Never net a credit against an inventory. Reduction and
     avoided emissions are drawn in their own card, to their own
     zero baseline, and are subtracted from nothing.

     Never stack nested money. Disbursed sits inside committed
     and committed inside allocated, so they share one scale
     rather than being laid end to end.

     Never let a projection look measured. What is still to
     arrive is hatched, which means projection everywhere else
     in this application too.

   And one mechanical rule learned the hard way here: anything
   that changes what the first request says must be wired BEFORE
   that request is sent. The basis toggle and the portfolio
   filter are both read in init() ahead of the first fetch.
   ============================================================ */

const DeskPage = (() => {

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t || ''; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const show = (id, visible) => { const el = $(id); if (el) el.hidden = !visible; };

  /* Absence is checked before the number is. `Number(null)` is 0 and 0 is
     finite, which has caused three separate defects in this book — a project
     ranked on a 0% return nobody had entered, and a drawdown series collapsed
     to a single year. A dash is a claim about the evidence; a zero is a claim
     about the value. */
  const absent = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v));

  const num = (v, dp = 0) => (absent(v) ? '—'
    : Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }));

  /** Money at the scale a book is actually read: millions, one decimal. */
  const money = (v) => {
    if (absent(v)) return '—';
    const n = Number(v);
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toLocaleString('en-US', { maximumFractionDigits: 0 })}k`;
    return `$${num(n)}`;
  };

  const pct = (v, dp = 1) => (absent(v) ? '—' : `${Number(v).toFixed(dp)}%`);

  /* A gate reason is a paragraph in the record and a line on a desk. The whole
     text stays reachable in the title attribute rather than being thrown away
     — a truncation that loses the reason is worse than no reason at all. */
  const clip = (s, n = 96) => {
    const t = String(s || '').trim();
    return t.length <= n ? t : `${t.slice(0, n - 1).replace(/[\s,;.]+$/, '')}…`;
  };
  const width = (part, whole) => (absent(part) || absent(whole) || Number(whole) <= 0
    ? 0 : Math.max(0, Math.min(100, (Number(part) / Number(whole)) * 100)));

  const STATUS_LABEL = {
    pipeline: 'Pipeline', committed: 'Committed', deployed: 'Deployed',
    exited: 'Exited', declined: 'Declined',
  };
  const DELIVERY_LABEL = {
    not_started: 'Not started', under_construction: 'Under construction', completed: 'Completed',
  };
  const GATE_CHIP = {
    eligible: 'dk-chip dk-chip-done', flagged: 'dk-chip dk-chip-build', excluded: 'dk-chip dk-chip-wait',
  };
  const GATE_LABEL = { eligible: 'Eligible', flagged: 'Flagged', excluded: 'Excluded' };

  const DELIVERY_CHIP = {
    not_started: 'dk-chip', under_construction: 'dk-chip dk-chip-build', completed: 'dk-chip dk-chip-done',
  };

  let state = {
    basis: 'outstanding',
    portfolioId: '',
    position: null,
    candidates: null,
    readiness: null,
    scenario: null,
    /* A selection is one reader's question, held here and never written down —
       the same rule the dashboard's assumptions follow. */
    selected: new Set(),
    adopting: null,
    portfolios: [],
    filters: { search: '', status: '', delivery: '', sort: 'commitment' },
    loaded: false,
  };

  async function call(path, opts) {
    const res = await window.CARBONIQ_fetch('/v1/desk' + path, opts);
    let data = {};
    try { data = await res.json(); } catch (_) { /* non-JSON body */ }
    if (!res.ok) {
      throw new Error([data.message, data.remedy].filter(Boolean).join(' ')
        || `Request failed (${res.status})`);
    }
    return data;
  }

  // ── Tiles ──────────────────────────────────────────────────

  const tile = (label, value, unit, tone = '') => `
    <div class="dk-tile ${tone}">
      <span class="dk-tile-label">${esc(label)}</span>
      <span class="dk-tile-value">${esc(value)}</span>
      <span class="dk-tile-unit">${esc(unit || '')}</span>
    </div>`;

  const scaleRow = (label, value, part, whole, cls = '') => `
    <div class="dk-scale-row">
      <span class="dk-scale-head"><span>${esc(label)}</span><b>${esc(value)}</b></span>
      <span class="dk-bar"><i class="${cls}" style="width:${width(part, whole).toFixed(1)}%"></i></span>
    </div>`;

  // ── Render ─────────────────────────────────────────────────

  function renderMoney(p) {
    const m = p.money;
    setHtml('deskMoneyTiles',
      tile('Allocated', money(m.allocated), 'Budget across the portfolios shown', 'dk-tile-accent')
      + tile('Committed', money(m.committed), `${pct(m.commitmentPct)} of the allocation`)
      + tile('Paid out', money(m.paid), `${pct(m.deploymentPct)} of the allocation, net of repayments`, 'dk-tile-ok')
      + tile('Still to draw', money(m.undrawnCommitment), 'Committed and not yet out of the door', 'dk-tile-signal'));

    /* One scale, three nested figures. Laid end to end they would count the
       same dollar three times. */
    setHtml('deskMoneyScale',
      scaleRow('Allocated', money(m.allocated), m.allocated, m.allocated, 'is-neutral')
      + scaleRow('Committed', money(m.committed), m.committed, m.allocated, '')
      + scaleRow('Paid out', money(m.paid), m.paid, m.allocated, 'is-deep'));

    say('deskMoneyNote', m.note || m.nestingNote);
  }

  function renderEmissions(p) {
    const e = p.emissions;
    setHtml('deskEmissionTiles',
      tile('At full commitment', num(e.atFullCommitment.total), 'tCO2e once every facility is fully drawn')
      + tile('Carried today', num(e.carried.total),
        `tCO2e attributed on drawdown — ${pct(e.carriedPct)} of the above`, 'dk-tile-ok')
      + tile('Still to arrive', num(e.pending.total),
        'tCO2e that will be attributed as the undrawn money is drawn', 'dk-tile-signal'));

    const full = e.atFullCommitment.total;
    setHtml('deskEmissionScale', `
      <div class="dk-scale-row">
        <span class="dk-scale-head">
          <span>Carried today against the whole book fully drawn</span>
          <b>${esc(num(e.carried.total))} of ${esc(num(full))} tCO2e</b>
        </span>
        <span class="dk-split">
          <i style="width:${width(e.carried.total, full).toFixed(1)}%;background:var(--dk-ok)"></i>
          <i class="is-pending" style="width:${width(e.pending.total, full).toFixed(1)}%"></i>
        </span>
      </div>
      ${scaleRow('Already incurred — measured', num(e.carried.incurred) + ' tCO2e',
        e.carried.incurred, full, 'is-deep')}
      ${scaleRow('Expected over the remaining term — a projection', num(e.carried.forward) + ' tCO2e',
        e.carried.forward, full, 'is-pending')}`);

    setHtml('deskEmissionLegend', `
      <span><i class="dk-swatch is-deep"></i>Measured — already incurred</span>
      <span><i class="dk-swatch is-pending"></i>Hatched — not measured</span>
      <span>${esc(e.investmentsCounted)} holdings counted · data quality
        ${e.dataQuality && !absent(e.dataQuality.weighted)
          ? `${num(e.dataQuality.weighted, 2)} (PCAF scale 1–5, 1 is best)` : 'not scored'}</span>`);

    say('deskClaimNote', e.claimNote);
    say('deskAttributionNote', e.attributionNote);
    say('deskRoundingNote', e.roundingNote);

    setHtml('deskCreditTiles',
      tile('Reduction', num(e.separatelyStated.reduction), 'tCO2e against each project\'s own base year')
      + tile('Avoided', num(e.separatelyStated.avoided), 'tCO2e against a counterfactual that did not happen')
      + tile('Basis', 'PCAF Part A', 'Reported separately from the inventory, p.126'));
    say('deskCreditNote', e.separatelyStated.note);
  }

  function renderDelivery(p) {
    const d = p.delivery;
    const total = (d.completed || 0) + (d.under_construction || 0) + (d.not_started || 0);
    const seg = (n, colour) => `<i style="width:${width(n, total).toFixed(1)}%;background:${colour}"></i>`;
    setHtml('deskDeliverySplit', total === 0 ? '' :
      seg(d.completed, 'var(--dk-ok)')
      + seg(d.under_construction, 'var(--dk-warn)')
      + seg(d.not_started, 'var(--dk-neutral)'));

    setHtml('deskDeliveryLegend', `
      <span><i class="dk-swatch is-deep"></i><b>${esc(num(d.completed))}</b>&nbsp;completed</span>
      <span><i class="dk-swatch" style="background:var(--dk-warn)"></i><b>${esc(num(d.under_construction))}</b>&nbsp;under construction</span>
      <span><i class="dk-swatch is-neutral"></i><b>${esc(num(d.not_started))}</b>&nbsp;not started</span>`);
    say('deskDeliveryNote', d.note);

    /* The second axis, drawn on its own scale directly beneath the first. Side
       by side they answer two questions — what is built, and what we hold —
       without ever being one figure. */
    const l = p.lifecycle;
    const order = [
      ['deployed', 'Deployed', 'var(--dk-ok)'],
      ['committed', 'Committed', 'var(--dk-accent)'],
      ['pipeline', 'Pipeline', 'var(--dk-signal)'],
      ['exited', 'Exited', 'var(--dk-neutral)'],
      ['declined', 'Declined', 'var(--dk-neutral)'],
    ].filter(([k]) => (l[k] || 0) > 0);
    const lTotal = order.reduce((t, [k]) => t + (l[k] || 0), 0);
    setHtml('deskPositionSplit', order
      .map(([k, , c]) => `<i style="width:${width(l[k], lTotal).toFixed(1)}%;background:${c}"></i>`).join(''));
    setHtml('deskPositionLegend', order
      .map(([k, label, c]) => `<span><i class="dk-swatch" style="background:${c}"></i><b>${esc(num(l[k]))}</b>&nbsp;${esc(label.toLowerCase())}</span>`)
      .join('')
      + `<span>${esc(num(l.held))} of ${esc(num(l.total))} carry attributed emissions</span>`);
  }

  function renderPipeline(p) {
    const w = p.pipeline;
    setHtml('deskPipelineFigures', `
      <div class="dk-tiles-3">
        ${tile('Waiting', num(w.waiting), `of ${num(w.pool)} candidates`, 'dk-tile-signal')}
        ${tile('Bank share', money(w.dfccShare), 'Commitment if all were written')}
        ${tile('GCF ask', money(w.gcfAsk), 'Concessional finance sought')}
      </div>`);
    say('deskPipelineNote', w.note);
    say('deskPipelineStreams',
      `${w.byStream.mitigation} mitigation · ${w.byStream.adaptation} adaptation · `
      + `${num(w.adopted)} on the book. ${w.streamNote}`);
  }

  function visibleRows() {
    const f = state.filters;
    const q = f.search.trim().toLowerCase();
    let rows = (state.position.rows || []).filter(r =>
      (!q || String(r.name).toLowerCase().includes(q) || String(r.sector || '').toLowerCase().includes(q))
      && (!f.status || r.status === f.status)
      && (!f.delivery || r.delivery === f.delivery));

    const by = {
      commitment: (a, b) => (b.commitment || 0) - (a.commitment || 0),
      drawn: (a, b) => (b.drawn || 0) - (a.drawn || 0),
      carried: (a, b) => (b.carried_tCO2e || 0) - (a.carried_tCO2e || 0),
      name: (a, b) => String(a.name).localeCompare(String(b.name)),
    };
    return rows.sort(by[f.sort] || by.commitment);
  }

  function renderTable() {
    const rows = visibleRows();
    const p = state.position;
    say('deskRowCount', `${rows.length} of ${(p.rows || []).length} positions`);

    if (!rows.length) {
      setHtml('deskTable', `<tbody><tr><td class="dk-empty">Nothing on the book matches that.</td></tr></tbody>`);
      renderSelBar();
      return;
    }

    const head = `<thead><tr>
      <th style="width:28px" aria-label="Select"></th>
      <th>Project</th><th>Position</th><th>Delivery</th>
      <th class="num">Commitment</th><th class="num">Drawn</th>
      <th class="num">Carried tCO2e</th><th class="num">Fully drawn</th>
      <th class="num">GCF pledge</th>
    </tr></thead>`;

    const body = rows.map(r => {
      /* A held position carries emissions; a pipeline candidate is an
         intention and carries none. A dash says so; a zero would claim the
         emissions had been measured at nothing. */
      const carried = r.held ? num(r.carried_tCO2e) : '—';
      const full = r.held ? num(r.atFullCommitment_tCO2e) : '—';
      const pledge = r.pledgedMitigation && !absent(r.pledgedMitigation.annual_tCO2e)
        ? `${num(r.pledgedMitigation.annual_tCO2e)}<span class="dk-sub">${
          esc(r.pledgedMitigation.isCoBenefit ? 'co-benefit' : r.pledgedMitigation.baselineType || '')}/yr · ${
          esc(r.pledgedMitigation.tier || 'no tier')}</span>`
        : '—';

      /* Only a project still waiting can be written. A held position is already
         on the book, so offering to model writing it would be modelling a
         decision that has been taken. */
      const selectable = r.status === 'pipeline';
      return `<tr>
        <td><input type="checkbox" class="dk-check" data-select="${esc(r.id)}"
             ${selectable ? '' : 'disabled'} ${state.selected.has(r.id) ? 'checked' : ''}
             aria-label="Model writing ${esc(r.name)}"></td>
        <td>
          <span class="dk-name">${esc(r.name)}</span>
          <span class="dk-sub">${esc(r.sector || 'Unclassified')}${r.country ? ' · ' + esc(r.country) : ''}${
            r.origin && r.origin.code ? ' · from ' + esc(r.origin.code) : ''}</span>
        </td>
        <td><span class="dk-chip ${r.held ? 'dk-chip-money' : ''}">${esc(STATUS_LABEL[r.status] || r.status)}</span></td>
        <td><span class="${DELIVERY_CHIP[r.delivery] || 'dk-chip'}">${esc(DELIVERY_LABEL[r.delivery] || r.delivery)}</span></td>
        <td class="num">${esc(money(r.commitment))}</td>
        <td class="num">
          ${esc(money(r.drawn))}<span class="dk-sub">${esc(pct(r.drawnPct))}</span>
          <span class="dk-mini"><i style="width:${width(r.drawnPct, 100).toFixed(1)}%"></i></span>
        </td>
        <td class="num">${esc(carried)}</td>
        <td class="num">${esc(full)}</td>
        <td class="num">${pledge}</td>
      </tr>`;
    }).join('');

    setHtml('deskTable', head + `<tbody>${body}</tbody>`);

    /* Delegated, so it survives every re-render of the table body. */
    const table = $('deskTable');
    if (table && !table.dataset.wired) {
      table.dataset.wired = 'true';
      table.addEventListener('change', (ev) => {
        const id = ev.target && ev.target.dataset && ev.target.dataset.select;
        if (!id) return;
        if (ev.target.checked) state.selected.add(id); else state.selected.delete(id);
        renderSelBar();
        if (!$('deskDrawer').hidden) loadScenario();
      });
    }
    renderSelBar();
  }

  function renderSelBar() {
    const n = state.selected.size;
    show('deskSelBar', n > 0);
    say('deskSelText', n === 0 ? ''
      : `${n} project${n === 1 ? '' : 's'} selected`);
    if (n === 0) show('deskDrawer', false);
  }


  // ── Stage 4 — the candidates ───────────────────────────────────────────

  function renderCandidates() {
    const c = state.candidates;
    if (!c) return;

    setHtml('deskCandTiles',
      tile('Waiting', num(c.pool - c.adopted), `of ${num(c.pool)} candidates`, 'dk-tile-signal')
      + tile('Eligible', num(c.eligible), 'Within DFCC\'s accreditation scope', 'dk-tile-ok')
      + tile('Flagged', num(c.flagged), 'Eligible, subject to verification')
      + tile('Excluded', num(c.excluded), 'Outside the accreditation scope'));

    const head = `<thead><tr>
      <th>Candidate</th><th>Gate</th><th>Rank</th><th class="num">Impact</th>
      <th class="num">Bank's share</th><th class="num">GCF ask</th>
      <th>Left standing</th><th></th>
    </tr></thead>`;

    const body = (c.rows || []).map((r) => {
      /* An excluded project is not ranked at all, and a dash says so. A zero
         would read as "ranked last". */
      const rank = r.rank === null ? '—' : `#${r.rank} <span class="dk-sub">in ${esc(r.stream)}</span>`;
      const impact = absent(r.impact.value) ? '—'
        : `${num(r.impact.value)}<span class="dk-sub">${esc(
          r.stream === 'adaptation' ? 'people / $M ask' : 'tCO2e·yr / $M ask')}</span>`;
      const left = r.structure && r.structure.barriersLeftStanding.length
        ? `<span class="dk-chip dk-chip-wait dk-chip-phrase">${
          esc(r.structure.barriersLeftStanding.join(' · '))}</span>`
        : '<span class="dk-sub">Covered</span>';
      const action = r.adopted
        ? `<span class="dk-chip dk-chip-money">On the book</span>`
        : `<button type="button" class="dk-btn dk-btn-ghost" data-adopt="${esc(r.id)}">Put on the book</button>`;

      return `<tr>
        <td>
          <span class="dk-name">${esc(r.name)}</span>
          <span class="dk-sub">${esc(r.code)} · ${esc(r.sector || '')} · ${esc(r.stream)}</span>
        </td>
        <td>
          <span class="${GATE_CHIP[r.gate.verdict] || 'dk-chip'}">${esc(GATE_LABEL[r.gate.verdict] || r.gate.verdict)}</span>
          ${r.gate.reasons.length
    ? `<span class="dk-reason" title="${esc(r.gate.reasons.join(' — '))}">${esc(clip(r.gate.reasons[0]))}</span>`
    : ''}
        </td>
        <td>${rank}</td>
        <td class="num">${impact}</td>
        <td class="num">${esc(money(r.financing.bankShare))}</td>
        <td class="num">${esc(money(r.financing.gcfAsk))}</td>
        <td>${left}</td>
        <td>${action}</td>
      </tr>`;
    }).join('');

    setHtml('deskCandTable', head + `<tbody>${body}</tbody>`);

    const table = $('deskCandTable');
    if (table && !table.dataset.wired) {
      table.dataset.wired = 'true';
      table.addEventListener('click', (ev) => {
        const btn = ev.target.closest && ev.target.closest('[data-adopt]');
        if (btn) openAdopt(btn.dataset.adopt);
      });
    }

    say('deskCandUnscored',
      `Not scored: ${c.unscoredCriteria.map(x => x.name).join(' · ')}. ${c.criteriaNote}`);
    
    say('deskCandMandate', c.mandateGap
      ? `Mandate gap — ${c.mandateGap.barriers.map(b => b.label).join(', ')}. ${c.mandateGap.note}`
      : c.gateNote);
  }

  /* Adopting writes to the organisation's own book, and its own records
     replace the baseline entirely. That is stated before the write, not
     discovered after it. */
  async function openAdopt(recordId) {
    const row = (state.candidates.rows || []).find(r => r.id === recordId);
    if (!row) return;
    state.adopting = row;
    show('deskAdoptPanel', true);
    say('deskAdoptName', row.name);
    say('deskAdoptHint', '');
    const amount = $('deskAdoptCommitment');
    if (amount) amount.value = row.financing.bankShare ?? '';

    try {
      const res = await window.CARBONIQ_fetch('/v1/capital/portfolios');
      const data = await res.json();
      state.portfolios = (data.portfolios || data || []).filter(p => p && p.id);
    } catch (_) { state.portfolios = []; }

    const sel = $('deskAdoptPortfolio');
    if (!sel) return;
    if (!state.portfolios.length) {
      sel.innerHTML = '<option value="">No portfolio recorded</option>';
      say('deskAdoptHint', 'No portfolio has been recorded. Create one on the Dashboard first. '
        + 'Recorded portfolios replace the illustrative dataset in full.');
    } else {
      sel.innerHTML = state.portfolios
        .map(p => `<option value="${esc(p.id)}">${esc(p.name || p.id)}</option>`).join('');
      say('deskAdoptHint', 'Commitment defaults to the bank\'s share of project cost. '
        + 'Added at pipeline status.');
    }
  }

  async function confirmAdopt() {
    if (!state.adopting) return;
    const portfolioId = ($('deskAdoptPortfolio') || {}).value || '';
    if (!portfolioId) {
      say('deskAdoptHint', 'Select a portfolio.');
      return;
    }
    const raw = ($('deskAdoptCommitment') || {}).value;
    try {
      say('deskAdoptHint', 'Writing…');
      await call('/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: state.adopting.id,
          portfolioId,
          commitment: raw === '' ? undefined : Number(raw),
        }),
      });
      show('deskAdoptPanel', false);
      state.adopting = null;
      state.selected.clear();
      await load();
    } catch (e) {
      say('deskAdoptHint', e.message);
    }
  }

  // ── Stage 5 — the scenario ─────────────────────────────────────────────

  async function loadScenario() {
    const ids = [...state.selected];
    try {
      const data = await call('/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          select: ids, attributionBasis: state.basis, portfolioId: state.portfolioId || undefined,
        }),
      });
      state.scenario = data.scenario;
      renderScenario();
    } catch (e) {
      setHtml('deskDrawerBody', `<div class="dk-error">${esc(e.message)}</div>`);
    }
  }

  function renderScenario() {
    const sc = state.scenario;
    if (!sc) return;
    say('deskDrawerSub', `${sc.count} selected · ${sc.storedNote}`);
    

    const f = sc.funding;
    const fundingBlock = `
      <div class="dk-tiles-3">
        ${tile('Would need', money(f.needed), 'Commitment across the selection', 'dk-tile-accent')}
        ${tile(f.affordable ? 'Left over' : 'Shortfall',
          money(f.affordable ? f.remaining : f.shortfall),
          f.affordable ? 'Uncommitted allocation remaining' : 'Additional allocation this would need',
          f.affordable ? 'dk-tile-ok' : 'dk-tile-signal')}
        ${tile('Blended return', absent(sc.finance.blendedReturnPct) ? '—' : pct(sc.finance.blendedReturnPct, 2),
          sc.finance.unpricedCount
            ? `${sc.finance.unpricedCount} unpriced, excluded from the weighting`
            : 'Capital-weighted')}
      </div>
      <p class="dk-note">${esc(f.note)}</p>`;

    /* Three figures, never one — exactly as the ledger reports them. A basket
       that funded a solar farm would otherwise appear to lower the book's
       emissions, which is a different and false claim. */
    const i = sc.impact;
    const impactBlock = `
      <p class="dk-eyebrow" style="margin-top:18px">What it would add</p>
      <div class="dk-kv">
        <span>Emissions over the remaining term</span><b>${esc(num(i.forward_tCO2e))} tCO2e</b>
        <span>Emissions already incurred</span><b>${esc(num(i.incurred_tCO2e))} tCO2e</b>
        <span>Reduction (reported separately)</span><b>${esc(num(i.reduction_tCO2e))} tCO2e</b>
        <span>Avoided (reported separately)</span><b>${esc(num(i.avoided_tCO2e))} tCO2e</b>
      </div>
      <p class="dk-note">${esc(i.basis)}</p>`;

    const rowsBlock = sc.rows.length ? `
      <p class="dk-eyebrow" style="margin-top:18px">The selection</p>
      <div class="dk-kv">
        ${sc.rows.map(r => `<span>${esc(r.name)}</span><b>${esc(money(r.commitment))}</b>`).join('')}
      </div>` : '<p class="dk-note">Nothing selected.</p>';

    const unknownBlock = sc.unknownNote ? `<div class="dk-error">${esc(sc.unknownNote)}</div>` : '';

    setHtml('deskDrawerBody', unknownBlock + fundingBlock + impactBlock + rowsBlock
      + `<p class="dk-note">${esc(sc.forecast.basisNote)}</p>`);
  }

  // ── Stage 6 — year end ─────────────────────────────────────────────────

  function renderReadiness() {
    const r = state.readiness;
    if (!r) return;

    setHtml('deskReadyTiles',
      tile('Outstanding items', num(r.disclosure.gaps),
        `items · checklist ${num(r.disclosure.checklistMet)} of ${num(r.disclosure.checklistTotal)} met`,
        'dk-tile-signal')
      + tile('Entity disclosures', `${num(r.entity.recorded)} / ${num(r.entity.total)}`,
        'Recorded by the reporting entity')
      + tile('Concept Note inputs outstanding', num(r.conceptNotes.outstanding),
        `across ${num(r.conceptNotes.projects.length)} candidates · ${num(r.conceptNotes.readyCount)} complete`));

    const head = '<thead><tr><th>Candidate</th><th class="num">Held</th>'
      + '<th class="num">External</th><th class="num">Partial</th><th class="num">Held %</th></tr></thead>';
    setHtml('deskCnTable', head + `<tbody>${(r.conceptNotes.projects || []).map(p => `
      <tr>
        <td><span class="dk-name">${esc(p.code)}</span><span class="dk-sub">${esc(p.name)}</span></td>
        <td class="num">${esc(num(p.held))} / ${esc(num(p.total))}</td>
        <td class="num">${esc(num(p.external))}</td>
        <td class="num">${esc(num(p.partial))}</td>
        <td class="num">${esc(num(p.pctHeld, 1))}%</td>
      </tr>`).join('')}</tbody>`);
    say('deskCnNote', r.conceptNotes.note);

    const gaps = r.disclosure.top || [];
    setHtml('deskGapList', gaps.map(g => `<li>${esc(g)}</li>`).join('')
      + (r.disclosure.more ? `<li>and ${esc(num(r.disclosure.more))} further items — see the GCF Pipeline screen</li>` : '')
      || '<li>Nothing outstanding.</li>');
    say('deskEntityNote', `${r.disclosure.completenessNote || r.disclosure.note} ${r.entity.note}`);
  }

  function renderFilters(p) {
    const statuses = [...new Set((p.rows || []).map(r => r.status))];
    const deliveries = [...new Set((p.rows || []).map(r => r.delivery))];
    const fill = (id, values, labels, keep) => {
      const el = $(id);
      if (!el) return;
      const first = el.querySelector('option').outerHTML;
      el.innerHTML = first + values.map(v =>
        `<option value="${esc(v)}">${esc(labels[v] || v)}</option>`).join('');
      el.value = values.includes(keep) ? keep : '';
    };
    fill('deskFilterStatus', statuses, STATUS_LABEL, state.filters.status);
    fill('deskFilterDelivery', deliveries, DELIVERY_LABEL, state.filters.delivery);

    /* The portfolio list is rebuilt from what came back rather than remembered,
       so a portfolio recorded on another screen appears here without a reload.
       The current choice survives if it still exists. */
    const sel = $('deskPortfolio');
    if (sel) {
      const seen = new Map();
      for (const r of p.rows || []) if (r.portfolioId) seen.set(r.portfolioId, r.portfolioId);
      const opts = ['<option value="">All portfolios</option>']
        .concat([...seen.keys()].map(id => `<option value="${esc(id)}">${esc(id)}</option>`));
      sel.innerHTML = opts.join('');
      sel.value = seen.has(state.portfolioId) ? state.portfolioId : '';
      state.portfolioId = sel.value;
    }
  }

  function render() {
    const p = state.position;
    if (!p) return;

    show('deskSample', Boolean(p.sample));
    if (p.sample) say('deskSample', p.sampleNote);

    if (p.empty) {
      setHtml('deskMoneyTiles', `<div class="dk-empty">Nothing has been recorded in this book yet,
        and no baseline is available on this deployment. That is not a position of zero — it is a
        position that has not been measured.</div>`);
      return;
    }

    renderMoney(p);
    renderEmissions(p);
    renderDelivery(p);
    renderPipeline(p);
    renderFilters(p);
    renderTable();
    renderCandidates();
    renderReadiness();
    if (!$('deskDrawer').hidden) loadScenario();

    say('deskBasisHint', state.basis === 'outstanding'
      ? 'Attributed on the outstanding amount, per PCAF Part A.'
      : 'Attributed at full commitment. Conservative; not the Part A attribution factor.');
  }

  // ── Fetch ──────────────────────────────────────────────────

  async function load() {
    const qs = new URLSearchParams({ attributionBasis: state.basis });
    if (state.portfolioId) qs.set('portfolioId', state.portfolioId);
    const cq = new URLSearchParams();
    if (state.portfolioId) cq.set('portfolioId', state.portfolioId);
    try {
      show('deskError', false);
      /* Three reads over the same two books, issued together so the screen
         cannot render a position against a stale candidate pool. */
      const [pos, cand, ready] = await Promise.all([
        call(`/position?${qs.toString()}`),
        call(`/candidates?${cq.toString()}`),
        call('/readiness'),
      ]);
      state.position = pos.position;
      state.candidates = cand.candidates;
      state.readiness = ready.readiness;
      render();
    } catch (e) {
      /* The failure is visible on the screen rather than only in a response
         body. A screen that silently keeps its last figures after a failed
         request is how a stale number gets read as a current one. */
      state.position = null;
      state.candidates = null;
      state.readiness = null;
      show('deskError', true);
      say('deskError', `The desk could not be read. ${e.message}`);
      setHtml('deskTable', '');
      setHtml('deskCandTable', '');
      setHtml('deskCnTable', '');
      say('deskRowCount', '');
    }
  }

  function setBasis(basis) {
    if (state.basis === basis) return;
    state.basis = basis;
    const oEl = $('deskBasisOutstanding');
    const cEl = $('deskBasisCommitment');
    if (oEl) oEl.setAttribute('aria-pressed', String(basis === 'outstanding'));
    if (cEl) cEl.setAttribute('aria-pressed', String(basis === 'commitment'));
    load();
  }

  function init() {
    if (state.loaded) return refresh();
    state.loaded = true;

    /* Wired BEFORE the first fetch. Anything that changes what the request
       says has to exist by the time it is sent — reading a control after the
       first fetch is the defect that made adjustments vanish on reload. */
    on('deskBasisOutstanding', 'click', () => setBasis('outstanding'));
    on('deskBasisCommitment', 'click', () => setBasis('commitment'));
    on('deskPortfolio', 'change', (ev) => { state.portfolioId = ev.target.value; load(); });

    on('deskSearch', 'input', (ev) => { state.filters.search = ev.target.value; renderTable(); });
    on('deskFilterStatus', 'change', (ev) => { state.filters.status = ev.target.value; renderTable(); });
    on('deskFilterDelivery', 'change', (ev) => { state.filters.delivery = ev.target.value; renderTable(); });
    on('deskSort', 'change', (ev) => { state.filters.sort = ev.target.value; renderTable(); });

    on('deskSelClear', 'click', () => { state.selected.clear(); renderTable(); });
    on('deskSelOpen', 'click', () => { show('deskDrawer', true); loadScenario(); });
    on('deskDrawerClose', 'click', () => show('deskDrawer', false));
    on('deskAdoptCancel', 'click', () => { show('deskAdoptPanel', false); state.adopting = null; });
    on('deskAdoptConfirm', 'click', confirmAdopt);

    /* Escape closes the drawer. A panel that covers the page and can only be
       dismissed by finding one small button is a panel people get stuck in. */
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') show('deskDrawer', false);
    });

    return load();
  }

  /* Every figure is fetched, never remembered: a payment recorded on the
     Dashboard or a project adopted from the pipeline changes this position, so
     a return visit re-reads rather than showing what it said last time. */
  function refresh() { return load(); }

  return { init, refresh };
})();
