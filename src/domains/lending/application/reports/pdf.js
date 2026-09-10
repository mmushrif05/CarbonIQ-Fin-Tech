// @ts-check
/**
 * The PDF rendering of a report.
 */

'use strict';

const PDFDocument = require('pdfkit');
const integrity   = require('../../../../shared/report-integrity');
const { _humaniseKey } = require('./demo');

// ---------------------------------------------------------------------------
// PDF Builder
// ---------------------------------------------------------------------------

function buildPDF(report) {
  const doc = new PDFDocument({ margin: 56, size: 'A4', compress: true });

  _pdfCover(doc, report);
  _pdfSummaryTable(doc, report);
  _pdfSections(doc, report);
  _pdfFooterNote(doc, report);

  doc.end();
  return doc;
}

function _pdfCover(doc, report) {
  // Header bar
  doc.rect(0, 0, doc.page.width, 8).fill('#10b981');

  doc.moveDown(2);
  doc.fontSize(9).fillColor('#6e6e73').text('CONFIDENTIAL — BANK USE ONLY', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(22).fillColor('#1d1d1f').font('Helvetica-Bold')
     .text('CarbonIQ', { align: 'center' });
  doc.fontSize(14).fillColor('#6e6e73').font('Helvetica')
     .text('Bank Carbon Intelligence Platform', { align: 'center' });

  doc.moveDown(1.5);
  doc.fontSize(18).fillColor('#1d1d1f').font('Helvetica-Bold')
     .text(report.title, { align: 'center' });

  doc.moveDown(0.8);
  doc.fontSize(11).fillColor('#6e6e73').font('Helvetica')
     .text(`${report.organisation}  ·  ${report.reportingPeriod}`, { align: 'center' });

  doc.moveDown(0.4);
  doc.fontSize(9).fillColor('#aeaeb2')
     .text(report.standard, { align: 'center' });

  // Divider
  doc.moveDown(1.5);
  doc.moveTo(56, doc.y).lineTo(doc.page.width - 56, doc.y).lineWidth(0.5).strokeColor('#e5e5e7').stroke();
  doc.moveDown(1);
}

function _pdfSummaryTable(doc, report) {
  const summary = report.summary || {};
  const entries = Object.entries(summary);
  if (entries.length === 0) return;

  doc.fontSize(12).fillColor('#1d1d1f').font('Helvetica-Bold').text('Executive Summary');
  doc.moveDown(0.6);

  const colW = (doc.page.width - 112) / 2;
  let col = 0;
  let startX = 56;
  let rowY = doc.y;

  for (const [key, val] of entries) {
    const label = _humaniseKey(key);
    const value = String(val);
    const x = startX + col * (colW + 8);

    doc.fontSize(8).fillColor('#aeaeb2').font('Helvetica').text(label.toUpperCase(), x, rowY, { width: colW });
    doc.fontSize(11).fillColor('#1d1d1f').font('Helvetica-Bold').text(value, x, doc.y, { width: colW });

    col++;
    if (col >= 2) {
      col = 0;
      rowY = doc.y + 12;
      doc.y = rowY;
    } else {
      doc.y = rowY;
    }
  }

  doc.moveDown(2);
  doc.moveTo(56, doc.y).lineTo(doc.page.width - 56, doc.y).lineWidth(0.5).strokeColor('#e5e5e7').stroke();
  doc.moveDown(1);
}

function _pdfSections(doc, report) {
  const skip = new Set(['generatedAt', 'reportingPeriod', 'organisation', 'reportId', 'type', 'title', 'standard', 'summary']);
  const sections = Object.entries(report).filter(([k]) => !skip.has(k));

  for (const [key, value] of sections) {
    if (doc.y > doc.page.height - 140) doc.addPage();

    doc.fontSize(13).fillColor('#1d1d1f').font('Helvetica-Bold').text(_humaniseKey(key));
    doc.moveDown(0.5);
    _pdfValue(doc, value, 0);
    doc.moveDown(1);
  }
}

function _pdfValue(doc, value, depth) {
  const indent = 56 + depth * 14;
  const width = doc.page.width - indent - 56;

  /* An absent disclosure has to read as absent on the page, not as an object
     dump. It is set in italic amber so a reader scanning the document can see
     at a glance which statements the entity still has to make. */
  if (integrity.isPlaceholder(value)) {
    const label = value._status === integrity.NOT_PROVIDED
      ? 'Not provided by the reporting entity'
      : 'Not measured by this system';
    const detail = value.requirement || value.metric;
    const ref = value.standardRef ? ` (${value.standardRef})` : '';
    doc.fontSize(9).fillColor('#8a5a00').font('Helvetica-Oblique')
       .text(`${label}${ref} — ${detail}`, indent, doc.y, { width });
    if (value.reason || value.note) {
      doc.fontSize(8).fillColor('#6e6e73').font('Helvetica-Oblique')
         .text(value.reason || value.note, indent, doc.y, { width });
    }
    doc.moveDown(0.3);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'object' && item !== null) {
        _pdfValue(doc, item, depth + 1);
      } else {
        doc.fontSize(9).fillColor('#3d3d3f').font('Helvetica')
           .text(`• ${item}`, indent, doc.y, { width });
      }
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      if (doc.y > doc.page.height - 100) doc.addPage();

      if (typeof v === 'object' || Array.isArray(v)) {
        doc.fontSize(10).fillColor('#1d1d1f').font('Helvetica-Bold')
           .text(_humaniseKey(k), indent, doc.y, { width });
        doc.moveDown(0.3);
        _pdfValue(doc, v, depth + 1);
      } else {
        doc.fontSize(8).fillColor('#aeaeb2').font('Helvetica')
           .text(_humaniseKey(k).toUpperCase(), indent, doc.y, { width });
        doc.fontSize(9).fillColor('#3d3d3f').font('Helvetica')
           .text(String(v), indent, doc.y, { width });
        doc.moveDown(0.4);
      }
    }
  } else {
    doc.fontSize(9).fillColor('#3d3d3f').font('Helvetica')
       .text(String(value), indent, doc.y, { width: width });
    doc.moveDown(0.3);
  }
}

function _pdfFooterNote(doc, report) {
  doc.moveDown(2);
  doc.moveTo(56, doc.y).lineTo(doc.page.width - 56, doc.y).lineWidth(0.5).strokeColor('#e5e5e7').stroke();
  doc.moveDown(0.5);
  doc.fontSize(7.5).fillColor('#aeaeb2').font('Helvetica')
     .text(
       `Report ID: ${report.reportId}  ·  Generated: ${new Date(report.generatedAt).toUTCString()}  ·  Powered by CarbonIQ FinTech`,
       56, doc.y, { align: 'center', width: doc.page.width - 112 }
     );
}

module.exports = { buildPDF, _pdfCover, _pdfSummaryTable, _pdfSections, _pdfValue, _pdfFooterNote };
