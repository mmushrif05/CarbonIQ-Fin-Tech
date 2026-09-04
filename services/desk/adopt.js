/**
 * CarbonIQ FinTech — adopting a GCF candidate into the capital book
 *
 * The join. Before this existed the projects lived in one place and the money
 * in another, and the questions a credit committee actually asks — which of
 * these did we write, how much has gone out, what does the book carry — could
 * not be answered without a person holding both screens in their head.
 *
 * Adoption creates one pipeline investment from one pipeline record. Three
 * things travel with it and each is written once and never again:
 *
 * **The link.** `origin` says which record this came from. It is set at
 * creation and `updateInvestment` will not accept it, because a provenance
 * pointer that can be re-aimed afterwards is not provenance.
 *
 * **The gate answer as it stood.** The screening verdict is frozen alongside.
 * A gate is a statement about the day it was asked: the accreditation, the
 * project cost and the E&S category can all move afterwards, and a verdict
 * re-derived later would quietly restate what was known when the facility was
 * written.
 *
 * **The pledge.** The mitigation figure, its tier and its counterfactual, as
 * they stood on the day. Recomputing it from the live record would mean every
 * later edit silently rewrote what a committee was told, and the rewrite would
 * be invisible exactly where it matters.
 *
 * ── What adoption is not ───────────────────────────────────────────────────
 *
 * It is not a decision to lend. The investment lands at `status: 'pipeline'`
 * and `delivery: 'not_started'` — on the book as a candidate, ranked with the
 * others, committed only by a deliberate PATCH afterwards.
 *
 * It is also not a second gate. An `excluded` screening verdict is carried,
 * not enforced: the gate is about what DFCC can carry *as the GCF accredited
 * entity*, and a bank may perfectly well finance with its own balance sheet
 * something it cannot take to the Fund. Refusing here would be this software
 * deciding a question that belongs to the bank. The verdict travels so the
 * decision is made with it in view.
 */

'use strict';

const book = require('../capital-book');
const gcfStore = require('../gcf/store');
const screening = require('../gcf/screening');

const err = (statusCode, code, message, remedy) => {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  if (remedy) e.remedy = remedy;
  return e;
};

const traced = t => (t && typeof t === 'object' && Number.isFinite(Number(t.value))
  ? { value: Number(t.value), tier: t.tier || null }
  : { value: null, tier: null });

/** A record id turned into an investment id, so a duplicate is visible by eye. */
function investmentIdFor(recordId) {
  const slug = String(recordId).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `inv_${slug}`.slice(0, 60);
}

/**
 * Adopt one candidate.
 *
 * @param {string} orgId
 * @param {object} input  recordId, portfolioId, and optional overrides
 * @returns {Promise<{investment: object, project: object, screening: object, source: string}>}
 */
async function adoptCandidate(orgId, input = {}) {
  const recordId = input.recordId;
  if (!recordId) throw err(400, 'RECORD_REQUIRED', 'recordId is required — adoption is always of a named pipeline record.');
  if (!input.portfolioId) {
    throw err(400, 'PORTFOLIO_REQUIRED',
      'portfolioId is required. An investment has to sit in a portfolio, because the allocation it '
      + 'is drawn against belongs to the portfolio and not to the book as a whole.');
  }

  const { project, source } = await gcfStore.get(orgId, recordId);
  if (!project) {
    throw err(404, 'RECORD_NOT_FOUND',
      `No pipeline record "${recordId}" in the recorded book or the shipped pipeline.`);
  }

  const portfolio = await book.getPortfolio(orgId, input.portfolioId);
  if (!portfolio) {
    throw err(404, 'PORTFOLIO_NOT_FOUND',
      `No portfolio "${input.portfolioId}" in this book.`,
      'Record the portfolio first, or adopt into one that exists.');
  }

  /* One record, one investment. Checked against the book rather than against
     the generated id alone, so an investment created under any id still blocks
     a second adoption of the same project — two rows for one project would
     double every figure on the desk. */
  const existing = await book.listInvestments(orgId);
  const already = existing.find(i => i.origin && i.origin.system === 'gcf' && i.origin.recordId === recordId);
  if (already) {
    throw err(409, 'ALREADY_ADOPTED',
      `"${project.name}" is already on the book as investment ${already.id}.`,
      'Amend that investment rather than adopting the record a second time.');
  }

  const verdict = screening.screenOne(project, { accreditation: gcfStore.seedMeta().accreditation });

  const fin = project.financing || {};
  const mit = project.mitigation || {};
  const annual = traced(mit.annual_tCO2e);
  const lifetime = traced(mit.lifetime_tCO2e);

  /* DFCC's own share is the bank's money and therefore the bank's commitment.
     The GCF ask and any sponsor equity are somebody else's, and putting them in
     this book would report a position the bank does not hold. An explicit
     override wins, because a term sheet is what actually decides it. */
  const commitment = input.commitment === undefined || input.commitment === null || input.commitment === ''
    ? Number(fin.dfcc) || 0
    : Number(input.commitment);
  if (!Number.isFinite(commitment) || commitment < 0) {
    throw err(400, 'BAD_COMMITMENT', `commitment must be a number of zero or more; received "${input.commitment}".`);
  }

  const investment = await book.createInvestment(orgId, {
    id: investmentIdFor(recordId),
    portfolioId: input.portfolioId,
    name: project.name,
    sector: project.sector || 'Unclassified',
    assetType: project.resultsArea || null,
    country: (project.location && project.location.country) || 'LK',
    status: 'pipeline',
    delivery: 'not_started',
    commitment,
    projectCost: Number(fin.totalCost) || 0,
    startYear: input.startYear === undefined ? null : input.startYear,
    phasing: input.phasing || null,
    taxonomy: (project.taxonomy && project.taxonomy.band) || null,
    /* No emission lines are carried across. The four lines on an investment are
       the bank's own attributed inventory, computed from what it finances; the
       pipeline record holds a project-level mitigation claim, which is a
       different boundary entirely. Copying one into the other is exactly the
       merge the three-boundary rule exists to prevent. */
    notes: input.notes || `Adopted from the GCF pipeline record ${project.code}.`,
    origin: {
      system: 'gcf',
      recordId: project.id,
      code: project.code,
      adoptedBy: input.by || null,
      screening: {
        verdict: verdict.status,
        reasons: [...verdict.exclusions, ...verdict.flags].map(r => r.detail),
      },
    },
    pledgedMitigation: {
      annual_tCO2e: annual.value,
      lifetime_tCO2e: lifetime.value,
      tier: annual.tier || lifetime.tier,
      baselineType: (mit.baseline && mit.baseline.type) || null,
      counterfactual: (mit.baseline && mit.baseline.counterfactual) || null,
      isCoBenefit: mit.isCoBenefit === true,
    },
  });

  return { investment, project, screening: verdict, source };
}

module.exports = { adoptCandidate, investmentIdFor };
