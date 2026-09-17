/* ============================================================
   CarbonIQ — the Walkthrough
   ============================================================
   The bank's book shown in the order a committee reads it, from inside
   the product. Two things and no arithmetic:

     What the day still needs, read live off the reporting year's
     position — the book, the bank's name, who prepared and approved,
     the approvals, what the disclosure still lists, and whether the
     document renders. Every row is a field a route returned.

     The eight steps, chief executive first. Opening a step navigates to the real
     screen with the step already applied, through the same doors the
     screens already use: the class hand-over the Lending Book reads, and
     an intent the Bank Overview reads on load. Starting the walkthrough
     keeps a strip on every screen — the step, what to do, what to say —
     held in the browser so it survives navigation and a reload.

   Nothing here fetches a figure to show as its own: the strip and the
   readiness table print what the position said.
   ============================================================ */

const WalkthroughPage = (() => {

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const show = (id, yes) => { const el = $(id); if (el) el.hidden = !yes; };
  const nav = page => { if (typeof window.CARBONIQ_navigateTo === 'function') window.CARBONIQ_navigateTo(page); };
  const remember = (key, value) => { try { localStorage.setItem(key, value); } catch (_) { /* a courtesy */ } };
  const forget = key => { try { localStorage.removeItem(key); } catch (_) { /* a courtesy */ } };
  const recall = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };

  const STATE_KEY = 'carboniq.walkthrough';
  const BANK_INTENT = 'carboniq.bank.intent';
  const CLASS_KEY = 'carboniq.parta.class';

  /* The eight steps, in the order a chief executive reads them: the position
     first, the file they will file second, and the technical screens after.
     `apply` sets the hand-over the target screen reads before its first
     request, so a step opens the real screen already showing what it is about
     rather than a slide of it. */
  const STEPS = [
    {
      title: 'The position — the whole book on one screen',
      page: 'bank',
      action: 'Bank Overview. The bank’s name and the reporting year; financed scope 1 and 2 with the boundaries it sums; scope 3 on its own line; coverage of the stated book; economic intensity; how many exposures the bank has approved.',
      note: 'Every figure on this screen is one the engine returned. The screen draws it and adds nothing to it.',
    },
    {
      title: 'The SLFRS S2 file, downloaded',
      page: 'bank',
      action: 'Press SLFRS S2 disclosure — PDF. The document opens: the cover names the reporting entity, who prepared it and who approved it, and carries a reference derived from the content itself.',
      note: 'One document, downloaded in one press. The same position rendered twice carries the same reference, so a filed copy can be matched to what was on screen.',
    },
    {
      title: 'What S2 asks, and where it is answered',
      page: 'bank',
      apply: () => remember(BANK_INTENT, 'behind:s2'),
      action: 'The strip above the charts shows the four S2 pillars — governance, strategy, risk management, metrics and targets — with what the bank has stated and what it has not. Behind the S2 file opens the index: every paragraph, and whether the document answers it.',
      note: 'A paragraph the bank has not answered is printed as not stated with the clause that asks for it. Nothing is written on the bank’s behalf.',
    },
    {
      title: 'The climate view',
      page: 'bank',
      action: 'Climate risk and opportunity: the outstanding vulnerable to transition risk, vulnerable to physical risk, and aligned with opportunities — S2 §29(b)–(d) — each bar split into what was assessed and what has not been. Then the same book by industry, with carbon-related lending marked.',
      note: 'The share is taken over the outstanding actually assessed. What has not been assessed is drawn beside it and is not counted as not vulnerable.',
    },
    {
      title: 'What is collected when a loan is awarded',
      page: 'parta-register',
      apply: () => remember(CLASS_KEY, 'business-loans-unlisted-equity'),
      action: 'Lending Book, at business loans. Open the record form: the PCAF inputs the engine prices a loan from, and beneath them the climate block — transition risk, physical risk, opportunity alignment, each with the horizon the bank judged it over. Open a recorded row for the equation the engine ran, the factor set with its checksum, and the findings with what clears each.',
      note: 'These are the fields a relationship manager fills at origination. The climate block feeds S2 §29(b)–(d) and nothing else; it changes no figure the engine computes.',
    },
    {
      title: 'How it reaches the dashboard',
      page: 'bank',
      apply: () => remember(BANK_INTENT, 'focus:business-loans-unlisted-equity'),
      action: 'Back on the overview with that class in focus: every other class dims across the charts and the tiles, and the class’s own panel opens — its lines, its score, its coverage, its largest improvement step marked scenario.',
      note: 'A projected score is marked scenario and is never the reported score. One hue is one class on every panel.',
    },
    {
      title: 'What stands behind a figure',
      page: 'bank',
      apply: () => remember(BANK_INTENT, 'behind:headline'),
      action: 'Behind this figure under the headline: the document reference and its content hash, the build, the standard edition, every factor set with its version and checksum, the baselines in force with scope and version, the assurance mode, and how many exposures stand approved.',
      note: 'This is the lineage the document itself carries. A reader can take any figure back to the exposure it came from.',
    },
    {
      title: 'The detail, for the analysts',
      page: 'parta-position',
      action: 'Financed Emissions — what the team uses after a loan is awarded: every asset class side by side, the entity’s own facts as a form, the SLFRS S2 statements pillar by pillar, and the disclosure as PDF, Word or JSON with the exposure register as CSV.',
      note: 'The checklist is answered from the document’s own facts, so an item can answer No — approvals until every exposure is approved, and the entity’s own inventory until the bank states it.',
    },
  ];

  let year = '';
  let position = null;

  const call = path => (typeof window.CARBONIQ_fetch === 'function'
    ? window.CARBONIQ_fetch(path) : fetch(path)).then(async r => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { const err = new Error(body.message || `${r.status}`); err.status = r.status; err.code = body.error; throw err; }
    return body;
  });
  const partA = path => call(`/v1/pcaf/part-a${path}`);

  // ── years ──────────────────────────────────────────────────

  async function loadYears() {
    let years = [];
    try { ({ years } = await partA('/years')); } catch (_) { years = []; }
    const chosen = $('wt-year') ? $('wt-year').value : '';
    const list = years.map(y => String(y.reportingYear));
    if (!list.length) list.push(String(new Date().getFullYear()));
    setHtml('wt-year', list.map(y => `<option value="${esc(y)}">${esc(y)}</option>`).join(''));
    $('wt-year').value = list.includes(chosen) ? chosen : list[list.length - 1];
    year = $('wt-year').value;
  }

  // ── readiness, read off the position ───────────────────────

  async function load() {
    year = $('wt-year').value;
    say('wt-status', 'Reading the position…');
    position = null;
    let refusal = null;
    try { position = await partA(`/financed-emissions/${encodeURIComponent(year)}`); } catch (err) { refusal = err; }
    let document_ = null;
    if (position) {
      try { ({ report: document_ } = await partA(`/financed-emissions/${encodeURIComponent(year)}/disclosure?format=json`)); } catch (_) { document_ = null; }
    }
    renderReadiness(position, refusal, document_);
    renderSteps();
    const e = (position && position.entity) || {};
    say('wt-entity', e.reportingEntity || 'Reporting entity not stated');
    say('wt-subtitle', position ? `FY${position.reportingYear} · ${position.exposures} exposure(s)` : `FY${year}`);
    say('wt-status', position ? 'Every row below is read off the position for this year.' : (refusal ? refusal.message : ''));
  }

  const ready = (yes, word) => `<span class="wt-state ${yes ? 'wt-ready' : 'wt-needed'}">${esc(word || (yes ? 'Ready' : 'Needed'))}</span>`;
  const opener = (page, label, apply) => `<button type="button" class="btn btn-secondary wt-open" data-page="${esc(page)}" ${apply ? `data-apply="${esc(apply)}"` : ''}>${esc(label)}</button>`;

  function renderReadiness(p, refusal, doc) {
    const rows = [];
    if (!p) {
      rows.push(['The bank’s book', ready(false), esc(refusal ? refusal.message : 'No position for this year.'), opener('bank', 'Open Bank Overview')]);
      setHtml('wt-readiness-rows', rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="partc-hint">${r[2]}</td><td>${r[3]}</td></tr>`).join(''));
      return;
    }
    const e = p.entity || {};
    const recorded = (p.classes || []).filter(c => c.status === 'recorded');
    rows.push(['The bank’s book', ready(recorded.length > 0),
      `${esc(p.exposures)} exposure(s) across ${esc(recorded.length)} asset class(es) in FY${esc(p.reportingYear)}`, opener('bank', 'Open Bank Overview')]);
    rows.push(['The bank’s name', ready(Boolean(e.reportingEntity)),
      e.reportingEntity ? `${esc(e.reportingEntity)} — heads the sidebar group` : 'Not stated; type it beside Load starter book, or record it on Financed Emissions', opener('parta-position', 'Open Financed Emissions')]);
    rows.push(['Who prepared and who approved', ready(Boolean(e.preparedBy && e.approvedBy)),
      e.preparedBy && e.approvedBy
        ? `Prepared by ${esc(e.preparedBy.name || '')}; approved by ${esc(e.approvedBy.name || '')}`
        : 'Not stated; the entity form on Financed Emissions records both', opener('parta-position', 'Open Financed Emissions')]);
    const a = p.approval || {};
    rows.push(['Approved exposures', ready(Number(a.approved) > 0, Number(a.approved) > 0 ? 'Moving' : 'None yet'),
      a.total != null ? `${esc(a.approved)} of ${esc(a.total)} approved — the ring and the tile show movement once one is` : 'Register classes only', opener('parta-register', 'Open Lending Book', 'class:business-loans-unlisted-equity')]);
    const items = p.outstandingItems || [];
    rows.push(['What the disclosure still lists', ready(items.length === 0, items.length === 0 ? 'Nothing' : `${items.length} item(s)`),
      items.length ? items.map(x => esc(x.what)).join(' · ') : 'Every Chapter 6 item the bank must state is on the record', opener('parta-position', 'Open Financed Emissions')]);
    /* The two S2 rows: what the bank has said about itself, and how much of
       the book it has classified. Both are fields the position returned. */
    const r = e.climateReadiness || null;
    rows.push(['The bank’s SLFRS S2 statements', ready(Boolean(r) && r.absent === 0 && r.illustrative === 0,
      !r ? 'None' : r.absent === 0 && r.illustrative === 0 ? 'Stated' : r.stated > 0 || r.illustrative > 0 ? 'Part stated' : 'None'),
      r ? `${esc(r.stated)} stated by the bank · ${esc(r.illustrative)} illustrative · ${esc(r.absent)} not stated, of ${esc(r.total)}`
        : 'Governance, strategy, risk management and the entity’s own metrics are the bank’s to state',
      opener('parta-position', 'Open Financed Emissions')]);
    const band = (p.climateExposure && p.climateExposure.transitionRisk) || null;
    rows.push(['The climate classification on the book', ready(Boolean(band) && band.exposuresAssessed > 0 && !band.unassessedAmount,
      !band || !band.exposuresAssessed ? 'None' : band.unassessedAmount ? 'Part classified' : 'Classified'),
      band ? `${esc(band.exposuresAssessed)} exposure(s) assessed for transition risk${band.unassessedAmount ? '; some outstanding is not yet assessed and is reported beside the share' : ''}`
        : 'Each exposure carries the bank’s own verdict; the engine sums them for S2 §29(b)–(d)',
      opener('parta-register', 'Open Lending Book', 'class:business-loans-unlisted-equity')]);
    const cover = (doc && doc.cover) || null;
    rows.push(['The SLFRS S2 disclosure renders', ready(Boolean(cover)),
      cover ? `Reference ${esc(cover.reportId || '')}; download it once from Bank Overview so the first render on the day is not the first render on the site` : 'The document did not render for this year', opener('bank', 'Open Bank Overview')]);
    setHtml('wt-readiness-rows', rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="partc-hint">${r[2]}</td><td>${r[3]}</td></tr>`).join(''));
  }

  function renderSteps() {
    setHtml('wt-steps', STEPS.map((s, i) => `
      <li class="wt-step">
        <div class="wt-step-head"><span class="wt-step-n">${i + 1}</span><h4>${esc(s.title)}</h4>
          <button type="button" class="btn btn-secondary wt-go" data-step="${i}">Open</button></div>
        <p>${esc(s.action)}</p>
        <p class="wt-say"><span class="wt-say-label">Say</span> ${esc(s.note)}</p>
      </li>`).join(''));
  }

  // ── the strip that follows the presenter ───────────────────

  function state() {
    try { const s = JSON.parse(recall(STATE_KEY) || 'null'); return s && Number.isInteger(s.step) ? s : null; } catch (_) { return null; }
  }

  function go(i, navigate) {
    const step = STEPS[i];
    if (!step) return;
    remember(STATE_KEY, JSON.stringify({ step: i }));
    if (step.apply) step.apply();
    renderStrip();
    if (navigate) nav(step.page);
  }

  function end() {
    forget(STATE_KEY); forget(BANK_INTENT);
    renderStrip();
    show('wt-start', true); show('wt-end', false);
  }

  function renderStrip() {
    const strip = $('wt-strip');
    if (!strip) return;
    const s = state();
    if (!s || !STEPS[s.step]) { strip.hidden = true; return; }
    const step = STEPS[s.step];
    strip.hidden = false;
    say('wt-strip-n', `Step ${s.step + 1} of ${STEPS.length}`);
    say('wt-strip-title', step.title);
    say('wt-strip-action', step.action);
    say('wt-strip-say', step.note);
    show('wt-strip-say-row', Boolean($('wt-strip-notes') && $('wt-strip-notes').checked));
    $('wt-strip-back').disabled = s.step === 0;
    $('wt-strip-next').textContent = s.step === STEPS.length - 1 ? 'Finish' : 'Next';
    show('wt-start', false); show('wt-end', true);
  }

  function wireStrip() {
    on('wt-strip-back', 'click', () => { const s = state(); if (s && s.step > 0) go(s.step - 1, true); });
    on('wt-strip-next', 'click', () => { const s = state(); if (!s) return; if (s.step >= STEPS.length - 1) end(); else go(s.step + 1, true); });
    on('wt-strip-open', 'click', () => { const s = state(); if (s) go(s.step, true); });
    on('wt-strip-end', 'click', end);
    on('wt-strip-notes', 'change', renderStrip);
  }

  // ── lifecycle ──────────────────────────────────────────────

  let stripWired = false;

  /* The strip lives in the shell and is wired once, before any page loads,
     so a walkthrough begun before a reload is on screen again after it. */
  function mount() {
    if (stripWired) return;
    stripWired = true;
    wireStrip();
    placeStrip();
    window.addEventListener('resize', placeStrip);
    renderStrip();
  }

  /* The strip sticks just under whichever bar is on screen — the page's
     topbar, or the phone's fixed navbar — so it stays in view as the
     presenter scrolls. */
  function placeStrip() {
    const strip = $('wt-strip');
    if (!strip) return;
    const mobile = document.querySelector('.mobile-navbar');
    const top = document.querySelector('.topbar');
    const shown = el => el && window.getComputedStyle(el).display !== 'none';
    const bar = shown(mobile) ? mobile : (shown(top) ? top : null);
    strip.style.top = bar && window.getComputedStyle(bar).position !== 'static' ? `${bar.offsetHeight}px` : '0px';
  }

  async function init() {
    mount();
    on('wt-refresh', 'click', load);
    on('wt-year', 'change', load);
    on('wt-start', 'click', () => go(0, true));
    on('wt-end', 'click', end);
    on('wt-steps', 'click', ev => {
      const b = ev.target && ev.target.closest ? ev.target.closest('.wt-go') : null;
      if (b) go(Number(b.getAttribute('data-step')), true);
    });
    on('wt-readiness-rows', 'click', ev => {
      const b = ev.target && ev.target.closest ? ev.target.closest('.wt-open') : null;
      if (!b) return;
      const apply = b.getAttribute('data-apply') || '';
      if (apply.startsWith('class:')) remember(CLASS_KEY, apply.slice(6));
      nav(b.getAttribute('data-page'));
    });
    await loadYears();
    await load();
    const s = state();
    show('wt-start', !s); show('wt-end', Boolean(s));
  }

  function refresh() {
    return load();
  }

  return { init, refresh, load, mount, STEPS };
})();

/* The strip is part of the shell: mount it as soon as the script loads so
   it is on screen whatever page a reload lands on. */
if (typeof document !== 'undefined' && document.getElementById('wt-strip')) WalkthroughPage.mount();
