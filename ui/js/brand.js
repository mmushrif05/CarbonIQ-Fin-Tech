/* ============================================================
   CarbonIQ — the Datum Solutions mark

   One source. The lockup, the name and the legal name are defined
   once here and rendered into every `[data-brand]` placeholder in
   the shell, so the sidebar, the login screen and the page footer
   can never drift from one another — the same discipline the
   deployment already applies to the UI API key, which used to be
   a literal in two places and was wrong in one of them.

   The artwork is the supplied lockup, not a redrawing of it. The
   brand rules that come with it are followed rather than
   reinterpreted: height is set and width follows (the lockup is
   2.70 : 1), it is never recoloured or stretched, and the
   knocked-out white variant is used on the dark sidebar rather
   than the colour one.

   Because the lockup already reads DATUM SOLUTIONS, no text
   wordmark is rendered beside it — that would say the name twice.
   The name survives as the image's alt text, so it is announced
   once and copies correctly.

   Assets and the brand sheet live in `ui/brand/`.
   ============================================================ */

const Brand = (() => {

  const LOGO = {
    name: 'Datum Solutions',
    legalName: 'Datum Solutions (Private) Limited',
    product: 'CarbonIQ FinTech',
    base: 'brand/',

    /* Two files, one lockup. Which one shows is decided in CSS by the
       surface behind it, not here: the sidebar is dark in every theme, and
       the page follows the viewer's. Sizing is by height only. */
    lockup: (variant) => {
      const light = `<img class="brand-lockup-img is-on-light" src="${LOGO.base}datum-lockup.png"`
        + ` alt="${LOGO.name}" width="451" height="167" decoding="async">`;
      const dark = `<img class="brand-lockup-img is-on-dark" src="${LOGO.base}datum-lockup-white.png"`
        + ` alt="${LOGO.name}" width="451" height="167" decoding="async">`;
      /* The sidebar is dark whatever the page theme is, so it takes the
         knocked-out variant outright rather than switching. */
      if (variant === 'onDark') return dark;
      return light + dark;
    },
  };

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* Three placements, one lockup. Each says the same thing at a different
     weight: the sidebar attributes the product, the footer signs the page,
     the login screen introduces the company. */
  const VARIANTS = {
    sidebar: () => `
      <span class="brand-lockup brand-lockup-sidebar">
        <span class="brand-eyebrow">A product of</span>
        ${LOGO.lockup('onDark')}
      </span>`,

    footer: () => `
      <span class="brand-lockup brand-lockup-footer">
        ${LOGO.lockup()}
        <span class="brand-meta">${esc(LOGO.legalName)} &middot; ${esc(LOGO.product)}
          &middot; &copy; ${new Date().getFullYear()}</span>
      </span>`,

    /* The sign-in screen has its own dark styling in css/login.css and is dark
       in every theme, so it takes the knocked-out variant outright — the same
       as the sidebar. The colour lockup on that ground is navy on near-black,
       which is illegible and is the one thing the brand sheet forbids. */
    login: () => `
      <span class="brand-lockup brand-lockup-login">
        <span class="brand-eyebrow">A product of</span>
        ${LOGO.lockup('onDark')}
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
