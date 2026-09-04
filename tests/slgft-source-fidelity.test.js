/**
 * The Sri Lanka taxonomy constants, pinned to the source document.
 *
 * This suite exists because of what was found when the taxonomy PDF was finally
 * added to the repository: the constants carried activity codes the document
 * does not contain, a threshold kind it does not use, and an edition nobody
 * could produce — and the tests asserted the same wrong values the code
 * produced, so neither side caught it.
 *
 * That is the NDC failure exactly. A test only protects you if it knows
 * something the code does not. What this suite knows is the document:
 * SLGFT-Sri-Lanka-Green-Finance-Taxonomy-May2022.pdf, in the repository root.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { TAXONOMY_LK, TAXONOMY_SL } = require('../config/constants');

const ROOT = path.join(__dirname, '..');
const PDF = path.join(ROOT, 'SLGFT-Sri-Lanka-Green-Finance-Taxonomy-May2022.pdf');

/* Activity codes present in the document, read out of it by full-text sweep.
   Non-contiguous by design — the numbering skips, which is what tells us the
   document is a subset rather than the complete activity list. */
const IN_DOCUMENT = [
  'A2.1', 'A3.1',
  'E1.6', 'E1.7', 'E1.8', 'E2.3', 'E2.4', 'E2.5', 'E3.5', 'E3.6',
  'M2.2', 'M2.3', 'M3.3', 'M3.9', 'M3.10', 'M3.11', 'M3.13', 'M3.14',
  'M4.5', 'M4.6', 'M4.11', 'M4.12', 'M5.3', 'M5.4',
  'M6.1', 'M6.2', 'M6.3', 'M6.7', 'M7.2', 'M8.2',
];

describe('The source document is in the repository', () => {
  test('the PDF is present and is the file docs/SLGFT-SOURCES.md describes', () => {
    expect(fs.existsSync(PDF)).toBe(true);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(PDF)).digest('hex');
    expect(sha).toBe('1b4f7f78b77b5ab3a40867b054b1052f5cecfb42e33d33b3354cc766acc9803a');
  });

  test('the sources note records what it says, and the constants point at it', () => {
    const notes = fs.readFileSync(path.join(ROOT, 'docs/SLGFT-SOURCES.md'), 'utf8');
    expect(notes).toContain('May 2022');
    expect(notes).toContain('M6.3');
    expect(TAXONOMY_LK.sourceDocument).toBe(path.basename(PDF));
  });
});

describe('The edition claimed is the edition held', () => {
  test('the constants say May 2022, because that is what the cover says', () => {
    expect(TAXONOMY_LK.version).toBe('2022-05');
    expect(TAXONOMY_LK.edition).toBe('May 2022');
  });

  test('nothing in the Sri Lanka constants claims an edition we cannot produce', () => {
    /* "SLGFT v2024" was stamped onto a certificate carrying a SHA-256 audit
       hash. If a 2024 edition is ever obtained, it goes in the repository and
       this assertion is updated with it — not before. */
    const flat = JSON.stringify({ TAXONOMY_LK, TAXONOMY_SL });
    expect(flat).not.toMatch(/v?2024/);
  });
});

describe('Activity codes exist in the document, or say they do not', () => {
  test('every code marked as in the document actually is', () => {
    const claimed = TAXONOMY_LK.constructionActivities
      .filter(a => a.inSourceDocument)
      .map(a => a.code);
    expect(claimed.length).toBeGreaterThan(4);
    const notThere = claimed.filter(c => !IN_DOCUMENT.includes(c));
    expect(notThere).toEqual([]);
  });

  test('every activity carries an explicit evidenced/unevidenced verdict', () => {
    for (const a of TAXONOMY_LK.constructionActivities) {
      expect(typeof a.inSourceDocument).toBe('boolean');
    }
  });

  test('an unevidenced activity carries no code and says why', () => {
    /* Solar and wind are almost certainly in the full taxonomy under codes this
       repository cannot confirm. Printing a guessed code on a certificate is
       the failure; leaving the activity out entirely would be a different one. */
    for (const a of TAXONOMY_LK.constructionActivities.filter(x => !x.inSourceDocument)) {
      expect(a.code).toBeNull();
      expect(a.note).toMatch(/[Nn]ot present in the taxonomy document/);
    }
  });

  test('the codes the constants used to invent are gone', () => {
    const codes = TAXONOMY_LK.constructionActivities.map(a => a.code).filter(Boolean);
    /* M1.1 and M1.2 put construction in macro-sector 1; it is 6.
       M4.1/M4.2/M4.3 asserted solar and wind codes the document lacks.
       A2.1 was labelled "Flood-Resilient Construction"; in the document A2.1 is
       a financial-services activity — affordable climate insurance. */
    for (const bad of ['M1.1', 'M1.2', 'M4.1', 'M4.2', 'M4.3']) {
      expect(codes).not.toContain(bad);
    }
  });

  test('construction sits in macro-sector 6, as the document has it', () => {
    const construction = TAXONOMY_LK.constructionActivities
      .filter(a => a.macroSector === 'Construction' && a.code && a.code.startsWith('M'));
    expect(construction.length).toBeGreaterThan(2);
    for (const a of construction) expect(a.code).toMatch(/^M6\./);
  });
});

describe("The document's own criteria, quoted not paraphrased", () => {
  const byCode = c => TAXONOMY_LK.constructionActivities.find(a => a.code === c);

  test('M6.1 renovation — at least 30% reduction in PED, energy or GHG', () => {
    expect(byCode('M6.1').criterion).toMatch(/at least 30%/);
    expect(byCode('M6.1').criterion).toMatch(/primary energy demand/i);
  });

  test('M6.2 acquisition — Green SL Rated Gold and Platinum', () => {
    expect(byCode('M6.2').criterion).toMatch(/Green SL Rated buildings: Gold and Platinum/);
    expect(byCode('M6.2').eligibility).toBe('certification');
  });

  test('M6.3 new buildings — at least 10% below a nearly zero-energy benchmark', () => {
    const m63 = byCode('M6.3');
    expect(m63.criterion).toMatch(/at least 10% lower/);
    expect(m63.criterion).toMatch(/nearly zero-energy building/);
    /* And it is RELATIVE, so it cannot be answered from an intensity alone. */
    expect(m63.threshold_kgCO2e_m2).toBeNull();
    expect(m63.note).toMatch(/cannot be evaluated from a carbon intensity alone/);
  });

  test('M4.5 hydropower carries all three of the document\'s alternatives', () => {
    const c = byCode('M4.5').criterion;
    expect(c).toMatch(/run-of-river/i);
    expect(c).toMatch(/5 W\/m2/);
    expect(c).toMatch(/100 gCO2e\/kWh/);
    expect(c).toMatch(/G-res tool/);
  });

  test('M4.6 bio-energy carries the 2 MW limit and the 80% saving', () => {
    const c = byCode('M4.6').criterion;
    expect(c).toMatch(/less than 2 MW/);
    expect(c).toMatch(/at least 80%/);
  });
});

describe('No activity claims an absolute carbon-intensity threshold', () => {
  test('the taxonomy sets none, so no activity carries one', () => {
    /* A full-text sweep of all 26 pages returns exactly one figure per unit
       area — 5 W/m2 power density on hydropower — and it is not a carbon
       intensity. */
    for (const a of TAXONOMY_LK.constructionActivities) {
      expect(a.threshold_kgCO2e_m2).toBeNull();
    }
  });

  test('the bands are labelled as this product\'s own screen', () => {
    expect(TAXONOMY_LK.intensityScreen.source).toMatch(/CarbonIQ/);
    expect(TAXONOMY_LK.intensityScreen.notTaxonomy).toMatch(/sets no absolute/);
    expect(TAXONOMY_SL.intensityScreenSource).toMatch(/not a taxonomy\s+threshold/);
  });

  test('the numbers are unchanged, because changing them would rescore projects', () => {
    expect(TAXONOMY_LK.thresholds.green).toBe(600);
    expect(TAXONOMY_LK.thresholds.transition).toBe(900);
    expect(TAXONOMY_SL.criteria.construction.maxEmbodiedCarbon_kgCO2e_per_m2_green).toBe(520);
    expect(TAXONOMY_SL.criteria.construction.maxEmbodiedCarbon_kgCO2e_per_m2_transition).toBe(780);
  });
});

describe('Nothing asserts compliance to the regulator that decides it', () => {
  test('no Sri Lanka label claims CBSL compliance', () => {
    const flat = JSON.stringify({ TAXONOMY_LK, TAXONOMY_SL });
    expect(flat).not.toMatch(/CBSL[- ]Compliant/i);
    expect(flat).not.toMatch(/Compliant\)/);
  });

  test('the screen labels say what they are', () => {
    expect(TAXONOMY_SL.classifications.green.label).toMatch(/intensity screen/);
    expect(TAXONOMY_SL.classifications.transition.label).toMatch(/intensity screen/);
  });

  test('the Green SL rating percentages are marked as not from the taxonomy', () => {
    /* The document names Gold and Platinum for M6.2 and attaches no percentage
       to either. */
    expect(TAXONOMY_SL.certifications.greensl_gold.inSourceDocument).toBe(false);
    expect(TAXONOMY_SL.certifications.greensl_platinum.inSourceDocument).toBe(false);
    expect(TAXONOMY_SL.certifications.note).toMatch(/states no\s+percentage/);
  });
});

describe('A certificate issued before the edition was corrected still verifies', () => {
  test('the verifier reads the stamp off the certificate, not off the code', () => {
    /* The stamp is inside the hash. Changing it without a fallback would
       invalidate every certificate ever issued — that is not a correction,
       it is destroying evidence. */
    const src = fs.readFileSync(path.join(ROOT, 'services/certificate.js'), 'utf8');
    expect(src).toMatch(/LEGACY_STAMP/);
    expect(src).toMatch(/cert\.taxonomy\?\.stamp \|\| LEGACY_STAMP/);
  });

  test('a new certificate carries the edition it was hashed with', () => {
    const { generateCertificate, verifyCertificate } = require('../services/certificate');
    const cert = generateCertificate({
      projectName: 'Fidelity fixture', emissions_tCO2e: 100,
      buildingArea_m2: 1000, bankName: 'DFCC Bank PLC',
    });
    expect(cert.taxonomy.stamp).toBe('SLGFT May 2022');
    expect(cert.taxonomy.sourceDocument).toBe(path.basename(PDF));
    expect(verifyCertificate(cert).valid).toBe(true);
  });
});
