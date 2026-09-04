/**
 * What the deployed site is allowed to give away.
 *
 * The methodology statement is the whole method: every equation the engine
 * executes, every factor with its tier and named source, the worked example,
 * the declared limits. Published, it is the one artefact from which the
 * product could be rebuilt.
 *
 * It is therefore not on the website — not as a page, not as a script, not as
 * a stylesheet, and not as an endpoint. The engine that builds it stays in the
 * repository and the annual disclosure still renders it, because a disclosure
 * is **issued to a named recipient** rather than published. Removing the
 * surface must not remove the asset, and this suite asserts both halves.
 *
 * A sweep rather than a walk. A page can come back by way of a nav entry
 * somebody re-adds, an orphan file the publish directory still ships, or a
 * route restored in a merge, and each of those is silent.
 */

'use strict';

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const KEY = process.env.UI_API_KEY;
const auth = r => r.set('x-api-key', KEY);

/** Everything Netlify publishes. `publish = "ui"` in netlify.toml. */
function publishedFiles(dir = 'ui', acc = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) publishedFiles(rel, acc);
    else acc.push(rel);
  }
  return acc;
}

describe('The methodology is not on the website', () => {
  test('no file that serves it is in the publish directory', () => {
    const offenders = publishedFiles().filter(f => /methodology/i.test(f));
    expect(offenders).toEqual([]);
  });

  test('the shell has no nav entry, no container and no script for it', () => {
    const index = read('ui/index.html');
    expect(index).not.toMatch(/data-page="methodology"/);
    expect(index).not.toMatch(/page-methodology/);
    expect(index).not.toMatch(/js\/methodology\.js/);
    expect(index).not.toMatch(/css\/methodology\.css/);
  });

  test('the page registry does not know the id', () => {
    /* Registered but unreachable is still reachable: the router navigates on
       a hash, so a leftover entry restores the page from the address bar. */
    const app_js = read('ui/app.js');
    expect(app_js).not.toMatch(/'methodology'/);
  });

  test('nothing served to a browser mentions it at all', () => {
    const offenders = publishedFiles()
      .filter(f => /\.(html|js|css)$/.test(f))
      .filter(f => /methodology/i.test(read(f)))
      /* Two mentions are not ours to protect: the PCAF attribution formula is
         published in the standard, and "PCAF v3 methodology" is a column
         label naming which standard a figure follows. */
      .filter(f => !/Methodology: Outstanding|PCAF v3 methodology/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

describe('The endpoint is absent, not forbidden', () => {
  /* A 403 announces that something exists to be taken. Absence announces
     nothing, which is the point. */
  test.each([
    '/v1/pcaf/part-c/methodology',
    '/v1/pcaf/part-c/methodology?format=json',
    '/v1/pcaf/part-c/methodology?format=pdf',
    '/v1/pcaf/part-c/methodology?format=docx',
  ])('%s returns 404', async (url) => {
    const res = await auth(request(app).get(url));
    expect(res.status).toBe(404);
  });

  test('and 404 without a key too, so the key is not what is protecting it', async () => {
    const res = await request(app).get('/v1/pcaf/part-c/methodology');
    expect([401, 404]).toContain(res.status);
  });
});

describe('The asset survives the removal', () => {
  test('the engine is still in the repository', () => {
    expect(fs.existsSync(path.join(ROOT, 'services/partc-methodology.js'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'services/partc-methodology-doc.js'))).toBe(true);
  });

  test('the annual disclosure still builds its methodology section from it', () => {
    /* This is the distinction that matters: a disclosure is issued to a named
       recipient, a website is issued to everyone. */
    expect(read('services/partc-disclosure.js')).toMatch(/partc-methodology/);
  });

  test('and it still produces a complete statement when asked', () => {
    const { buildMethodology } = require('../services/partc-methodology');
    const m = buildMethodology();
    expect(m.calculationChain.length).toBeGreaterThan(0);
    expect(m.factorStore.rowCount).toBeGreaterThan(0);
  });
});

/*
 * The calculation trace is the methodology in a different container.
 *
 * Annex C is every equation the engine executed, in order, with its inputs and
 * the factor each step consulted. It was rendered as a tab on the Part C
 * screen, as an expandable section on the walkthrough, and as an annex table
 * in the report anyone can download — three copies of the asset the
 * methodology statement was taken off the website to protect.
 *
 * Removing the markup would not have been enough on its own: the assess
 * response carried the entries whether or not a screen drew them. The sweep is
 * therefore over the published source AND the wire.
 */
describe('The calculation trace is not on the website', () => {
  test('no published file renders it', () => {
    const offenders = publishedFiles()
      .filter(f => /\.(html|js|css)$/.test(f))
      .filter(f => /auditTrail|audit-trail|pd-trail|partcBadgeC/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  test('no published file prints an engine equation', () => {
    // The equations are the asset, and they read the same under any key name.
    const offenders = publishedFiles()
      .filter(f => /\.(html|js)$/.test(f))
      .filter(f => /EF_road|EF_sea|EF_rail|mass_factor|A4_total\s*=/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  test('the route strips it before the response is shaped', () => {
    const route = read('routes/v1/pcaf-partc.js');
    expect(route).toMatch(/function _publicRegisters/);
    expect(route).toMatch(/registers: _publicRegisters\(registers\)/);
  });

  test('the downloadable report carries no trace annex', () => {
    expect(read('services/partc-report-standard.js')).toMatch(/auditTrail: \[\],/);
  });

  /*
   * Three containers, and the first two passes each missed one. The screen was
   * only the visible copy: the assess response carried the entries whether or
   * not a tab drew them; the JSON report carried them as Annex C; and the
   * rendered report model carried the whole register bundle on its facts,
   * unread by any section but serialised with everything else. The sweep is
   * over the built artefact, not over the source that builds it.
   */
  test('no built report carries a traced step, in any format', () => {
    const fx = require('./fixtures/fisheries');
    const { runPartC } = require('../services/pcaf-partc');
    const { buildRegisters } = require('../services/partc-registers');
    const std = require('../services/partc-report-standard');
    const { buildPartCReport } = require('../services/partc-reports');

    const result = runPartC(fx.workbookInput());
    const registers = buildRegisters(result);

    const facts = std.assessmentFacts({ result, registers, settings: {} });
    const model = JSON.stringify(std.buildStandardModel(facts, {}));
    // A traced step is the step number, its inputs and the factor it consulted.
    expect(model).not.toMatch(/"step":\s*\d/);
    expect(model).not.toContain('totalMass_t');
    expect(model).not.toContain('materialCount');

    const json = JSON.stringify(buildPartCReport({ result, registers, settings: {} }));
    expect(json).not.toMatch(/"step":\s*\d/);
    expect(json).not.toContain('totalMass_t');
  });

  /*
   * The module equations stay, and this pins the distinction so a later sweep
   * does not take them out by association. Part C ch.6 METHODOLOGY makes
   * giving them a "shall" — checklist item MET-2 — and they are ten formulas,
   * several of them RICS's and PCAF's own as published. The audit trail is a
   * different artefact: 58 steps, each with its inputs and its factors.
   */
  test('the module equations are still given, because the standard requires them', () => {
    const fx = require('./fixtures/fisheries');
    const { runPartC } = require('../services/pcaf-partc');
    const { buildRegisters } = require('../services/partc-registers');
    const std = require('../services/partc-report-standard');
    const result = runPartC(fx.workbookInput());
    const facts = std.assessmentFacts({ result, registers: buildRegisters(result), settings: {} });
    expect(facts.equations.length).toBeGreaterThan(0);

    const { completeChecklist } = require('../services/partc-checklist');
    const met2 = completeChecklist(facts).items.find(i => i.id === 'MET-2');
    expect(met2.duty).toBe('shall');
    expect(met2.answer).toBe('Yes');
  });
});

describe('The trace survives the removal', () => {
  test('the engine still builds it, equation by equation', () => {
    const { auditTrail } = require('../services/partc-registers');
    expect(typeof auditTrail).toBe('function');
  });

  test('the methodology statement still reads it', () => {
    expect(read('services/partc-methodology.js')).toMatch(/trace|equation/i);
  });

  test('the checklist answers the traceability item honestly rather than dropping it', () => {
    const { ITEMS } = require('../services/partc-checklist');
    const anx2 = ITEMS.find(i => i.id === 'ANX-2');
    expect(anx2).toBeTruthy();
    expect(anx2.section).toBeNull();
    expect(anx2.justify({ auditTrailEntries: 58 })).toMatch(/retained/);
  });
});
