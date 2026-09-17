/* ============================================================
   CarbonIQ — the SLFRS S2 climate facts the bank states about itself
   ============================================================

   Every control on this panel is drawn from the registry the server serves
   at /v1/pcaf/part-a/climate/reference: one row per fact, each naming the
   paragraph that requires it, and one closed list per question the standard
   bounds. Nothing about what S2 asks is written here, so a field added to the
   registry appears on this form on the same commit and a screen can never
   offer an answer the record would refuse.

   The panel computes nothing. It puts what was typed on the wire and renders
   what came back; the state beside each fact — the bank's own words,
   illustrative content still carrying ours, or not stated — is worked out by
   the server by comparing what is held with the pack it shipped.

   Illustrative content is labelled wherever it appears, on the screen and in
   the document, because a governance paragraph that reads as the bank's
   statement and is not is the one thing a disclosure must never carry.
   ============================================================ */

const PartAClimatePanel = (() => {

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const show = (id, yes) => { const el = $(id); if (el) el.hidden = !yes; };

  /** The registry, fetched once: it is reference data and does not move. */
  let registry = null;
  let settings = null;
  let openPillar = 'governance';

  const preview = () => {
    try { return typeof Auth !== 'undefined' && typeof Auth.isPreview === 'function' && Boolean(Auth.isPreview()); }
    catch (_) { return false; }
  };

  async function call(path, opts = {}) {
    const res = await window.CARBONIQ_fetch('/v1/pcaf/part-a' + path, opts);
    let data = {};
    try { data = await res.json(); } catch (_) { /* empty */ }
    if (!res.ok) {
      const err = new Error([data.message, data.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ── reading and writing a dotted path ──────────────────────

  function at(obj, path) {
    let cur = obj;
    for (const key of String(path).split('.')) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
      cur = cur[key];
    }
    return cur;
  }

  function place(obj, path, value) {
    const keys = String(path).split('.');
    let cur = obj;
    for (const key of keys.slice(0, -1)) {
      if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
      cur = cur[key];
    }
    cur[keys[keys.length - 1]] = value;
  }

  const listOf = name => (registry && registry.vocabulary && registry.vocabulary[name]) || [];
  const labelIn = (name, id) => {
    const row = listOf(name).find(x => x.id === id);
    return row ? row.label : (id || '');
  };

  // ── the state beside each fact ─────────────────────────────

  const STATE_WORD = { stated: 'Stated by the bank', illustrative: 'Illustrative', absent: 'Not stated' };
  const pill = state => `<span class="cl-state cl-${esc(state)}">${esc(STATE_WORD[state] || state)}</span>`;

  function readinessOf(path) {
    const r = settings && settings.climateReadiness;
    const row = r && r.items.find(i => i.path === path);
    return row ? row.state : 'absent';
  }

  // ── the controls, one per kind the registry declares ───────

  const id = path => `cl-${String(path).replace(/\./g, '-')}`;

  function selectFor(name, value, controlId, allowEmpty) {
    const opts = [allowEmpty === false ? '' : '<option value="">Not stated</option>']
      .concat(listOf(name).map(o =>
        `<option value="${esc(o.id)}"${o.id === value ? ' selected' : ''}>${esc(o.label)}</option>`));
    return `<select id="${esc(controlId)}" data-cl="${esc(controlId)}">${opts.join('')}</select>`;
  }

  function figureControl(item, value) {
    const v = value || {};
    const base = id(item.path);
    const money = item.path === 'crossIndustry.capitalDeployed';
    return `<div class="cl-figure">
      <label>${money ? 'Amount' : 'Figure'} <input type="number" step="any" id="${base}-value" value="${esc(money ? (v.amount ?? '') : (v.value ?? ''))}"></label>
      ${money
    ? `<label>Currency <input type="text" maxlength="10" id="${base}-currency" value="${esc(v.currency || '')}"></label>`
    : `<label>Basis ${selectFor('inventoryBases', v.basis || '', `${base}-basis`)}</label>
         <label>Period <input type="text" maxlength="40" id="${base}-period" value="${esc(v.period || '')}"></label>`}
      <label class="cl-wide">Note <input type="text" maxlength="1000" id="${base}-note" value="${esc(v.note || '')}"></label>
      <label class="cl-wide">Reason it is absent <input type="text" maxlength="1000" id="${base}-absent" value="${esc(v.absentReason || '')}" placeholder="where no figure is stated"></label>
    </div>`;
  }

  function carbonPriceControl(item, value) {
    const v = value || {};
    const base = id(item.path);
    const chosen = new Set(v.appliedTo || []);
    return `<div class="cl-figure">
      <fieldset class="cl-wide cl-checks"><legend>Applied to</legend>${listOf('carbonPriceUses').map((o, n) => `
        <label class="cl-check"><input type="checkbox" id="${base}-use-${n}" data-use="${esc(o.id)}"${chosen.has(o.id) ? ' checked' : ''}> ${esc(o.label)}</label>`).join('')}</fieldset>
      <label>Price <input type="number" step="any" id="${base}-price" value="${esc(v.price ?? '')}"></label>
      <label>Currency <input type="text" maxlength="10" id="${base}-currency" value="${esc(v.currency || '')}"></label>
      <label class="cl-wide">Note <input type="text" maxlength="1000" id="${base}-note" value="${esc(v.note || '')}"></label>
    </div>`;
  }

  function remunerationControl(item, value) {
    const v = value || {};
    const base = id(item.path);
    return `<div class="cl-figure">
      <label>Linked to climate
        <select id="${base}-linked"><option value="">Not stated</option>
          <option value="yes"${v.linked === true ? ' selected' : ''}>Yes</option>
          <option value="no"${v.linked === false ? ' selected' : ''}>No</option></select></label>
      <label>Share recognised (%) <input type="number" step="any" min="0" max="100" id="${base}-share" value="${esc(v.sharePct ?? '')}"></label>
      <label class="cl-wide">Note <input type="text" maxlength="1000" id="${base}-note" value="${esc(v.note || '')}"></label>
    </div>`;
  }

  /** A repeating block: the rows held, plus one blank row to add another. */
  function rowsControl(item, value) {
    const shape = (registry.rowShapes && registry.rowShapes[item.of]) || [];
    const held = Array.isArray(value) ? value : [];
    const draw = (row, n) => `<div class="cl-row" data-row="${esc(item.path)}">
      ${shape.map(f => {
    const cid = `${id(item.path)}-${n}-${f.key}`;
    const v = row ? row[f.key] : null;
    const control = f.kind === 'enum' ? selectFor(f.list, v || '', cid)
      : f.kind === 'number' ? `<input type="number" step="any" id="${cid}" data-key="${esc(f.key)}" value="${esc(v ?? '')}">`
        : `<input type="text" maxlength="${f.max || 2000}" id="${cid}" data-key="${esc(f.key)}" value="${esc(v || '')}">`;
    /* The key travels on the control so the collector reads the row
       without knowing the index it was drawn at. */
    return `<label class="${f.kind === 'text' && (f.max || 0) > 400 ? 'cl-wide' : ''}">${esc(f.label)}${f.required ? ' *' : ''} ${control.replace('<select ', `<select data-key="${esc(f.key)}" `)}</label>`;
  }).join('')}
    </div>`;
    return `<div class="cl-rows" id="${id(item.path)}-rows">${held.map(draw).join('')}${draw(null, held.length)}</div>
      <button type="button" class="btn btn-secondary btn-sm" data-add-row="${esc(item.path)}">Add another</button>`;
  }

  function controlFor(item, value) {
    const cid = id(item.path);
    switch (item.kind) {
      case 'text': return (item.max || 0) > 400
        ? `<textarea id="${cid}" rows="4" maxlength="${item.max}">${esc(value || '')}</textarea>`
        : `<input type="text" id="${cid}" maxlength="${item.max || 300}" value="${esc(value || '')}">`;
      case 'enum': return selectFor(item.list, value || '', cid);
      case 'number': return `<input type="number" id="${cid}" value="${esc(value ?? '')}">`;
      case 'figure': return figureControl(item, value);
      case 'carbonPrice': return carbonPriceControl(item, value);
      case 'remuneration': return remunerationControl(item, value);
      case 'list': return rowsControl(item, value);
      default: return '';
    }
  }

  // ── rendering ──────────────────────────────────────────────

  function renderTabs() {
    const r = settings && settings.climateReadiness;
    setHtml('fe-cl-tabs', (registry.pillars || []).map(p => {
      const st = r && r.pillars.find(x => x.id === p.id);
      const counts = st ? `${st.stated + st.illustrative} of ${st.total}` : '';
      return `<button type="button" class="cl-tab${p.id === openPillar ? ' is-on' : ''}" data-pillar="${esc(p.id)}">
        <b>${esc(p.label)}</b><span>${esc(p.paragraphs)}</span><em>${esc(counts)}</em></button>`;
    }).join(''));
  }

  function renderSummary() {
    const r = settings && settings.climateReadiness;
    if (!r) return setHtml('fe-cl-summary', '');
    const trial = r.illustrative > 0
      ? `<p class="cl-trial">Illustrative content is in place for ${esc(r.illustrative)} of ${esc(r.total)} items. Every field is editable, and a document prints an unedited item as illustrative rather than as a statement by the bank.</p>`
      : '';
    setHtml('fe-cl-summary', `
      <div class="cl-counts">
        <span class="cl-state cl-stated">Stated by the bank ${esc(r.stated)}</span>
        <span class="cl-state cl-illustrative">Illustrative ${esc(r.illustrative)}</span>
        <span class="cl-state cl-absent">Not stated ${esc(r.absent)}</span>
      </div>${trial}`);
  }

  function renderPillar() {
    const items = (registry.items || []).filter(i => i.pillar === openPillar);
    const climate = (settings && settings.climate) || {};
    setHtml('fe-cl-fields', items.map(item => `
      <div class="cl-item">
        <div class="cl-item-head">
          <h5>${esc(item.label)}${item.optional ? ' <span class="partc-hint">(optional)</span>' : ''}</h5>
          <span class="cl-para">${esc(item.paragraph)}</span>
          ${pill(readinessOf(item.path))}
        </div>
        <p class="partc-hint">${esc(item.help || '')}</p>
        <div class="cl-control">${controlFor(item, at(climate, item.path))}</div>
      </div>`).join(''));
  }

  function renderView() {
    const r = settings && settings.climateReadiness;
    if (!r) return setHtml('fe-cl-view', '');
    setHtml('fe-cl-view', `<div class="cl-view">${r.pillars.map(p => `
      <div class="cl-view-pillar">
        <b>${esc(p.label)}</b>
        <span class="partc-hint">${esc(p.paragraphs)}</span>
        ${pill(p.state === 'partial' ? 'absent' : p.state)}
        <span class="partc-hint">${esc(p.stated)} stated · ${esc(p.illustrative)} illustrative · ${esc(p.absent)} not stated</span>
      </div>`).join('')}</div>`);
  }

  function render() {
    renderSummary();
    renderView();
    if (preview()) { show('fe-cl-form', false); return; }
    renderTabs();
    renderPillar();
    show('fe-cl-form', true);
    show('fe-cl-illustrative', Boolean(settings && settings.climateReadiness
      && settings.climateReadiness.stated === 0 && settings.climateReadiness.illustrative === 0));
  }

  // ── collecting ─────────────────────────────────────────────

  const val = elId => { const el = $(elId); return el && el.value !== '' ? el.value : null; };
  const numVal = elId => { const v = val(elId); return v === null ? null : Number(v); };

  function collectFigure(item) {
    const base = id(item.path);
    if (item.path === 'crossIndustry.capitalDeployed') {
      return { amount: numVal(`${base}-value`), currency: val(`${base}-currency`), note: val(`${base}-note`), absentReason: val(`${base}-absent`) };
    }
    return {
      value: numVal(`${base}-value`), basis: val(`${base}-basis`), period: val(`${base}-period`),
      note: val(`${base}-note`), absentReason: val(`${base}-absent`),
    };
  }

  function collectCarbonPrice(item) {
    const base = id(item.path);
    const appliedTo = [];
    for (const el of document.querySelectorAll(`#fe-cl-fields [id^="${base}-use-"]`)) {
      if (el.checked) appliedTo.push(el.getAttribute('data-use'));
    }
    return { appliedTo, price: numVal(`${base}-price`), currency: val(`${base}-currency`), note: val(`${base}-note`) };
  }

  function collectRemuneration(item) {
    const base = id(item.path);
    const linked = val(`${base}-linked`);
    return { linked: linked === null ? null : linked === 'yes', sharePct: numVal(`${base}-share`), note: val(`${base}-note`) };
  }

  function collectRows(item) {
    const shape = (registry.rowShapes && registry.rowShapes[item.of]) || [];
    const out = [];
    for (const rowEl of document.querySelectorAll(`#${id(item.path)}-rows .cl-row`)) {
      const row = {};
      let any = false;
      for (const f of shape) {
        const el = rowEl.querySelector(`[data-key="${f.key}"]`);
        const v = el && el.value !== '' ? el.value : null;
        row[f.key] = v === null ? null : (f.kind === 'number' ? Number(v) : v);
        if (v !== null) any = true;
      }
      if (any) out.push(row);
    }
    return out;
  }

  /** What the open pillar's controls hold, and nothing else. */
  function collect() {
    const patch = {};
    for (const item of (registry.items || []).filter(i => i.pillar === openPillar)) {
      const value = item.kind === 'figure' ? collectFigure(item)
        : item.kind === 'carbonPrice' ? collectCarbonPrice(item)
          : item.kind === 'remuneration' ? collectRemuneration(item)
            : item.kind === 'list' ? collectRows(item)
              : item.kind === 'number' ? numVal(id(item.path))
                : val(id(item.path));
      place(patch, item.path, value);
    }
    return patch;
  }

  // ── acting ─────────────────────────────────────────────────

  async function save(ev) {
    if (ev) ev.preventDefault();
    say('fe-cl-status', 'Recording…');
    try {
      const body = await call('/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ climate: collect() }),
      });
      settings = body.settings;
      render();
      say('fe-cl-status', 'Recorded.');
      document.dispatchEvent(new CustomEvent('carboniq:climate'));
    } catch (err) { say('fe-cl-status', err.message); }
  }

  async function loadIllustrative() {
    say('fe-cl-status', 'Loading…');
    try {
      const body = await call('/settings/climate/illustrative', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      settings = body.settings;
      render();
      say('fe-cl-status', `Illustrative content loaded for ${body.installed} items. Edit each one before filing.`);
      document.dispatchEvent(new CustomEvent('carboniq:climate'));
    } catch (err) { say('fe-cl-status', err.message); }
  }

  function wire() {
    on('fe-cl-form', 'submit', save);
    on('fe-cl-illustrative', 'click', loadIllustrative);
    on('fe-cl-tabs', 'click', ev => {
      const tab = ev.target.closest('[data-pillar]');
      if (!tab) return;
      openPillar = tab.getAttribute('data-pillar');
      renderTabs();
      renderPillar();
    });
    on('fe-cl-fields', 'click', ev => {
      const add = ev.target.closest('[data-add-row]');
      if (!add) return;
      const item = (registry.items || []).find(i => i.path === add.getAttribute('data-add-row'));
      if (!item) return;
      /* Re-rendered from what the controls hold plus one more blank row, so
         nothing typed is lost by asking for another. */
      const held = collectRows(item);
      const climate = (settings && settings.climate) || {};
      place(climate, item.path, held);
      renderPillar();
    });
  }

  let wired = false;

  /**
   * The registry is fetched before anything renders, because every control on
   * this panel is drawn from it — the load-before-the-first-render rule this
   * codebase has shipped four defects by breaking.
   */
  async function load(given) {
    if (!registry) {
      try { registry = await call('/climate/reference'); }
      catch (err) { say('fe-cl-status', err.message); return; }
    }
    settings = given || (await call('/settings')).settings;
    if (!wired) { wire(); wired = true; }
    render();
  }

  return { load, _collect: collect, _at: at };
})();

if (typeof window !== 'undefined') window.PartAClimatePanel = PartAClimatePanel;
