/**
 * PCAF Part A §5.9 — the persisted sovereign register (step 4).
 *
 * The register turns the stateless engine into a book: exposures persist, a
 * year's position is rolled up from a stored projection, coverage is a
 * percentage of the entity's stated book total, and a recomputation reports
 * what moved. The rules it inherits from the §5.2 register are pinned here —
 * both halves kept, one bond once, a 409 on an empty year — and the one that is
 * new to the sovereign shape: the position sums scope 1 on both LULUCF
 * boundaries without ever adding them together.
 */

'use strict';

const store = require('../src/platform/database/store');
const sovereign = require('../src/domains/pcaf-part-a/application/sovereign-register');
const register = require('../src/domains/pcaf-part-a/application/register');
const sovRepo = require('../src/domains/pcaf-part-a/infrastructure/sovereign-store');
const { rollUpSovereign } = require('../src/domains/pcaf-part-a/domain/sovereign/portfolio');

const ORG = 'org-sov-register';

beforeEach(async () => { await store._resetMemory(); });

const sg = (over = {}) => ({
  reportingYear: 2024, country: 'SG', exposure: { amount: 1e6, currency: 'USD' }, ...over,
});

describe('Recording and reading', () => {
  test('a sovereign exposure records with both halves kept', async () => {
    const rec = await sovereign.record(ORG, sg());
    expect(rec.exposureId).toMatch(/^pas_/);
    expect(rec.assetClass).toBe('sovereign-debt');
    expect(rec.country.code).toBe('SG');
    expect(rec.input.exposure.amount).toBe(1e6);
    expect(Math.round(rec.result.inventory.scope1.exclLULUCF.value)).toBe(106);
    const got = await sovereign.get(ORG, rec.exposureId);
    expect(got.exposureId).toBe(rec.exposureId);
  });

  test('one bond once — a repeated reference in a year is a 409', async () => {
    await sovereign.record(ORG, sg({ identifiers: { accountNumber: 'ISIN-SG-001' } }));
    await expect(sovereign.record(ORG, sg({ identifiers: { accountNumber: 'ISIN-SG-001' } })))
      .rejects.toMatchObject({ code: 'DUPLICATE_SOVEREIGN_HOLDING', statusCode: 409 });
    /* Two different references stand — a bank may hold several of one issuer. */
    await expect(sovereign.record(ORG, sg({ identifiers: { accountNumber: 'ISIN-SG-002' } })))
      .resolves.toBeTruthy();
  });

  test('a reporting year with no exposures is a 409, not a position of zero', async () => {
    await expect(sovereign.position(ORG, 2030)).rejects.toMatchObject({ code: 'EMPTY_SOVEREIGN_YEAR', statusCode: 409 });
  });
});

describe('The reporting-year position', () => {
  test('scope 1 is summed on both boundaries and never added together', async () => {
    await sovereign.record(ORG, sg({ identifiers: { accountNumber: 'A' } }));
    await sovereign.record(ORG, {
      reportingYear: 2024, exposure: { amount: 5e6, currency: 'USD' }, identifiers: { accountNumber: 'B' },
      sovereign: { name: 'Testland', scope1ExclLULUCF: 40e6, scope1InclLULUCF: 30e6, pppGdp: 400000, emissionsYear: 2024, pppGdpYear: 2024, basis: 'unfccc-reported-verified' },
    });
    const pos = await sovereign.position(ORG, 2024);
    expect(pos.exposures).toBe(2);
    expect(pos.totals.financedScope1ExclLULUCF).toBeGreaterThan(0);
    /* Only Testland holds an including-LULUCF figure, so the incl sum is partial. */
    expect(pos.totals.financedScope1InclLULUCF.heldCount).toBe(1);
    expect(pos.totals.financedScope1InclLULUCF.note).toMatch(/never added/i);
    /* No single field equals excl + incl. */
    const excl = pos.totals.financedScope1ExclLULUCF;
    const incl = pos.totals.financedScope1InclLULUCF.value;
    expect(JSON.stringify(pos.totals)).not.toContain(String(+(excl + incl).toFixed(2)));
  });

  test('coverage is a percentage of the stated book, or absent', async () => {
    await sovereign.record(ORG, sg());
    const noBook = await sovereign.position(ORG, 2024);
    expect(noBook.coverage.share).toBeNull();
    expect(noBook.coverage.note).toMatch(/absent|not stated/i);

    await register.stateBook(ORG, { reportingYear: 2024, totalLoansAndInvestments: 1e8, currency: 'USD', statedBy: 'CFO' });
    const withBook = await sovereign.position(ORG, 2024);
    expect(withBook.coverage.share).toBeGreaterThan(0);
    expect(withBook.coverage.assessedOutstanding).toBe(1e6);
  });

  test('the disclosed score is weighted by outstanding amount', async () => {
    await sovereign.record(ORG, sg());
    const pos = await sovereign.position(ORG, 2024);
    expect(pos.dataQuality.basis).toMatch(/outstanding amount/);
    expect(pos.dataQuality.score).toBe(2); // SG EDGAR → option 1b → score 2
  });
});

describe('The stored projection equals the whole record', () => {
  test('the position rolled from the projection matches the whole-record roll-up figure for figure', async () => {
    await sovereign.record(ORG, sg({ identifiers: { accountNumber: 'A' } }));
    await sovereign.record(ORG, sg({ country: 'HK', identifiers: { accountNumber: 'B' } }));

    const projected = await sovereign.position(ORG, 2024);
    const whole = await sovRepo.exposuresForYear(ORG, 2024);
    const expected = rollUpSovereign(whole.map(sovereign._inflate), {});
    expect(projected.totals.financedScope1ExclLULUCF).toBe(expected.totals.financedScope1ExclLULUCF);
    expect(projected.dataQuality.score).toBe(expected.dataQuality.score);
    expect(projected.bySovereign.length).toBe(expected.bySovereign.length);
  });
});

describe('Recompute', () => {
  test('a deterministic engine reports no movement on the same input', async () => {
    const rec = await sovereign.record(ORG, sg());
    const { movement } = await sovereign.recompute(ORG, rec.exposureId);
    expect(movement.moved).toBe(false);
    expect(movement.note).toMatch(/same figures/i);
    expect(movement.lines.map(l => l.line)).toContain('scope1 excl LULUCF');
  });
});
