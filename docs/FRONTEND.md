# The frontend — build, browser tests, the policy it runs under

Phase E5 of `docs/ENTERPRISE-READINESS.md` (gaps H1, H3, H4; G1 for the
type check).

## The build (H1)

`npm run build:ui` — `scripts/build-ui.js` — produces `dist/ui`, the
directory Netlify publishes, from `ui/`:

- every script and stylesheet minified with esbuild, a source map beside
  it (`1557 KB → 1212 KB` at the time of writing);
- every other file — the shell, the page fragments, the brand artwork, the
  data — copied as it is;
- `build-manifest.json` naming the commit and every file with its size.

Paths are preserved exactly, so nothing the shell fetches by path moves,
and top-level names are kept — the modules are classic scripts that reach
one another through globals, and esbuild does not rename top-level symbols
when it is not bundling. A module that does not parse fails the build
here, before it fails in a browser.

The local server serves `ui/` — the source — unless `UI_DIR=dist/ui`, which
is what the browser tests set. The source sweeps in `tests/*-ui.test.js`
read `ui/`; the browser tests drive `dist/ui`.

## Browser tests (H3)

`npm run test:e2e` — builds, starts the server on the memory store with a
test key, and runs `e2e/*.spec.js` in Chromium (`playwright.config.js`).
Five journeys:

1. sign in, see the sidebar and the mark, and read `/health`;
2. reach the Part C book and see a record the API just created;
3. every response the page asked for carried `X-Request-ID` and
   `X-Api-Envelope`;
4. the Content Security Policy reaches the browser and the page runs
   under it without a violation;
5. no page scrolls sideways at 430px.

They run in CI as the `ui` job; a failure uploads the Playwright report.
They are deliberately few: the source sweeps catch the mechanical faults
this codebase has shipped once each (`[hidden]` beaten by a class,
`display:block` on a bar, a `<select>` that will not shrink, a module
loaded after the first fetch); these catch what only a browser sees.

## The Content Security Policy (H4)

One policy, `src/platform/http/csp.js`, applied twice: helmet sends it on
everything the function answers; `netlify.toml` sends the same string on
everything the CDN serves. `tests/frontend.test.js` holds the two to each
other.

```
default-src 'self'; script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:;
connect-src 'self'; frame-ancestors 'none'; object-src 'none';
base-uri 'self'; form-action 'self'
```

What it closes: scripts from any origin but this one, framing by any other
site, plugins, a rewritten base URL, forms posting elsewhere. What it does
not close yet: **inline scripts**. The shell carries one inline controller
(the sign-in page) and forty-seven inline `onclick` handlers across the
pages; until those are event listeners, `'unsafe-inline'` stays on
`script-src`, and the policy says so in its own source rather than
pretending. That migration is the next step on this page, and the
directive is the one line to change when it lands.

## Type checking (G1)

`npm run typecheck` runs the TypeScript compiler over the JavaScript tree
with `checkJs` off globally and on per file: a file that carries
`// @ts-check` is checked, with JSDoc as its types; one that does not is
not. Every file under `src/platform` and `src/shared` carries it, every
clean file elsewhere carries it, and `tests/frontend.test.js` counts them
and refuses a platform file without it — so the check covers what it
covers today and never regresses. The domain files that do not yet carry
it are the worklist, listed by the same test; a file joins when its
errors are fixed, not by pragma.
