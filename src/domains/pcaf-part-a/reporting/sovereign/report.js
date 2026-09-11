// @ts-check
/**
 * PCAF Part A §5.9 sovereign-debt reporting — the barrel.
 *
 * Two documents, one content model, one renderer. The annual disclosure is
 * built from the sovereign register's reporting-year position; the per-holding
 * report from one engine result. Both render through the platform report
 * standard — the same renderer §5.2 and Part C use — so the scopes stay apart
 * while sharing one document engine.
 */

'use strict';

const { disclosureFacts, holdingFacts, STANDARD } = require('./facts');
const { buildStandardModel } = require('./model');
const { renderStandardPDF } = require('../../../../platform/reporting/report-standard/render-pdf');
const { renderStandardDOCX } = require('../../../../platform/reporting/report-standard/render-docx');

function disclosureModel(input) { return buildStandardModel(disclosureFacts(input)); }
function holdingModel(input) { return buildStandardModel(holdingFacts(input)); }

function disclosurePDF(input) { return renderStandardPDF(disclosureModel(input)); }
function disclosureDOCX(input) { return renderStandardDOCX(disclosureModel(input)); }
function holdingPDF(input) { return renderStandardPDF(holdingModel(input)); }
function holdingDOCX(input) { return renderStandardDOCX(holdingModel(input)); }

module.exports = {
  STANDARD,
  disclosureFacts, holdingFacts,
  disclosureModel, holdingModel,
  disclosurePDF, disclosureDOCX, holdingPDF, holdingDOCX,
};
