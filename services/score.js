/**
 * CarbonIQ FinTech — Carbon Finance Score Service
 *
 * Calculates a normalized project-level score (0-100) that banks use
 * for green loan eligibility, pricing, and covenant compliance.
 *
 * CFS = w1×Material + w2×Compliance + w3×Verification + w4×Reduction + w5×Certification
 *
 * Classification:
 *   Green (>=70) | Transition (40-69) | Brown (<40)
 *
 * Implementation: Step 5
 */

const { CFS_WEIGHTS, CFS_THRESHOLDS } = require('../config/constants');

/**
 * Calculate the Carbon Finance Score for a project.
 *
 * @param {Object} projectData - Aggregated project metrics
 * @param {Object} projectData.materials80Pct - 80% significant materials data
 * @param {Object} projectData.approvalStatus - Workflow approval metrics
 * @param {Object} projectData.verification - External verification status
 * @param {Object} projectData.reduction - Baseline vs target reduction
 * @param {Object} projectData.certification - Green certification info
 * @returns {Object} { score, classification, breakdown, dataCompleteness }
 */
function calculateCarbonFinanceScore(projectData) {
  const breakdown = {
    material: calculateMaterialScore(projectData.materials80Pct),
    compliance: calculateComplianceScore(projectData.approvalStatus),
    verification: calculateVerificationScore(projectData.verification),
    reduction: calculateReductionScore(projectData.reduction),
    certification: calculateCertificationScore(projectData.certification)
  };

  const score = Math.round(
    breakdown.material * CFS_WEIGHTS.material +
    breakdown.compliance * CFS_WEIGHTS.compliance +
    breakdown.verification * CFS_WEIGHTS.verification +
    breakdown.reduction * CFS_WEIGHTS.reduction +
    breakdown.certification * CFS_WEIGHTS.certification
  );

  const classification = score >= CFS_THRESHOLDS.green
    ? 'green'
    : score >= CFS_THRESHOLDS.transition
      ? 'transition'
      : 'brown';

  const dataCompleteness = calculateDataCompleteness(projectData);

  return {
    score: Math.max(0, Math.min(100, score)),
    classification,
    breakdown,
    dataCompleteness,
    calculatedAt: new Date().toISOString()
  };
}

function calculateMaterialScore(materials) {
  if (!materials || !materials.items) return 0;
  const significant = materials.items.filter(i => i.inTop80Pct);
  if (significant.length === 0) return 0;
  const withEPD = significant.filter(i => i.epdVerified || i._gwpAdjusted);
  return Math.round((withEPD.length / significant.length) * 100);
}

function calculateComplianceScore(approval) {
  if (!approval) return 0;
  const { total, approved, pending, rejected } = approval;
  if (!total || total === 0) return 0;
  return Math.round((approved / total) * 100);
}

function calculateVerificationScore(verification) {
  if (!verification) return 0;
  if (verification.status === 'verified') return 100;
  if (verification.status === 'in_review') return 50;
  if (verification.status === 'submitted') return 25;
  return 0;
}

function calculateReductionScore(reduction) {
  if (!reduction) return 0;
  const { actual, target } = reduction;
  if (!target || target === 0) return 0;
  const achievementRatio = Math.min(actual / target, 1.5);
  return Math.round(achievementRatio * 100 / 1.5);
}

function calculateCertificationScore(certification) {
  if (!certification) return 0;
  const levels = {
    'platinum': 100, 'gold': 75, 'silver': 50, 'certified': 25,
    'super_low_energy': 100, 'zero_carbon_ready': 100,
    'gold_plus': 80, 'green_mark': 60
  };
  return levels[certification.level] || 0;
}

function calculateDataCompleteness(projectData) {
  let filled = 0;
  let total = 5;
  if (projectData.materials80Pct && projectData.materials80Pct.items) filled++;
  if (projectData.approvalStatus) filled++;
  if (projectData.verification) filled++;
  if (projectData.reduction) filled++;
  if (projectData.certification) filled++;
  return Math.round((filled / total) * 100);
}

module.exports = { calculateCarbonFinanceScore };
