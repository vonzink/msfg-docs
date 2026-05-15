'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { wrapTextToLines } = require('./wrapText');

/**
 * Build a branded PDF from the email-modal data shape:
 *   { title, sections: [{ heading, rows: [{label, value, isTotal?}] }] }
 *
 * Used by the workspace's "Add to Session Report" button as the
 * fallback PDF generator for documents that don't have a dedicated
 * server-side PDF endpoint. Keep this conservative: it is shared by
 * calculators, letters, and application summaries.
 *
 * @param {object} body  { title, sections }
 * @returns {Promise<Uint8Array>}
 */
async function generateStructuredPdfBuffer(body) {
  const title = cleanInline((body && body.title) || 'Document') || 'Document';
  const sections = normalizeSections(Array.isArray(body && body.sections) ? body.sections : []);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.12, 0.13, 0.14);
  const muted = rgb(0.43, 0.47, 0.48);
  const lightText = rgb(0.96, 0.98, 0.96);
  const brand = rgb(0.176, 0.416, 0.310);
  const brandDark = rgb(0.105, 0.263, 0.196);
  const rowAlt = rgb(0.974, 0.984, 0.976);
  const rowTotal = rgb(0.890, 0.951, 0.906);
  const rule = rgb(0.820, 0.855, 0.835);
  const headerRule = rgb(0.700, 0.790, 0.730);

  const W = 612;
  const H = 792;
  const margin = 50;
  const bottomY = 58;
  const contentW = W - margin * 2;
  const tableX = margin;
  const tableW = contentW;
  const labelW = 166;
  const valueW = tableW - labelW;
  const rowPadX = 11;
  const rowPadY = 7;
  const rowLine = 11.5;
  const sectionGap = 12;
  const tableHeaderH = 20;
  const sectionTitleSize = 10.5;
  const labelSize = 8.4;
  const valueSize = 9.2;

  let page;
  let cursorY;
  let pageNumber = 0;

  function addPage() {
    page = pdfDoc.addPage([W, H]);
    pageNumber += 1;
    cursorY = drawHeader(page, pageNumber);
  }

  function drawHeader(p, pageNo) {
    const dateText = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    p.drawRectangle({ x: 0, y: H - 7, width: W, height: 7, color: brand });
    drawText(p, margin, H - 33, 'Mountain State Financial Group', {
      size: 8.5,
      font: fontBold,
      color: brandDark
    });
    drawRightText(p, dateText, W - margin, H - 33, {
      size: 8.2,
      font,
      color: muted
    });
    p.drawLine({
      start: { x: margin, y: H - 48 },
      end: { x: W - margin, y: H - 48 },
      thickness: 0.7,
      color: headerRule
    });

    const headerTitle = pageNo === 1 ? title : title + ' (continued)';
    const lines = wrapSafe(headerTitle, contentW, fontBold, 17).slice(0, 2);
    let y = H - 76;
    lines.forEach((line) => {
      drawText(p, margin, y, line, {
        size: 17,
        font: fontBold,
        color: ink
      });
      y -= 20;
    });

    return y - 8;
  }

  function ensureRoom(needed) {
    if (cursorY - needed < bottomY) addPage();
  }

  function drawText(targetPage, x, y, text, opts) {
    opts = opts || {};
    targetPage.drawText(sanitizeForPdf(text), {
      x,
      y,
      size: opts.size || valueSize,
      font: opts.font || font,
      color: opts.color || ink
    });
  }

  function drawRightText(targetPage, text, rightX, y, opts) {
    opts = opts || {};
    const size = opts.size || valueSize;
    const f = opts.font || font;
    const clean = cleanInline(text);
    const width = f.widthOfTextAtSize(clean, size);
    drawText(targetPage, rightX - width, y, clean, opts);
  }

  function wrapSafe(text, maxWidth, f, size) {
    return wrapTextToLines(cleanText(text, { preserveNewlines: true }), maxWidth, f, size);
  }

  function drawSectionTitle(section, continued) {
    const heading = cleanInline(section.heading || 'Details') + (continued ? ' (continued)' : '');
    const lines = wrapSafe(heading, contentW, fontBold, sectionTitleSize);
    const titleH = Math.max(20, lines.length * 12 + 8);

    ensureRoom(titleH + tableHeaderH + 24);
    let y = cursorY - sectionTitleSize - 1;
    lines.forEach((line) => {
      drawText(page, margin, y, line.toUpperCase(), {
        size: sectionTitleSize,
        font: fontBold,
        color: brandDark
      });
      y -= 12;
    });
    pLine(margin, cursorY - titleH + 2, W - margin, cursorY - titleH + 2, 1, brand);
    cursorY -= titleH;
    drawTableHeader();
  }

  function drawTableHeader() {
    page.drawRectangle({
      x: tableX,
      y: cursorY - tableHeaderH,
      width: tableW,
      height: tableHeaderH,
      color: brandDark
    });
    drawText(page, tableX + rowPadX, cursorY - 14, 'Field', {
      size: 7.5,
      font: fontBold,
      color: lightText
    });
    drawText(page, tableX + labelW + rowPadX, cursorY - 14, 'Value', {
      size: 7.5,
      font: fontBold,
      color: lightText
    });
    cursorY -= tableHeaderH;
  }

  function pLine(x1, y1, x2, y2, thickness, color) {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness,
      color
    });
  }

  function buildRowLayout(row) {
    const isTotal = !!row.isTotal;
    const stacked = !!row.stacked || (!row.value && row.label.length > 42);
    const labelFont = fontBold;
    const valueFont = (isTotal || row.bold) ? fontBold : font;

    if (stacked) {
      const combined = row.value ? row.label + '\n' + row.value : row.label;
      const lines = wrapSafe(combined, tableW - rowPadX * 2, valueFont, valueSize);
      return {
        stacked: true,
        isTotal,
        labelLines: lines,
        valueLines: [],
        labelFont: valueFont,
        valueFont,
        height: Math.max(26, lines.length * rowLine + rowPadY * 2)
      };
    }

    const labelLines = wrapSafe(row.label, labelW - rowPadX * 2, labelFont, labelSize);
    const valueLines = wrapSafe(row.value, valueW - rowPadX * 2, valueFont, valueSize);
    return {
      stacked: false,
      isTotal,
      labelLines,
      valueLines,
      labelFont,
      valueFont,
      alignValueRight: shouldRightAlign(row.value) && valueLines.length === 1,
      height: Math.max(26, Math.max(labelLines.length, valueLines.length) * rowLine + rowPadY * 2)
    };
  }

  function shouldRightAlign(value) {
    return /^-?\(?\$?[\d,]+(?:\.\d+)?\)?%?$/.test(cleanInline(value));
  }

  function drawRow(layout, rowIndex) {
    const yBottom = cursorY - layout.height;
    const fill = layout.isTotal ? rowTotal : (rowIndex % 2 ? rowAlt : rgb(1, 1, 1));
    const textColor = layout.isTotal ? brandDark : ink;

    page.drawRectangle({ x: tableX, y: yBottom, width: tableW, height: layout.height, color: fill });
    pLine(tableX, yBottom, tableX + tableW, yBottom, 0.45, rule);

    if (layout.stacked) {
      drawLines(layout.labelLines, tableX + rowPadX, cursorY - rowPadY - valueSize, {
        size: valueSize,
        font: layout.labelFont,
        color: textColor
      });
    } else {
      pLine(tableX + labelW, yBottom, tableX + labelW, cursorY, 0.45, rule);
      drawLines(layout.labelLines, tableX + rowPadX, cursorY - rowPadY - labelSize, {
        size: labelSize,
        font: layout.labelFont,
        color: layout.isTotal ? brandDark : muted
      });
      drawLines(layout.valueLines, tableX + labelW + rowPadX, cursorY - rowPadY - valueSize, {
        size: valueSize,
        font: layout.valueFont,
        color: textColor,
        maxWidth: valueW - rowPadX * 2,
        alignRight: layout.alignValueRight
      });
    }

    cursorY = yBottom;
  }

  function drawLines(lines, x, y, opts) {
    opts = opts || {};
    lines.forEach((line, index) => {
      let drawX = x;
      if (opts.alignRight) {
        const width = opts.font.widthOfTextAtSize(cleanInline(line), opts.size);
        drawX = x + opts.maxWidth - width;
      }
      drawText(page, drawX, y - index * rowLine, line, opts);
    });
  }

  function drawSection(section) {
    drawSectionTitle(section, false);
    section.rows.forEach((row, rowIndex) => {
      const layout = buildRowLayout(row);
      if (cursorY - layout.height < bottomY) {
        addPage();
        drawSectionTitle(section, true);
      }
      drawRow(layout, rowIndex);
    });
    cursorY -= sectionGap;
  }

  function drawEmptyState() {
    drawSection({
      heading: 'Session item',
      rows: [{ label: 'Status', value: 'No structured data was provided.' }]
    });
  }

  addPage();
  if (sections.length) {
    sections.forEach(drawSection);
  } else {
    drawEmptyState();
  }

  // Footer on every page
  const pages = pdfDoc.getPages();
  pages.forEach((p, idx) => {
    p.drawLine({
      start: { x: margin, y: 42 },
      end: { x: W - margin, y: 42 },
      thickness: 0.5,
      color: rule
    });
    drawText(p, margin, 28, 'Mountain State Financial Group LLC | msfginfo.com', {
      size: 7.8,
      font,
      color: muted
    });
    drawRightText(p, `Page ${idx + 1} of ${pages.length}`, W - margin, 28, {
      size: 7.8,
      font,
      color: muted
    });
  });

  return pdfDoc.save();
}

function normalizeSections(rawSections) {
  return rawSections.map((section) => {
    const rows = Array.isArray(section && section.rows) ? section.rows : [];
    return {
      heading: cleanInline(section && section.heading),
      rows: rows.map(normalizeRow).filter((row) => row.label || row.value)
    };
  }).filter((section) => section.heading || section.rows.length);
}

function normalizeRow(row) {
  return {
    label: cleanInline(row && row.label),
    value: cleanText(row && row.value, { preserveNewlines: true }),
    isTotal: !!(row && row.isTotal),
    bold: !!(row && row.bold),
    stacked: !!(row && row.stacked)
  };
}

/**
 * pdf-lib's StandardFonts use WinAnsi. Clean before both measuring and
 * drawing; unsupported glyphs can otherwise throw before drawText.
 */
function sanitizeForPdf(value) {
  return String(value == null ? '' : value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ' ')
    .replace(/[\uD800-\uDFFF]/g, ' ')
    .replace(/[^\n\x20-\x7E\u00A1-\u00FF]/g, ' ');
}

function cleanInline(value) {
  return cleanText(value).replace(/\s+/g, ' ').trim();
}

function cleanText(value, opts) {
  opts = opts || {};
  const text = sanitizeForPdf(value);
  if (opts.preserveNewlines) {
    return text
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return text.replace(/\s+/g, ' ').trim();
}

module.exports = { generateStructuredPdfBuffer };
