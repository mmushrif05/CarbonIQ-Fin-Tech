/**
 * CarbonIQ FinTech — SLGFT Green Loan Certificate Service
 *
 * Generates tamper-evident digital Green Loan Certificates for projects
 * that meet the Sri Lanka Green Finance Taxonomy (SLGFT v2024) criteria,
 * regulated by the Central Bank of Sri Lanka (CBSL).
 */

'use strict';

const crypto = require('crypto');
const { TAXONOMY_LK } = require('../config/constants');

const CERT_VERSION = '1.0';

/**
 * Generate a SLGFT Green Loan Certificate.
 */
function generateCertificate(opts) {
  const {
    projectName, projectId, bankName, bankOrgId,
    slsicSector, activityCode,
    emissions_tCO2e, buildingArea_m2,
    ndcTier, ndcContrib_pct, sdgs = [], dnshStatus = 'pass',
    classificationTier, loanAmount_M, currency = 'LKR', validUntil,
  } = opts;

  if (!projectName) throw new Error('projectName is required.');
  if (!bankName)    throw new Error('bankName is required.');

  const intensity = (emissions_tCO2e && buildingArea_m2)
    ? Math.round((emissions_tCO2e * 1000) / buildingArea_m2)
    : null;

  const actMatch = activityCode
    ? TAXONOMY_LK.constructionActivities.find(a => a.code === activityCode)
    : null;

  let tier = classificationTier;
  if (!tier) {
    if (actMatch && actMatch.eligibility === 'direct') {
      tier = 'directly_eligible';
    } else if (intensity !== null && intensity <= TAXONOMY_LK.thresholds.green) {
      tier = 'green';
    } else if (intensity !== null && intensity <= TAXONOMY_LK.thresholds.transition) {
      tier = 'transition';
    } else {
      tier = 'conditional';
    }
  }

  const sectorInfo = slsicSector ? TAXONOMY_LK.sectors[slsicSector] : null;
  const issuedAt   = new Date().toISOString();
  const expiresAt  = validUntil || new Date(Date.now() + 2 * 365.25 * 24 * 3600 * 1000).toISOString();
  const certId     = `SLGFT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const classificationRecord = {
    certId, certVersion: CERT_VERSION, issuedAt,
    taxonomy: 'SLGFT v2024', regulator: 'Central Bank of Sri Lanka (CBSL)',
    projectName, projectId: projectId || null, tier,
    activityCode: activityCode || null, slsicSector: slsicSector || null,
    intensity_kgCO2e_m2: intensity, emissions_tCO2e: emissions_tCO2e || null,
    ndcTier: ndcTier || null, ndcContrib_pct: ndcContrib_pct || null,
    sdgs: [...sdgs].sort((a, b) => a - b), dnshStatus, bankName,
  };

  const hash = crypto.createHash('sha256').update(JSON.stringify(classificationRecord)).digest('hex');

  return {
    certId, certVersion: CERT_VERSION, issuedAt, expiresAt, hash, isValid: true,

    taxonomy: { framework: TAXONOMY_LK.name, version: TAXONOMY_LK.version, regulator: TAXONOMY_LK.regulator },

    project: {
      name: projectName, id: projectId || null,
      slsicSector: slsicSector || null, sectorLabel: sectorInfo ? sectorInfo.label : null,
      activityCode: activityCode || null, activityLabel: actMatch ? actMatch.label : null,
      activityEligibility: actMatch ? actMatch.eligibility : null,
      emissions_tCO2e: emissions_tCO2e || null, buildingArea_m2: buildingArea_m2 || null,
      intensity_kgCO2e_m2: intensity,
    },

    classification: {
      tier, tierLabel: _tierLabel(tier), description: _tierDescription(tier, intensity),
      thresholds: {
        green: `\u2264${TAXONOMY_LK.thresholds.green} kgCO2e/m\xb2`,
        transition: `\u2264${TAXONOMY_LK.thresholds.transition} kgCO2e/m\xb2`,
      },
    },

    loanDetails: {
      bankName, bankOrgId: bankOrgId || null, loanAmount_M: loanAmount_M || null, currency,
      loanClassification: _loanClass(tier),
      pricingAdjustment_bps: _loanPricing(tier),
      pricingLabel: _loanPricing(tier) !== 0
        ? `${_loanPricing(tier) > 0 ? '+' : ''}${_loanPricing(tier)} bps` : 'Standard rate',
    },

    ndcAlignment: {
      tier: ndcTier || null, contribution_pct: ndcContrib_pct || null,
      unconditionalTarget: TAXONOMY_LK.ndcTargets.unconditional,
      conditionalTarget: TAXONOMY_LK.ndcTargets.conditional,
      netZeroTarget: TAXONOMY_LK.ndcTargets.netZeroTarget,
    },

    sdgAlignment: {
      sdgs: [...sdgs].sort((a, b) => a - b),
      keySDGs: TAXONOMY_LK.ndcTargets.keySDGs,
    },

    dnsh: {
      status: dnshStatus,
      objectives: ['M', 'A', 'P', 'E'].map(code => ({
        code, label: TAXONOMY_LK.environmentalObjectives[code]?.label || code, status: dnshStatus,
      })),
    },

    auditTrail: {
      hash, algorithm: 'SHA-256',
      canonicalForm: 'JSON.stringify(classificationRecord)',
      generatedBy: 'CarbonIQ FinTech — SLGFT Certificate Service v1.0',
    },
  };
}

/**
 * Verify a certificate's tamper-evident hash.
 */
function verifyCertificate(cert) {
  try {
    const rec = {
      certId: cert.certId, certVersion: cert.certVersion, issuedAt: cert.issuedAt,
      taxonomy: 'SLGFT v2024', regulator: 'Central Bank of Sri Lanka (CBSL)',
      projectName: cert.project?.name, projectId: cert.project?.id,
      tier: cert.classification?.tier, activityCode: cert.project?.activityCode,
      slsicSector: cert.project?.slsicSector,
      intensity_kgCO2e_m2: cert.project?.intensity_kgCO2e_m2,
      emissions_tCO2e: cert.project?.emissions_tCO2e,
      ndcTier: cert.ndcAlignment?.tier, ndcContrib_pct: cert.ndcAlignment?.contribution_pct,
      sdgs: [...(cert.sdgAlignment?.sdgs || [])].sort((a, b) => a - b),
      dnshStatus: cert.dnsh?.status, bankName: cert.loanDetails?.bankName,
    };
    const hash = crypto.createHash('sha256').update(JSON.stringify(rec)).digest('hex');
    const valid = hash === cert.hash;
    return {
      valid,
      message: valid ? 'Certificate hash verified successfully.' : 'Hash mismatch — document may have been tampered with.',
      computedHash: hash, storedHash: cert.hash,
    };
  } catch (err) {
    return { valid: false, message: `Verification failed: ${err.message}` };
  }
}

function _tierLabel(tier) {
  return { green: 'Green — SLGFT Aligned', transition: 'Transition — SLGFT Pathway',
    directly_eligible: 'Directly Eligible — SLGFT Aligned', conditional: 'Conditional — Further Assessment Required' }[tier] || tier;
}

function _tierDescription(tier, intensity) {
  const i = intensity !== null ? ` (${intensity} kgCO2e/m\xb2)` : '';
  return {
    green: `Embodied carbon intensity${i} is at or below the SLGFT Green threshold. Qualifies as a SLGFT Green Loan under CBSL Direction No. 05 of 2022.`,
    transition: `Embodied carbon intensity${i} is below the SLGFT Transition threshold. Qualifies as a Sustainability-Linked Loan (SLL) with carbon reduction covenant.`,
    directly_eligible: 'Project activity is directly eligible under SLGFT without an intensity threshold. Qualifies as a SLGFT Green Loan.',
    conditional: 'Project requires further SLGFT assessment. Intensity may exceed the transition threshold.',
  }[tier] || 'Classification pending further review.';
}

function _loanClass(tier) {
  return { green: 'Green Loan (SLGFT)', transition: 'Sustainability-Linked Loan (SLL)',
    directly_eligible: 'Green Loan (SLGFT — Direct Eligibility)', conditional: 'Standard Loan (pending)' }[tier] || 'Standard';
}

function _loanPricing(tier) {
  return { green: -20, transition: -8, directly_eligible: -20, conditional: 0 }[tier] || 0;
}

module.exports = { generateCertificate, verifyCertificate };
