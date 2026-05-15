'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { wrapTextToLines } = require('./wrapText');

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 34;
const CONTENT_W = PAGE_W - MARGIN * 2;

function canGenerateApplicationSummarySessionPdf(body) {
  const sections = Array.isArray(body && body.sections) ? body.sections : [];
  return cleanInline(body && body.title).toLowerCase() === 'application summary' &&
    groupApplications(sections).applications.length > 0;
}

async function generateApplicationSummarySessionPdfBuffer(body) {
  const grouped = groupApplications(Array.isArray(body && body.sections) ? body.sections : []);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const colors = {
    ink: rgb(0.12, 0.13, 0.14),
    muted: rgb(0.43, 0.47, 0.48),
    line: rgb(0.82, 0.86, 0.84),
    brand: rgb(0.176, 0.416, 0.310),
    brandDark: rgb(0.105, 0.263, 0.196),
    brandPale: rgb(0.957, 0.984, 0.965),
    review: rgb(0.760, 0.255, 0.047),
    reviewPale: rgb(1, 0.969, 0.929),
    headerFill: rgb(0.969, 0.980, 0.973),
    rowAlt: rgb(0.982, 0.988, 0.984),
    white: rgb(1, 1, 1)
  };

  grouped.applications.forEach((application, index) => {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    drawApplicationPage({
      page,
      app: application,
      appIndex: index,
      appTotal: grouped.applications.length,
      loanRows: grouped.loanRows,
      font,
      fontBold,
      colors
    });
  });

  return pdfDoc.save();
}

function drawApplicationPage(ctx) {
  const { page, app, appIndex, appTotal, loanRows, font, fontBold, colors } = ctx;
  let y = PAGE_H - 32;
  const borrowerName = applicationBorrowerName(app);
  const dateText = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  page.drawRectangle({ x: 0, y: PAGE_H - 7, width: PAGE_W, height: 7, color: colors.brand });
  drawText(page, fontBold, MARGIN, y, `Borrower Review - Application ${appIndex + 1} of ${appTotal}`, 7.8, colors.brand);
  drawRightText(page, font, dateText, PAGE_W - MARGIN, y, 8, colors.muted);
  y -= 20;
  drawText(page, fontBold, MARGIN, y, 'Application Summary', 18, colors.ink);
  y -= 15;
  drawText(page, font, MARGIN, y, borrowerName || 'Borrower', 9.5, colors.muted);
  page.drawLine({
    start: { x: MARGIN, y: y - 12 },
    end: { x: PAGE_W - MARGIN, y: y - 12 },
    thickness: 1.2,
    color: colors.brand
  });
  y -= 27;

  const summaryRows = rowsByLabel(app.summaryRows);
  y = drawKpis(page, font, fontBold, colors, y, [
    { label: 'Residence coverage', value: summaryRows['residence history'] || 'Not provided' },
    { label: 'Employment coverage', value: summaryRows['employment history'] || 'Not provided' },
    { label: 'Review items', value: reviewLabel(summaryRows['review items']) }
  ]);

  y = drawActionBox(page, font, fontBold, colors, y, summaryRows['review items']);

  const gap = 10;
  const colW = (CONTENT_W - gap) / 2;
  const infoTop = y;
  drawSectionBox(page, font, fontBold, colors, {
    title: 'Loan overview',
    x: MARGIN,
    y: infoTop,
    width: colW,
    height: 82,
    rows: loanRows,
    rowHeight: 12
  });
  drawSectionBox(page, font, fontBold, colors, {
    title: 'Borrower information',
    x: MARGIN + colW + gap,
    y: infoTop,
    width: colW,
    height: 82,
    rows: borrowerInfoRows(app.summaryRows),
    rowHeight: 12
  });
  y = infoTop - 92;

  const historyTop = y;
  drawSectionBox(page, font, fontBold, colors, {
    title: 'Residence history',
    x: MARGIN,
    y: historyTop,
    width: colW,
    height: 118,
    rows: sectionRows(app, 'residence history'),
    tallRows: true,
    rowHeight: 25
  });
  drawSectionBox(page, font, fontBold, colors, {
    title: 'Employment history',
    x: MARGIN + colW + gap,
    y: historyTop,
    width: colW,
    height: 118,
    rows: sectionRows(app, 'employment history'),
    tallRows: true,
    rowHeight: 25
  });
  y = historyTop - 130;

  const financialRows = sectionRows(app, 'financial assets').concat(prefixRows(sectionRows(app, 'real estate owned'), 'REO'));
  const financialTop = y;
  drawSectionBox(page, font, fontBold, colors, {
    title: 'Assets and REO',
    x: MARGIN,
    y: financialTop,
    width: colW,
    height: 222,
    rows: financialRows,
    rowHeight: 17
  });
  drawSectionBox(page, font, fontBold, colors, {
    title: 'Liabilities',
    x: MARGIN + colW + gap,
    y: financialTop,
    width: colW,
    height: 222,
    rows: sectionRows(app, 'liabilities'),
    rowHeight: 17
  });

  drawFooter(page, font, fontBold, colors, appIndex, appTotal);
}

function drawKpis(page, font, fontBold, colors, y, items) {
  const gap = 8;
  const boxW = (CONTENT_W - gap * 2) / 3;
  const boxH = 42;

  items.forEach((item, index) => {
    const x = MARGIN + index * (boxW + gap);
    const needsReview = /needs review/i.test(item.value);
    page.drawRectangle({
      x,
      y: y - boxH,
      width: boxW,
      height: boxH,
      color: needsReview ? colors.reviewPale : colors.brandPale,
      borderColor: needsReview ? rgb(0.996, 0.718, 0.420) : rgb(0.718, 0.894, 0.780),
      borderWidth: 0.8
    });
    drawText(page, fontBold, x + 8, y - 13, item.label.toUpperCase(), 6.4, needsReview ? colors.review : colors.brandDark);
    drawFittedText(page, fontBold, item.value, x + 8, y - 29, boxW - 16, 8.1, colors.ink);
  });

  return y - boxH - 10;
}

function drawActionBox(page, font, fontBold, colors, y, reviewItems) {
  const clean = cleanInline(reviewItems || '');
  const hasItems = clean && clean.toLowerCase() !== 'none';
  const boxH = 48;
  page.drawRectangle({
    x: MARGIN,
    y: y - boxH,
    width: CONTENT_W,
    height: boxH,
    color: hasItems ? colors.reviewPale : colors.brandPale,
    borderColor: hasItems ? rgb(0.996, 0.718, 0.420) : rgb(0.718, 0.894, 0.780),
    borderWidth: 0.8
  });
  drawText(page, fontBold, MARGIN + 10, y - 14, 'Items to confirm before submission', 8.2, hasItems ? colors.review : colors.brandDark);
  const body = hasItems
    ? cleanText(reviewItems, { preserveNewlines: true }).replace(/\n/g, '   ')
    : 'No two-year employment or residence gaps found for this borrower from the MISMO data.';
  drawWrapped(page, font, body, MARGIN + 10, y - 29, CONTENT_W - 20, 8.2, colors.ink, 2, 10);
  return y - boxH - 10;
}

function drawSectionBox(page, font, fontBold, colors, opts) {
  const headerH = 18;
  const rowAreaH = opts.height - headerH;
  const rowH = opts.rowHeight || (opts.tallRows ? 25 : 16);
  const maxRows = Math.max(1, Math.floor(rowAreaH / rowH));
  const sourceRows = opts.rows.length ? opts.rows : [{ label: 'Status', value: 'No data listed' }];
  const rows = fitRows(sourceRows, maxRows);
  const labelW = Math.min(opts.width * 0.42, 112);

  page.drawRectangle({
    x: opts.x,
    y: opts.y - opts.height,
    width: opts.width,
    height: opts.height,
    color: colors.white,
    borderColor: colors.line,
    borderWidth: 0.55
  });
  page.drawRectangle({
    x: opts.x,
    y: opts.y - headerH,
    width: opts.width,
    height: headerH,
    color: colors.headerFill
  });
  drawText(page, fontBold, opts.x + 7, opts.y - 12, opts.title.toUpperCase(), 7.5, colors.brandDark);
  page.drawLine({
    start: { x: opts.x, y: opts.y - headerH },
    end: { x: opts.x + opts.width, y: opts.y - headerH },
    thickness: 0.7,
    color: colors.brand
  });

  rows.forEach((row, index) => {
    const rowTop = opts.y - headerH - index * rowH;
    const rowBottom = rowTop - rowH;
    if (index % 2) {
      page.drawRectangle({
        x: opts.x,
        y: rowBottom,
        width: opts.width,
        height: rowH,
        color: colors.rowAlt
      });
    }
    page.drawLine({
      start: { x: opts.x, y: rowBottom },
      end: { x: opts.x + opts.width, y: rowBottom },
      thickness: 0.35,
      color: colors.line
    });
    drawFittedText(page, fontBold, row.label, opts.x + 7, rowTop - 10, labelW - 12, 6.9, colors.muted);
    if (opts.tallRows) {
      drawWrapped(page, font, row.value, opts.x + labelW, rowTop - 10, opts.width - labelW - 8, 7.5, valueColor(row.value, colors), 2, 8.5);
    } else {
      drawFittedText(page, font, row.value, opts.x + labelW, rowTop - 10, opts.width - labelW - 8, 7.4, valueColor(row.value, colors));
    }
  });
}

function drawFooter(page, font, fontBold, colors, appIndex, appTotal) {
  const disclaimer = 'Application information will be verified and may be updated during the loan process.';
  drawText(page, font, MARGIN, 58, disclaimer, 7.2, colors.muted);
  page.drawLine({
    start: { x: MARGIN, y: 43 },
    end: { x: PAGE_W - MARGIN, y: 43 },
    thickness: 0.5,
    color: colors.line
  });
  drawText(page, font, MARGIN, 29, 'Mountain State Financial Group LLC | msfginfo.com', 7.2, colors.muted);
  drawRightText(page, fontBold, `Application ${appIndex + 1} of ${appTotal}`, PAGE_W - MARGIN, 29, 7.2, colors.brandDark);
}

function drawText(page, font, x, y, text, size, color) {
  page.drawText(cleanInline(text), { x, y, size, font, color });
}

function drawRightText(page, font, text, rightX, y, size, color) {
  const clean = cleanInline(text);
  page.drawText(clean, {
    x: rightX - font.widthOfTextAtSize(clean, size),
    y,
    size,
    font,
    color
  });
}

function drawFittedText(page, font, text, x, y, maxWidth, size, color) {
  page.drawText(truncateToWidth(text, maxWidth, font, size), { x, y, size, font, color });
}

function drawWrapped(page, font, text, x, y, maxWidth, size, color, maxLines, lineHeight) {
  const lines = wrapTextToLines(cleanText(text, { preserveNewlines: true }), maxWidth, font, size);
  const limited = lines.slice(0, maxLines);
  if (lines.length > maxLines && limited.length) {
    limited[limited.length - 1] = truncateToWidth(limited[limited.length - 1] + ' ...', maxWidth, font, size);
  }
  limited.forEach((line, index) => {
    page.drawText(line, { x, y: y - index * lineHeight, size, font, color });
  });
}

function truncateToWidth(value, maxWidth, font, size) {
  let text = cleanInline(value);
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const suffix = '...';
  while (text.length > suffix.length && font.widthOfTextAtSize(text + suffix, size) > maxWidth) {
    text = text.slice(0, -1);
  }
  return (text || '').trimEnd() + suffix;
}

function valueColor(value, colors) {
  return /not provided|needs review|missing/i.test(cleanInline(value)) ? colors.review : colors.ink;
}

function reviewLabel(value) {
  const clean = cleanInline(value);
  if (!clean || clean.toLowerCase() === 'none') return 'None';
  return clean.split(/\n/).filter(Boolean).length + ' item(s)';
}

function groupApplications(sections) {
  const loanRows = [];
  const applications = [];
  let current = null;

  sections.forEach((section) => {
    const heading = cleanInline(section && section.heading);
    const rows = normalizeRows(section && section.rows);
    const isApplication = section && section.variant === 'application-divider';

    if (/^loan overview$/i.test(heading)) {
      loanRows.push(...rows);
      return;
    }

    if (isApplication) {
      current = { heading, summaryRows: rows, sections: [] };
      applications.push(current);
      return;
    }

    if (current) {
      current.sections.push({ heading, rows });
    }
  });

  return { applications, loanRows: fitRows(loanRows, 5) };
}

function rowsByLabel(rows) {
  return rows.reduce((out, row) => {
    out[cleanInline(row.label).toLowerCase()] = row.value;
    return out;
  }, {});
}

function applicationBorrowerName(app) {
  const summary = rowsByLabel(app.summaryRows);
  const borrower = summary.borrower || '';
  if (borrower) return cleanInline(borrower.split('|')[0]);
  return cleanInline(app.heading.replace(/^Application\s+\d+\s+of\s+\d+\s+-\s+/i, ''));
}

function borrowerInfoRows(summaryRows) {
  const summary = rowsByLabel(summaryRows);
  const borrower = summary.borrower || '';
  const parts = borrower.split('|').map(cleanInline);
  const labels = ['Name', 'Role', 'SSN/ITIN', 'DOB', 'Citizenship', 'Marital', 'Dependents', 'Phones', 'Email', 'AKA'];
  const rows = [];
  const preferredIndexes = [1, 2, 3, 4, 5, 6, 7, 8];
  preferredIndexes.forEach((index) => {
    const part = parts[index];
    if (!part || index === 0) return;
    rows.push({ label: labels[index] || `Field ${index + 1}`, value: part });
  });
  return rows.slice(0, 5);
}

function sectionRows(app, prefix) {
  const target = prefix.toLowerCase();
  const section = app.sections.find((candidate) => cleanInline(candidate.heading).toLowerCase().startsWith(target));
  return section ? section.rows : [];
}

function prefixRows(rows, prefix) {
  return rows.map((row) => ({
    label: `${prefix} - ${row.label}`,
    value: row.value
  }));
}

function fitRows(rows, maxRows) {
  const cleaned = normalizeRows(rows).filter((row) => row.label || row.value);
  if (cleaned.length <= maxRows) return cleaned;
  const shown = cleaned.slice(0, Math.max(maxRows - 1, 0));
  shown.push({
    label: 'Additional entries',
    value: `${cleaned.length - shown.length} more listed in MISMO`
  });
  return shown;
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    label: cleanInline(row && row.label),
    value: cleanText(row && row.value, { preserveNewlines: true })
  }));
}

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

module.exports = {
  canGenerateApplicationSummarySessionPdf,
  generateApplicationSummarySessionPdfBuffer
};
