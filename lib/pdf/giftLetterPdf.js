'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { wrapTextToLines } = require('./wrapText');

/**
 * Build the Gift Letter PDF.
 *
 * Body shape (matches the worksheet ids in views/documents/gift-letter.ejs):
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
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.45, 0.45, 0.45);
  const accent = rgb(0.176, 0.416, 0.310); // MSFG green

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

  /* Header band with title */
  page.drawRectangle({ x: 0, y: 740, width: 612, height: 52, color: accent });
  drawText(margin, 758, 'GIFT LETTER', { font: fontBold, size: 18, color: rgb(1, 1, 1) });
  drawText(margin, 745, 'For mortgage loan funds', { size: fsSm, font, color: rgb(0.9, 0.95, 0.92) });

  /* Date + loan number on the right of the header band */
  const todayStr = b.letterDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  drawText(450, 758, 'Date', { font: fontBold, size: fsSm, color: rgb(0.9, 0.95, 0.92) });
  drawText(450, 745, todayStr, { size: fsSm, font, color: rgb(1, 1, 1) });

  let cursorY = 712;

  /* Recipient + property block */
  drawText(margin, cursorY, 'Loan Number:', { font: fontBold, size: fs });
  drawText(margin + 100, cursorY, b.loanNumber || '—');
  cursorY -= lead;
  drawText(margin, cursorY, 'Recipient:', { font: fontBold, size: fs });
  drawText(margin + 100, cursorY, b.recipientName || '—');
  cursorY -= lead;
  drawText(margin, cursorY, 'Property:', { font: fontBold, size: fs });
  cursorY = drawWrapped(margin + 100, cursorY, 612 - margin - 100 - margin, b.subjectPropertyAddress || '—');
  cursorY -= lead * 0.5;

  /* Statement of gift */
  page.drawLine({
    start: { x: margin, y: cursorY }, end: { x: 612 - margin, y: cursorY },
    thickness: 0.5, color: muted
  });
  cursorY -= lead;

  drawText(margin, cursorY, 'Statement of Gift', { font: fontBold, size: 13, color: accent });
  cursorY -= lead * 1.4;

  const donorName = b.donorName || '—';
  const giftAmount = b.giftAmount || '—';
  const relationship = b.relationshipToDonor || 'family member';
  const recipient = b.recipientName || 'the borrower';
  const propAddr = b.subjectPropertyAddress || 'the subject property';
  const transferDate = b.fundTransferDate || '—';
  const sourceOfGift = b.sourceOfGift || '—';

  const statement =
    'I, ' + donorName + ', the undersigned, certify that I have made (or will make) a bona fide gift of ' +
    giftAmount + ' to ' + recipient + ', my ' + relationship + ', toward the purchase of the property located at ' +
    propAddr + '. The gift was transferred (or will be transferred) on ' + transferDate +
    ' from the source of funds described below. No repayment is expected, no lien will be placed against the ' +
    'subject property, and the funds are not from any party to the transaction (e.g., the seller, builder, ' +
    'real estate agent, broker, or any other interested party).';

  cursorY = drawWrapped(margin, cursorY, 612 - margin * 2, statement, { size: fs });
  cursorY -= lead;

  drawText(margin, cursorY, 'Source of gift funds:', { font: fontBold, size: fs });
  cursorY -= lead;
  cursorY = drawWrapped(margin, cursorY, 612 - margin * 2, sourceOfGift, { size: fs });
  cursorY -= lead * 1.4;

  /* Donor info block */
  drawText(margin, cursorY, 'Donor Information', { font: fontBold, size: 13, color: accent });
  cursorY -= lead * 1.4;

  function donorRow(label, value) {
    drawText(margin, cursorY, label, { font: fontBold, size: fsSm, color: muted });
    drawText(margin + 130, cursorY, value || '—');
    cursorY -= lead;
  }
  donorRow('Name', b.donorName);
  donorRow('Relationship', b.relationshipToDonor);
  donorRow('Phone', b.donorPhone);
  donorRow('Email', b.donorEmail);
  drawText(margin, cursorY, 'Address', { font: fontBold, size: fsSm, color: muted });
  cursorY = drawWrapped(margin + 130, cursorY, 612 - margin - margin - 130, b.donorAddress || '—');
  cursorY -= lead * 1.4;

  /* Signature block at the bottom of the page */
  const sigY = 130;
  // Donor sig
  page.drawLine({ start: { x: margin, y: sigY }, end: { x: margin + 230, y: sigY }, thickness: 0.6, color: ink });
  drawText(margin, sigY - 14, 'Donor signature', { size: fsSm, font, color: muted });
  page.drawLine({ start: { x: margin + 260, y: sigY }, end: { x: margin + 360, y: sigY }, thickness: 0.6, color: ink });
  drawText(margin + 260, sigY - 14, 'Date', { size: fsSm, font, color: muted });
  // Recipient sig
  const sigY2 = sigY - 60;
  page.drawLine({ start: { x: margin, y: sigY2 }, end: { x: margin + 230, y: sigY2 }, thickness: 0.6, color: ink });
  drawText(margin, sigY2 - 14, 'Recipient (borrower) signature', { size: fsSm, font, color: muted });
  page.drawLine({ start: { x: margin + 260, y: sigY2 }, end: { x: margin + 360, y: sigY2 }, thickness: 0.6, color: ink });
  drawText(margin + 260, sigY2 - 14, 'Date', { size: fsSm, font, color: muted });

  /* Footer */
  drawText(margin, 36, 'Mountain State Financial Group LLC', { size: 8, color: muted });
  drawText(margin, 24, 'msfginfo.com', { size: 8, color: muted });

  return pdfDoc.save();
}

module.exports = { generateGiftLetterPdfBuffer };
