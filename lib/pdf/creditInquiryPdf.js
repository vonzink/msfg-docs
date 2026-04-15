'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { wrapTextToLines } = require('./wrapText');

/**
 * Build the Credit Inquiry Letter PDF (layout-only, static text).
 * @param {object} body - Same shape as POST /api/pdf/credit-inquiry body
 * @returns {Promise<Uint8Array>}
 */
async function generateCreditInquiryPdfBuffer(body) {
  const {
    senderName = '',
    coBorrowerName = '',
    subjectPropertyAddress = '',
    loanNumber = '',
    letterDate = '',
    inquiries = []
  } = body || {};

  const pdfDoc = await PDFDocument.create();
  const { width, height } = { width: 612, height: 792 };
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.45, 0.45, 0.45);

  const margin = 48;
  const labelColW = 120;
  const valueX = margin + labelColW;
  const valueW = width - margin - valueX;

  const colNo = margin;
  const colDate = margin + 34;
  const colCred = margin + 128;
  const colExpl = margin + 292;
  const wNo = 30;
  const wDate = 92;
  const wCred = 154;
  const wExpl = width - margin - colExpl;

  const fs = 11;
  const fsSm = 10;
  const lead = fs * 1.22;
  const leadSm = fsSm * 1.22;
  const rowGap = 10;
  const tableHdrGap = 18;
  const closingBlockH = 120;

  function drawLine(page, x, y, text, opts) {
    page.drawText(String(text ?? ''), {
      x,
      y,
      size: opts.size || fs,
      font: opts.font || font,
      color: opts.color || ink
    });
  }

  function drawWrapped(page, text, x, topBaseline, maxW, size, f, color) {
    const lines = wrapTextToLines(String(text || ''), maxW - 2, f, size);
    const L = size * 1.22;
    let y = topBaseline;
    for (let i = 0; i < lines.length; i++) {
      drawLine(page, x, y, lines[i], { size, font: f, color });
      y -= L;
    }
    return y + L;
  }

  function drawLabelValueBlock(page, label, value, cursorY) {
    drawLine(page, margin, cursorY, label, { font: fontBold, size: fs });
    const vLines = wrapTextToLines(String(value || ''), valueW, font, fs);
    let y = cursorY;
    const L = lead;
    if (!vLines.length) vLines.push('');
    for (let i = 0; i < vLines.length; i++) {
      drawLine(page, valueX, y, vLines[i], { size: fs });
      y -= L;
    }
    return y - 10;
  }

  function tableHeaderBand(page, cursorY) {
    const hdrY = cursorY;
    drawLine(page, colNo, hdrY, 'No.', { font: fontBold, size: fsSm });
    drawLine(page, colDate, hdrY, 'Inquiry Date', { font: fontBold, size: fsSm });
    drawLine(page, colCred, hdrY, 'Creditor', { font: fontBold, size: fsSm });
    drawLine(page, colExpl, hdrY, 'Explanation', { font: fontBold, size: fsSm });
    const ruleY = hdrY - tableHdrGap;
    page.drawLine({
      start: { x: margin, y: ruleY },
      end: { x: width - margin, y: ruleY },
      thickness: 0.5,
      color: muted
    });
    return ruleY - 14;
  }

  function measureTableRow(fr) {
    const noL = wrapTextToLines(String(fr.rowLabel || ' '), wNo - 2, font, fsSm);
    const dL = wrapTextToLines(String(fr.date || ' '), wDate - 4, font, fsSm);
    const cL = wrapTextToLines(String(fr.creditor || ' '), wCred - 4, font, fsSm);
    const eL = wrapTextToLines(String(fr.explanation || ' '), wExpl - 4, font, fs);
    const n = Math.max(1, noL.length, dL.length, cL.length, eL.length);
    return { noL, dL, cL, eL, n };
  }

  function rowHeightPts(n) {
    return Math.max(n, 1) * leadSm + rowGap;
  }

  const rawList = Array.isArray(inquiries) && inquiries.length
    ? inquiries
    : [{ inquiryDate: '', creditor: '', explanation: '' }];

  const flatRows = [];
  const maxExplChunkLines = 42;
  for (let i0 = 0; i0 < rawList.length; i0++) {
    const q = rawList[i0];
    const explLines = wrapTextToLines(q.explanation || '', wExpl - 4, font, fs);
    if (!explLines.length) {
      flatRows.push({
        rowLabel: String(i0 + 1),
        date: q.inquiryDate || '',
        creditor: q.creditor || '',
        explanation: ''
      });
      continue;
    }
    for (let off = 0; off < explLines.length; off += maxExplChunkLines) {
      const slice = explLines.slice(off, off + maxExplChunkLines);
      const part = off > 0;
      flatRows.push({
        rowLabel: part ? '' : String(i0 + 1),
        date: part ? '' : (q.inquiryDate || ''),
        creditor: part ? '' : (q.creditor || ''),
        explanation: slice.join('\n')
      });
    }
  }

  function drawTableRow(page, fr, rowTopBaseline) {
    const { noL, dL, cL, eL, n } = measureTableRow(fr);
    for (let r = 0; r < n; r++) {
      const y = rowTopBaseline - r * leadSm;
      if (noL[r] !== undefined) drawLine(page, colNo, y, noL[r], { size: fsSm });
      if (dL[r] !== undefined) drawLine(page, colDate, y, dL[r], { size: fsSm });
      if (cL[r] !== undefined) drawLine(page, colCred, y, cL[r], { size: fsSm });
      if (eL[r] !== undefined) drawLine(page, colExpl, y, eL[r], { size: fs });
    }
    return rowTopBaseline - n * leadSm - rowGap;
  }

  function drawLetterhead(page, pageIndex) {
    let cursor = height - margin;
    drawLine(page, margin, cursor, 'Credit Inquiry Letter', { font: fontBold, size: 16 });
    if (pageIndex > 0) {
      drawLine(page, margin + 200, cursor + 2, '(continued)', { size: fs, color: muted });
    }
    cursor -= 30;
    cursor = drawLabelValueBlock(page, 'Date:', letterDate, cursor);
    cursor = drawLabelValueBlock(page, 'Borrower:', senderName, cursor);
    cursor = drawLabelValueBlock(page, 'Co-Borrower:', coBorrowerName, cursor);
    cursor = drawLabelValueBlock(page, 'Subject Property:', subjectPropertyAddress, cursor);
    cursor = drawLabelValueBlock(page, 'Loan #:', loanNumber, cursor);
    drawLine(page, margin, cursor, 'To Whom It May Concern,', { size: fs });
    cursor -= 22;
    drawLine(page, margin, cursor, 'Please see the explanations for the following credit inquiries.', {
      size: fs
    });
    cursor -= 26;
    return cursor;
  }

  const bottomInner = margin + 64;
  const bottomLast = margin + 140;

  let pageIndex = 0;
  let page = pdfDoc.addPage([width, height]);
  let cursor = drawLetterhead(page, pageIndex);
  let tableCursor = tableHeaderBand(page, cursor);

  for (let i = 0; i < flatRows.length; i++) {
    const fr = flatRows[i];
    const n = measureTableRow(fr).n;
    const rh = rowHeightPts(n);
    const isLast = i === flatRows.length - 1;
    const floor = isLast ? bottomLast : bottomInner;
    if (tableCursor - rh < floor) {
      pageIndex += 1;
      page = pdfDoc.addPage([width, height]);
      cursor = drawLetterhead(page, pageIndex);
      tableCursor = tableHeaderBand(page, cursor);
    }
    tableCursor = drawTableRow(page, fr, tableCursor);
  }

  if (tableCursor < margin + closingBlockH) {
    pageIndex += 1;
    page = pdfDoc.addPage([width, height]);
    let c = height - margin;
    drawLine(page, margin, c, 'Credit Inquiry Letter', { font: fontBold, size: 16 });
    drawLine(page, margin + 200, c + 2, '(continued)', { size: fs, color: muted });
    tableCursor = c - 36;
  }

  const thankY = tableCursor - 8;
  page.drawLine({
    start: { x: margin, y: thankY + 8 },
    end: { x: width - margin, y: thankY + 8 },
    thickness: 0.35,
    color: muted
  });
  drawLine(page, margin, thankY, 'Thank you,', { size: fs });
  let y = thankY - 26;
  drawLine(page, margin, y, 'Sincerely,', { size: fs });
  y -= 28;
  drawWrapped(page, senderName || '', margin, y, width - 2 * margin, fs, font, ink);

  return pdfDoc.save();
}

module.exports = { generateCreditInquiryPdfBuffer };
