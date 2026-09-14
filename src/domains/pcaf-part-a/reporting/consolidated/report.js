// @ts-check
/**
 * The consolidated Part A disclosure — the barrel. One content model, the one
 * platform renderer, so the document a bank files renders through exactly the
 * engine the per-class documents and Part C render through.
 */

'use strict';

const { disclosureFacts, STANDARD } = require('./facts');
const { buildStandardModel } = require('./model');
const { renderStandardPDF } = require('../../../../platform/reporting/report-standard/render-pdf');
const { renderStandardDOCX } = require('../../../../platform/reporting/report-standard/render-docx');

function disclosureModel(input) { return buildStandardModel(disclosureFacts(input)); }
function disclosurePDF(input) { return renderStandardPDF(disclosureModel(input)); }
function disclosureDOCX(input) { return renderStandardDOCX(disclosureModel(input)); }

module.exports = { STANDARD, disclosureFacts, disclosureModel, disclosurePDF, disclosureDOCX };
