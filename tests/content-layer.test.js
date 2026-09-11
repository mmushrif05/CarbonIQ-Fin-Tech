// @ts-check
/**
 * The content layer, and the two things it must not become.
 *
 * The gap it closes: 7,712 characters of prose lived in domain source, so a
 * compliance officer changing a sentence needed a developer and a deploy.
 *
 * The gap it must not open: most of that prose is not wording. "No row in
 * this table sums them" states a scope rule, and a sentence that can be
 * edited out of a disclosure is a rule that can be edited out of a
 * disclosure. So the overridable set is an allow-list, and an override that
 * would put an endorsement claim back on a page is refused.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const content = require('../src/shared/content');
const { containsForbiddenLanguage } = require('../src/shared/report-integrity');

describe('What a deployment may reword', () => {
  test('every key names its owner, its purpose and its default', () => {
    expect(content.KEYS.length).toBeGreaterThan(0);
    for (const entry of content.catalogue()) {
      expect(['entity', 'presentation']).toContain(entry.owner);
      expect(entry.description.length).toBeGreaterThan(20);
      expect(entry.default.length).toBeGreaterThan(20);
      expect(entry.text).toBe(entry.default);          // nothing overridden in the repo
    }
  });

  test('no default carries endorsement language', () => {
    for (const entry of content.catalogue()) {
      expect(containsForbiddenLanguage(entry.default)).toEqual([]);
    }
  });

  test('the report reads its four statements through it', () => {
    const common = require('../src/domains/pcaf-part-c/reporting/report-standard/common');
    expect(common.PREPARED_BY).toBe(content.text('report.preparedBy'));
    expect(common.UNITS_STATEMENT).toBe(content.text('report.unitsStatement'));
    expect(common.SCALE_QUALIFIER).toBe(content.text('report.scaleQualifier'));
    expect(common.FINANCED_EMISSIONS_STATEMENT).toBe(content.text('report.financedEmissionsStatement'));
  });
});

describe('What it refuses', () => {
  test('a key that is not on the list is refused by name', () => {
    /* Silently dropping an operator's edit is how they conclude the feature
       does not work and go back to asking a developer. */
    expect(() => content.validateOverrides({ 'report.conformanceRule': 'x' }))
      .toThrow(/not an overridable content key/);
  });

  test('an override claiming PCAF endorsement is refused', () => {
    expect(() => content.validateOverrides({ 'report.preparedBy': 'PCAF approved methodology' }))
      .toThrow(/endorsement/);
    expect(() => content.validateOverrides({ 'report.preparedBy': 'Certified by PCAF' }))
      .toThrow(/endorsement/);
  });

  test('the permitted disclaimer still passes', () => {
    /* "not approved, endorsed or certified by PCAF" is the sentence the
       standard's own conformance language requires, and a guard that blocked
       it would block the correct statement along with the false one. */
    expect(() => content.validateOverrides({
      'report.unitsStatement': 'This assessment is not approved, endorsed or certified by PCAF.'
    })).not.toThrow();
  });

  test('an empty or oversized value is refused', () => {
    expect(() => content.validateOverrides({ 'report.preparedBy': '  ' })).toThrow(/non-empty/);
    expect(() => content.validateOverrides({ 'report.preparedBy': 'x'.repeat(content.MAX_LENGTH + 1) }))
      .toThrow(/limit is/);
  });
});

describe('An override reaches the document', () => {
  /* A temporary file, never the deployment's own: this suite used to write
     "PCAF certified" into data/content/report-text.json for one assertion,
     and the Netlify-function suite on another worker loaded the application
     in that instant and refused to start. */
  const file = path.join(os.tmpdir(), `carboniq-report-text-${process.pid}.json`);

  beforeAll(() => {
    fs.writeFileSync(file, JSON.stringify({ text: { 'report.preparedBy': 'Prepared by Ceylon Insurance PLC' } }));
  });

  afterAll(() => {
    fs.rmSync(file, { force: true });
    jest.resetModules();
  });

  test('the cover line becomes the deployment’s', () => {
    jest.resetModules();
    const fresh = require('../src/shared/content');
    fresh.useOverrideFile(file);
    expect(fresh.text('report.preparedBy')).toBe('Prepared by Ceylon Insurance PLC');
    const common = require('../src/domains/pcaf-part-c/reporting/report-standard/common');
    expect(common.PREPARED_BY).toBe('Prepared by Ceylon Insurance PLC');
  });

  test('a bad override fails loudly at load rather than being ignored', () => {
    fs.writeFileSync(file, JSON.stringify({ text: { 'report.preparedBy': 'PCAF certified preparer' } }));
    jest.resetModules();
    const fresh = require('../src/shared/content');
    fresh.useOverrideFile(file);
    expect(() => fresh.text('report.preparedBy')).toThrow(/endorsement/);
  });
});
