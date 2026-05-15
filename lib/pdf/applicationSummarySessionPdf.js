'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { wrapTextToLines } = require('./wrapText');

const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 28;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_Y = 34;

function canGenerateApplicationSummarySessionPdf(body) {
  if (cleanInline(body && body.title).toLowerCase() !== 'application summary') return false;
  if (Array.isArray(body && body.applications) && body.applications.length) return true;
  const sections = Array.isArray(body && body.sections) ? body.sections : [];
  return groupLegacyApplications(sections).applications.length > 0;
}

async function generateApplicationSummarySessionPdfBuffer(body) {
  const data = normalizeSessionData(body || {});
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const colors = {
    ink: rgb(0.13, 0.18, 0.23),
    muted: rgb(0.39, 0.43, 0.45),
    line: rgb(0.86, 0.88, 0.89),
    rowLine: rgb(0.91, 0.93, 0.94),
    headerFill: rgb(0.965, 0.972, 0.976),
    rowAlt: rgb(0.986, 0.990, 0.988),
    brand: rgb(0.176, 0.416, 0.310),
    brandDark: rgb(0.105, 0.263, 0.196),
    brandPale: rgb(0.957, 0.984, 0.965),
    review: rgb(0.760, 0.255, 0.047),
    reviewPale: rgb(1, 0.969, 0.929),
    white: rgb(1, 1, 1)
  };

  data.applications.forEach((app, index) => {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    drawApplicationPage({ page, app, index, total: data.applications.length, loanOverview: data.loanOverview, font, fontBold, colors });
  });

  return pdfDoc.save();
}

function drawApplicationPage(ctx) {
  const { page, app, index, total, loanOverview, font, fontBold, colors } = ctx;
  const dateText = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  let y = PAGE_H - 26;

  page.drawRectangle({ x: 0, y: PAGE_H - 7, width: PAGE_W, height: 7, color: colors.brand });
  drawText(page, fontBold, MARGIN, y, `${app.label || `Application ${index + 1} of ${total}`} - Borrower review`, 7.6, colors.brand);
  drawRightText(page, font, dateText, PAGE_W - MARGIN, y, 7.4, colors.muted);
  y -= 16;
  drawText(page, fontBold, MARGIN, y, 'Application Summary', 16, colors.ink);
  drawText(page, font, MARGIN + 182, y + 2, app.borrowerName || 'Borrower', 8.8, colors.muted);
  page.drawLine({ start: { x: MARGIN, y: y - 9 }, end: { x: PAGE_W - MARGIN, y: y - 9 }, thickness: 1.1, color: colors.brand });
  y -= 24;

  y = drawKpis(page, font, fontBold, colors, y, app.coverage);
  y = drawActionBox(page, font, fontBold, colors, y, app.coverage.reviewItems);

  const sections = [
    { title: 'Loan overview', table: loanOverview, maxRows: 5, rowH: 9.5, headH: 11, bodyFont: 6.6 },
    { title: 'Borrower information', table: app.tables.borrowerInformation, maxRows: 1, rowH: 16, headH: 12, bodyFont: 6.1, bodyLines: 2 },
    { title: 'Residence history', table: app.tables.residenceHistory, maxRows: 3, rowH: 12.5, headH: 11, bodyFont: 6.4, bodyLines: 2 },
    { title: 'Employment history', table: app.tables.employmentHistory, maxRows: 4, rowH: 12, headH: 11, bodyFont: 6.2, bodyLines: 2 },
    { title: 'Financial assets', table: app.tables.assets, maxRows: 2, rowH: 10.5, headH: 11, bodyFont: 6.2 },
    { title: 'Real estate owned', table: app.tables.reo, maxRows: 2, rowH: 10.5, headH: 11, bodyFont: 6.0 },
    { title: 'Liabilities', table: app.tables.liabilities, maxRows: 3, rowH: 11, headH: 11, bodyFont: 6.0 },
    { title: 'Declarations to confirm', table: app.tables.declarations, maxRows: 1, rowH: 12, headH: 14, bodyFont: 6.0, bodyLines: 1, headerLines: 2 }
  ];

  sections.forEach((section) => {
    if (y < BOTTOM_Y + 28) return;
    y = drawFullWidthTable(page, font, fontBold, colors, y, section);
  });

  drawFooter(page, font, fontBold, colors, index, total);
}

function drawKpis(page, font, fontBold, colors, y, coverage) {
  const items = [
    { label: 'Residence coverage', value: coverage.residence || 'Not provided' },
    { label: 'Employment coverage', value: coverage.employment || 'Not provided' },
    { label: 'Review items', value: reviewLabel(coverage.reviewItems) }
  ];
  const gap = 8;
  const boxW = (CONTENT_W - gap * 2) / 3;
  const boxH = 24;

  items.forEach((item, idx) => {
    const x = MARGIN + idx * (boxW + gap);
    const review = /needs review|missing/i.test(item.value);
    page.drawRectangle({
      x,
      y: y - boxH,
      width: boxW,
      height: boxH,
      color: review ? colors.reviewPale : colors.brandPale,
      borderColor: review ? rgb(0.996, 0.718, 0.420) : rgb(0.718, 0.894, 0.780),
      borderWidth: 0.6
    });
    drawText(page, fontBold, x + 7, y - 9, item.label.toUpperCase(), 5.4, review ? colors.review : colors.brandDark);
    drawFittedText(page, font, item.value, x + 7, y - 19, boxW - 14, 6.8, colors.ink);
  });

  return y - boxH - 5;
}

function drawActionBox(page, font, fontBold, colors, y, reviewItems) {
  const clean = cleanInline(reviewItems);
  const hasItems = clean && clean.toLowerCase() !== 'none';
  const boxH = 23;
  page.drawRectangle({
    x: MARGIN,
    y: y - boxH,
    width: CONTENT_W,
    height: boxH,
    color: hasItems ? colors.reviewPale : colors.brandPale,
    borderColor: hasItems ? rgb(0.996, 0.718, 0.420) : rgb(0.718, 0.894, 0.780),
    borderWidth: 0.6
  });
  drawText(page, fontBold, MARGIN + 7, y - 9, 'Items to confirm before submission', 6.4, hasItems ? colors.review : colors.brandDark);
  const body = hasItems
    ? cleanText(reviewItems, { preserveNewlines: true }).replace(/\n/g, '   ')
    : 'No two-year employment or residence gaps found for this borrower from the MISMO data.';
  drawFittedText(page, font, body, MARGIN + 7, y - 18, CONTENT_W - 14, 6.8, colors.ink);
  return y - boxH - 6;
}

function drawFullWidthTable(page, font, fontBold, colors, topY, section) {
  const table = normalizeTable(section.table);
  const rows = fitRows(table.rows, section.maxRows, table.columns.length);
  const titleH = 10;
  const headH = section.headH || 11;
  const rowH = section.rowH || 13;
  const totalH = titleH + headH + rows.length * rowH;
  const titleY = topY - 7;
  const x = MARGIN;
  const y = topY - titleH;
  const widths = columnWidths(section.title, table.columns, CONTENT_W);

  drawText(page, fontBold, x, titleY, section.title, 8.4, colors.brandDark);
  page.drawLine({ start: { x, y: topY - titleH + 1 }, end: { x: x + CONTENT_W, y: topY - titleH + 1 }, thickness: 0.45, color: colors.line });
  page.drawRectangle({ x, y: y - headH, width: CONTENT_W, height: headH, color: colors.headerFill });

  let cursorX = x;
  table.columns.forEach((column, idx) => {
    drawCell(page, fontBold, column, cursorX + 5, y - 4, widths[idx] - 10, 6.0, colors.muted, section.headerLines || 1, 6.5);
    cursorX += widths[idx];
  });

  rows.forEach((row, rowIndex) => {
    const rowTop = y - headH - rowIndex * rowH;
    const rowBottom = rowTop - rowH;
    if (rowIndex % 2) {
      page.drawRectangle({ x, y: rowBottom, width: CONTENT_W, height: rowH, color: colors.rowAlt });
    }
    page.drawLine({ start: { x, y: rowBottom }, end: { x: x + CONTENT_W, y: rowBottom }, thickness: 0.32, color: colors.rowLine });

    let rowX = x;
    row.forEach((cell, cellIndex) => {
      const isFirst = cellIndex === 0;
      const cellColor = /not provided|needs review|missing/i.test(cleanInline(cell)) ? colors.review : colors.ink;
      drawCell(page, isFirst ? fontBold : font, cell, rowX + 5, rowTop - 4, widths[cellIndex] - 10, section.bodyFont || 6.4, isFirst ? colors.ink : cellColor, section.bodyLines || 1, 6.8);
      rowX += widths[cellIndex];
    });
  });

  return topY - totalH - 4;
}

function drawFooter(page, font, fontBold, colors, index, total) {
  const y = 18;
  drawText(page, font, MARGIN, y + 12, 'Application information will be verified and may be updated during the loan process.', 6.8, colors.muted);
  page.drawLine({ start: { x: MARGIN, y: y + 5 }, end: { x: PAGE_W - MARGIN, y: y + 5 }, thickness: 0.45, color: colors.line });
  drawText(page, font, MARGIN, y - 6, 'Mountain State Financial Group LLC | msfginfo.com', 6.7, colors.muted);
  drawRightText(page, fontBold, `Application ${index + 1} of ${total}`, PAGE_W - MARGIN, y - 6, 6.7, colors.brandDark);
}

function drawText(page, font, x, y, text, size, color) {
  page.drawText(cleanInline(text), { x, y, size, font, color });
}

function drawRightText(page, font, text, rightX, y, size, color) {
  const clean = cleanInline(text);
  page.drawText(clean, { x: rightX - font.widthOfTextAtSize(clean, size), y, size, font, color });
}

function drawFittedText(page, font, text, x, y, maxWidth, size, color) {
  page.drawText(truncateToWidth(text, maxWidth, font, size), { x, y, size, font, color });
}

function drawCell(page, font, text, x, y, maxWidth, size, color, maxLines, lineHeight) {
  const lines = wrapTextToLines(cleanText(text, { preserveNewlines: true }), maxWidth, font, size);
  const limited = lines.slice(0, maxLines);
  if (lines.length > maxLines && limited.length) {
    limited[limited.length - 1] = truncateToWidth(limited[limited.length - 1] + ' ...', maxWidth, font, size);
  }
  limited.forEach((line, idx) => {
    page.drawText(line, { x, y: y - idx * lineHeight, size, font, color });
  });
}

function truncateToWidth(value, maxWidth, font, size) {
  let text = cleanInline(value);
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const suffix = '...';
  while (text.length > suffix.length && font.widthOfTextAtSize(text + suffix, size) > maxWidth) {
    text = text.slice(0, -1);
  }
  return text.trimEnd() + suffix;
}

function normalizeSessionData(body) {
  if (Array.isArray(body.applications) && body.applications.length) {
    return {
      loanOverview: normalizeTable(body.loanOverview),
      applications: body.applications.map(normalizeApplication)
    };
  }
  return legacySectionsToSessionData(Array.isArray(body.sections) ? body.sections : []);
}

function normalizeApplication(app) {
  const coverage = app.coverage || {};
  const tables = app.tables || {};
  return {
    label: cleanInline(app.label),
    borrowerName: cleanInline(app.borrowerName),
    coverage: {
      residence: cleanInline(coverage.residence),
      employment: cleanInline(coverage.employment),
      reviewItems: cleanText(coverage.reviewItems, { preserveNewlines: true })
    },
    tables: {
      borrowerInformation: normalizeTable(tables.borrowerInformation, ['Name', 'Role', 'SSN/ITIN', 'DOB', 'Citizenship', 'Marital', 'Dependents', 'Phones', 'Email', 'AKA']),
      residenceHistory: normalizeTable(tables.residenceHistory, ['Type', 'Address', 'Duration', 'Start', 'End']),
      employmentHistory: normalizeTable(tables.employmentHistory, ['Type', 'Employer', 'Title', 'Duration', 'Start', 'End', 'Monthly income']),
      assets: normalizeTable(tables.assets, ['Type', 'Institution / account', 'Value', 'Usage', 'Disposition']),
      reo: normalizeTable(tables.reo, ['Address', 'Usage', 'Value', 'Lien UPB', 'Net rental', 'Maintenance', 'Disposition']),
      liabilities: normalizeTable(tables.liabilities, ['Type', 'Creditor', 'Account', 'Balance', 'Payment', 'Paid off at closing', 'Excluded']),
      declarations: normalizeTable(tables.declarations, ['Occupy', 'Seller relationship', 'Borrowed funds', 'New credit', 'Other mortgage', 'Judgments', 'Federal debt delinquent', 'Lawsuit', 'Bankruptcy', 'Foreclosure', 'Short sale'])
    }
  };
}

function normalizeTable(table, fallbackColumns) {
  const columns = Array.isArray(table && table.columns) && table.columns.length
    ? table.columns.map(cleanInline)
    : (fallbackColumns || ['Field', 'Value']);
  const rows = Array.isArray(table && table.rows)
    ? table.rows.map((row) => normalizeRow(row, columns.length))
    : [];
  return { columns, rows };
}

function normalizeRow(row, width) {
  if (Array.isArray(row)) {
    return Array.from({ length: width }, (_, idx) => cleanText(row[idx], { preserveNewlines: true }));
  }
  if (row && typeof row === 'object') {
    return [row.label, row.value].concat(Array(Math.max(width - 2, 0)).fill('')).slice(0, width).map((value) => cleanText(value, { preserveNewlines: true }));
  }
  return Array(width).fill('');
}

function fitRows(rows, maxRows, width) {
  const cleaned = rows.filter((row) => row.some((cell) => cleanInline(cell)));
  if (cleaned.length) {
    if (cleaned.length <= maxRows) return cleaned;
    const shown = cleaned.slice(0, Math.max(maxRows - 1, 0));
    const summary = Array(width).fill('');
    summary[0] = 'Additional entries';
    summary[1] = `${cleaned.length - shown.length} more listed in MISMO`;
    shown.push(summary);
    return shown;
  }
  const empty = Array(width).fill('');
  empty[0] = 'Status';
  empty[1] = 'No data listed';
  return [empty];
}

function reviewLabel(value) {
  const clean = cleanInline(value);
  if (!clean || clean.toLowerCase() === 'none') return 'None';
  return clean.split(/\n/).filter(Boolean).length + ' item(s)';
}

function columnWidths(title, columns, totalWidth) {
  const lower = cleanInline(title).toLowerCase();
  let weights = null;
  if (lower === 'loan overview') weights = [0.26, 0.24, 0.26, 0.24];
  if (lower === 'borrower information') weights = [0.12, 0.08, 0.09, 0.09, 0.12, 0.08, 0.08, 0.11, 0.17, 0.06];
  if (lower === 'residence history') weights = [0.12, 0.40, 0.13, 0.17, 0.18];
  if (lower === 'employment history') weights = [0.11, 0.22, 0.15, 0.12, 0.13, 0.13, 0.14];
  if (lower === 'financial assets') weights = [0.18, 0.34, 0.13, 0.18, 0.17];
  if (lower === 'real estate owned') weights = [0.31, 0.12, 0.13, 0.13, 0.11, 0.10, 0.10];
  if (lower === 'liabilities') weights = [0.14, 0.22, 0.12, 0.12, 0.12, 0.18, 0.10];
  if (lower === 'declarations to confirm') weights = [0.07, 0.11, 0.10, 0.09, 0.10, 0.09, 0.12, 0.08, 0.09, 0.08, 0.07];
  if (!weights || weights.length !== columns.length) weights = columns.map(() => 1 / columns.length);
  const sum = weights.reduce((acc, item) => acc + item, 0) || 1;
  return weights.map((weight) => totalWidth * (weight / sum));
}

function groupLegacyApplications(sections) {
  const loanRows = [];
  const applications = [];
  let current = null;
  sections.forEach((section) => {
    const heading = cleanInline(section && section.heading);
    const rows = normalizeTable({ rows: section && section.rows }).rows;
    if (/^loan overview$/i.test(heading)) {
      loanRows.push(...rows);
      return;
    }
    if (section && section.variant === 'application-divider') {
      current = { heading, rows, sections: [] };
      applications.push(current);
      return;
    }
    if (current) current.sections.push({ heading, rows });
  });
  return { loanRows, applications };
}

function legacySectionsToSessionData(sections) {
  const grouped = groupLegacyApplications(sections);
  return {
    loanOverview: legacyLoanOverview(grouped.loanRows),
    applications: grouped.applications.map((app, idx) => legacyApplication(app, idx, grouped.applications.length))
  };
}

function legacyLoanOverview(rows) {
  const pairs = [];
  for (let i = 0; i < rows.length; i += 2) {
    const left = rows[i] || ['', ''];
    const right = rows[i + 1] || ['', ''];
    pairs.push([left[0], left[1], right[0], right[1]]);
  }
  return normalizeTable({ columns: ['Field', 'Value', 'Field', 'Value'], rows: pairs });
}

function legacyApplication(app, idx, total) {
  const summary = {};
  app.rows.forEach((row) => { summary[cleanInline(row[0]).toLowerCase()] = row[1]; });
  const borrower = cleanInline((summary.borrower || '').split('|')[0]) || cleanInline(app.heading.replace(/^Application\s+\d+\s+of\s+\d+\s+-\s+/i, ''));
  return normalizeApplication({
    label: `Application ${idx + 1} of ${total}`,
    borrowerName: borrower,
    coverage: {
      residence: summary['residence history'],
      employment: summary['employment history'],
      reviewItems: summary['review items']
    },
    tables: {
      borrowerInformation: legacyBorrowerInfo(summary.borrower),
      residenceHistory: legacyTwoColumnTable(sectionRows(app, 'residence history'), ['Type / duration', 'Address']),
      employmentHistory: legacyTwoColumnTable(sectionRows(app, 'employment history'), ['Type / duration', 'Employer / title']),
      assets: legacyTwoColumnTable(sectionRows(app, 'financial assets'), ['Asset', 'Details']),
      reo: legacyTwoColumnTable(sectionRows(app, 'real estate owned'), ['Property', 'Details']),
      liabilities: legacyTwoColumnTable(sectionRows(app, 'liabilities'), ['Liability', 'Details'])
    }
  });
}

function legacyBorrowerInfo(value) {
  return normalizeTable({
    columns: ['Name', 'Role', 'SSN/ITIN', 'DOB', 'Citizenship', 'Marital', 'Dependents', 'Phones', 'Email', 'AKA'],
    rows: [String(value || '').split('|').map(cleanInline)]
  });
}

function legacyTwoColumnTable(rows, columns) {
  return normalizeTable({ columns, rows });
}

function sectionRows(app, prefix) {
  const target = prefix.toLowerCase();
  const found = app.sections.find((section) => cleanInline(section.heading).toLowerCase().startsWith(target));
  return found ? found.rows : [];
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
