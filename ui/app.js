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
  'ai-extract':  { title: 'AI BOQ Extractor',   subtitle: 'Paste any BOQ — Claude maps materials to ICE v3 carbon factors' },
  'new-project': { title: 'New Project',         subtitle: 'Submit a construction project for scoring' },
  'pcaf':        { title: 'PCAF Calculator',     subtitle: 'Compute financed emissions attribution' },
  'monitoring':  { title: 'Monitoring',          subtitle: 'Track project emissions over time' },
  'reports':         { title: 'Reports',             subtitle: 'Generate PCAF · GRI 305 · TCFD · IFRS S2 · SLGFT CBSL disclosure reports' },
  'taxonomy':        { title: 'Taxonomy',            subtitle: 'Check regional taxonomy alignment' },
  'pipeline':        { title: 'Pipelines',            subtitle: 'Multi-agent supervisor workflows — orchestrate screening · origination · covenant design' },
  'carbon-pricing':  { title: 'Carbon Pricing',      subtitle: 'Quantify carbon tax exposure · loan pricing adjustments · stranded asset risk' },
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

    // Lazy-load dynamic pages on first visit
    if (DYNAMIC_PAGES[pageId] && !target.dataset.loaded) {
      await _loadPageFragment(target, pageId);
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
