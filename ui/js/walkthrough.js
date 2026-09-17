/* ============================================================
   CarbonIQ — the Walkthrough
   ============================================================
   The bank's book shown in the order a committee reads it, from inside
   the product. Two things and no arithmetic:

     What the day still needs, read live off the reporting year's
     position — the book, the bank's name, who prepared and approved,
     the approvals, what the disclosure still lists, and whether the
     document renders. Every row is a field a route returned.

     The six steps: one loan, from the door to the file. The position and
     the file first, for the chief executive; then one loan — it comes in
     with every field already filled, the engine prices it, it is reviewed
     and approved, and it is on the dashboard. Opening a step navigates to
     the real screen with the step already applied, through the doors the
     screens already read: the class hand-over and a one-shot intent each
     screen reads once its own load is done. Every step changes the screen
     and marks the one control it asks the presenter to press. Starting the
     walkthrough keeps a strip on every screen — the step, what to do, what
     to say — held in the browser so it survives navigation and a reload.

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
  const REGISTER_INTENT = 'carboniq.register.intent';
  const CLASS_KEY = 'carboniq.parta.class';
  const LOAN_CLASS = 'business-loans-unlisted-equity';

  /* Six steps, one loan from the door to the file. `apply` sets the
     hand-over the target screen reads before it acts, so a step opens the
     real screen already showing what it is about rather than a slide of it;
     each also marks the one control the presenter presses next. */
  const STEPS = [
    {
      title: 'The position — the whole book on one screen',
      page: 'bank',
      apply: () => { forget(BANK_INTENT); forget(REGISTER_INTENT); },
      action: 'Bank Overview. The bank’s name over the reporting year; financed scope 1 and 2 as the headline, with scope 3 on its own line; coverage of the stated book; economic intensity; what the disclosure still asks for; how many exposures the bank has approved. Beneath, the four SLFRS S2 pillars and what the bank has stated under each.',
      note: 'Every figure on this screen is one the engine returned; the screen draws it and adds nothing. A projected score anywhere on it is marked scenario and is never the reported one.',
    },
    {
      title: 'The file — the SLFRS S2 disclosure, in one press',
      page: 'bank',
      apply: () => remember(BANK_INTENT, 'file:s2'),
      action: 'Press SLFRS S2 disclosure — PDF, the marked button. The document opens on the cover: the reporting entity, who prepared and approved it, and a reference derived from the content. Beneath the figures, Behind the S2 file has opened the index — every paragraph of the standard and where in the document it is answered.',
      note: 'One document, one press; the same position rendered twice carries the same reference. Nothing is written on the bank’s behalf: a paragraph the bank has not answered prints as not stated with its clause, and the checklist is answered from the document itself, so an item can answer No.',
    },
    {
      title: 'A loan comes in',
      page: 'parta-register',
      apply: () => { remember(CLASS_KEY, LOAN_CLASS); remember(REGISTER_INTENT, 'record:example'); },
      action: 'Lending Book. The record form has opened for one borrower with every field already filled: the facility and its outstanding, the borrower’s equity and debt, its reported scope 1 and 2, and the climate block — the bank’s own judgement of transition risk, physical risk and opportunity. Change any figure, then press Record.',
      note: 'These are the fields a relationship manager fills at origination. The engine runs before anything is written, and a loan the standard would refuse is refused here with its clause. The climate block feeds S2 §29(b)–(d) and changes no figure; what has not been assessed is reported apart and is not counted as not vulnerable.',
    },
    {
      title: 'What the standard made of it',
      page: 'parta-register',
      apply: () => { remember(CLASS_KEY, LOAN_CLASS); remember(REGISTER_INTENT, 'open:latest'); },
      action: 'The loan just recorded is open: the PCAF option the data it carried earned and the data-quality score that follows from it, the attribution equation the engine ran, the factor set with its checksum, and any finding with the sentence that clears it.',
      note: 'The score is a category from 1 to 5 set by the option — reported figures earn a 2, a sector factor a 5 — and never an average. What would raise it is written beside it, which is the improvement plan for this one loan.',
    },
    {
      title: 'Reviewed, approved, frozen',
      page: 'parta-register',
      apply: () => { remember(CLASS_KEY, LOAN_CLASS); remember(REGISTER_INTENT, 'approve:latest'); },
      action: 'The same loan, with its controls marked. Press Send for review, then Approve. The state moves recorded → under review → approved, each move dated and attributed on the exposure’s own trail, and an approved loan offers no edit, recomputation or removal until it is reopened with a recorded reason.',
      note: 'Approving is a separate authority from recording — the lock scope, exactly as a Part C lock is. A figure the bank has approved cannot move underneath the disclosure.',
    },
    {
      title: 'On the dashboard, and in the file',
      page: 'bank',
      apply: () => remember(BANK_INTENT, `focus:${LOAN_CLASS}`),
      action: 'Back on the overview with business loans in focus: the new loan is in the class’s figures, the approved count has moved, and the next press of SLFRS S2 disclosure — PDF carries it in Annex A and in the register annex a verifier samples from.',
      note: 'That is the process behind the number: recorded through the engine, reviewed, approved, and only then in the file. One hue is one class on every panel.',
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
    renderSummary();
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

  const SCREEN = { bank: 'Bank Overview', 'parta-register': 'Lending Book', 'parta-position': 'Financed Emissions' };

  function renderSteps() {
    setHtml('wt-steps', STEPS.map((s, i) => `
      <li class="wt-step">
        <span class="wt-step-n">${i + 1}</span>
        <div class="wt-step-body">
          <div class="wt-step-head"><h4>${esc(s.title)}</h4><span class="wt-step-screen">${esc(SCREEN[s.page] || s.page)}</span>
            <button type="button" class="btn btn-secondary wt-go" data-step="${i}">Open</button></div>
          <p>${esc(s.action)}</p>
          <details class="wt-say"><summary><span class="wt-say-label">Say</span> What to say</summary><p>${esc(s.note)}</p></details>
        </div>
      </li>`).join(''));
  }

  /* The day at a glance: how many rows stand ready, read off the rows
     already rendered — a count of states, not a figure. */
  function renderSummary() {
    const rows = document.querySelectorAll('#wt-readiness-rows .wt-state');
    let ready = 0, needed = 0;
    for (const el of rows) { if (el.classList.contains('wt-ready')) ready += 1; else needed += 1; }
    setHtml('wt-summary', rows.length
      ? `<span class="wt-sum"><b>${ready}</b> ready</span><span class="wt-sum"><b>${needed}</b> needed</span><span class="wt-sum"><b>${STEPS.length}</b> steps</span>`
      : '');
  }

  // ── the strip that follows the presenter ───────────────────

  function state() {
    try { const s = JSON.parse(recall(STATE_KEY) || 'null'); return s && Number.isInteger(s.step) ? s : null; } catch (_) { return null; }
  }

  /* Whether the page a step names is the one on screen now. */
  const onPage = page => { const el = document.getElementById(`page-${page}`); return Boolean(el && el.offsetParent !== null); };

  function go(i, navigate) {
    const step = STEPS[i];
    if (!step) return;
    remember(STATE_KEY, JSON.stringify({ step: i }));
    if (step.apply) step.apply();
    renderStrip();
    if (!navigate) return;
    /* Two consecutive steps on one screen used to leave Next changing only
       the strip's words, which reads as nothing happening. The screen is
       re-read either way, so the intent just set is applied now. */
    if (onPage(step.page) && typeof window.CARBONIQ_refreshPage === 'function') window.CARBONIQ_refreshPage(step.page);
    else nav(step.page);
  }

  function end() {
    forget(STATE_KEY); forget(BANK_INTENT); forget(REGISTER_INTENT);
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
    setHtml('wt-strip-dots', STEPS.map((_, i) => `<i class="${i < s.step ? 'is-done' : i === s.step ? 'is-on' : ''}"></i>`).join(''));
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
  /* Marks one control for a few seconds — the button a step asks the
     presenter to press — so a step is visible as well as read. Any screen
     may call it; it is defined here because the strip is. */
  function cueControl(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('wt-cue');
    void el.offsetWidth;
    el.classList.add('wt-cue');
    setTimeout(() => el.classList.remove('wt-cue'), 7000);
  }

  function mount() {
    if (stripWired) return;
    stripWired = true;
    window.CARBONIQ_cue = cueControl;
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
