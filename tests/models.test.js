// @ts-check
/**
 * The shared vocabulary, held to the code that uses it.
 *
 * `src/shared/models/` was seven files, two of which were
 * `module.exports = {}` placeholders citing steps of a build plan finished
 * long ago — worse than an absent file, because a developer looking for a
 * declaration finds one and it is empty. `src/shared/types.js` was fourteen
 * lines holding one typedef. That was the entire shared type vocabulary for a
 * 42,000-line system.
 *
 * A declaration file is only worth having if it cannot drift from the thing it
 * declares, so this holds each one to the code: the vocabularies to the
 * schemas and the engines that enforce them, and the entity names to the
 * modules that use them.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODELS = path.join(ROOT, 'src', 'shared', 'models');

const entities = require('../src/shared/models/entities');
const webhookModel = require('../src/shared/models/webhook-subscription');
const taxonomyModel = require('../src/shared/models/taxonomy-result');
const constants = require('../src/shared/constants');

describe('There is no placeholder left, and none can come back', () => {
  test('every model file declares something', () => {
    const empty = fs.readdirSync(MODELS)
      .filter(f => f.endsWith('.js'))
      .filter(f => {
        /* Comments stripped first, as the tone sweep does: these files now
           describe the defect they used to be, and a scan that reads the
           prose finds the pattern in the sentence explaining it. */
        const src = fs.readFileSync(path.join(MODELS, f), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        /* Both shapes of the defect: an empty export, and the build-step
           note that made it look intentional. */
        return /module\.exports\s*=\s*\{\s*\}/.test(src)
          || /will be implemented in Step/i.test(src);
      });
    expect(empty).toEqual([]);
  });

  test('each one carries at least one typedef and one exported vocabulary', () => {
    for (const f of fs.readdirSync(MODELS).filter(n => n.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(MODELS, f), 'utf8');
      expect({ file: f, hasTypedef: /@typedef/.test(src) })
        .toEqual({ file: f, hasTypedef: true });
      expect(Object.keys(require(path.join(MODELS, f))).length).toBeGreaterThan(0);
    }
  });
});

describe('"Project" is three entities, and they are named apart', () => {
  test('each kind names its own table and its own emission boundary', () => {
    expect(Object.keys(entities.PROJECT_KINDS).sort())
      .toEqual(['insured', 'lending', 'pipeline']);

    const kinds = Object.values(entities.PROJECT_KINDS);
    /* Three distinct entity names, three distinct tables, three distinct
       boundaries. A shared name here would be the ambiguity itself. */
    for (const field of ['entity', 'table', 'boundary']) {
      expect(new Set(kinds.map(k => k[field])).size).toBe(3);
    }
    for (const k of kinds) expect(k.entity).not.toBe('Project');
  });

  test('the three tables are the ones the collection registry actually holds', () => {
    const registry = require('../src/platform/database/collections');
    const tables = new Set(Object.values(registry.COLLECTIONS || registry)
      .map(c => c && c.table).filter(Boolean));
    for (const kind of Object.values(entities.PROJECT_KINDS)) {
      expect({ table: kind.table, known: tables.has(kind.table) })
        .toEqual({ table: kind.table, known: true });
    }
  });
});

describe('The vocabularies match what enforces them', () => {
  test('the Part C assessment lifecycle is the service\'s own', () => {
    const { STATUS } = require('../src/domains/pcaf-part-c/application/partc-assessments');
    expect([...entities.ASSESSMENT_STATUS].sort())
      .toEqual(Object.values(STATUS).sort());
  });

  test('the two capital lifecycle axes are the book model\'s own', () => {
    const book = require('../src/domains/capital/domain/book-model');
    expect([...entities.INVESTMENT_STATUS].sort()).toEqual([...book.STATUSES].sort());
    expect([...entities.DELIVERY_STATE].sort()).toEqual([...book.DELIVERY_STATES].sort());
    /* Three states and not four: `operating` beside `completed` is one fact
       said twice, and two labels for one state is how two screens disagree. */
    expect(entities.DELIVERY_STATE).not.toContain('operating');
  });

  test('the GCF evidence tiers are not PCAF scores', () => {
    expect([...entities.EVIDENCE_TIERS])
      .toEqual(['measured', 'modelled', 'benchmark', 'declared']);
    /* Numerals here would be quoted as PCAF data-quality scores by the time
       they reached a submission, which is the error Part A must not make with
       Part C's option mapping either. */
    for (const tier of entities.EVIDENCE_TIERS) expect(tier).not.toMatch(/^\d+$/);
  });

  test('the webhook events are the ones the boundary accepts', () => {
    const { webhookCreateSchema } = require('../src/domains/lending/interface/schemas/webhooks');
    const described = webhookCreateSchema.describe();
    const allowed = described.keys.events.items[0].allow;
    expect([...webhookModel.WEBHOOK_EVENTS].sort()).toEqual([...allowed].sort());
  });

  test('the taxonomy frameworks are the ones a screen answers with', () => {
    const { checkAllTaxonomies } = require('../src/domains/taxonomy/domain/taxonomy');
    const result = checkAllTaxonomies({
      totalEmission_tCO2e: 5000, buildingArea_m2: 10000,
      reductionPct: 12, hasLCA: true, hasEPD: true,
    });
    for (const framework of taxonomyModel.TAXONOMY_FRAMEWORKS) {
      expect({ framework, present: result[framework] !== undefined })
        .toEqual({ framework, present: true });
    }
    expect([...taxonomyModel.TAXONOMY_TIERS])
      .toEqual(['green', 'transition', 'not_aligned']);
    expect(taxonomyModel.TAXONOMY_TIERS).toContain(result.sriLanka.classification);
    /* The SLGFT sets no absolute figure per unit area anywhere, so the bands
       are regional judgement under governance and must never present as a
       published threshold. */
    expect(result.sriLanka.screen.isTaxonomyThreshold).toBe(false);
  });
});

describe('One PCAF data-quality table', () => {
  test('it is declared once and re-exported, never restated', () => {
    const viaModels = require('../src/shared/models/constants').PCAF_DATA_QUALITY;
    /* Identity, not equality: two frozen objects with the same content would
       satisfy a deep comparison and still be two declarations that can drift,
       which is exactly what happened. */
    expect(viaModels).toBe(constants.PCAF_DATA_QUALITY);

    const declarations = fs.readFileSync(path.join(MODELS, 'constants.js'), 'utf8')
      .match(/const PCAF_DATA_QUALITY\s*=\s*(Object\.freeze\()?\{/g) || [];
    expect(declarations).toEqual([]);
  });

  test('every score carries one key name, and 1 is the best', () => {
    for (let score = 1; score <= 5; score += 1) {
      const row = constants.PCAF_DATA_QUALITY[score];
      expect({ score, label: typeof row.label, description: typeof row.description })
        .toEqual({ score, label: 'string', description: 'string' });
      /* `name:` against `label:` was the split that let production and the
         test read different tables without either failing. */
      expect(row.name).toBeUndefined();
    }
    expect(Object.keys(constants.PCAF_DATA_QUALITY)).toEqual(['1', '2', '3', '4', '5']);
    expect(Object.isFrozen(constants.PCAF_DATA_QUALITY)).toBe(true);
  });

  test('it does not present itself as an option-to-score lookup', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/shared/constants.js'), 'utf8');
    const block = src.slice(src.indexOf('PCAF data quality'), src.indexOf('const PCAF_DATA_QUALITY'));
    /* There is no global option-to-score mapping: Part A's differs by asset
       class and Part C's is Table 5.3-2. The comment has to say so, because a
       reader who assumes otherwise gets a wrong score for some classes and no
       error anywhere. */
    expect(block).toMatch(/not uniform across asset classes/);
    expect(block).toMatch(/Table 5\.3-2/);
    expect(block).toMatch(/1 is the highest quality/);

    /* And no engine resolves a score through it. */
    for (const engine of ['src/domains/pcaf-part-c/domain/dq-scoring.js',
      'src/domains/pcaf-part-c/domain/data-quality.js']) {
      expect(fs.readFileSync(path.join(ROOT, engine), 'utf8'))
        .not.toMatch(/PCAF_DATA_QUALITY/);
    }
  });
});
