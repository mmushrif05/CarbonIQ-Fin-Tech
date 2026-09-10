// @ts-check
/**
 * Nothing reaches the arithmetic unchecked.
 *
 * Twenty-three JSON files under `data/` were read straight into the engines
 * through `require()` or `JSON.parse` with nothing in between — twelve factor
 * tables, the GCF reference set and its shipped pipeline, Part A's option
 * tables and grid factors, the baseline seed, the assurance baseline, the
 * capital book. Every one is an input to a figure that ends up in a regulatory
 * disclosure. `ajv` sat in devDependencies, imported nowhere.
 *
 * The cost is specific and quiet. A factor row missing its `value` is
 * `undefined`, and `undefined * quantity` is `NaN`, which travels through
 * every sum it touches and prints as an empty cell — a hole in a disclosure
 * that reads as a formatting fault. A row whose value is the string `"2400"`
 * multiplies fine and then fails a comparison it should have passed. Neither
 * announces itself, and neither is caught by a test that reads a different row.
 *
 * This file proves two things: that each of the twenty-three goes through the
 * guard, and that the guard actually refuses what it claims to.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { checked, strictNumber, factorTableSchema } = require('../src/shared/reference-data');

/** Every JSON file under `data/`. */
function dataFiles(dir = path.join(ROOT, 'data'), found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) dataFiles(full, found);
    else if (entry.name.endsWith('.json')) found.push(full);
  }
  return found;
}

/** Every source file that might carry a `checked(...)` call. */
function sourceFiles(dir = path.join(ROOT, 'src'), found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (entry.name.endsWith('.js')) found.push(full);
  }
  return found;
}

describe('Every reference file goes through the guard', () => {
  const files = dataFiles().map(f => path.relative(ROOT, f).split(path.sep).join('/'));
  const src = sourceFiles().map(f => fs.readFileSync(f, 'utf8')).join('\n');

  test('there are reference files to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test('each one is named in a checked() call', () => {
    /* Naming the path in the call is what makes this provable from the outside
       and what puts the file's own name in the failure message when it is
       wrong. The factor tables are named by pattern because their loader
       iterates a list. */
    const unguarded = files.filter((file) => {
      if (src.includes(`checked('${file}'`)) return false;
      if (file.startsWith('data/factors/') && src.includes('checked(`data/factors/${name}.json`')) return false;
      return true;
    });
    expect(unguarded).toEqual([]);
  });
});

describe('The guard refuses what it claims to', () => {
  const good = () => JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data/factors/densities.json'), 'utf8'));

  test('a table that satisfies its schema comes back unchanged', () => {
    const table = good();
    /* Identity: the loader validates, it does not rewrite. A loader that
       quietly corrected a committed file would hide the mistake it exists to
       surface. */
    expect(checked('data/factors/densities.json', table, factorTableSchema)).toBe(table);
  });

  test('a row with no value is refused, and the message names the row', () => {
    const table = good();
    delete table.rows.steel.value;
    expect(() => checked('data/factors/densities.json', table, factorTableSchema))
      .toThrow(/rows\.steel\.value/);
  });

  test('a quoted number is refused rather than coerced', () => {
    const table = good();
    table.rows.steel.value = '7850';
    /* This is the one a converting validator would let through: the string
       multiplies correctly and then loses a comparison. */
    expect(() => checked('data/factors/densities.json', table, factorTableSchema))
      .toThrow(/rows\.steel\.value/);
    expect(strictNumber.validate('7850').error).toBeDefined();
    expect(strictNumber.validate(7850).error).toBeUndefined();
    expect(strictNumber.validate(Infinity).error).toBeDefined();
    expect(strictNumber.validate(NaN).error).toBeDefined();
  });

  test('a row that resolves no tier or source is refused', () => {
    /* A factor that cannot say where it came from cannot be defended to an
       assurer, and the methodology statement is extracted from an execution of
       the engine — so such a row does not go missing, it appears in the
       document as an unattributable number. */
    const table = good();
    delete table.rows.steel.tier;
    expect(() => checked('data/factors/densities.json', table, factorTableSchema))
      .toThrow(/resolves no tier/);

    /* Declared once on the table is enough — that is how `refrigerant-gwp`
       carries one IPCC citation for every row. */
    const shared = good();
    shared.tier = 'Global';
    for (const row of Object.values(shared.rows)) delete (/** @type {any} */ (row)).tier;
    expect(() => checked('data/factors/densities.json', shared, factorTableSchema)).not.toThrow();
  });

  test('the failure carries a status, a code and a remedy', () => {
    const table = good();
    delete table.rows.steel.value;
    try {
      checked('data/factors/densities.json', table, factorTableSchema);
      throw new Error('should have refused');
    } catch (thrown) {
      const err = /** @type {any} */ (thrown);
      expect(err.code).toBe('INVALID_REFERENCE_DATA');
      expect(err.statusCode).toBe(500);
      expect(err.remedy).toMatch(/data\/factors\/densities\.json/);
    }
  });
});

describe('The rules the shape alone cannot express', () => {
  test('NDC reduction and removal each total their own two halves', () => {
    const { ndc3Schema, NDC3 } = require('../src/shared/ndc');
    expect(NDC3.reduction.totalPct).toBeCloseTo(20.09, 2);
    expect(NDC3.removal.totalPct).toBeCloseTo(4.49, 2);

    const bent = JSON.parse(JSON.stringify(NDC3));
    /* The mistake, computed rather than written: the two ledgers added
       together. The figure itself must appear nowhere in the tree — a sweep in
       `ndc3-currency.test.js` fails the build on the literal, and it caught
       this file when the number was typed in here. */
    bent.reduction.totalPct = NDC3.reduction.totalPct + NDC3.removal.totalPct;
    expect(() => checked('data/gcf/ndc3.json', bent, ndc3Schema))
      .toThrow(/is not unconditional/);
  });

  test('a Part A option table must name its asset class', () => {
    const { dqTableSchema, DQ_PROJECT_FINANCE, DQ_LISTED_EQUITY } =
      require('../src/domains/pcaf-part-a/domain/reference');
    /* The mapping is not uniform across asset classes — Option 2b is score 2
       in one and 3 in another — so a table that does not say which class it
       belongs to can be applied to the wrong one, producing a wrong disclosed
       score with no error anywhere. */
    expect(DQ_PROJECT_FINANCE.assetClass).not.toBe(DQ_LISTED_EQUITY.assetClass);

    /* The two classes held here agree on the options they share. That is a
       fact about these two and not a rule — Part A's third edition spans ten
       asset classes and the mapping differs between others — so what is
       asserted is the thing that protects: **Part A resolves a score from its
       own class's table and from nowhere else.** Every score in it comes off
       one of these files.
       Part C's `OPTION_SCORES` is a different matter and is correct: Table
       5.3-2 is the single table PCAF publishes for insurance-associated
       emissions, so one lookup is the whole standard there. Reusing it for
       Part A would be wrong for some classes, silently — which is the error
       this sweep is scoped to catch. */
    const strays = sourceFiles()
      .filter(f => /pcaf-part-a|[/\\]shared[/\\]/.test(f))
      .filter(f => /OPTION_SCORES|optionToScore|OPTION_TO_SCORE|'2b':\s*3/.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(ROOT, f));
    expect(strays).toEqual([]);

    for (const table of [DQ_PROJECT_FINANCE, DQ_LISTED_EQUITY]) {
      expect(table.scale).toMatch(/1 is the highest/);
      /* A category, never a mark out of five. */
      expect(table.scale).toMatch(/never a mark out of five/);
    }

    const nameless = JSON.parse(JSON.stringify(DQ_PROJECT_FINANCE));
    delete nameless.assetClass;
    expect(() => checked('x.json', nameless, dqTableSchema)).toThrow(/assetClass/);
  });

  test('an absent grid factor must state why it is absent', () => {
    const { countryConfigSchema, COUNTRY_CONFIG } =
      require('../src/domains/pcaf-part-a/domain/reference');
    const bent = JSON.parse(JSON.stringify(COUNTRY_CONFIG));
    bent.countries.LK.grid_factors.combined_margin = null;
    delete bent.countries.LK.grid_factors.combined_margin_absent_reason;
    /* A bare null cannot be told from a field nobody filled in, which is the
       distinction this file exists to keep. */
    expect(() => checked('data/pcaf-parta/country-config.json', bent, countryConfigSchema))
      .toThrow(/absent with no/);
  });

  test('the shipped assurance baseline can never say an audit happened', () => {
    const { BASELINE } = require('../src/domains/lending/application/assurance');
    for (const scope of Object.values(BASELINE.scopes)) {
      expect((/** @type {any} */ (scope)).status).toBe('not_declared');
    }
  });

  test('the capital book is refused rather than half-read when it does not join up', () => {
    const baseline = require('../src/domains/capital/infrastructure/capital-baseline');
    const book = baseline.baselineBook();
    expect(book).not.toBeNull();
    if (!book) return;
    /* Every payment lands on a facility that is on the book. A payment that
       did not would be drawn money attributed to no row: summed into the
       disbursed total, shown against nothing. */
    const ids = new Set(book.investments.map((/** @type {any} */ i) => i.id));
    for (const payment of book.payments) expect(ids.has(payment.investmentId)).toBe(true);
    const portfolios = new Set(book.portfolios.map((/** @type {any} */ p) => p.id));
    for (const inv of book.investments) expect(portfolios.has(inv.portfolioId)).toBe(true);
  });

  test('an instrument cannot answer a barrier no record can declare', () => {
    const { instrumentsSchema, INSTRUMENT_CATALOGUE } =
      require('../src/domains/gcf/domain/reference');
    const bent = JSON.parse(JSON.stringify(INSTRUMENT_CATALOGUE));
    bent.instruments[0].answers = ['a_barrier_that_does_not_exist'];
    /* Such an instrument matches nothing, silently, while reading as coverage
       — and coverage is always reported with what it leaves standing. */
    expect(() => checked('data/gcf/instruments.json', bent, instrumentsSchema))
      .toThrow(/which no record can declare/);
  });
});

describe('The model extracts; the engine computes', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/domains/lending/application/extract.js'), 'utf8');

  test('the extraction schema admits no figure the model computed', () => {
    const schema = src.slice(src.indexOf('const extractionOutputSchema'),
      src.indexOf('Parse Claude'));
    /* An LLM must never compute a figure that reaches a regulatory
       disclosure, so the fields it could have multiplied for itself are not
       in the schema and are stripped if returned. */
    for (const computed of ['emissionFactor', 'totalKgCO2e', 'emissions']) {
      expect({ field: computed, present: schema.includes(computed) })
        .toEqual({ field: computed, present: false });
    }
    expect(schema).toMatch(/quantity: Joi\.number\(\)\.min\(0\)\.allow\(null\)/);
  });

  test('the output is validated before anything is multiplied', () => {
    const validateAt = src.indexOf('extractionOutputSchema.validate');
    const enrichAt = src.indexOf('_enrichWithFactor(mat)');
    expect(validateAt).toBeGreaterThan(-1);
    expect(validateAt).toBeLessThan(enrichAt);
    /* `convert: false` is what makes it worth having: Joi would otherwise turn
       "1200" into 1200 and the shape would pass, hiding the one case this
       boundary exists to catch. */
    expect(src.slice(validateAt, validateAt + 200)).toMatch(/convert: false/);
  });
});
