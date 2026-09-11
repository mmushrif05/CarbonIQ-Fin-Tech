// @ts-check
/**
 * PCAF Part A §5.2 reporting — the barrel.
 *
 * Two documents, one content model, one renderer. The annual disclosure is
 * built from the register's reporting-year position; the per-exposure report
 * from one engine result. Both render through the platform report standard,
 * the same renderer Part C uses, so the two scopes stay apart while sharing
 * one document engine.
 */

'use strict';

const { disclosureFacts, exposureFacts, STANDARD } = require('./facts');
const { buildStandardModel } = require('./model');
const { renderStandardPDF } = require('../../../platform/reporting/report-standard/render-pdf');
const { renderStandardDOCX } = require('../../../platform/reporting/report-standard/render-docx');

function disclosureModel(input) { return buildStandardModel(disclosureFacts(input)); }
function exposureModel(input) { return buildStandardModel(exposureFacts(input)); }

function disclosurePDF(input) { return renderStandardPDF(disclosureModel(input)); }
function disclosureDOCX(input) { return renderStandardDOCX(disclosureModel(input)); }
function exposurePDF(input) { return renderStandardPDF(exposureModel(input)); }
function exposureDOCX(input) { return renderStandardDOCX(exposureModel(input)); }

module.exports = {
  STANDARD,
  disclosureFacts, exposureFacts,
  disclosureModel, exposureModel,
  disclosurePDF, disclosureDOCX, exposurePDF, exposureDOCX,
};
