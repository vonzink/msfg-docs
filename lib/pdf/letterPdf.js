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

/** Parse "#rrggbb" into a pdf-lib rgb(). Falls back to MSFG green. */
function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  if (!m) return rgb(0.176, 0.416, 0.310);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const MARGIN_PT = { narrow: 40, normal: 64, wide: 80 };

/** A/B/C template styles, mirroring the client STYLE_THEMES in
 *  public/js/shared/letter-style.js. When the payload carries a
 *  `templateStyle`, these fields win over the raw stored settings — same
 *  precedence as the live preview — so the branded PDF matches the picker. */
const STYLE_THEMES_ABC = {
  A: { fontFamily: 'times',     fontSize: 11, accent: '#1d4d3e', tableStyle: 'dotted', titleAlign: 'center', margin: 'normal', headerBand: false, footerBand: false, leftRail: false, justify: false },
  B: { fontFamily: 'helvetica', fontSize: 10, accent: '#0f8a8e', tableStyle: 'thin',   titleAlign: 'left',   margin: 'narrow', headerBand: false, footerBand: false, leftRail: true,  justify: false },
  C: { fontFamily: 'times',     fontSize: 11, accent: '#1d1d1f', tableStyle: 'thin',   titleAlign: 'left',   margin: 'wide',   headerBand: false, footerBand: false, leftRail: false, justify: false },
};

/** Overlay the chosen A/B/C template theme onto the raw settings when one
 *  is set. Unknown/absent templateStyle leaves the settings untouched so
 *  any non-picker caller keeps its explicit fields. */
function applyTemplateStyle(s) {
  const raw = String((s && s.templateStyle) == null ? '' : s.templateStyle).trim().toUpperCase();
  const theme = STYLE_THEMES_ABC[raw];
  return theme ? Object.assign({}, s, theme) : (s || {});
}

/** Build a theme-shaped object from the full per-user settings payload
 *  the client sends alongside each PDF request. Mirrors the CSS-vars
 *  the in-page preview uses so the PDF stays visually in sync. */
function resolveSettings(s0) {
  const s = applyTemplateStyle(s0);
  const isSerif = (s.fontFamily || 'times').toLowerCase() !== 'helvetica';
  const accent = hexToRgb(s.accent);
  const bodyPt = Number(s.fontSize) || 11;
  return {
    font: isSerif ? 'TimesRoman' : 'Helvetica',
    fontBold: isSerif ? 'TimesRomanBold' : 'HelveticaBold',
    fontItalic: isSerif ? 'TimesRomanItalic' : 'HelveticaOblique',
    bodyPt,
    leadMul: s.justify === false ? 1.45 : 1.5,
    headerBand: !!s.headerBand,
    footerBand: !!s.footerBand,
    justify: s.justify !== false,
    accent,
    ink: rgb(0.12, 0.12, 0.15),
    muted: rgb(0.45, 0.45, 0.5),
    margin: MARGIN_PT[s.margin] || MARGIN_PT.normal,
    titleAlign: s.titleAlign === 'left' ? 'left' : 'center',
    tableStyle: s.tableStyle || 'dotted',
    leftRail: !!s.leftRail,
  };
}

async function generateLetterPdfBuffer(letter) {
  const l = letter || {};
  // Preferred path: full settings object matching the in-page preview.
  // Back-compat: fall back to the old named-style lookup.
  const base = l.settings ? resolveSettings(l.settings) : resolveTheme(l.style);
  // Copy so branding tweaks never mutate the shared named-style THEMES.
  const theme = Object.assign({}, base);

  // Branded docs (Pre-Approval, Application Summary) always carry the
  // company letterhead + footer regardless of the chosen A/B/C style; the
  // style still drives typography, accent, table and alignment.
  const branded = !!l.brand;
  if (branded) theme.footerBand = true;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts[theme.font]);
  const fontBold = await pdfDoc.embedFont(StandardFonts[theme.fontBold]);
  const fontItalic = await pdfDoc.embedFont(StandardFonts[theme.fontItalic]);

  // Optional signature image, stamped above any signature line flagged
  // `stampImage`. Embedded once up front (async) so drawSignatures can
  // place it synchronously. A bad/unsupported image just degrades to the
  // plain signature line.
  let sigImage = null;
  if (l.signatureImage && l.signatureImage.bytes) {
    try {
      sigImage = l.signatureImage.format === 'jpg'
        ? await pdfDoc.embedJpg(l.signatureImage.bytes)
        : await pdfDoc.embedPng(l.signatureImage.bytes);
    } catch (_e) {
      sigImage = null;
    }
  }

  // Optional company logo for the branded letterhead. Embedded once up
  // front so drawBrandHeader can place it synchronously; a bad/missing
  // image degrades to the text wordmark.
  let logoImage = null;
  if (branded && l.brand.logo && l.brand.logo.bytes) {
    try {
      logoImage = l.brand.logo.format === 'jpg'
        ? await pdfDoc.embedJpg(l.brand.logo.bytes)
        : await pdfDoc.embedPng(l.brand.logo.bytes);
    } catch (_e) {
      logoImage = null;
    }
  }

  // Optional Equal Housing Lender mark for the branded footer (pre-approval).
  let ehlImage = null;
  if (branded && l.brand.ehlLogo && l.brand.ehlLogo.bytes) {
    try {
      ehlImage = l.brand.ehlLogo.format === 'jpg'
        ? await pdfDoc.embedJpg(l.brand.ehlLogo.bytes)
        : await pdfDoc.embedPng(l.brand.ehlLogo.bytes);
    } catch (_e) {
      ehlImage = null;
    }
  }

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

  /** Branded letterhead: company logo (or text wordmark fallback) top-left,
   *  generation date top-right, a thin accent rule beneath. Drawn on the
   *  first page only; continuation pages start at the top margin. */
  function drawBrandHeader() {
    const topY = H - margin;
    let hdrBottom;
    if (logoImage) {
      const maxW = 170, maxH = 52;
      const s = Math.min(maxW / logoImage.width, maxH / logoImage.height);
      const w = logoImage.width * s, h = logoImage.height * s;
      page.drawImage(logoImage, { x: contentLeft, y: topY - h, width: w, height: h });
      hdrBottom = topY - h;
    } else {
      drawText(contentLeft, topY - 15, l.brand.company || 'Mountain State Financial Group', {
        font: fontBold, size: 15, color: theme.accent,
      });
      hdrBottom = topY - 22;
    }
    if (l.dateLine) {
      const dw = textWidth(l.dateLine, font, bodyFS - 1);
      drawText(contentRight - dw, topY - 13, l.dateLine, { size: bodyFS - 1, color: theme.muted });
    }
    const ruleY = hdrBottom - 8;
    page.drawRectangle({
      x: contentLeft, y: ruleY,
      width: contentRight - contentLeft, height: 1.5, color: theme.accent,
    });
    // Breathing room between the letterhead rule and the document title.
    y = ruleY - lead * 1.9;
  }

  function drawFooterBand(pg) {
    if (!theme.footerBand) return;
    pg.drawRectangle({ x: 0, y: 0, width: W, height: 26, color: rgb(0.95, 0.96, 0.96) });
    pg.drawLine({ start: { x: 0, y: 26 }, end: { x: W, y: 26 }, thickness: 2, color: theme.accent });
    pg.drawText('Mountain State Financial Group LLC  |  msfginfo.com', {
      x: margin, y: 10, size: 8, font, color: theme.muted,
    });
    if (ehlImage) {
      const maxH = 30;
      const s = maxH / ehlImage.height;
      const w = ehlImage.width * s;
      // Bottom-right, sitting just above the 26pt footer band.
      pg.drawImage(ehlImage, { x: W - margin - w, y: 30, width: w, height: maxH });
    }
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
    // drawWrapped returns the last baseline, so advance a full line to clear it
    // (1.0) plus a paragraph gap (0.45) — otherwise paragraphs sit tighter than
    // the lines within them and the text overlaps.
    y -= lead * 1.45;
  }

  function drawBodyHeading(text) {
    ensureRoom(lead * 2);
    y -= lead * 0.5; // breathing room above the heading so it doesn't crowd the paragraph before it
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
    y -= lead * 0.45; // breathing room so the first row clears the preceding paragraph's last line
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
    // Each row holds one signature line. No separate date line — the
    // generation date already appears in the letterhead (top-right).
    const colW = (contentRight - contentLeft - 20) / 2;
    const rowH = 44;
    sigs.forEach(function (sig, i) {
      ensureRoom(rowH + 6);
      const rowY = y;
      const sigLineY = rowY - rowH + 20;

      // Signature line (full column width)
      const sigW = colW;
      page.drawLine({
        start: { x: contentLeft, y: sigLineY },
        end: { x: contentLeft + sigW, y: sigLineY },
        thickness: 0.6, color: theme.ink,
      });
      // Stamp the uploaded signature image just above the line, scaled to
      // fit the line width and a ~26pt band. Only entries flagged by the
      // builder (the loan-officer line) get stamped.
      if (sigImage && sig.stampImage) {
        const s = Math.min(sigW / sigImage.width, 26 / sigImage.height);
        page.drawImage(sigImage, {
          x: contentLeft,
          y: sigLineY + 2,
          width: sigImage.width * s,
          height: sigImage.height * s,
        });
      }
      drawText(contentLeft, sigLineY - 12, sig.caption || ('Signature ' + (i + 1)), {
        size: bodyFS - 2, color: theme.muted,
      });

      y = rowY - rowH;
    });
  }

  /* ---- Compose ---- */
  drawLeftRail();
  if (branded) drawBrandHeader();
  else drawHeaderBand();
  drawTitle();
  if (!branded) {
    drawDateLine();
    drawSectionDivider();
  }
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
