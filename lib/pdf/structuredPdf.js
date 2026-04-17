'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { wrapTextToLines } = require('./wrapText');

/**
 * Build a generic branded PDF from the email-modal data shape:
 *   { title, sections: [{ heading, rows: [{label, value, isTotal?}] }] }
 *
 * Used by the workspace's "Add to Session Report" button as the
 * fallback PDF generator for documents that don't have a dedicated
 * server-side PDF endpoint (Generic Invoice, Income Statement,
 * Balance Sheet, Condo Questionnaire chooser, etc.). Output is
 * intentionally unfussy — header band + per-section table — so it
 * still reads cleanly when bundled with other items in the merged
 * session export.
 *
 * @param {object} body  { title, sections }
 * @returns {Promise<Uint8Array>}
 */
async function generateStructuredPdfBuffer(body) {
  const title = (body && body.title) || 'Document';
  const sections = Array.isArray(body && body.sections) ? body.sections : [];

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.45, 0.45, 0.45);
  const accent = rgb(0.176, 0.416, 0.310);
  const W = 612, H = 792;
  const margin = 54;
  const fs = 10;
  const fsSm = 9;
  const lead = fs * 1.4;

  let page = pdfDoc.addPage([W, H]);
  let cursorY = drawHeader(page);

  function drawHeader(p) {
    p.drawRectangle({ x: 0, y: 740, width: W, height: 52, color: accent });
    p.drawText(title, { x: margin, y: 758, size: 16, font: fontBold, color: rgb(1, 1, 1) });
    p.drawText(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      { x: 450, y: 758, size: fsSm, font, color: rgb(1, 1, 1) });
    return 712;
  }

  function ensureRoom(needed) {
    if (cursorY - needed < 60) {
      page = pdfDoc.addPage([W, H]);
      cursorY = drawHeader(page);
    }
  }

  /** StandardFonts (Helvetica) is WinAnsi-encoded — it can't render
   *  emoji or other non-Latin glyphs without erroring. Strip anything
   *  outside the WinAnsi range (and replace with a placeholder so the
   *  layout doesn't shift) before drawing. */
  function sanitize(str) {
    return String(str == null ? '' : str).replace(/[\u0080-\u009F\u00AD]|[\u0100-\uFFFF]|[\uD800-\uDFFF][\uDC00-\uDFFF]/g, function (ch) {
      // Replace emoji and other non-WinAnsi chars with a thin space.
      return ' ';
    });
  }

  function drawText(x, y, text, opts) {
    opts = opts || {};
    page.drawText(sanitize(text), {
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

  sections.forEach((sec) => {
    ensureRoom(lead * 3);
    drawText(margin, cursorY, sec.heading || '', { font: fontBold, size: 12, color: accent });
    cursorY -= lead * 1.3;

    (sec.rows || []).forEach((row) => {
      ensureRoom(lead * 2);
      const label = row.label || '';
      const value = row.value == null ? '' : String(row.value);
      const isTotal = !!row.isTotal;

      // Long values wrap below the label; short values sit beside it.
      const valueWidth = W - margin * 2 - 150;
      const labelW = 150;
      const lineCount = wrapTextToLines(value, valueWidth, font, fs).length;

      if (value.length > 60 || lineCount > 1) {
        drawText(margin, cursorY, label, { font: fontBold, size: fsSm, color: muted });
        cursorY -= lead * 0.8;
        cursorY = drawWrapped(margin + 12, cursorY, W - margin * 2 - 12, value, { size: fs });
        cursorY -= lead * 0.4;
      } else {
        drawText(margin, cursorY, label, { font: fontBold, size: fsSm, color: muted });
        drawText(margin + labelW, cursorY, value, { size: fs, font: isTotal ? fontBold : font });
        cursorY -= lead;
      }
    });

    cursorY -= lead * 0.6;
  });

  // Footer on every page
  pdfDoc.getPages().forEach((p) => {
    p.drawText('Mountain State Financial Group LLC  |  msfginfo.com', {
      x: margin, y: 32, size: 8, font, color: muted
    });
  });

  return pdfDoc.save();
}

module.exports = { generateStructuredPdfBuffer };
