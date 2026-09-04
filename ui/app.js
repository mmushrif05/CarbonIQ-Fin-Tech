/* ============================================================
   CarbonIQ — Navigation & Interactions
   ============================================================ */

/**
 * Page metadata: title + subtitle shown in the topbar.
 * Add a new entry here whenever a new page is created.
 */
const PAGE_META = {
  'dashboard':   { title: 'Dashboard',          subtitle: 'Portfolio carbon overview' },
  'portfolio':   { title: 'Portfolio',           subtitle: 'Aggregated emissions analysis' },
  'ai-agents':   { title: 'AI Agents',           subtitle: '8-stage green loan lifecycle agents — Coach · Originate · Screen · Underwrite · Triage · Covenants · Monitor · Portfolio' },
  'ai-extract':  { title: 'AI BOQ Extractor',   subtitle: 'Automated mapping of bill-of-quantities lines to ICE v3 carbon factors' },
  'new-project': { title: 'New Project',         subtitle: 'Submit a construction project for scoring' },
  'pcaf':        { title: 'PCAF Calculator',     subtitle: 'Compute financed emissions attribution (A1-A3, lending)' },
  'partc-book':  { title: 'Insurance Book',      subtitle: 'Clients, projects and the policies written against them' },
  'partc-portfolio': { title: 'Reporting Year',  subtitle: 'The insurer position for a reporting year — locked assessments, summed per policy' },
  'pcaf-parta':  { title: 'PCAF Part A',         subtitle: 'Financed emissions for lending — attribution, scope 1 and 2, data quality by option. Manual entry.' },
  'pcaf-partc':  { title: 'PCAF Part C',         subtitle: 'Insurance-associated emissions — construction A4+A5 · use-stage separate' },
  'pcaf-demo':   { title: 'Live Walkthrough',  subtitle: 'PCAF Part C computed live — change an input and see what moves' },
  'monitoring':  { title: 'Monitoring',          subtitle: 'Track project emissions over time' },
  'reports':         { title: 'Reports',             subtitle: 'Generate PCAF · GRI 305 · TCFD · IFRS S2 · SLGFT CBSL disclosure reports' },
  'taxonomy':        { title: 'Taxonomy',            subtitle: 'Check regional taxonomy alignment' },
  'pipeline':        { title: 'Pipelines',            subtitle: 'Multi-agent supervisor workflows — orchestrate screening · origination · covenant design' },
  'carbon-pricing':  { title: 'Carbon Pricing',      subtitle: 'Quantify carbon tax exposure · loan pricing adjustments · stranded asset risk' },
  'desk':            { title: 'Fund Desk', subtitle: 'Position, delivery, attributed emissions and the GCF pipeline' },
  'gcf':             { title: 'GCF Pipeline', subtitle: 'DFCC post-accreditation — candidate screening, emissions, disclosure and Concept Note inputs' },
  'ndc-sdg':         { title: 'NDC & SDG Alignment', subtitle: 'NDC 3.0 and SDG alignment under the Sri Lanka Green Finance Taxonomy' },
};

/**
 * Pages whose HTML is loaded dynamically from a separate file.
 * Key: page ID  →  Value: { src, init (function name on window) }
 */
const DYNAMIC_PAGES = {
  'ai-agents': {
    src:  'pages/agents.html',
    init: () => typeof AgentsPage !== 'undefined' && AgentsPage.init(),
  },
  'ai-extract': {
    src:  'pages/extract.html',
    init: () => typeof ExtractPage !== 'undefined' && ExtractPage.init(),
  },
  'reports': {
    src:  'pages/reports.html',
    init: () => typeof ReportsPage !== 'undefined' && ReportsPage.init(),
  },
  'pipeline': {
    src:  'pages/pipeline.html',
    init: () => typeof PipelinePage !== 'undefined' && PipelinePage.init(),
  },
  'carbon-pricing': {
    src:  'pages/carbon-pricing.html',
    init: () => typeof CarbonPricingPage !== 'undefined' && CarbonPricingPage.init(),
  },
  'pcaf-parta': {
    src:  'pages/pcaf-parta.html',
    init: () => typeof PCAFPartAPage !== 'undefined' && PCAFPartAPage.init(),
  },
  'pcaf-partc': {
    src:  'pages/pcaf-partc.html',
    init: () => typeof PCAFPartCPage !== 'undefined' && PCAFPartCPage.init(),
    // The position at the top of the screen changes whenever an assessment is
    // locked elsewhere, so a return visit re-reads the book rather than showing
    // what it said last time.
    refresh: () => typeof PCAFPartCPage !== 'undefined' && PCAFPartCPage.refresh(),
  },
  'pcaf-demo': {
    src:  'pages/pcaf-demo.html',
    init: () => typeof PCAFDemoPage !== 'undefined' && PCAFDemoPage.init(),
    // Every figure is fetched, never remembered, so a return visit re-asks
    // the engine rather than showing what it said last time.
    refresh: () => typeof PCAFDemoPage !== 'undefined' && PCAFDemoPage.refresh(),
  },
  'partc-book': {
    src:  'pages/partc-book.html',
    init: () => typeof PartCBook !== 'undefined' && PartCBook.init(),
  },
  'partc-portfolio': {
    src:     'pages/partc-portfolio.html',
    init:    () => typeof PartCPortfolio !== 'undefined' && PartCPortfolio.init(),
    // The reporting-year position changes whenever an assessment is locked on
    // another screen, so this page re-reads the period on every return visit.
    refresh: () => typeof PartCPortfolio !== 'undefined' && PartCPortfolio.refresh(),
  },
  'desk': {
    src:  'pages/desk.html',
    init: () => typeof DeskPage !== 'undefined' && DeskPage.init(),
    // A payment recorded on the Dashboard or a candidate adopted from the
    // pipeline changes this position, so a return visit re-reads it rather
    // than showing what it said last time.
    refresh: () => typeof DeskPage !== 'undefined' && DeskPage.refresh(),
  },
  'gcf': {
    src:  'pages/gcf.html',
    init: () => typeof GCFPage !== 'undefined' && GCFPage.init(),
    // Every panel is fetched, never remembered: a project recorded on the
    // intake sub-tab changes the pool, the ranking, the report and the
    // Concept Note package, so a return visit re-reads rather than showing
    // what it said last time.
    refresh: () => typeof GCFPage !== 'undefined' && GCFPage.refresh(),
  },
  'ndc-sdg': {
    src:  'pages/ndc-sdg.html',
    init: () => typeof NdcSdgPage !== 'undefined' && NdcSdgPage.init(),
  },
};

document.addEventListener('DOMContentLoaded', () => {
  // ── Enforce authentication on load ────────────────────────
  if (typeof Auth !== 'undefined') {
    Auth.enforceAuth();
  }

  const navItems  = document.querySelectorAll('.nav-item');
  const pageTitle    = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');

  // ── Navigate to a page ──────────────────────────────────────
  async function navigateTo(pageId) {
    // Role-based access check
    if (typeof Auth !== 'undefined' && !Auth.canAccessPage(pageId)) {
      Toast.error('Access denied — your role does not have permission to view this page.');
      return;
    }
    // Update active nav state
    navItems.forEach((n) => n.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Hide all pages
    document.querySelectorAll('.page').forEach((p) => { p.style.display = 'none'; });

    const target = document.getElementById('page-' + pageId);
    if (!target) return;

    // Lazy-load dynamic pages on first visit; on later visits give the page a
    // chance to re-read anything that may have moved while it was hidden.
    const firstVisit = !target.dataset.loaded;
    if (DYNAMIC_PAGES[pageId] && firstVisit) {
      await _loadPageFragment(target, pageId);
    } else if (DYNAMIC_PAGES[pageId] && DYNAMIC_PAGES[pageId].refresh) {
      try { await DYNAMIC_PAGES[pageId].refresh(); } catch (_) { /* page reports its own errors */ }
    }

    // Dashboard & Portfolio share live data from the same module
    if ((pageId === 'dashboard' || pageId === 'portfolio') && typeof Dashboard !== 'undefined') {
      Dashboard.init(); // idempotent — only fetches once
    }

    // Inline pages that need a one-time init on first visit
    if (pageId === 'pcaf' && !target.dataset.pcafInit) {
      target.dataset.pcafInit = 'true';
      if (typeof PCAFCalculator !== 'undefined') PCAFCalculator.init();
    }
    if (pageId === 'monitoring' && !target.dataset.monInit) {
      target.dataset.monInit = 'true';
      if (typeof Monitoring !== 'undefined') Monitoring.init();
    }
    if (pageId === 'new-project' && !target.dataset.npInit) {
      target.dataset.npInit = 'true';
      if (typeof NewProject !== 'undefined') NewProject.init();
    }
    if (pageId === 'taxonomy' && !target.dataset.taxInit) {
      target.dataset.taxInit = 'true';
      if (typeof Taxonomy !== 'undefined') Taxonomy.init();
    }

    // Reveal and animate
    target.style.display = 'block';
    target.style.animation = 'none';
    target.offsetHeight; // force reflow
    target.style.animation = '';

    // Update topbar
    const meta = PAGE_META[pageId] || { title: pageId, subtitle: '' };
    if (pageTitle)    pageTitle.textContent    = meta.title;
    if (pageSubtitle) pageSubtitle.textContent = meta.subtitle;
  }

  // ── Lazy-load an HTML fragment into a placeholder div ───────
  async function _loadPageFragment(container, pageId) {
    const config = DYNAMIC_PAGES[pageId];
    try {
      const response = await fetch(config.src);
      if (!response.ok) throw new Error(`Failed to load page fragment: ${config.src}`);
      container.innerHTML = await response.text();
      container.dataset.loaded = 'true';
      // Run the page module's init function (wires all event listeners)
      if (typeof config.init === 'function') config.init();
    } catch (err) {
      container.innerHTML = `
        <div style="padding:48px;text-align:center;color:var(--text-secondary);">
          <p style="font-size:14px;font-weight:600;margin-bottom:6px;">Page could not be loaded</p>
          <p style="font-size:12px;">${err.message}</p>
        </div>`;
      container.dataset.loaded = 'error';
    }
  }

  // ── Wire nav clicks ─────────────────────────────────────────
  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // Every page's data is loaded by navigateTo, and until now navigateTo was
  // only ever reached by clicking a nav item. A returning user — session
  // already in localStorage, page reloaded — was shown the Dashboard by the
  // inline display:block on #page-dashboard while Dashboard.init() never ran,
  // so the loader sat on "Loading portfolio data…" indefinitely. It looked
  // like a backend that never answered; nothing had asked it anything.
  //
  // Landing is therefore the same code path as clicking, so a page cannot be
  // visible without having been navigated to.
  window.CARBONIQ_navigateTo = navigateTo;

  function _landOnFirstPage() {
    const loggedIn = typeof Auth === 'undefined' || Auth.isLoggedIn();
    if (!loggedIn) return;   // the login screen owns the first navigation
    let landing = 'dashboard';
    if (typeof Auth !== 'undefined' && typeof Auth.getDefaultPage === 'function') {
      landing = Auth.getDefaultPage() || 'dashboard';
    }
    navigateTo(landing);
  }
  _landOnFirstPage();

  // ── DQ selector interactivity ────────────────────────────────
  document.querySelectorAll('.dq-option input').forEach((opt) => {
    opt.addEventListener('change', () => {
      document.querySelectorAll('.dq-option-card').forEach((c) => c.classList.remove('selected'));
      opt.closest('.dq-option')?.querySelector('.dq-option-card')?.classList.add('selected');
    });
  });

  // ── Chip toggles ─────────────────────────────────────────────
  document.querySelectorAll('.chart-controls .chip, .filter-chips .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      chip.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
});

// Show results animation (PCAF page)
function showResults() {
  const panel = document.getElementById('resultsPanel');
  if (panel) {
    panel.style.animation = 'none';
    panel.offsetHeight;
    panel.style.animation = 'fadeIn 0.4s ease';
  }
}
