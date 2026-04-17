'use strict';

/**
 * Shared letter-style PDF renderer.
 *
 * Consumers (Credit Inquiry, Address LOX, Pre-Approval, Gift Letter,
 * Generic LOX) build a structured `letter` payload and pick one of
 * four visual styles; this module does the drawing so the four looks
 * stay consistent across docs.
 *
 *   generateLetterPdfBuffer({
 *     style,              // 'classic' | 'modern' | 'branded' | 'compact'
 *     title,              // string — appears on the letterhead
 *     subtitle,           // optional string below the title
 *     dateLine,           // pretty date string
 *     headerRows,         // [{ label, value }]
 *     body,               // [{ type: 'paragraph' | 'heading' | 'ol' | 'ul' | 'table',
 *                         //    text?, items?, rows? }]
 *     signatures          // [{ caption }]
 *   })
 *
 * The shape above matches the in-page HTML previews (same data →
 * four distinct looks in both the preview and the exported PDF).
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { wrapTextToLines } = require('./wrapText');

const THEMES = {
  classic: {
    font: 'TimesRoman',           // serif
    fontBold: 'TimesRomanBold',
    fontItalic: 'TimesRomanItalic',
    bodyPt: 11,
    leadMul: 1.5,
    headerBand: false,
    footerBand: false,
    justify: true,
    accent: rgb(0.12, 0.12, 0.12), // black (no color accent)
    ink: rgb(0.12, 0.12, 0.12),
    muted: rgb(0.45, 0.45, 0.45),
    margin: 64,
    titleAlign: 'center',
    tableStyle: 'dotted',
    leftRail: false,
  },
  modern: {
    font: 'Helvetica',
    fontBold: 'HelveticaBold',
    fontItalic: 'HelveticaOblique',
    bodyPt: 11,
    leadMul: 1.55,
    headerBand: false,
    footerBand: false,
    justify: false,
    accent: rgb(0.176, 0.416, 0.310), // MSFG green
    ink: rgb(0.067, 0.094, 0.153),
    muted: rgb(0.42, 0.45, 0.5),
    margin: 64,
    titleAlign: 'left',
    tableStyle: 'striped',
    leftRail: true,
  },
  branded: {
    font: 'Helvetica',
    fontBold: 'HelveticaBold',
    fontItalic: 'HelveticaOblique',
    bodyPt: 11,
    leadMul: 1.5,
    headerBand: true,
    footerBand: true,
    justify: false,
    accent: rgb(0.176, 0.416, 0.310),
    ink: rgb(0.067, 0.094, 0.153),
    muted: rgb(0.42, 0.45, 0.5),
    margin: 54,
    titleAlign: 'left',
    tableStyle: 'accentKey',
    leftRail: false,
  },
  compact: {
    font: 'Helvetica',
    fontBold: 'HelveticaBold',
    fontItalic: 'HelveticaOblique',
    bodyPt: 9,
    leadMul: 1.35,
    headerBand: false,
    footerBand: false,
    justify: false,
    accent: rgb(0.176, 0.416, 0.310),
    ink: rgb(0.12, 0.12, 0.15),
    muted: rgb(0.45, 0.45, 0.5),
    margin: 40,
    titleAlign: 'left',
    tableStyle: 'thin',
    leftRail: false,
  },
};

function resolveTheme(style) {
  return THEMES[style] || THEMES.classic;
}

async function generateLetterPdfBuffer(letter) {
  const l = letter || {};
  const theme = resolveTheme(l.style);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts[theme.font]);
  const fontBold = await pdfDoc.embedFont(StandardFonts[theme.fontBold]);
  const fontItalic = await pdfDoc.embedFont(StandardFonts[theme.fontItalic]);

  const W = 612, H = 792;
  const margin = theme.margin;
  const bodyFS = theme.bodyPt;
  const lead = bodyFS * theme.leadMul;

  let page = pdfDoc.addPage([W, H]);
  // Track content left/right bounds per page — header band forces a
  // narrower content column below it so text doesn't bleed under.
  let contentTop = H - margin;
  let contentLeft = margin;
  let contentRight = W - margin;
  let y = contentTop;

  /** Strip non-WinAnsi chars (emoji etc) so the StandardFonts embed
   *  doesn't error. Replaces with a thin space to keep spacing stable. */
  function sanitize(s) {
    return String(s == null ? '' : s).replace(
      /[\u0080-\u009F\u00AD]|[\u0100-\uFFFF]|[\uD800-\uDFFF][\uDC00-\uDFFF]/g,
      ' '
    );
  }

  function textWidth(text, f, size) {
    return f.widthOfTextAtSize(sanitize(text), size);
  }

  function drawText(x, yy, text, opts) {
    opts = opts || {};
    page.drawText(sanitize(text), {
      x, y: yy,
      size: opts.size || bodyFS,
      font: opts.font || font,
      color: opts.color || theme.ink,
    });
  }

  function drawHeaderBand() {
    if (!theme.headerBand) return;
    page.drawRectangle({ x: 0, y: H - 52, width: W, height: 52, color: theme.accent });
    drawText(margin, H - 28, 'MSFG', { font: fontBold, size: 16, color: rgb(1, 1, 1) });
    drawText(margin + 60, H - 28, 'Mountain State Financial Group', { size: 9, color: rgb(1, 1, 1), font });
    if (l.dateLine) {
      const w = textWidth(l.dateLine, font, 9);
      drawText(W - margin - w, H - 28, l.dateLine, { size: 9, color: rgb(0.9, 0.95, 0.92), font });
    }
    y = H - 52 - 16;
  }

  function drawFooterBand(pg) {
    if (!theme.footerBand) return;
    pg.drawRectangle({ x: 0, y: 0, width: W, height: 26, color: rgb(0.95, 0.96, 0.96) });
    pg.drawLine({ start: { x: 0, y: 26 }, end: { x: W, y: 26 }, thickness: 2, color: theme.accent });
    pg.drawText('Mountain State Financial Group LLC  |  msfginfo.com', {
      x: margin, y: 10, size: 8, font, color: theme.muted,
    });
  }

  function drawPlainFooter(pg) {
    if (theme.footerBand) return;
    pg.drawText('Mountain State Financial Group LLC  |  msfginfo.com', {
      x: margin, y: 28, size: 7, font, color: theme.muted,
    });
  }

  function drawLeftRail() {
    if (!theme.leftRail) return;
    page.drawRectangle({
      x: 0, y: 0, width: 6, height: H, color: theme.accent,
    });
    contentLeft = margin + 4;
  }

  function ensureRoom(needed) {
    if (y - needed < (theme.footerBand ? 50 : 60)) {
      drawPlainFooter(page);
      drawFooterBand(page);
      page = pdfDoc.addPage([W, H]);
      drawHeaderBand();
      drawLeftRail();
      y = theme.headerBand ? (H - 52 - 16) : (H - margin);
    }
  }

  function drawWrapped(x, topY, maxW, text, opts) {
    opts = opts || {};
    const size = opts.size || bodyFS;
    const f = opts.font || font;
    const lines = wrapTextToLines(sanitize(text), maxW, f, size);
    const L = size * theme.leadMul;
    let cy = topY;
    const justify = theme.justify && (opts.justify !== false);
    lines.forEach(function (line, i) {
      const isLast = i === lines.length - 1;
      if (justify && !isLast && line.indexOf(' ') !== -1) {
        drawJustified(x, cy, maxW, line, size, f, opts.color);
      } else {
        drawText(x, cy, line, { size, font: f, color: opts.color });
      }
      cy -= L;
    });
    return cy + L;
  }

  function drawJustified(x, yy, maxW, line, size, f, color) {
    const words = line.split(' ').filter(Boolean);
    if (words.length < 2) { drawText(x, yy, line, { size, font: f, color }); return; }
    const wordsW = words.reduce(function (acc, w) { return acc + f.widthOfTextAtSize(sanitize(w), size); }, 0);
    const gap = (maxW - wordsW) / (words.length - 1);
    let cx = x;
    words.forEach(function (w, i) {
      drawText(cx, yy, w, { size, font: f, color });
      cx += f.widthOfTextAtSize(sanitize(w), size);
      if (i < words.length - 1) cx += gap;
    });
  }

  function drawTitle() {
    const title = l.title || '';
    const subtitle = l.subtitle || '';
    const titlePt = theme.headerBand ? 20 : 22;
    if (theme.titleAlign === 'center') {
      const tw = textWidth(title, fontBold, titlePt);
      drawText((W - tw) / 2, y, title, { font: fontBold, size: titlePt });
    } else {
      drawText(contentLeft, y, title, { font: fontBold, size: titlePt });
    }
    y -= titlePt * 1.25;
    if (subtitle) {
      drawText(contentLeft, y, subtitle, { size: bodyFS, font: fontItalic, color: theme.muted });
      y -= lead;
    }
  }

  function drawDateLine() {
    if (theme.headerBand) return; // already in the band
    if (!l.dateLine) return;
    if (theme.titleAlign === 'center') {
      drawText(contentLeft, y, l.dateLine, { size: bodyFS - 1, color: theme.muted });
    } else {
      const tw = textWidth(l.dateLine, font, bodyFS - 1);
      drawText(contentRight - tw, y, l.dateLine, { size: bodyFS - 1, color: theme.muted });
    }
    y -= lead;
  }

  function drawHeaderRows() {
    const rows = l.headerRows || [];
    if (!rows.length) return;
    const labelW = 120;
    rows.forEach(function (r) {
      ensureRoom(lead);
      const label = String(r.label || '') + ':';
      const value = r.value == null || r.value === '' ? '\u2014' : String(r.value);
      drawText(contentLeft, y, label, { font: fontBold, size: bodyFS });
      const valueStart = contentLeft + labelW;
      const valueW = contentRight - valueStart;
      const lines = wrapTextToLines(sanitize(value), valueW, font, bodyFS);
      let cy = y;
      lines.forEach(function (line) {
        drawText(valueStart, cy, line, { size: bodyFS });
        cy -= lead;
      });
      y = cy + (lines.length > 1 ? 0 : 0);
    });
    y -= lead * 0.3;
  }

  function drawSectionDivider() {
    ensureRoom(10);
    page.drawLine({
      start: { x: contentLeft, y: y + lead * 0.4 },
      end: { x: contentRight, y: y + lead * 0.4 },
      thickness: 0.5, color: theme.muted,
    });
    y -= lead * 0.3;
  }

  function drawBodyParagraph(text) {
    ensureRoom(lead * 2);
    const maxW = contentRight - contentLeft;
    y = drawWrapped(contentLeft, y, maxW, text || '', { size: bodyFS });
    y -= lead * 0.6;
  }

  function drawBodyHeading(text) {
    ensureRoom(lead * 1.5);
    drawText(contentLeft, y, text || '', { font: fontBold, size: bodyFS + 2, color: theme.accent });
    y -= lead * 1.3;
  }

  function drawOrderedList(items) {
    (items || []).forEach(function (item, i) {
      ensureRoom(lead * 2);
      const num = (i + 1) + '.';
      const numW = textWidth(num + ' ', fontBold, bodyFS);
      drawText(contentLeft, y, num, { font: fontBold, size: bodyFS });
      const maxW = contentRight - (contentLeft + numW);
      y = drawWrapped(contentLeft + numW, y, maxW, item || '', { size: bodyFS, justify: false });
      y -= lead * 0.3;
    });
    y -= lead * 0.3;
  }

  function drawTable(rows) {
    if (!rows || !rows.length) return;
    const maxW = contentRight - contentLeft;
    const keyW = Math.max(120, Math.min(200, maxW * 0.4));
    const valW = maxW - keyW;

    rows.forEach(function (r, idx) {
      ensureRoom(lead);
      const label = String(r.label == null ? '' : r.label);
      const value = r.value == null ? '' : String(r.value);

      // Row backdrop per theme
      if (theme.tableStyle === 'striped' && idx % 2 === 0) {
        page.drawRectangle({
          x: contentLeft, y: y - lead * 0.3,
          width: maxW, height: lead * 0.95,
          color: rgb(0.97, 0.98, 0.97),
        });
      } else if (theme.tableStyle === 'accentKey') {
        page.drawRectangle({
          x: contentLeft, y: y - lead * 0.3,
          width: keyW, height: lead * 0.95,
          color: rgb(0.94, 0.96, 0.94),
        });
      }

      const labelOpts = theme.tableStyle === 'accentKey'
        ? { font: fontBold, size: bodyFS - 1, color: theme.accent }
        : { font: fontBold, size: bodyFS - 1, color: theme.ink };
      drawText(contentLeft + 6, y, label, labelOpts);

      const valueLines = wrapTextToLines(sanitize(value), valW - 10, font, bodyFS - 1);
      let cy = y;
      valueLines.forEach(function (line) {
        drawText(contentLeft + keyW + 6, cy, line, { size: bodyFS - 1 });
        cy -= lead * 0.8;
      });
      const rowHeight = Math.max(lead, lead * 0.8 * valueLines.length);

      if (theme.tableStyle === 'dotted') {
        // Dashed underline under each row
        for (let dx = 0; dx < maxW; dx += 3) {
          page.drawRectangle({
            x: contentLeft + dx, y: y - lead * 0.4,
            width: 1, height: 0.4, color: theme.muted,
          });
        }
      } else if (theme.tableStyle === 'thin') {
        page.drawLine({
          start: { x: contentLeft, y: y - lead * 0.3 },
          end: { x: contentRight, y: y - lead * 0.3 },
          thickness: 0.25, color: rgb(0.88, 0.88, 0.88),
        });
      }

      y -= rowHeight;
    });
    y -= lead * 0.4;
  }

  function drawSignatures() {
    const sigs = l.signatures || [];
    if (!sigs.length) return;
    // Each row holds one signature line + one date line (two columns).
    const colW = (contentRight - contentLeft - 20) / 2;
    const rowH = 44;
    sigs.forEach(function (sig, i) {
      ensureRoom(rowH + 6);
      const rowY = y;
      const sigLineY = rowY - rowH + 20;

      // Signature line (left 60% of column)
      const sigW = colW * 0.62;
      page.drawLine({
        start: { x: contentLeft, y: sigLineY },
        end: { x: contentLeft + sigW, y: sigLineY },
        thickness: 0.6, color: theme.ink,
      });
      drawText(contentLeft, sigLineY - 12, sig.caption || ('Signature ' + (i + 1)), {
        size: bodyFS - 2, color: theme.muted,
      });

      // Date line (right portion of column) + same caption style
      const dateX = contentLeft + sigW + 12;
      const dateW = colW - sigW - 12;
      page.drawLine({
        start: { x: dateX, y: sigLineY },
        end: { x: dateX + dateW, y: sigLineY },
        thickness: 0.6, color: theme.ink,
      });
      drawText(dateX, sigLineY - 12, 'Date', { size: bodyFS - 2, color: theme.muted });

      y = rowY - rowH;
    });
  }

  /* ---- Compose ---- */
  drawHeaderBand();
  drawLeftRail();
  drawTitle();
  drawDateLine();
  drawSectionDivider();
  drawHeaderRows();

  (l.body || []).forEach(function (item) {
    if (!item) return;
    if (item.type === 'heading') drawBodyHeading(item.text);
    else if (item.type === 'paragraph') drawBodyParagraph(item.text);
    else if (item.type === 'ol') drawOrderedList(item.items);
    else if (item.type === 'table') drawTable(item.rows);
  });

  drawSignatures();

  // Footer on every page
  pdfDoc.getPages().forEach(function (p) {
    if (theme.footerBand) drawFooterBand(p);
    else drawPlainFooter(p);
  });

  return pdfDoc.save();
}

module.exports = { generateLetterPdfBuffer, THEMES };
