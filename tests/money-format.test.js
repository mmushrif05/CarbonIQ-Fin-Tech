'use strict';
/**
 * Money and scale are printed one way, on the screens and in the documents.
 *
 * Nine screens carried their own money formatter and seven printed a dollar
 * sign in front of whatever the figure was — on a rupee book, on a GCF ask in
 * US dollars, on figures carrying no currency at all — while the register form
 * showed `6100000000` with no separator and no scale. A symbol is a claim
 * about the currency; a wrong one on a regulated document is a wrong figure.
 *
 * So there is one formatter (`src/shared/money.js`), the browser carries a
 * copy of it (`ui/js/format.js`) that this suite holds to the server's over
 * the same figures, every amount carries its ISO code and never a symbol, and
 * a sweep refuses a dollar sign used as a currency symbol anywhere a reader
 * would see it.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const M = require('../src/shared/money');
const { source, must, mustNot, ROOT } = require('./helpers/ui-source');

/** The browser formatter, run as the browser runs it. */
function browserMoney() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'ui/js/format.js'), 'utf8'), { window });
  return window.CARBONIQ_money;
}

const SAMPLES = [0, 1, 420, 999, 1000, 1500, 750000, 999999, 1e6, 1250000, 250e6, 999999999, 1e9, 1.25e9, 6.1e9, 6100000000,
  -1.2e6, -420, 12038.24, 0.5, '250000000', null, undefined, '', NaN, Infinity, true];

describe('the scale words', () => {
  test('bn, mn and k — lower case, a space before, at most two decimals', () => {
    expect(M.short(250e6)).toBe('250 mn');
    expect(M.short(6.1e9)).toBe('6.1 bn');
    expect(M.short(1.25e9)).toBe('1.25 bn');
    expect(M.short(1500)).toBe('1.5 k');
    expect(M.short(750000)).toBe('750 k');
    expect(M.short(420)).toBe('420');
  });

  test('a figure that rounds up to the next step takes it — never "1,000 mn"', () => {
    expect(M.short(999999999)).toBe('1 bn');
    expect(M.short(999999)).toBe('1 mn');
    expect(M.short(999.999)).toBe('1 k');
  });

  test('absence is a dash and never nought', () => {
    for (const v of [null, undefined, '', NaN, Infinity, true]) {
      expect(M.short(v)).toBe('—');
      expect(M.money(v, 'LKR')).toBe('—');
      expect(M.moneyShort(v, 'LKR')).toBe('—');
      expect(M.moneyAnnotated(v, 'LKR')).toBe('—');
      expect(M.fixed(v)).toBe('—');
    }
    expect(M.money(0, 'LKR')).toBe('LKR 0');
  });
});

describe('an amount carries its code and never a symbol', () => {
  test('full, short and annotated forms', () => {
    expect(M.money(250e6, 'LKR')).toBe('LKR 250,000,000');
    expect(M.money(250e6, 'lkr')).toBe('LKR 250,000,000');
    expect(M.moneyShort(250e6, 'LKR')).toBe('LKR 250 mn');
    expect(M.moneyAnnotated(250e6, 'LKR')).toBe('LKR 250,000,000 (250 mn)');
    expect(M.moneyAnnotated(6100000000, 'LKR')).toBe('LKR 6,100,000,000 (6.1 bn)');
    expect(M.moneyAnnotated(750000, 'LKR')).toBe('LKR 750,000');
    expect(M.money(250e6)).toBe('250,000,000');
  });

  test('a negative figure carries the minus before the code', () => {
    expect(M.moneyShort(-1.2e6, 'USD')).toBe('−USD 1.2 mn');
    expect(M.money(-420, 'USD')).toBe('−USD 420');
  });

  test('tonnes print at three decimals with their separators', () => {
    expect(M.fixed(12038.24, 3)).toBe('12,038.240');
    expect(M.fixed(0.5)).toBe('0.500');
    expect(M.separated(1234567.891)).toBe('1,234,567.89');
  });

  test('no form ever prints a dollar sign', () => {
    for (const v of SAMPLES) for (const ccy of ['USD', 'LKR', undefined]) {
      for (const s of [M.money(v, ccy), M.moneyShort(v, ccy), M.moneyAnnotated(v, ccy), M.short(v)]) expect(s).not.toContain('$');
    }
  });
});

describe('the browser prints exactly what the server prints', () => {
  const B = browserMoney();
  test('over the same figures, form for form', () => {
    for (const v of SAMPLES) for (const ccy of ['USD', 'LKR', 'lkr', undefined]) {
      expect(B.money(v, ccy)).toBe(M.money(v, ccy));
      expect(B.moneyShort(v, ccy)).toBe(M.moneyShort(v, ccy));
      expect(B.annotated(v, ccy)).toBe(M.moneyAnnotated(v, ccy));
      expect(B.short(v)).toBe(M.short(v));
      expect(B.number(v)).toBe(M.separated(v));
    }
  });
  test('the browser copy is frozen and loaded before the first page module', () => {
    expect(Object.isFrozen(B)).toBe(true);
    const shell = source('ui/index.html');
    const at = s => shell.indexOf(`<script src="${s}"></script>`);
    expect(at('js/format.js')).toBeGreaterThan(at('app.js'));
    for (const m of ['js/dashboard.js', 'js/desk.js', 'js/bank.js', 'js/parta-register.js', 'js/gcf-pipeline.js']) {
      expect(at('js/format.js')).toBeLessThan(at(m));
    }
  });
});

describe('no dollar sign as a currency symbol, anywhere a reader sees it', () => {
  /* A dollar right before an interpolation, a tag or a digit, or alone in
     quotes, is a currency symbol. `${…}` on its own is a template and `$1` in
     a replacement is a back-reference; neither reaches a reader. */
  const SYMBOL = /\$\$\{|\$<[a-z]|'\$'|"\$"|`\$[0-9]/;
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out); else if (/\.(js|html)$/.test(e.name)) out.push(p);
    }
    return out;
  };

  test('the frontend', () => {
    const offenders = [];
    for (const f of [...walk(path.join(ROOT, 'ui/js')), ...walk(path.join(ROOT, 'ui/pages')), path.join(ROOT, 'ui/index.html'), path.join(ROOT, 'ui/app.js')]) {
      const text = strip(fs.readFileSync(f, 'utf8'));
      const m = text.match(SYMBOL);
      if (m) offenders.push(`${path.relative(ROOT, f)}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  test('every document and every note the API returns for display', () => {
    const DIRS = ['src/domains/pcaf-part-a/reporting', 'src/domains/pcaf-part-c/reporting', 'src/domains/pcaf-part-c/application',
      'src/domains/gcf/application', 'src/domains/gcf/domain', 'src/domains/capital', 'src/platform/reporting'];
    const offenders = [];
    for (const d of DIRS) for (const f of walk(path.join(ROOT, d))) {
      const text = strip(fs.readFileSync(f, 'utf8'));
      const m = text.match(/\$\$\{|\$[0-9]/);
      if (m) offenders.push(`${path.relative(ROOT, f)}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('the register form prints what was keyed with its scale beside it', () => {
  const HTML = source('ui/pages/parta-register.html');
  const JS = source('ui/js/parta-register.js');

  test('every money field is marked, and no count or year is', () => {
    for (const id of ['pr-f-outstanding', 'pr-f-average', 'pr-f-revenue', 'pr-f-equity', 'pr-f-debt', 'pr-f-deposits', 'pr-f-mcap',
      'pr-f-re-outstanding', 'pr-f-re-value', 'pr-f-mv-outstanding', 'pr-f-mv-value', 'pr-f-pf-outstanding', 'pr-f-pf-denominator',
      'pr-f-le-outstanding', 'pr-f-le-mcap', 'pr-book-total']) {
      must(HTML, `<input id="${id}" type="number" data-money`, `${id} is a money field`, 'add data-money to the input');
    }
    for (const id of ['pr-f-s1', 'pr-f-period', 'pr-f-count', 'pr-f-area', 'pr-f-mv-km', 'pr-f-elec']) {
      mustNot(HTML, new RegExp(`<input id="${id}" type="number" data-money`), `${id} is not money`, 'tonnes, years, counts and areas carry no currency');
    }
  });

  test('the hint comes from the shared formatter, and no scale lives in the module', () => {
    must(JS, /const M = window\.CARBONIQ_money;/, 'the module reads the shared formatter');
    must(JS, /M\.annotated\(input\.value, currencyFor\(input\)\)/, 'the hint is the shared annotated form');
    must(JS, /\[data-money\]/, 'the marked fields are the ones wired');
    must(JS, /on\(id, 'reset', \(\) => setTimeout\(refreshMoneyHints, 0\)\)/, 'a reset clears the hints');
    mustNot(JS, /1e6|1e9|1000000/, 'no scale in the browser', 'the scale is the shared formatter’s');
  });

  test('the overview and the position print an amount with its code, never a symbol', () => {
    for (const rel of ['ui/js/bank.js', 'ui/js/parta-position.js']) {
      must(source(rel), /window\.CARBONIQ_money\.annotated\(n, ccy \|\| ''\)/, `${rel} reads the shared formatter`);
    }
  });
});
