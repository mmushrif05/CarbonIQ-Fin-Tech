/* ============================================================
   Mobile navigation drawer

   Only active below 768px, where the shell hides the sidebar and
   leaves no way to change page. Adds a frosted top bar with a
   toggle, a slide-over drawer and a scrim.

   Keeps itself out of the way on desktop: the elements exist but
   the CSS hides them, and no listener changes desktop behaviour.
   ============================================================ */

const MobileNav = (() => {
  'use strict';

  let bar, scrim, toggle, title;

  const isOpen  = () => document.body.classList.contains('mobile-nav-open');
  const close   = () => { document.body.classList.remove('mobile-nav-open'); sync(); };
  const open    = () => { document.body.classList.add('mobile-nav-open');    sync(); };
  const toggleD = () => (isOpen() ? close() : open());

  function sync() {
    if (toggle) toggle.setAttribute('aria-expanded', String(isOpen()));
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.setAttribute('aria-hidden', String(!isOpen() && window.innerWidth <= 768));
  }

  /** Mirror the active page name into the mobile bar. */
  function setTitle(text) { if (title) title.textContent = text || 'CarbonIQ'; }

  function build() {
    if (document.querySelector('.mobile-navbar')) return;

    bar = document.createElement('header');
    bar.className = 'mobile-navbar';
    bar.innerHTML = `
      <button class="mobile-nav-toggle" type="button"
              aria-label="Open navigation" aria-expanded="false" aria-controls="appSidebar">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
      <span class="mobile-navbar-title">CarbonIQ</span>`;

    scrim = document.createElement('div');
    scrim.className = 'mobile-nav-scrim';

    const main = document.querySelector('.main');
    if (main && main.parentNode) main.parentNode.insertBefore(bar, main);
    else document.body.prepend(bar);
    document.body.appendChild(scrim);

    const sidebar = document.querySelector('.sidebar');
    if (sidebar && !sidebar.id) sidebar.id = 'appSidebar';

    toggle = bar.querySelector('.mobile-nav-toggle');
    title  = bar.querySelector('.mobile-navbar-title');

    toggle.addEventListener('click', toggleD);
    scrim.addEventListener('click', close);

    // Choosing a destination should dismiss the drawer.
    document.querySelectorAll('.nav-item').forEach(item =>
      item.addEventListener('click', () => {
        setTitle(item.textContent.trim());
        close();
      }));

    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(); });
    window.addEventListener('resize', () => { if (window.innerWidth > 768 && isOpen()) close(); });

    const active = document.querySelector('.nav-item.active');
    if (active) setTitle(active.textContent.trim());
    sync();
  }

  function init() { build(); }

  return { init, open, close, setTitle };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => MobileNav.init());
} else {
  MobileNav.init();
}
