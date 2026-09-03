/**
 * The Part A screen, checked against the engine it renders.
 *
 * Two failure modes are worth a suite of their own.
 *
 * The first is a screen that is built but unreachable. A page fragment can be
 * perfect and still never appear, because the nav item, the container, the
 * script tag, the stylesheet, the PAGE_META entry, the DYNAMIC_PAGES entry and
 * the role gate are seven separate edits in four files and any one of them
 * missing is silent. That is exactly how Part A shipped to production with a
 * working API and nothing in the sidebar.
 *
 * The second is a form that drifts from the engine. Every id the module reads
 * has to exist in the fragment, and the worked examples the screen opens with
 * have to actually produce the figures a demo will be given on. So the presets
 * are pulled out of the browser module and run through the real engine here.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const html   = read('ui', 'index.html');
const appJs  = read('ui', 'app.js');
const authJs = read('ui', 'js', 'auth.js');
const page   = read('ui', 'pages', 'pcaf-parta.html');
const moduleSrc = read('ui', 'js', 'pcaf-parta.js');

/* The browser module, loaded without a browser. Nothing at its top level
   touches the DOM — init() does — so it evaluates in a bare context. */
const PartA = vm.runInNewContext(`${moduleSrc}\n;PCAFPartAPage`, {}, { timeout: 5000 });

describe('The Part A screen is reachable', () => {
  test('the sidebar carries a nav item for it', () => {
    expect(html).toContain('data-page="pcaf-parta"');
    expect(html).toMatch(/data-page="pcaf-parta"[\s\S]{0,600}?PCAF Part A/);
  });

  test('the page container exists and names its fragment', () => {
    expect(html).toContain('id="page-pcaf-parta" data-src="pages/pcaf-parta.html"');
  });

  test('the module and its stylesheet are loaded', () => {
    expect(html).toContain('<script src="js/pcaf-parta.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="css/pcaf-parta.css">');
  });

  test('the script tag is present for every asset the page needs', () => {
    for (const f of ['ui/js/pcaf-parta.js', 'ui/css/pcaf-parta.css', 'ui/pages/pcaf-parta.html']) {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    }
  });

  test('the router knows how to title it and how to load it', () => {
    expect(appJs).toMatch(/'pcaf-parta':\s*\{\s*title:\s*'PCAF Part A'/);
    expect(appJs).toContain("src:  'pages/pcaf-parta.html'");
    expect(appJs).toContain('PCAFPartAPage.init()');
  });

  test('the role gate holds it to the same bar as the other PCAF screens', () => {
    const level = s => Number((s.match(/'pcaf-parta':\s*(\d+)/) || [])[1]);
    const pcaf  = Number((authJs.match(/'pcaf':\s*(\d+)/) || [])[1]);
    expect(level(authJs)).toBe(pcaf);
  });
});

describe('Every field the module reads exists in the fragment', () => {
  /* A renamed id does not throw — readField returns undefined and the value
     silently leaves the request. This is the check that catches it. */
  const ids = new Set();
  for (const m of moduleSrc.matchAll(/el\('([a-zA-Z0-9-]+)'\)/g)) ids.add(m[1]);
  // Trailing '-' is a prefix the module concatenates a field name onto
  // ('pa-reduction-'), not an id in its own right.
  for (const m of moduleSrc.matchAll(/'(pa-[a-zA-Z0-9_-]+)'/g)) {
    if (!m[1].endsWith('-')) ids.add(m[1]);
  }

  test('the sweep found the ids it claims to', () => {
    expect(ids.size).toBeGreaterThan(30);
  });

  test('each one is in the page', () => {
    const missing = [...ids].filter(id => !page.includes(`id="${id}"`));
    expect(missing).toEqual([]);
  });

  test('the prefixed field ids cover every field sent to the engine', () => {
    for (const group of ['FIELDS', 'REDUCTION_FIELDS', 'GENERATION_FIELDS']) {
      const block = moduleSrc.match(new RegExp(`const ${group} = \\[([\\s\\S]*?)\\];`))[1];
      const names = [...block.matchAll(/\['([a-zA-Z0-9_]+)',/g)].map(m => m[1]);
      expect(names.length).toBeGreaterThan(4);
      const prefix = group === 'FIELDS' ? 'pa-' : group === 'REDUCTION_FIELDS' ? 'pa-reduction-' : 'pa-gen-';
      const missing = names.filter(n => !page.includes(`id="${prefix}${n}"`));
      expect(missing).toEqual([]);
    }
  });
});

describe('The screen renders the engine rather than repeating it', () => {
  test('it does not compute an attribution factor of its own', () => {
    // The one number a browser is most tempted to work out for itself.
    expect(moduleSrc).not.toMatch(/outstanding\w*\s*\/\s*(total|denominator)/i);
  });

  test('it does not multiply emissions by a factor of its own', () => {
    expect(moduleSrc).not.toMatch(/Scope[12]\w*\s*\*\s*\w*[aA][fF]/);
  });

  test('the data-quality label comes from the engine, not from a template here', () => {
    expect(moduleSrc).toContain('inv.dataQuality.label');
    expect(moduleSrc).not.toMatch(/Data quality score:\s*\$\{/);
  });
});

describe('The worked examples produce the figures they promise', () => {
  const parta = require('../services/pcaf-parta');

  /* The page builds its request from a preset the same way collect() does:
     the nested blocks travel under `reduction` and `avoided`. */
  const request = name => {
    const p = { ...PartA.PRESETS[name] };
    /* Mirrors collect(): the chosen option is sent as dataQualityOption, and
       a preset that names none leaves the engine to derive it. */
    if (p.dataQualityOptionChosen) p.dataQualityOption = p.dataQualityOptionChosen;
    delete p.dataQualityOptionChosen;
    for (const k of Object.keys(p)) if (p[k] === '') delete p[k];
    if (p.generation) {
      p.generation = { ...p.generation };
      for (const k of Object.keys(p.generation)) if (p.generation[k] === '') delete p.generation[k];
    }
    return p;
  };

  test('Cement Company 1 — a reduction against its own base year', () => {
    const r = parta.assessExposure(request('cement'));

    expect(r.attribution.value).toBe(0.25);
    expect(r.inventory.scope1.value).toBe(120000);
    expect(r.inventory.scope2.value).toBe(15000);
    expect(r.inventory.scope1And2.value).toBe(135000);
    expect(r.inventory.scope3.value).toBe(23750);
    expect(r.inventory.economicIntensity_tCO2e_per_M).toBe(3375);

    // Option 1b is score 2 in Table 5.3-1 — a category, with its scale beside it.
    expect(r.inventory.dataQuality.label).toBe('Data quality score: 2 (Option 1b)');

    // (540,000 - 320,000) / (2030 - 2025) x (2027 - 2025) x 0.25
    const eer = r.impact.metrics.find(m => /EER/.test(m.metric));
    expect(eer.figure.value).toBe(22000);
    expect(r.impact.metrics.some(m => /avoid/i.test(m.metric))).toBe(false);
  });

  test('Solar Project — emissions derived from generation and a named grid factor', () => {
    const r = parta.assessExposure(request('solar'));

    expect(r.attribution.value).toBe(0.3);
    // Scope 2 is the plant's own auxiliary draw at the Sri Lankan grid average,
    // not the combined margin — the two factors answer different questions.
    expect(r.inventory.scope1.value).toBe(0);
    /* The preset no longer supplies a generation figure, so the engine derives
       it: 60 MW x 17.4% x 8,760 = 91,454.4 MWh, and scope 2 follows from that
       rather than from a number frozen into the preset. */
    expect(r.generation.annualGeneration.value).toBe(91454.4);
    expect(r.generation.annualGeneration.source).toBe('derived');
    expect(r.inventory.scope1And2.value).toBe(68.59);

    // 90,600 MWh from 60 MW is a 17.2% capacity factor — inside Sri Lanka's band.
    expect(r.generation.plausibility.capacityFactorPct).toBe(17.4);
    /* No national band is held, so the plant is compared to the global
       weighted average as a ratio rather than passed or failed. */
    expect(r.generation.plausibility.status).toBe('no_band');
    expect(r.generation.plausibility.specificYield_kWh_per_kWp).toBe(1524);

    // Scope 3 was not marked relevant: absent, never a zero.
    expect(r.inventory.scope3.absent).toBe(true);
    expect(r.inventory.scope3.value).toBeNull();

    // A projection reports EAE, annualised, against a counterfactual the
    // factor store supplied rather than a text box.
    const eae = r.impact.metrics.find(m => /EAE/.test(m.metric));
    expect(eae.figure.value).toBe(22245.37);
    expect(eae.figure.unit).toBe('tCO2e per year');
    expect(eae.counterfactualSource).toMatch(/DNA Sri Lanka/);

    expect(r.impact.notComparable).toMatch(/never added to them/);
  });

  test('the empty form makes no reduction or avoidance claim', () => {
    expect(PartA.PRESETS.blank.archetype).toBe('general');
    expect(PartA.PRESETS.blank.reduction).toBeUndefined();
    expect(PartA.PRESETS.blank.avoided).toBeUndefined();
  });

  test('every preset that names an option names one the engine holds', () => {
    const held = parta.dataQuality.optionsFor('project-finance').map(o => o.option);
    for (const [name, p] of Object.entries(PartA.PRESETS)) {
      if (!p.dataQualityOptionChosen) continue;   // derived presets name none
      expect(`${name}:${held.includes(p.dataQualityOptionChosen)}`).toBe(`${name}:true`);
    }
  });

  test('the solar preset names no option at all — it has to earn one', () => {
    expect(PartA.PRESETS.solar.dataQualityOptionChosen).toBeUndefined();
    expect(PartA.PRESETS.solar.generation.country).toBe('LK');
  });
});

describe('A hidden element stays hidden', () => {
  const css = read('ui', 'css', 'pcaf-parta.css');

  /* Found in a browser, not by reading: with .parta-break set to display:flex,
     the `hidden` attribute lost, and the dashed "Not Part A" divider stayed on
     screen for a general-purpose exposure — announcing a section that was
     correctly not rendered. Every toggle on this page is el.hidden. */
  test('the stylesheet overrides its own display rules for [hidden]', () => {
    expect(css).toMatch(/\.parta \[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
  });

  test('the guard is declared before the rules it has to beat', () => {
    expect(css.indexOf('.parta [hidden]')).toBeLessThan(css.indexOf('.parta-break {'));
  });
});


  /* Reported from the live screen: "90600 is not changing to country and
     technology". It was not, and the cause was worse than a stale field — the
     preset supplied the figure, so the engine correctly classified it as
     user-supplied, froze it, AND scored the run 2b as though a human had
     produced it from a yield assessment. A preset is not evidence. */
  describe('A preset never claims to be a supplied generation figure', () => {
    const parta = require('../services/pcaf-parta');
    const request = name => {
      const p = { ...PartA.PRESETS[name] };
      if (p.dataQualityOptionChosen) p.dataQualityOption = p.dataQualityOptionChosen;
      delete p.dataQualityOptionChosen;
      for (const k of Object.keys(p)) if (p[k] === '') delete p[k];
      if (p.generation) {
        p.generation = { ...p.generation };
        for (const k of Object.keys(p.generation)) if (p.generation[k] === '') delete p.generation[k];
      }
      return p;
    };

    test('the solar preset carries no generation figure at all', () => {
      expect(PartA.PRESETS.solar.generation.annualGeneration_MWh).toBeUndefined();
      expect(PartA.PRESETS.solar.generation.installedCapacity_MW).toBe(60);
    });

    test('changing technology moves the derived generation', () => {
      const base = { ...request('solar') };
      const solar = parta.assessExposure(base);
      const wind = parta.assessExposure({
        ...base, generation: { ...base.generation, technology: 'wind_on' } });

      expect(solar.generation.annualGeneration.value).toBe(91454.4);
      expect(wind.generation.annualGeneration.value).toBe(178704);
      expect(wind.generation.annualGeneration.value)
        .toBeGreaterThan(solar.generation.annualGeneration.value);
    });

    test('the screen explains why country does not move it, before being asked', () => {
      const r = parta.assessExposure(request('solar'));
      const d = r.generation.annualGeneration.derivation;
      expect(d.cfIsGlobal).toBe(true);
      expect(d.whyUnchangedNote).toMatch(/GLOBAL weighted average/);
      expect(d.whyUnchangedNote).toMatch(/changing the\s+TECHNOLOGY will/i);
    });

    test('a genuinely supplied figure is still honoured, and scored lower than metered', () => {
      const base = request('solar');
      const supplied = parta.assessExposure({
        ...base, generation: { ...base.generation, annualGeneration_MWh: 90600 } });
      const metered = parta.assessExposure({
        ...base, generation: { ...base.generation, annualGeneration_MWh: 90600, basis: 'metered' } });

      expect(supplied.generation.annualGeneration.source).toBe('supplied');
      expect(supplied.generation.annualGeneration.overrideNote).toMatch(/does not move/);
      expect(supplied.inventory.dataQuality.option).toBe('2b');
      expect(metered.inventory.dataQuality.option).toBe('2a');
    });

    test('the lifetime chart plots the years the engine actually summed', () => {
      const r = parta.assessExposure(request('solar'));
      const l = r.generation.lifetime;
      expect(l.series).toHaveLength(l.years);
      const summed = l.series.reduce((t, y) => t + y.avoided_tCO2e, 0);
      expect(Math.abs(summed - l.value)).toBeLessThan(1);
      expect(l.lastYear).toBeLessThan(l.firstYear);   // degradation is applied
    });
  });

describe('The page keeps the two containers apart', () => {
  test('the impact block is reached past a labelled break', () => {
    expect(page).toContain('id="paBreak"');
    expect(page).toMatch(/paBreak[\s\S]{0,200}?Not Part A/);
  });

  test('an absent scope 3 is shown as absent, not as nought', () => {
    expect(moduleSrc).toContain("'Not reported'");
    expect(page).toContain('id="paScope3Absent"');
  });

  test('removals are drawn outside the figure grid', () => {
    const grid = page.slice(page.indexOf('class="parta-figures"'), page.indexOf('id="paRemovalsBox"'));
    expect(grid).not.toContain('paRemovals"');
    expect(page).toContain('Removals — reported separately');
  });

  test('the prohibited estimation bases are no longer reachable at all', () => {
    /* They used to be offered so the refusal was visible. Now the estimation
       basis comes from the factor store rather than a dropdown, so physical
       activity data is the only basis a generation run can have — a guardrail
       that cannot be tripped beats one that reports being tripped. */
    const impact = require('../services/pcaf-parta/impact');
    for (const banned of impact.PROHIBITED_BASES) {
      expect(page.includes(`value="${banned}"`)).toBe(false);
    }
    expect(moduleSrc).not.toContain('ESTIMATION_BASES');
  });
});
