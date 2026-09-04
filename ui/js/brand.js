/* ============================================================
   CarbonIQ — the Datum Solutions mark

   One source. The mark, the name and the legal name are defined
   once here and rendered into every `[data-brand]` placeholder
   in the shell, so the sidebar, the login screen and the page
   footer can never drift from one another — the same discipline
   the deployment already applies to the UI API key, which used
   to be a literal in two places and was wrong in one of them.

   ── Replacing this with the supplied logo file ──────────────
   Drop the file in `ui/assets/` and change LOGO.mark below to
   return an <img>:

       mark: () => '<img src="assets/datum-logo.svg" alt="" '
                 + 'class="brand-logo-img">',

   Nothing else changes. Every placement picks it up, because
   every placement reads it from here.

   The mark drawn below is geometric rather than pictorial and
   inherits `currentColor`, so it reads on both the dark sidebar
   and the light page without a second asset — a second colour
   variant is a second thing to keep in step.

   What it draws is the surveyor's benchmark: a reference line
   with a levelling triangle standing on it. A datum IS a
   reference point, so the mark says the company's name rather
   than decorating it.
   ============================================================ */

const Brand = (() => {

  const LOGO = {
    name: 'Datum Solutions',
    legalName: 'Datum Solutions (Private) Limited',
    product: 'CarbonIQ FinTech',
    /* Inherits currentColor. Sized by the CSS class, never by an attribute,
       so one rule changes every placement. */
    mark: () => `
      <svg class="brand-logo-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="M3 19h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M6.4 6h11.2L12 16.4 6.4 6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="12" cy="9.7" r="1.9" fill="currentColor"/>
      </svg>`,
  };

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* A real space between the two words, not a flex gap. A gap looks identical
     and copies as "DatumSolutions", which is what a screen reader announces
     and what lands in a pasted citation. */
  const wordmark = () =>
    `<span class="brand-word"><b>${esc(LOGO.name.split(' ')[0])}</b> `
    + `<span>${esc(LOGO.name.split(' ').slice(1).join(' '))}</span></span>`;

  /* Three placements, one lockup. Each says the same thing at a different
     weight: the sidebar attributes the product, the footer signs the page,
     the login screen introduces the company. */
  const VARIANTS = {
    sidebar: () => `
      <span class="brand-lockup brand-lockup-sidebar">
        <span class="brand-eyebrow">A product of</span>
        ${LOGO.mark()}${wordmark()}
      </span>`,

    footer: () => `
      <span class="brand-lockup brand-lockup-footer">
        ${LOGO.mark()}${wordmark()}
        <span class="brand-meta">${esc(LOGO.legalName)} &middot; ${esc(LOGO.product)}
          &middot; &copy; ${new Date().getFullYear()}</span>
      </span>`,

    login: () => `
      <span class="brand-lockup brand-lockup-login">
        <span class="brand-eyebrow">A product of</span>
        ${LOGO.mark()}${wordmark()}
      </span>`,
  };

  /**
   * Fill every placeholder in the document.
   *
   * Idempotent, and safe to call again after markup is injected — a page
   * fragment loaded later can carry its own `[data-brand]` and simply call
   * this again. Already-rendered placeholders are skipped rather than
   * rebuilt, so the DOM is not churned on every navigation.
   */
  function render(root = document) {
    const nodes = root.querySelectorAll('[data-brand]');
    nodes.forEach((el) => {
      if (el.dataset.brandRendered === 'true') return;
      const build = VARIANTS[el.dataset.brand] || VARIANTS.footer;
      el.innerHTML = build();
      el.dataset.brandRendered = 'true';
    });
    return nodes.length;
  }

  return { render, LOGO, VARIANTS };
})();

/* The shell's own placeholders exist before any page loads, so they are filled
   as soon as the document is parsed rather than waiting on a navigation. */
document.addEventListener('DOMContentLoaded', () => Brand.render());
