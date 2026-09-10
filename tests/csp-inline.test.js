'use strict';

/**
 * `script-src` no longer carries `'unsafe-inline'`, and this is what holds it.
 *
 * That directive is the difference between a string which reaches a page
 * being ugly and being an account takeover, and it was the last hole in the
 * perimeter. Closing it took two things — four inline `<script>` blocks became
 * files, and fifty inline handlers became `data-action` attributes — and
 * either one can be undone by a single careless line, in markup, where no
 * type checker and no route test will look.
 *
 * So: the policy, the markup and the allow-list are each checked, and the
 * fourth test is the one that earns its keep — every action a control names
 * has to resolve to a module that was actually registered. A typo in an
 * attribute is otherwise a button that does nothing, and the guard that hid
 * three dead pages in this codebase was exactly that kind of silence.
 */

const fs = require('fs');
const path = require('path');

const { source } = require('./helpers/ui-source');

const ROOT = path.join(__dirname, '..');
const csp = require('../src/platform/http/csp');

/** Every file a control can be written into. */
function markupFiles() {
  const out = [path.join(ROOT, 'ui', 'index.html')];
  for (const dir of ['ui/pages', 'ui/js']) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) out.push(path.join(full, f));
  }
  return out.filter(f => /\.(html|js)$/.test(f));
}

const rel = f => path.relative(ROOT, f);

/**
 * The file with its commentary removed.
 *
 * Every sweep here describes the shape it forbids, and several of the source
 * comments describe it too — `actions.js` explains at length why it does not
 * resolve against `window[name]`. Matching prose about a defect as though it
 * were the defect is how a sweep starts failing on the documentation that
 * exists to prevent it.
 */
function code(file) {
  /* Through `source()`, so a failure here names the file the way every other
     frontend sweep in this suite does. */
  return source(path.relative(ROOT, file)).text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('The policy itself', () => {
  test("script-src allows this origin and nothing else — no 'unsafe-inline'", () => {
    const directives = csp.DIRECTIVES || csp.directives;
    expect(directives['script-src']).toEqual(["'self'"]);
  });

  test('and the static site is sent the same string, so the two cannot drift', () => {
    const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
    expect(toml).toMatch(/script-src 'self';/);
    expect(toml).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  test("style-src still carries it, and the source says so rather than implying otherwise", () => {
    /* An inline style can deface a page; it cannot execute. Leaving it open is
       a decision, and a policy that quietly closed less than its comment
       claimed would be worse than one that states the gap. */
    const directives = csp.DIRECTIVES || csp.directives;
    expect(directives['style-src']).toContain("'unsafe-inline'");
    const src = fs.readFileSync(path.join(ROOT, 'src/platform/http/csp.js'), 'utf8');
    expect(src).toMatch(/`style-src` still carries it/);
  });
});

describe('Nothing in the frontend needs it', () => {
  test('no element carries an inline event handler', () => {
    const offenders = [];
    for (const f of markupFiles()) {
      for (const m of code(f).matchAll(/[\s"'](on[a-z]+)\s*=\s*"/g)) {
        offenders.push(`${rel(f)}: ${m[1]}=`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('no page carries an inline script block', () => {
    const offenders = [];
    for (const f of markupFiles().filter(x => x.endsWith('.html'))) {
      /* `<script>` with no src. A fragment's inline script never ran anyway —
         a fragment is inserted with innerHTML — so three modules defined that
         way were undefined and every control on their pages threw. */
      for (const m of code(f).matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)) {
        offenders.push(`${rel(f)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the three modules that were defined inside a fragment are real files now', () => {
    for (const name of ['reports', 'pipeline', 'carbon-pricing']) {
      expect(fs.existsSync(path.join(ROOT, 'ui', 'js', `${name}.js`))).toBe(true);
    }
    const shell = fs.readFileSync(path.join(ROOT, 'ui', 'index.html'), 'utf8');
    for (const name of ['reports', 'pipeline', 'carbon-pricing', 'actions', 'login', 'register-actions']) {
      expect(shell).toContain(`<script src="js/${name}.js">`);
    }
  });
});

describe('Every action a control names can actually be called', () => {
  /* The dispatcher resolves `Module.method` against a registered allow-list.
     A name that is not on it is a control that does nothing — which is the
     failure mode this whole change could introduce fifty times over. */
  const registration = fs.readFileSync(path.join(ROOT, 'ui/js/register-actions.js'), 'utf8');
  const registered = new Set(
    [...registration.matchAll(/^\s{2}([A-Z][\w$]*),\s*$/gm)].map(m => m[1]));

  function declaredActions() {
    const found = [];
    for (const f of markupFiles()) {
      for (const m of code(f).matchAll(/data-action(?:-input|-change)?="([^"]+)"/g)) {
        found.push({ file: rel(f), name: m[1] });
      }
    }
    return found;
  }

  test('the allow-list was read, and it is not empty', () => {
    expect(registered.size).toBeGreaterThanOrEqual(10);
    expect(registered.has('Dashboard')).toBe(true);
  });

  test('there are actions to check, so this suite cannot pass on nothing', () => {
    /* A check that passes because it had nothing to check is worse than no
       check — this codebase shipped one of those in a conformance matrix. */
    expect(declaredActions().length).toBeGreaterThanOrEqual(40);
  });

  test('every action names a registered module, and exactly one method on it', () => {
    const bad = [];
    for (const { file, name } of declaredActions()) {
      const parts = name.split('.');
      if (parts.length !== 2) { bad.push(`${file}: "${name}" is not Module.method`); continue; }
      if (!registered.has(parts[0])) bad.push(`${file}: "${name}" — ${parts[0]} is not registered`);
    }
    expect(bad).toEqual([]);
  });

  test('the dispatcher refuses a deeper path, so an allow-list of modules stays one', () => {
    const src = code(path.join(ROOT, 'ui/js/actions.js'));
    expect(src).toMatch(/parts\.length !== 2/);
    /* And it never reaches for a global by name, which would put the hole
       back. Checked against the code, not the comment that explains why. */
    expect(src).not.toMatch(/window\s*\[/);
  });
});
