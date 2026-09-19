/* ============================================================
   CarbonIQ — the two walkthroughs, and the strip that follows the presenter
   ============================================================
   Two pages, one module, one strip. The bank's Walkthrough sits under the
   reporting entity's name and runs the SLFRS S2 track — one loan, from the
   door to the file. The GCF Walkthrough sits under Capital & GCF beside the
   GCF Overview and runs the GCF track — one candidate, from the door to the
   Fund. They shipped as two tracks on the bank's page, so a reader looking
   for the accredited entity's walkthrough found a page headed by another
   bank; each is its own screen now, and the element ids on each carry the
   page's own prefix so both fragments can sit in one document.

   Each page shows two things and no arithmetic: what the day still needs,
   read live off the routes — every row a field a route returned — and the
   steps, each opened from the page with the real screen already showing
   what the step is about, through the hand-overs those screens read once
   their own load is done. Starting a walkthrough keeps a strip on every
   screen — the step, what to do, what to say — held in the browser so it
   survives navigation and a reload; the strip is shell markup and there is
   one, whichever page started it.

   Nothing here fetches a figure to show as its own: the strip and the
   readiness tables print what the routes said.
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
  /* The GCF track's two hand-overs: the GCF Overview reads one once its
     pipeline is on screen, the Pipeline tab reads the other before its first
     request. */
  const GCF_OVERVIEW_INTENT = 'carboniq.gcf-overview.intent';
  const GCF_INTENT = 'carboniq.gcf.intent';

  /* Seven steps, one loan from the door to the file. `apply` sets the
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
      action: 'Lending Book. The record form has opened for one borrower with every field already filled. The client asked for 250 million over five years: the facility is recorded as sanctioned, drawn in March and repaid quarterly, and the balance the standard attributes on is what is owed at the year-end — 212.5 million after three instalments — not the amount asked for. The preview beneath shows the attribution falling to nought as the loan is repaid, the borrower’s reported scope 1 and 2, and the climate block. Change any figure, then press Record.',
      note: 'These are the fields a relationship manager fills at origination. The outstanding amount is disbursed debt minus repayments at the fiscal year-end (PCAF Part A §5.2, p.56), so each reporting year is a fresh measurement of that year’s balance; the undrawn part of a facility is reported apart under §6.2 and never summed with it. The engine runs before anything is written, and a loan the standard would refuse is refused here with its clause. The climate block feeds S2 §29(b)–(d) and changes no figure; what has not been assessed is reported apart and is not counted as not vulnerable.',
    },
    {
      title: 'The borrower that does not know its emissions',
      page: 'parta-register',
      apply: () => { remember(CLASS_KEY, LOAN_CLASS); remember(REGISTER_INTENT, 'record:example-sector'); },
      action: 'Lending Book. The record form has opened for a second borrower — a rice miller with no emissions figures of its own. Not known — estimate from its industry is selected, the industry is set to rice milling, and the preview beneath the form shows what the standard makes of it before anything is written: Option 3a at score 4, the held sector factor per unit of the borrower’s revenue, the factor set named with its version and checksum, and beneath it what would raise the score. Clear the revenue and the preview falls to Option 3b at score 5 on the outstanding alone. Press Record.',
      note: 'Most borrowers on a Sri Lankan book cannot state their emissions, and a lending book is priced anyway: the sector factor library and the baselines behind it are the regional judgement this instrument holds, provisional and disclosed as such. The score says how far the figure is from the borrower’s own — a reported figure earns 2, a verified one 1 — and the list beneath the score is what to go back to the borrower for.',
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

  /* Eight steps, one candidate from the door to the Fund: where the entity
     stands and what is blocking it, for the chief executive; then one
     candidate comes in on the intake form already filled from the example
     the API serves, is read against the cycle, screened and structured,
     assessed and signed off by a named assessor, packaged for a Concept
     Note, and is in the file the pipeline yields. */
  const GCF_STEPS = [
    {
      title: 'Where we stand — the pipeline on one screen',
      page: 'gcf-overview',
      apply: () => { forget(GCF_OVERVIEW_INTENT); forget(GCF_INTENT); },
      action: 'GCF Overview. The accredited entity over its candidate pipeline: the GCF ask and the money by source; how many candidates the accreditation gate lets through, flags or excludes; where each sits on the ten-stage project activity cycle; how many assessments a named assessor has signed; and lifetime mitigation with the adaptation co-benefit on its own line.',
      note: 'Every figure on this screen is one the portfolio returned; the screen draws it and adds nothing. Accreditation is a gate, not a score — Board decision B.36/10 — and an excluded candidate is one the entity cannot carry as the accredited entity, never one ranked down.',
    },
    {
      title: 'What is blocking, and who holds the key',
      page: 'gcf-overview',
      apply: () => remember(GCF_OVERVIEW_INTENT, 'behind:gaps'),
      action: 'The same screen, with the register open behind the figure: every open item the engines raised — what the stage needs, what the six criteria lack, whether the assessment is signed, what the assessor returned — grouped by who closes it: the bank, the sponsor, the NDA, the Fund, the co-financiers, a gender specialist, the affected communities, the assessor. By candidate, furthest along first.',
      note: 'Nothing here is judged afresh: each item carries the clause that asks for it and the fact that clears it. A gap does not stop a stage move; it travels with the candidate. This is the worklist between a pipeline entry and a submission, written down.',
    },
    {
      title: 'A candidate comes in',
      page: 'gcf',
      apply: () => remember(GCF_INTENT, 'intake:example'),
      action: 'GCF Pipeline, on the intake form, already filled from the example candidate the API serves — a tea-factory biomass and rooftop-solar credit line — with every figure carrying its evidence tier: modelled, declared, benchmark or measured. Run the pre-check above it if you like; then press Record.',
      note: 'A bare number is refused at the door: a benchmark grid factor would otherwise become a measured fact by the time it reaches a submission. The evidence tiers are GCF appraisal classes and never PCAF’s 1–5 scale. The pre-check answers in plain words from the accreditation — a category A design is a stop under B.36/10, with the separable component named.',
    },
    {
      title: 'On the cycle — what this stage holds, and what the next will ask for',
      page: 'gcf',
      apply: () => remember(GCF_INTENT, 'open:latest'),
      action: 'The candidate just recorded is open: its place on the ten stages, what this stage holds, partly holds or is missing — each with the clause — the next step and who takes it, and the Fund’s dates as projections marked as such: six weeks for concept-note feedback, nine months to the Board.',
      note: 'Held means the record holds the fact; whether it is enough is for the Secretariat and the iTAP. A projected date names the service standard it rests on and is never listed beside a recorded date without the label.',
    },
    {
      title: 'Screened and structured — two rankings, never merged',
      page: 'gcf',
      apply: () => remember(GCF_INTENT, 'panel:decision'),
      action: 'The decision tab: the gate, then two ranked lists — mitigation on carbon per dollar, adaptation on beneficiaries per dollar — which two the engine recommends for a Concept Note, and the three criteria it names unscored. On the Instruments tab beside it, the structure that answers each candidate’s recorded barriers and the barrier it leaves standing.',
      note: 'One league table on carbon per dollar puts every adaptation project last; the sort key decides that, not the projects. Three of the six investment criteria rest on judgement this system does not hold and are named unscored, with reasons. An instrument that needs the grant modality is a mandate question, not a low score.',
    },
    {
      title: 'Assessed and signed — by a named assessor',
      page: 'gcf',
      apply: () => remember(GCF_INTENT, 'validate:latest'),
      action: 'The same candidate, on the assessor’s form with its controls marked. Press Start review, rate the six criteria in words — strong, adequate, weak — beside the evidence the record holds for each, record a recommendation, then Validate and sign off. The assessment is frozen, dated and attributed; the signable assessment report is one press beside it.',
      note: 'The ratings are words and never a number, because a number here would be read as a GCF or a PCAF score. Validating is the assessor’s own permission, kept apart from writing the book. A validated assessment can only be reopened, never edited in place, and every move is on its audit trail. It is the bank’s own appraisal, not a decision of the Fund.',
    },
    {
      title: 'The Concept Note package — what is held, and what only people can supply',
      page: 'gcf',
      apply: () => remember(GCF_INTENT, 'cn:latest'),
      action: 'The Concept Note tab, on the same candidate: every input laid out in GCF’s A–H order and marked held, partial or external, the readiness figure that measures what is held rather than how close the submission is, and the external worklist — the NDA’s no-objection, the gender assessment, the co-financing letters. Press PDF.',
      note: 'This does not write the Concept Note. The external list is the deliverable most people actually need: the worklist between a pipeline entry and a submission. A package is never complete while an external input is outstanding.',
    },
    {
      title: 'In the file — the GCF disclosure, in one press',
      page: 'gcf-overview',
      apply: () => remember(GCF_OVERVIEW_INTENT, 'file:gcf'),
      action: 'Back on the overview: the signed count has moved and the register is shorter. Press GCF disclosure — PDF, the marked button. The document opens on its cover with a reference derived from its content, and reads in the standard’s order: governance, strategy, risk management, then the lines a pipeline can answer — SLFRS S2 §29(d) and §29(e), emissions avoided and reduced stated apart — with §29(a) absent by rule and the checklist answered from the document itself.',
      note: 'A pipeline of financed projects is not the entity’s inventory: the inventory lines are absent with where the figure actually comes from, and nothing is netted against them. A statement the entity has not made prints as not stated with its clause; nothing is written on the bank’s behalf, and an item can answer No.',
    },
  ];

  /* Two walkthroughs over one product, one per page. The strip carries
     whichever is on. */
  const TRACKS = {
    financed: { label: 'SLFRS S2 — one loan', title: 'The seven steps — one loan, from the door to the file',
      hint: 'The position and the SLFRS S2 file first; then one loan comes in with every field already filled, a second that does not know its emissions is priced on the held sector factor, the engine’s answer is read, it is reviewed and approved, and it is on the dashboard and in the file.', steps: STEPS },
    gcf: { label: 'GCF — one candidate', title: 'The eight steps — one candidate, from the door to the Fund',
      hint: 'Where the entity stands and what is blocking it first; then one candidate comes in on the intake form already filled, is read against the ten-stage cycle, screened and structured, assessed and signed off by a named assessor, packaged for a Concept Note, and is in the GCF disclosure the pipeline yields.', steps: GCF_STEPS },
  };

  const call = path => (typeof window.CARBONIQ_fetch === 'function'
    ? window.CARBONIQ_fetch(path) : fetch(path)).then(async r => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { const err = new Error(body.message || `${r.status}`); err.status = r.status; err.code = body.error; throw err; }
    return body;
  });
  const partA = path => call(`/v1/pcaf/part-a${path}`);

  const SCREEN = { bank: 'Bank Overview', 'parta-register': 'Lending Book', 'parta-position': 'Financed Emissions', 'gcf-overview': 'GCF Overview', gcf: 'GCF Pipeline' };
  const ready = (yes, word) => `<span class="wt-state ${yes ? 'wt-ready' : 'wt-needed'}">${esc(word || (yes ? 'Ready' : 'Needed'))}</span>`;
  const opener = (page, label, apply) => `<button type="button" class="btn btn-secondary wt-open" data-page="${esc(page)}" ${apply ? `data-apply="${esc(apply)}"` : ''}>${esc(label)}</button>`;
  const rowsHtml = rows => rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="partc-hint">${r[2]}</td><td>${r[3]}</td></tr>`).join('');

  // ── the strip that follows the presenter ───────────────────

  /* The pages that have initialised, so the strip can tell each to show
     Start or End. */
  const pages = new Set();
  const syncPages = () => { for (const pg of pages) pg.syncControls(); };

  function state() {
    try {
      const s = JSON.parse(recall(STATE_KEY) || 'null');
      if (!s || !Number.isInteger(s.step)) return null;
      return { track: TRACKS[s.track] ? s.track : 'financed', step: s.step, open: s.open !== false };
    } catch (_) { return null; }
  }
  const stepsOf = s => (TRACKS[s.track] || TRACKS.financed).steps;

  /* Whether the page a step names is the one on screen now. */
  const onPage = page => { const el = document.getElementById(`page-${page}`); return Boolean(el && el.offsetParent !== null); };

  function go(trackKey, i, navigate) {
    const step = (TRACKS[trackKey] || TRACKS.financed).steps[i];
    if (!step) return;
    const prior = state();
    remember(STATE_KEY, JSON.stringify({ track: trackKey, step: i, open: prior ? prior.open : true }));
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
    forget(STATE_KEY); forget(BANK_INTENT); forget(REGISTER_INTENT); forget(GCF_OVERVIEW_INTENT); forget(GCF_INTENT);
    renderStrip();
  }

  function renderStrip() {
    const strip = $('wt-strip');
    if (!strip) return;
    const s = state();
    if (!s || !stepsOf(s)[s.step]) { strip.hidden = true; syncPages(); return; }
    const list = stepsOf(s);
    const step = list[s.step];
    strip.hidden = false;
    say('wt-strip-n', `Step ${s.step + 1} of ${list.length}`);
    setHtml('wt-strip-dots', list.map((_, i) => `<i class="${i < s.step ? 'is-done' : i === s.step ? 'is-on' : ''}"></i>`).join(''));
    say('wt-strip-title', step.title);
    say('wt-strip-action', step.action);
    say('wt-strip-say', step.note);
    show('wt-strip-say-row', Boolean($('wt-strip-notes') && $('wt-strip-notes').checked));
    $('wt-strip-back').disabled = s.step === 0;
    $('wt-strip-next').textContent = s.step === list.length - 1 ? 'Finish' : 'Next';
    /* The detail opens only on the step's own screen, and only while the
       presenter has not hidden it; on any other screen the bar is one line
       that says where the step is. A walkthrough must never cover the
       screen a reader came to see. */
    const here = onPage(step.page);
    const open = here && s.open;
    strip.classList.toggle('is-open', open);
    say('wt-strip-where', here ? '' : `on ${SCREEN[step.page] || step.page}`);
    const min = $('wt-strip-min');
    if (min) { min.hidden = !here; min.textContent = s.open ? 'Hide' : 'Show'; min.setAttribute('aria-expanded', String(open)); }
    syncPages();
  }

  function toggleOpen() {
    const s = state();
    if (!s) return;
    remember(STATE_KEY, JSON.stringify({ track: s.track, step: s.step, open: !s.open }));
    renderStrip();
  }

  function wireStrip() {
    on('wt-strip-back', 'click', () => { const s = state(); if (s && s.step > 0) go(s.track, s.step - 1, true); });
    on('wt-strip-next', 'click', () => { const s = state(); if (!s) return; if (s.step >= stepsOf(s).length - 1) end(); else go(s.track, s.step + 1, true); });
    on('wt-strip-open', 'click', () => { const s = state(); if (s) go(s.track, s.step, true); });
    on('wt-strip-end', 'click', end);
    on('wt-strip-notes', 'change', renderStrip);
    on('wt-strip-min', 'click', toggleOpen);
  }

  let stripWired = false;

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

  /* The strip lives in the shell and is wired once, before any page loads,
     so a walkthrough begun before a reload is on screen again after it. */
  function mount() {
    if (stripWired) return;
    stripWired = true;
    window.CARBONIQ_cue = cueControl;
    wireStrip();
    /* The strip follows the page the shell shows: open on the step's own
       screen, one line everywhere else. The shell announces each page. */
    document.addEventListener('carboniq:page', renderStrip);
    renderStrip();
  }

  // ── a page: one track, one fragment, ids under one prefix ──

  function pageFor(key, prefix) {
    const t = TRACKS[key];
    const id = name => `${prefix}-${name}`;
    let year = '';

    async function loadYears() {
      let years = [];
      try { ({ years } = await partA('/years')); } catch (_) { years = []; }
      const sel = $(id('year'));
      const chosen = sel ? sel.value : '';
      const list = years.map(y => String(y.reportingYear));
      if (!list.length) list.push(String(new Date().getFullYear()));
      setHtml(id('year'), list.map(y => `<option value="${esc(y)}">${esc(y)}</option>`).join(''));
      if (sel) { sel.value = list.includes(chosen) ? chosen : list[list.length - 1]; year = sel.value; }
    }

    // ── readiness, read off the position ───────────────────────

    async function loadFinanced() {
      year = $(id('year')) ? $(id('year')).value : year;
      say(id('status'), 'Reading the position…');
      let position = null, refusal = null;
      try { position = await partA(`/financed-emissions/${encodeURIComponent(year)}`); } catch (err) { refusal = err; }
      let document_ = null;
      if (position) {
        try { ({ report: document_ } = await partA(`/financed-emissions/${encodeURIComponent(year)}/disclosure?format=json`)); } catch (_) { document_ = null; }
      }
      renderReadiness(position, refusal, document_);
      const e = (position && position.entity) || {};
      say(id('entity'), e.reportingEntity || 'Reporting entity not stated');
      say(id('subtitle'), position ? `FY${position.reportingYear} · ${position.exposures} exposure(s)` : `FY${year}`);
      say(id('status'), position ? 'Every row below is read off the position for this year.' : (refusal ? refusal.message : ''));
    }

    function renderReadiness(p, refusal, doc) {
      const rows = [];
      if (!p) {
        rows.push(['The bank’s book', ready(false), esc(refusal ? refusal.message : 'No position for this year.'), opener('bank', 'Open Bank Overview')]);
        setHtml(id('readiness-rows'), rowsHtml(rows));
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
      setHtml(id('readiness-rows'), rowsHtml(rows));
    }

    /* The GCF day: every row a field a route returned — the portfolio, the gap
       register, the entity's own facts and the report. */
    async function loadGcf() {
      say(id('status'), 'Reading the pipeline…');
      let p = null, reg = null, entity = null, report = null, refusal = null;
      try {
        const [a, b, c, d] = await Promise.all([call('/v1/gcf/portfolio'), call('/v1/gcf/gaps'), call('/v1/gcf/entity'), call('/v1/gcf/report')]);
        p = a; reg = b.register; entity = c.entity; report = d.report;
      } catch (err) { refusal = err; }
      renderGcfReadiness(p, reg, entity, report, refusal);
      const name = report && report.basis && report.basis.entity && typeof report.basis.entity === 'string' ? report.basis.entity : null;
      say(id('entity'), name || 'Reporting entity not stated');
      say(id('subtitle'), p ? `${esc(p.portfolio.count)} candidate(s) on the ${p.sample ? 'illustrative' : 'recorded'} pipeline` : 'GCF pipeline');
      say(id('status'), p ? 'Every row below is read off the pipeline, the register and the report.' : (refusal ? refusal.message : ''));
    }

    function renderGcfReadiness(p, reg, entity, report, refusal) {
      const rows = [];
      if (!p || !reg || !report) {
        rows.push(['The pipeline', ready(false), esc(refusal ? refusal.message : 'The pipeline could not be read.'), opener('gcf-overview', 'Open GCF Overview')]);
        setHtml(id('readiness-rows'), rowsHtml(rows));
        return;
      }
      const pf = p.portfolio;
      rows.push(['The entity’s own pipeline', ready(!p.sample, p.sample ? 'Illustrative' : 'Recorded'),
        p.sample ? 'The shipped illustrative set is showing; load the starter projects from the GCF Overview, or record a candidate on the Pipeline tab' : `${esc(pf.count)} candidate(s) recorded`, opener('gcf-overview', 'Open GCF Overview')]);
      const name = report.basis && typeof report.basis.entity === 'string' ? report.basis.entity : null;
      rows.push(['The entity’s name', ready(Boolean(name)), name ? `${esc(name)} — on the cover of the disclosure` : 'Not stated; record it under Reporting → Entity facts on the Pipeline tab', opener('gcf', 'Open the Pipeline tab', 'panel:reporting')]);
      const acc = entity && entity.accreditation;
      rows.push(['The accreditation every gate reads', ready(Boolean(acc), acc ? 'Recorded' : 'As shipped'),
        acc ? `Board decision ${esc(acc.decision || '')}, recorded by the entity` : `Board decision ${esc(pf.envelope.decision || '')} as shipped; record the entity’s own under Reporting → Accreditation`, opener('gcf', 'Open the Pipeline tab', 'panel:reporting')]);
      const a = pf.assessment || {};
      rows.push(['A signed assessment', ready(Number(a.validated) > 0, Number(a.validated) > 0 ? 'Signed' : 'None yet'),
        `${esc(a.validated)} validated · ${esc(a.underReview)} under review · ${esc(a.draft)} draft — step 6 signs one live`, opener('gcf-overview', 'Open GCF Overview')]);
      const tt = reg.totals || {};
      rows.push(['What is blocking', ready(true, `${tt.now} item(s)`),
        `${esc(tt.project)} on ${esc(tt.blocked)} of ${esc(tt.projects)} candidate(s) · ${esc(tt.entity)} on the entity’s own statements — the register step 2 opens`, opener('gcf-overview', 'Open GCF Overview')]);
      rows.push(['The entity’s own statements', ready(Number(tt.entity) === 0, Number(tt.entity) === 0 ? 'Stated' : `${tt.entity} not stated`),
        Number(tt.entity) === 0 ? 'Governance, strategy, risk management and targets are on the record' : (reg.entity.items || []).map(x => esc(x.what)).join(' · '), opener('gcf', 'Open the Pipeline tab', 'panel:reporting')]);
      const yes = (report.checklist || []).filter(i => i.met).length;
      rows.push(['The GCF disclosure', ready(true, `${yes} of ${(report.checklist || []).length}`),
        `${esc(yes)} of ${esc((report.checklist || []).length)} checklist items answered Yes; the inventory item stays No by rule — download the PDF once from the GCF Overview so the first render on the day is not the first on the site`, opener('gcf-overview', 'Open GCF Overview')]);
      setHtml(id('readiness-rows'), rowsHtml(rows));
    }

    function renderSteps() {
      setHtml(id('steps'), t.steps.map((s, i) => `
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
      const host = $(id('readiness-rows'));
      const rows = host ? host.querySelectorAll('.wt-state') : [];
      let readyN = 0, needed = 0;
      for (const el of rows) { if (el.classList.contains('wt-ready')) readyN += 1; else needed += 1; }
      setHtml(id('summary'), rows.length
        ? `<span class="wt-sum"><b>${readyN}</b> ready</span><span class="wt-sum"><b>${needed}</b> needed</span><span class="wt-sum"><b>${t.steps.length}</b> steps</span>`
        : '');
    }

    async function load() {
      say(id('steps-title'), t.title); say(id('steps-hint'), t.hint);
      if (key === 'gcf') await loadGcf(); else await loadFinanced();
      renderSummary();
      renderSteps();
    }

    /* Start is offered while no walkthrough is on; End while one is — on
       either page, whichever started it. */
    function syncControls() {
      const s = state();
      show(id('start'), !s); show(id('end'), Boolean(s));
    }

    async function init() {
      mount();
      pages.add(page);
      on(id('refresh'), 'click', load);
      on(id('year'), 'change', load);
      on(id('start'), 'click', () => go(key, 0, true));
      on(id('end'), 'click', end);
      on(id('steps'), 'click', ev => {
        const b = ev.target && ev.target.closest ? ev.target.closest('.wt-go') : null;
        if (b) go(key, Number(b.getAttribute('data-step')), true);
      });
      on(id('readiness-rows'), 'click', ev => {
        const b = ev.target && ev.target.closest ? ev.target.closest('.wt-open') : null;
        if (!b) return;
        const apply = b.getAttribute('data-apply') || '';
        if (apply.startsWith('class:')) remember(CLASS_KEY, apply.slice(6));
        if (apply.startsWith('panel:')) remember(GCF_INTENT, apply);
        nav(b.getAttribute('data-page'));
      });
      /* The bank's page has a year selector and it is settled before the
         first request; the GCF page reads the whole pipeline and has none. */
      if (key === 'financed') {
        await loadYears();
        await load();
      } else {
        await load();
      }
      syncControls();
    }

    function refresh() {
      return load();
    }

    const page = { init, refresh, load, syncControls };
    return page;
  }

  const financed = pageFor('financed', 'wt');
  const gcf = pageFor('gcf', 'gwt');

  return { init: financed.init, refresh: financed.refresh, load: financed.load, gcf, mount, STEPS, GCF_STEPS, TRACKS };
})();

/* The GCF Walkthrough page: the same module, the other track, its own ids. */
const GCFWalkthroughPage = WalkthroughPage.gcf;

/* The strip is part of the shell: mount it as soon as the script loads so
   it is on screen whatever page a reload lands on. */
if (typeof document !== 'undefined' && document.getElementById('wt-strip')) WalkthroughPage.mount();
