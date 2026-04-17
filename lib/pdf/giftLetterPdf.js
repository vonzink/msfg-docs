'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { wrapTextToLines } = require('./wrapText');

/**
 * Build the Gift Letter PDF — layout mirrors the LendingPad sample
 * (centered title, header rows, numbered "I, donor, certify..."
 * statements with inline values where blanks would be, then signature
 * lines at the bottom).
 *
 * Body shape (matches worksheet ids in views/documents/gift-letter.ejs):
 *   { donorName, donorAddress, donorPhone, donorEmail,
 *     giftAmount, sourceOfGift, fundTransferDate, relationshipToDonor,
 *     recipientName, loanNumber, subjectPropertyAddress, letterDate }
 *
 * @param {object} body
 * @returns {Promise<Uint8Array>}
 */
async function generateGiftLetterPdfBuffer(body) {
  const b = body || {};
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.5, 0.5, 0.5);

  const W = 612, H = 792;
  const margin = 64;
  const innerW = W - margin * 2;

  const fs = 11;
  const fsSm = 9;
  const lead = fs * 1.5;

  function drawText(x, y, text, opts) {
    opts = opts || {};
    page.drawText(String(text == null ? '' : text), {
      x, y,
      size: opts.size || fs,
      font: opts.font || font,
      color: opts.color || ink
    });
  }

  function textWidth(text, f, size) { return f.widthOfTextAtSize(String(text || ''), size); }

  function drawCentered(y, text, opts) {
    opts = opts || {};
    const size = opts.size || fs;
    const f = opts.font || font;
    const w = textWidth(text, f, size);
    drawText((W - w) / 2, y, text, opts);
  }

  function drawWrapped(x, topY, maxW, text, opts) {
    opts = opts || {};
    const size = opts.size || fs;
    const f = opts.font || font;
    const lines = wrapTextToLines(String(text || ''), maxW, f, size);
    const L = (opts.lead || size * 1.5);
    let y = topY;
    lines.forEach(function (line) {
      drawText(x, y, line, { size, font: f, color: opts.color });
      y -= L;
    });
    return y;
  }

  /** Render a numbered statement where the static text contains blanks
   *  filled with bold values. Pass an array of segments — strings are
   *  static text, objects { value, underline? } are bold values. */
  function drawNumberedItem(num, segments, startY) {
    const indent = margin + 18;
    const numX = margin;
    drawText(numX, startY, num + '.', { font: fontBold, size: fs });

    // Compose segments into wrappable text spans. Simple approach:
    // render line-by-line, manually computing word widths so bold
    // values stay bold. Acceptable since most lines fit on one wrap.
    let y = startY;
    let x = indent;
    const lineW = innerW - 18;
    let lineSoFar = 0;

    function newline() {
      y -= lead;
      x = indent;
      lineSoFar = 0;
    }

    function drawWord(word, opts) {
      opts = opts || {};
      const f = opts.font || font;
      const size = opts.size || fs;
      const w = textWidth(word, f, size);
      const sp = textWidth(' ', f, size);
      // Wrap if word + leading space exceeds remaining width
      if (lineSoFar > 0 && lineSoFar + sp + w > lineW) {
        newline();
      }
      // Add the word
      drawText(x, y, word, { size, font: f, color: opts.color });
      x += w;
      lineSoFar += w;
      // Add space for next word
      drawText(x, y, ' ', { size, font: f });
      x += sp;
      lineSoFar += sp;
    }

    segments.forEach(function (seg) {
      if (typeof seg === 'string') {
        seg.split(/\s+/).filter(Boolean).forEach(function (w) { drawWord(w); });
      } else if (seg && seg.value != null) {
        // Bold inline value (the "blank")
        const v = String(seg.value || '').trim() || '_______________________';
        v.split(/\s+/).filter(Boolean).forEach(function (w) {
          drawWord(w, { font: fontBold });
        });
      }
    });

    return y - lead;
  }

  /* ---- Title + header rows ---- */
  let y = H - margin;
  drawCentered(y, 'Gift Letter', { font: fontBold, size: 22 });
  y -= 32;

  function headerRow(label, value) {
    drawText(margin, y, label, { font: fontBold, size: fs });
    drawText(margin + 110, y, value || '\u2014', { size: fs });
    y -= lead;
  }
  headerRow('Loan Number:', b.loanNumber);
  headerRow('Applicant(s):', b.recipientName);
  // Wrap address since it's often long
  drawText(margin, y, 'Address:', { font: fontBold, size: fs });
  y = drawWrapped(margin + 110, y, innerW - 110, b.subjectPropertyAddress || '\u2014', { lead });
  y -= lead * 0.5;

  /* "I, donor, do hereby certify..." opener */
  y = drawNumberedItem('', [
    'I,', { value: b.donorName }, ', do hereby certify the following:'
  ], y);
  y -= lead * 0.4;

  /* Numbered statements */
  y = drawNumberedItem('1', [
    'I have made a gift of', { value: b.giftAmount },
    'to', { value: b.recipientName },
    'whose relationship is', { value: b.relationshipToDonor }, '.'
  ], y);

  y = drawNumberedItem('2', [
    'This gift is to be applied towards the purchase of the property located at',
    { value: b.subjectPropertyAddress }, '.'
  ], y);

  y = drawNumberedItem('3', [
    'No repayment of this gift is expected or implied in the form of cash or by future services of the recipient.'
  ], y);

  y = drawNumberedItem('4', [
    'The funds given to the homebuyer were not made available to the donor from any person or entity with an interest in the sale of the property including the seller, real estate agent or broker, builder, loan officer, or any entity associated with them.'
  ], y);

  y = drawNumberedItem('5', [
    'The source of this gift is', { value: b.sourceOfGift }, '.'
  ], y);

  y = drawNumberedItem('6', [
    'The date the funds were transferred:', { value: b.fundTransferDate }, '.'
  ], y);

  /* Signature rows — donor + up to two borrowers, two columns */
  const sigBlockH = 130;
  const sigY = Math.max(y - lead, sigBlockH + 80);
  const colW = (innerW - 30) / 2;
  const colLeft = margin;
  const colRight = margin + colW + 30;

  function sigPair(x, lineY, captionLeft, captionRight) {
    page.drawLine({ start: { x: x, y: lineY }, end: { x: x + (colW * 0.55), y: lineY }, thickness: 0.6, color: ink });
    page.drawLine({ start: { x: x + (colW * 0.6), y: lineY }, end: { x: x + colW, y: lineY }, thickness: 0.6, color: ink });
    drawText(x, lineY - 12, captionLeft, { size: fsSm, font, color: muted });
    drawText(x + (colW * 0.6), lineY - 12, captionRight, { size: fsSm, font, color: muted });
  }

  // Row 1: Donor sig + Date | Borrower 1 sig + name beneath
  drawText(colLeft, sigY + 18, b.donorName || '', { size: fsSm, font, color: muted });
  sigPair(colLeft, sigY, 'Donor signature', 'Date');
  sigPair(colRight, sigY, 'Borrower 1 signature', 'Date');

  // Row 2: Donor name (print) + address | Borrower 2 sig + name beneath
  const sigY2 = sigY - 56;
  page.drawLine({ start: { x: colLeft, y: sigY2 }, end: { x: colLeft + colW, y: sigY2 }, thickness: 0.6, color: ink });
  drawText(colLeft, sigY2 - 12, 'Donor name (print)', { size: fsSm, font, color: muted });
  sigPair(colRight, sigY2, 'Borrower 2 signature', 'Date');

  // Row 3: Donor address / phone (full width)
  const sigY3 = sigY2 - 42;
  page.drawLine({ start: { x: colLeft, y: sigY3 }, end: { x: W - margin, y: sigY3 }, thickness: 0.6, color: ink });
  drawText(colLeft, sigY3 - 12, 'Donor address / phone', { size: fsSm, font, color: muted });
  // Print donor address + phone above the line in faint ink so we have a value
  const addrLine = [b.donorAddress, b.donorPhone].filter(function (s) { return s && String(s).trim(); }).join('  \u2022  ');
  if (addrLine) drawText(colLeft, sigY3 + 4, addrLine, { size: fsSm, font, color: muted });

  /* Footer */
  drawText(margin, 30, 'Mountain State Financial Group LLC', { size: 8, color: muted });
  drawText(W - margin - textWidth('msfginfo.com', font, 8), 30, 'msfginfo.com', { size: 8, color: muted });

  return pdfDoc.save();
}

module.exports = { generateGiftLetterPdfBuffer };
