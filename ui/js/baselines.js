/* ============================================================
   CarbonIQ — Baselines

   PCAF sets the method; it does not set a country's baseline.
   This screen is where the regional judgement lives, and its
   whole job is to make that judgement checkable: what is in
   force, at which version, released by whom, against what it
   replaced and for what recorded reason.

   Three rules the renderer is responsible for:

     Never let an illustrative figure look released. The shipped
     values carry a neutral provenance pill, not a warning — the
     reader is being told where a number came from.

     Never show a value without its provenance. A band with no
     version and no source behind it is a band that cannot be
     checked, and every figure on this product can be checked.

     Never present a pledge as measured. The commitment is what
     the institution stated, in a document named beside it; the
     position against it is computed and labelled apart.

   And the mechanical rule this codebase has shipped wrong four
   times: anything that changes what the first request says is
   wired before that request is sent.
   ============================================================ */

const BaselinesPage = (() => {

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const num = n => (n === null || n === undefined || !Number.isFinite(Number(n)))
    ? '—' : Number(n).toLocaleString();

  const state = { metrics: [], effective: {}, table: [], country: 'LK', loaded: false };

  async function call(path, opts) {
    const res = await window.CARBONIQ_fetch('/v1/baselines' + path, opts);
    let data = {};
    try { data = await res.json(); } catch (_) { /* non-JSON body */ }
    if (!res.ok) {
      throw new Error([data.message, data.remedy].filter(Boolean).join(' ')
        || `Request failed (${res.status})`);
    }
    return data;
  }

  /* ── In force ──────────────────────────────────────────── */

  function effectiveCard(key, r) {
    const def = state.metrics.find(m => m.key === key) || {};
    if (!r.resolved) {
      return `
        <div class="bl-card">
          <p class="bl-metric">${esc(def.label || key)}</p>
          <p class="bl-basis">${esc(r.basis)}</p>
          ${r.needs ? `<p class="bl-src">${esc(r.needs)}</p>` : ''}
        </div>`;
    }
    const values = def.shape === 'sector_bands'
      ? sectorBandTable(r.values)
      : Object.entries(r.values || {}).map(([k, v]) => `
      <span><span class="bl-v">${num(v)}</span> <span class="bl-u">${esc(k)}</span></span>`).join('');
    const pill = r.provisional
      ? '<span class="bl-pill prov">Illustrative dataset — not client records.</span>'
      : `<span class="bl-pill live">Released · version ${r.version}</span>`;
    return `
      <div class="bl-card">
        <p class="bl-metric">${esc(def.label || key)} ${pill}</p>
        <div class="bl-values">${values}<span class="bl-u">${esc(r.unit || '')}</span></div>
        <p class="bl-basis">${esc(r.basis)}</p>
        ${r.source ? `<p class="bl-src">${esc(r.source)}</p>` : ''}
      </div>`;
  }

  /* A band per sector reads as a table, not as forty-six loose numbers. */
  function sectorBandTable(values) {
    const rows = {};
    for (const [k, v] of Object.entries(values || {})) {
      const m = k.match(/^(.+)_(low|high)$/);
      if (!m) continue;
      rows[m[1]] = { ...(rows[m[1]] || {}), [m[2]]: v };
    }
    return `<div class="bl-scroll"><table class="bl-table bl-bands">
      <thead><tr><th>Sector</th><th class="num">Low</th><th class="num">High</th></tr></thead>
      <tbody>${Object.entries(rows).map(([k, b]) => `<tr><td>${esc(k)}</td><td class="num">${num(b.low)}</td><td class="num">${num(b.high)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  function shapeOf(metricKey) {
    const def = state.metrics.find(m => m.key === metricKey) || {};
    return def.shape || 'bands';
  }

  function renderEffective() {
    const host = $('bl-effective');
    if (!host) return;
    host.innerHTML = Object.entries(state.effective).map(([k, r]) => effectiveCard(k, r)).join('');
  }

  /* ── Pledge ────────────────────────────────────────────── */

  function renderPledge(p) {
    const host = $('bl-pledge');
    if (!host) return;
    if (!p || !p.available) {
      host.innerHTML = `
        <p class="bl-basis">${esc((p && p.reason) || 'No pledge recorded.')}</p>
        ${p && p.needs ? `<p class="bl-src">${esc(p.needs)}</p>` : ''}`;
      return;
    }
    const pledged = p.pledge;
    /* The bar shows how much of the pledged reduction has been achieved.
       Clamped, because a book that has over-delivered is at the end of the
       track rather than past it. */
    const pct = Math.max(0, Math.min(100, (p.achievedPct / pledged.targetPct) * 100));
    host.innerHTML = `
      <p class="bl-metric">${esc(pledged.targetPct)}% reduction by ${esc(pledged.targetYear)},
        against a ${esc(pledged.baseYear)} base year
        <span class="bl-pill past">Stated by ${esc(pledged.statedBy)}</span></p>
      <div class="bl-track"><span class="bl-fill" style="width:${pct.toFixed(1)}%"></span></div>
      <div class="bl-values">
        <span><span class="bl-v">${num(p.achievedPct)}%</span> <span class="bl-u">achieved</span></span>
        <span><span class="bl-v">${num(p.remainingPct)}</span> <span class="bl-u">points remaining</span></span>
        <span><span class="bl-v">${num(p.currentValue)}</span> <span class="bl-u">today, against ${num(p.targetValue)} pledged</span></span>
      </div>
      <p class="bl-basis">${esc(p.note)} Direction of travel: ${esc(p.direction)}.</p>
      ${pledged.basis ? `<p class="bl-src">Measured on: ${esc(pledged.basis)}.</p>` : ''}
      <p class="bl-src">Reference: ${esc(pledged.reference)}. ${esc(p.baseline.basis || '')}</p>`;
  }

  /* ── Master table ──────────────────────────────────────── */

  const statusPill = s => s === 'released'
    ? '<span class="bl-pill live">Released</span>'
    : s === 'draft'
      ? '<span class="bl-pill draft">Draft</span>'
      : '<span class="bl-pill past">Superseded</span>';

  function movementCell(b) {
    if (!b.restatement) return '—';
    const r = b.restatement;
    const label = r.isRestatement ? 'Restated' : 'Revised';
    return `${label} ${num(r.movementPct)}% from version ${r.previousVersion}`
      + (r.reason ? `<br><span class="bl-u">${esc(r.reason)}</span>` : '');
  }

  function actionsFor(b) {
    if (b.status === 'draft') {
      return `<button class="bl-btn" data-release="${esc(b.baselineId)}">Release</button>`;
    }
    if (b.status === 'released') {
      return `<button class="bl-btn" data-supersede="${esc(b.baselineId)}">Supersede</button>`;
    }
    return '';
  }

  function renderTable() {
    const body = $('bl-rows');
    const empty = $('bl-empty');
    if (!body) return;
    if (empty) empty.hidden = state.table.length > 0;

    body.innerHTML = state.table.map(b => `
      <tr class="${b.status === 'superseded' ? 'past' : ''}">
        <td>${esc(b.metric)}</td>
        <td>${esc(b.scope)}</td>
        <td>${esc(b.country || '—')}</td>
        <td class="num">${shapeOf(b.metric) === 'sector_bands'
    ? `${Object.keys(b.values).length / 2} sector bands`
    : Object.entries(b.values).map(([k, v]) => `${esc(k)} ${num(v)}`).join('<br>')}</td>
        <td class="num">${esc(b.version)}</td>
        <td>${statusPill(b.status)}</td>
        <td>${movementCell(b)}</td>
        <td>${esc(b.source)}</td>
        <td>${actionsFor(b)}</td>
      </tr>`).join('');
  }

  /* ── Actions ───────────────────────────────────────────── */

  function say(message, bad = false) {
    const el = $('bl-msg');
    if (!el) return;
    el.textContent = message;
    el.className = `bl-msg${bad ? ' bad' : ''}`;
    el.hidden = !message;
  }

  /* The two thresholds for a band metric; the whole value set as JSON for
     any other shape, because a sector band set is forty-odd numbers and a
     form of forty fields would be worse than the text. */
  function valuesFromForm(metricKey) {
    if (shapeOf(metricKey) === 'bands') {
      return { green: Number($('bl-green').value), transition: Number($('bl-transition').value) };
    }
    return JSON.parse($('bl-values').value || '{}');
  }

  function syncValueFields() {
    const bands = shapeOf($('bl-metric').value) === 'bands';
    for (const id of ['bl-green-field', 'bl-transition-field']) { const el = $(id); if (el) el.hidden = !bands; }
    const json = $('bl-values-field'); if (json) json.hidden = bands;
  }

  async function create() {
    const scope = $('bl-scope').value;
    let values;
    try { values = valuesFromForm($('bl-metric').value); } catch (err) { return say(`Values must be JSON: ${err.message}`, true); }
    const body = {
      metric: $('bl-metric').value,
      scope,
      values,
      source: $('bl-source').value.trim(),
    };
    if (scope !== 'global') body.country = $('bl-country').value.trim().toUpperCase();
    try {
      say('');
      await call('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      say('Saved as a draft. Release it to put it in force.');
      await load();
    } catch (err) { say(err.message, true); }
  }

  async function release(id) {
    try {
      say('');
      await call(`/${id}/release`, { method: 'POST' });
      await load();
    } catch (err) { say(err.message, true); }
  }

  async function supersede(id) {
    const current = state.table.find(b => b.baselineId === id);
    if (!current) return;
    let values;
    if (shapeOf(current.metric) === 'bands') {
      const green = window.prompt('New green threshold', String(current.values.green));
      if (green === null) return;
      const transition = window.prompt('New transition threshold', String(current.values.transition));
      if (transition === null) return;
      values = { green: Number(green), transition: Number(transition) };
    } else {
      const text = window.prompt('New values, as JSON', JSON.stringify(current.values));
      if (text === null) return;
      try { values = JSON.parse(text); } catch (err) { return say(`Values must be JSON: ${err.message}`, true); }
    }
    const reason = window.prompt('Reason for the change. Required where the movement reaches the restatement threshold.', '');
    if (reason === null) return;
    try {
      say('');
      await call(`/${id}/supersede`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, reason }),
      });
      say('A new version is recorded as a draft. Release it to put it in force.');
      await load();
    } catch (err) { say(err.message, true); }
  }

  /* ── Loading ───────────────────────────────────────────── */

  async function load() {
    try {
      const [vocab, eff, table, pledge] = await Promise.all([
        call('/metrics'),
        call(`/effective?country=${encodeURIComponent(state.country)}`),
        call(''),
        call('/pledge?metric=construction_intensity_kgCO2e_m2'),
      ]);
      state.metrics = vocab.metrics || [];
      state.effective = eff.effective || {};
      state.table = table.baselines || [];

      const select = $('bl-metric');
      if (select && !select.options.length) {
        select.innerHTML = state.metrics
          .map(m => `<option value="${esc(m.key)}">${esc(m.label)}</option>`).join('');
        select.addEventListener('change', syncValueFields);
        syncValueFields();
      }
      renderEffective();
      renderTable();
      renderPledge(pledge);
      state.loaded = true;
    } catch (err) {
      say(err.message, true);
    }
  }

  function init() {
    /* Wired before the first request, so a country typed into the field is
       part of what that request asks for. */
    const country = $('bl-country');
    if (country) state.country = (country.value || 'LK').toUpperCase();

    const create$ = $('bl-create');
    if (create$) create$.addEventListener('click', create);

    const rows = $('bl-rows');
    if (rows) {
      rows.addEventListener('click', (ev) => {
        const target = ev.target.closest('button');
        if (!target) return;
        if (target.dataset.release) return release(target.dataset.release);
        if (target.dataset.supersede) return supersede(target.dataset.supersede);
      });
    }
    return load();
  }

  function refresh() { return load(); }

  return { init, refresh };
})();
