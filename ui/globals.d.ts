/**
 * The globals this frontend actually has.
 *
 * There is no bundler and no module system here: every page module is a
 * `<script>` that puts one object on the global scope, and three pages define
 * theirs inline in their own HTML fragment, loaded at navigation time. That is
 * a real architecture with a real shape — it is just a shape the compiler
 * cannot read off the files, because nothing in `ui/js/` ever writes the
 * declaration down.
 *
 * So it is written down here, once. Without it every adopting file spends its
 * first fifty errors re-discovering that `window.CARBONIQ_fetch` exists, which
 * is the cost that kept `ui/js` outside the type check while it was the
 * largest consumer of these API responses and the place four mechanical
 * defects have shipped.
 *
 * A page object declared here and missing at runtime is still guarded at the
 * call site with `typeof X !== 'undefined'` — this file says what may exist,
 * not what must.
 */

/** The shell's own surface, established in `ui/config.js` and `ui/app.js`. */
interface Window {
  /** Origin the API is served from; empty string when same-origin. */
  CARBONIQ_API_BASE: string;
  /** Build stamp from `GET /v1/ui-config.js` — the running commit, not a secret. */
  CARBONIQ_BUILD?: { commit?: string; builtAt?: string; [key: string]: unknown };
  /** `fetch` with the session token, the request id and the error envelope applied. */
  CARBONIQ_fetch: (path: string, init?: RequestInit) => Promise<any>;
  /** Navigate the shell to a page id, as the sidebar does. */
  CARBONIQ_navigateTo: (pageId: string) => void;
  /** The capital adjust drawer, which must initialise before the first fetch. */
  CapitalAdjust?: { init: () => void; overlay: () => object | null; [key: string]: any };
  /**
   * The entity's own external-audit declaration, fetched once and cached for
   * the session: it is entity-level, so three screens fetching it separately
   * would be three chances for them to disagree.
   */
  CarbonIQAssurance?: {
    load: () => Promise<any>;
    render: (root: any) => Promise<any>;
    badgeHtml: (declaration: any) => string;
    forScope: (payload: any, scope: any) => any;
    [key: string]: any;
  };
  /** The last Part C result, held so the report button can re-render it. */
  _pcafCurrentResult?: any;
  /** The vendored markdown renderer. Never fetched from a CDN — see the CSP. */
  marked?: { parse: (src: string) => string; [key: string]: any };
}

/** A page module: an object with `init`, put on the global scope by its script. */
interface CarbonIQPage {
  init: () => void | Promise<void>;
  [key: string]: any;
}

/* Defined in `ui/config.js`, which every page loads before its own module. */
declare const Toast: {
  show: (message: string, kind?: 'info' | 'success' | 'warn' | 'error') => void;
  error: (message: string) => void;
  success: (message: string) => void;
  [key: string]: any;
};

/* The three pages whose module is declared inline in their own HTML fragment
   rather than in a file under `ui/js/`. They exist only once that fragment has
   been loaded, which is why every call site guards with `typeof`. */
declare const ReportsPage: CarbonIQPage | undefined;
declare const PipelinePage: CarbonIQPage | undefined;
declare const CarbonPricingPage: CarbonIQPage | undefined;
