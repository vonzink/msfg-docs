'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { wrapTextToLines } = require('./wrapText');

/**
 * Build the Generic Letter of Explanation PDF.
 *
 * Body shape (matches worksheet ids in views/documents/generic-lox.ejs):
 *   { borrowerNames, loanNumber, subjectPropertyAddress, letterDate,
 *     topic, explanation,
 *     signers: [{ name }] }   // up to 5 borrower-signature rows
 *
 * @param {object} body
 * @returns {Promise<Uint8Array>}
 */
async function generateGenericLoxPdfBuffer(body) {
  const b = body || {};
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.45, 0.45, 0.45);
  const accent = rgb(0.176, 0.416, 0.310);

  const margin = 54;
  const fs = 11;
  const fsSm = 10;
  const lead = fs * 1.4;

  function drawText(x, y, text, opts) {
    opts = opts || {};
    page.drawText(String(text == null ? '' : text), {
      x, y,
      size: opts.size || fs,
      font: opts.font || font,
      color: opts.color || ink
    });
  }

  function drawWrapped(x, topY, maxW, text, opts) {
    opts = opts || {};
    const size = opts.size || fs;
    const f = opts.font || font;
    const lines = wrapTextToLines(String(text || ''), maxW, f, size);
    const L = size * 1.4;
    let y = topY;
    for (let i = 0; i < lines.length; i++) {
      drawText(x, y, lines[i], { size, font: f, color: opts.color });
      y -= L;
    }
    return y + L;
  }

  /* Header band */
  page.drawRectangle({ x: 0, y: 740, width: 612, height: 52, color: accent });
  drawText(margin, 758, 'LETTER OF EXPLANATION', { font: fontBold, size: 18, color: rgb(1, 1, 1) });
  drawText(margin, 745, 'Borrower attestation', { size: fsSm, font, color: rgb(0.9, 0.95, 0.92) });

  const todayStr = b.letterDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  drawText(450, 758, 'Date', { font: fontBold, size: fsSm, color: rgb(0.9, 0.95, 0.92) });
  drawText(450, 745, todayStr, { size: fsSm, font, color: rgb(1, 1, 1) });

  let cursorY = 712;

  /* Header rows — match the LendingPad-style LOX layout. Each row
     always advances cursorY by at least one line so adjacent rows
     never overlap (the previous drawWrapped-only flow returned
     cursorY unchanged for single-line values, causing collisions). */
  const labelColW = 140;
  const valueX = margin + labelColW;
  const valueW = 612 - valueX - margin;
  function headerRow(label, value) {
    drawText(margin, cursorY, label + ':', { font: fontBold, size: fs });
    const lines = wrapTextToLines(String(value || '\u2014'), valueW, font, fs);
    let y = cursorY;
    lines.forEach(function (line) {
      drawText(valueX, y, line);
      y -= lead;
    });
    cursorY = y - lead * 0.15;
  }
  headerRow('Loan Number', b.loanNumber);
  headerRow('Borrower(s)', b.borrowerNames);
  headerRow('Property Address', b.subjectPropertyAddress);
  if (b.topic && String(b.topic).trim()) headerRow('Subject', b.topic);
  cursorY -= lead * 0.4;

  /* Divider */
  page.drawLine({
    start: { x: margin, y: cursorY }, end: { x: 612 - margin, y: cursorY },
    thickness: 0.5, color: muted
  });
  cursorY -= lead;

  /* Explanation body */
  drawText(margin, cursorY, 'Explanation', { font: fontBold, size: 13, color: accent });
  cursorY -= lead * 1.4;
  cursorY = drawWrapped(margin, cursorY, 612 - margin * 2, b.explanation || '', { size: fs });
  cursorY -= lead;

  /* Signature rows — up to 5 borrowers */
  const signers = Array.isArray(b.signers) ? b.signers.filter((s) => s && (s.name || '').trim()) : [];
  const signersToDraw = signers.length ? signers : [{ name: '' }, { name: '' }];
  // Place signatures starting from the bottom up so they don't crowd
  // the explanation when it's short.
  const sigStartY = Math.max(cursorY - lead, 180);
  let y = sigStartY;
  signersToDraw.slice(0, 5).forEach((s, i) => {
    if (y < 90) return; // ran out of room
    page.drawLine({ start: { x: margin, y }, end: { x: margin + 230, y }, thickness: 0.6, color: ink });
    drawText(margin, y - 14, s.name ? String(s.name) : 'Borrower ' + (i + 1) + ' signature', {
      size: fsSm, font, color: muted
    });
    page.drawLine({ start: { x: margin + 260, y }, end: { x: margin + 360, y }, thickness: 0.6, color: ink });
    drawText(margin + 260, y - 14, 'Date', { size: fsSm, font, color: muted });
    y -= 56;
  });

  /* Footer */
  drawText(margin, 36, 'Mountain State Financial Group LLC', { size: 8, color: muted });
  drawText(margin, 24, 'msfginfo.com', { size: 8, color: muted });

  return pdfDoc.save();
}

module.exports = { generateGenericLoxPdfBuffer };
