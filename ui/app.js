/* ============================================================
   CarbonIQ — Navigation & Interactions
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page');
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');

  const pageMeta = {
    'dashboard':   { title: 'Dashboard',        subtitle: 'Portfolio carbon overview' },
    'portfolio':   { title: 'Portfolio',         subtitle: 'Aggregated emissions analysis' },
    'new-project': { title: 'New Project',       subtitle: 'Submit a construction project for scoring' },
    'pcaf':        { title: 'PCAF Calculator',   subtitle: 'Compute financed emissions attribution' },
    'monitoring':  { title: 'Monitoring',        subtitle: 'Track project emissions over time' },
    'reports':     { title: 'Reports',           subtitle: 'Generate PCAF v3 disclosure reports' },
    'taxonomy':    { title: 'Taxonomy',          subtitle: 'Check regional taxonomy alignment' },
  };

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = item.dataset.page;

      // Update active nav
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      // Show page
      pages.forEach(p => {
        p.style.display = 'none';
      });
      const target = document.getElementById('page-' + pageId);
      if (target) {
        target.style.display = 'block';
        // Re-trigger animation
        target.style.animation = 'none';
        target.offsetHeight; // force reflow
        target.style.animation = '';
      }

      // Update header
      const meta = pageMeta[pageId] || { title: pageId, subtitle: '' };
      pageTitle.textContent = meta.title;
      pageSubtitle.textContent = meta.subtitle;
    });
  });

  // DQ selector interactivity
  const dqOptions = document.querySelectorAll('.dq-option input');
  dqOptions.forEach(opt => {
    opt.addEventListener('change', () => {
      document.querySelectorAll('.dq-option-card').forEach(c => c.classList.remove('selected'));
      opt.closest('.dq-option').querySelector('.dq-option-card').classList.add('selected');
    });
  });

  // Chip toggle
  document.querySelectorAll('.chart-controls .chip, .filter-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
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
