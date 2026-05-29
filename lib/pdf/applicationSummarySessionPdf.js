'use strict';

const { PDFDocument, StandardFonts, degrees, rgb } = require('pdf-lib');

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;

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
  const colors = palette(body && body.style);

  data.applications.forEach((app, index) => {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    drawReviewSheet({ page, app, index, total: data.applications.length, loanOverview: data.loanOverview, font, fontBold, colors });
  });

  return pdfDoc.save();
}

// A/B/C accent identities matching the letter styles: A Evergreen (green),
// B Ledger (teal), C Plain (near-black ink). Only the brand accents change;
// the neutral ink/line/amber palette is shared so the dense review sheet
// stays legible across styles.
const STYLE_ACCENTS = {
  A: { brand: rgb(0.176, 0.416, 0.310), brandDark: rgb(0.105, 0.263, 0.196), brandPale: rgb(0.941, 0.976, 0.953) },
  B: { brand: rgb(0.059, 0.541, 0.557), brandDark: rgb(0.043, 0.353, 0.365), brandPale: rgb(0.925, 0.973, 0.973) },
  C: { brand: rgb(0.137, 0.145, 0.157), brandDark: rgb(0.075, 0.082, 0.090), brandPale: rgb(0.945, 0.949, 0.953) }
};

function normalizeStyle(s) {
  const k = String(s == null ? '' : s).trim().toUpperCase();
  return (k === 'B' || k === 'C') ? k : 'A';
}

function palette(style) {
  const accent = STYLE_ACCENTS[normalizeStyle(style)];
  return {
    ink: rgb(0.12, 0.17, 0.22),
    muted: rgb(0.40, 0.44, 0.47),
    faint: rgb(0.96, 0.97, 0.965),
    faintAlt: rgb(0.985, 0.988, 0.986),
    line: rgb(0.83, 0.86, 0.85),
    brand: accent.brand,
    brandDark: accent.brandDark,
    brandPale: accent.brandPale,
    amber: rgb(0.760, 0.255, 0.047),
    amberPale: rgb(1, 0.969, 0.929),
    amberLine: rgb(0.996, 0.718, 0.420),
    white: rgb(1, 1, 1)
  };
}

function drawReviewSheet(ctx) {
  const { page, app, index, total, loanOverview, font, fontBold, colors } = ctx;
  let y = PAGE_H - 28;

  y = drawHeader(page, font, fontBold, colors, y, app, index, total);
  y = drawStatusCards(page, font, fontBold, colors, y, app.coverage);
  y = drawApplicationSnapshot(page, font, fontBold, colors, y, loanOverview);
  y = drawBorrowerDetails(page, font, fontBold, colors, y, app);
  y = drawHistoryPanel(page, font, fontBold, colors, y, {
    title: 'Residence history',
    rows: app.tables.residenceHistory.rows,
    emptyText: 'No residence history listed',
    maxRows: 3,
    formatter: residenceLine
  });
  y = drawHistoryPanel(page, font, fontBold, colors, y, {
    title: 'Employment history',
    rows: app.tables.employmentHistory.rows,
    emptyText: 'No employment history listed',
    maxRows: 4,
    formatter: employmentLine
  });
  y = drawFinancialPanels(page, font, fontBold, colors, y, app);
  y = drawLiabilities(page, font, fontBold, colors, y, app.tables.liabilities.rows);
  drawDeclarations(page, font, fontBold, colors, y, app.tables.declarations);
  drawFooter(page, font, fontBold, colors, index, total);
}

function drawHeader(page, font, fontBold, colors, y, app, index, total) {
  const dateText = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: colors.brand });
  drawText(page, fontBold, MARGIN, y, 'Application Summary', 22, colors.ink);
  drawText(page, font, MARGIN, y - 16, 'Borrower review sheet', 8.5, colors.muted);
  drawRightText(page, font, dateText, PAGE_W - MARGIN, y - 2, 8.2, colors.muted);
  drawRightText(page, fontBold, app.label || `Application ${index + 1} of ${total}`, PAGE_W - MARGIN, y - 17, 8.5, colors.brandDark);

  page.drawRectangle({ x: MARGIN, y: y - 48, width: CONTENT_W, height: 20, color: colors.brandPale });
  drawText(page, fontBold, MARGIN + 8, y - 42, app.borrowerName || 'Borrower', 10.4, colors.brandDark);
  drawText(page, font, MARGIN + 226, y - 41, 'Please review the information below for accuracy and completeness.', 7.6, colors.muted);

  return y - 60;
}

function drawStatusCards(page, font, fontBold, colors, y, coverage) {
  const items = [
    { label: 'Residence', value: coverage.residence || 'Not provided' },
    { label: 'Employment', value: coverage.employment || 'Not provided' },
    { label: 'Review items', value: reviewLabel(coverage.reviewItems) }
  ];
  const gap = 8;
  const boxW = (CONTENT_W - gap * 2) / 3;
  const boxH = 36;

  items.forEach((item, idx) => {
    const x = MARGIN + idx * (boxW + gap);
    const isReview = /needs review|missing|not provided/i.test(item.value);
    drawSoftBox(page, x, y - boxH, boxW, boxH, isReview ? colors.amberPale : colors.brandPale, isReview ? colors.amberLine : rgb(0.72, 0.88, 0.78));
    drawText(page, fontBold, x + 9, y - 13, item.label.toUpperCase(), 6.2, isReview ? colors.amber : colors.brandDark);
    drawFittedText(page, fontBold, item.value, x + 9, y - 26, boxW - 18, 8.0, colors.ink);
  });

  return y - boxH - 12;
}

function drawApplicationSnapshot(page, font, fontBold, colors, y, loanOverview) {
  const loan = loanMap(loanOverview);
  const boxH = 72;
  drawSectionBox(page, fontBold, colors, y, boxH, 'Application snapshot');

  drawLabeledValue(page, font, fontBold, colors, MARGIN + 12, y - 39, 328, 'Subject property', pick(loan, 'subject property'));
  drawLabeledValue(page, font, fontBold, colors, MARGIN + 360, y - 39, 168, 'Occupancy', pick(loan, 'occupancy'));

  const rowY = y - 62;
  drawLabeledValue(page, font, fontBold, colors, MARGIN + 12, rowY, 120, 'Loan purpose', pick(loan, 'loan purpose'));
  drawLabeledValue(page, font, fontBold, colors, MARGIN + 148, rowY, 120, 'Purchase price', pick(loan, 'purchase price'));
  drawLabeledValue(page, font, fontBold, colors, MARGIN + 284, rowY, 120, 'Property value', pick(loan, 'property value'));
  drawLabeledValue(page, font, fontBold, colors, MARGIN + 420, rowY, 108, 'Units', pick(loan, 'units'));

  return y - boxH - 10;
}

function drawBorrowerDetails(page, font, fontBold, colors, y, app) {
  const profile = rowMap(app.tables.borrowerInformation);
  const boxH = 66;
  drawSectionBox(page, fontBold, colors, y, boxH, 'Borrower details');

  drawLabeledValue(page, font, fontBold, colors, MARGIN + 12, y - 39, 124, 'Name', pick(profile, 'name') || app.borrowerName);
  drawLabeledValue(page, font, fontBold, colors, MARGIN + 148, y - 39, 68, 'Role', pick(profile, 'role'));
  drawLabeledValue(page, font, fontBold, colors, MARGIN + 228, y - 39, 74, 'DOB', pick(profile, 'dob'));
  drawLabeledValue(page, font, fontBold, colors, MARGIN + 314, y - 39, 74, 'SSN/ITIN', pick(profile, 'ssn/itin'));
  drawLabeledValue(page, font, fontBold, colors, MARGIN + 400, y - 39, 128, 'Citizenship', pick(profile, 'citizenship'));

  drawLabeledValue(page, font, fontBold, colors, MARGIN + 12, y - 62, 94, 'Marital', pick(profile, 'marital'));
  drawLabeledValue(page, font, fontBold, colors, MARGIN + 118, y - 62, 72, 'Dependents', pick(profile, 'dependents'));
  drawLabeledValue(page, font, fontBold, colors, MARGIN + 202, y - 62, 116, 'Phone', pick(profile, 'phones'));
  drawLabeledValue(page, font, fontBold, colors, MARGIN + 330, y - 62, 198, 'Email', pick(profile, 'email'));

  return y - boxH - 10;
}

function drawHistoryPanel(page, font, fontBold, colors, y, opts) {
  const rows = limitedRows(opts.rows, opts.maxRows);
  const boxH = opts.title === 'Residence history' ? 88 : 104;
  drawSectionBox(page, fontBold, colors, y, boxH, opts.title);

  if (!rows.length) {
    drawText(page, font, MARGIN + 12, y - 35, opts.emptyText, 8.3, colors.muted);
    return y - boxH - 10;
  }

  const rowH = opts.title === 'Residence history' ? 18 : 19;
  rows.forEach((row, idx) => {
    const line = opts.formatter(row);
    const rowTop = y - 25 - idx * rowH;
    if (idx > 0) {
      page.drawLine({ start: { x: MARGIN + 12, y: rowTop + 6 }, end: { x: PAGE_W - MARGIN - 12, y: rowTop + 6 }, thickness: 0.35, color: colors.line });
    }
    drawMiniTag(page, fontBold, colors, MARGIN + 12, rowTop - 8, 54, line.type || 'Listed');
    drawFittedText(page, fontBold, line.primary, MARGIN + 76, rowTop - 2, 326, 8.0, colors.ink);
    drawRightText(page, fontBold, line.duration, PAGE_W - MARGIN - 12, rowTop - 2, 8.0, colors.brandDark);
    if (line.secondary) drawFittedText(page, font, line.secondary, MARGIN + 76, rowTop - 13, 410, 7.0, colors.muted);
  });

  return y - boxH - 10;
}

function drawFinancialPanels(page, font, fontBold, colors, y, app) {
  const boxH = 70;
  const gap = 10;
  const boxW = (CONTENT_W - gap) / 2;

  drawSmallListBox(page, font, fontBold, colors, MARGIN, y, boxW, boxH, 'Financial assets', app.tables.assets.rows, 2, assetLine, 'No financial assets listed');
  drawSmallListBox(page, font, fontBold, colors, MARGIN + boxW + gap, y, boxW, boxH, 'Real estate owned', app.tables.reo.rows, 2, reoLine, 'No REO listed');

  return y - boxH - 10;
}

function drawSmallListBox(page, font, fontBold, colors, x, y, width, height, title, rows, maxRows, formatter, emptyText) {
  drawSoftBox(page, x, y - height, width, height, colors.white, colors.line);
  drawText(page, fontBold, x + 10, y - 14, title, 9.0, colors.brandDark);
  page.drawLine({ start: { x: x + 10, y: y - 20 }, end: { x: x + width - 10, y: y - 20 }, thickness: 0.45, color: colors.line });

  const shown = limitedRows(rows, maxRows);
  if (!shown.length) {
    drawText(page, font, x + 10, y - 40, emptyText, 7.7, colors.muted);
    return;
  }

  shown.forEach((row, idx) => {
    const line = formatter(row);
    const rowY = y - 38 - idx * 22;
    drawFittedText(page, fontBold, line.primary, x + 10, rowY, width - 20, 7.5, colors.ink);
    if (line.secondary) drawFittedText(page, font, line.secondary, x + 10, rowY - 10, width - 20, 6.8, colors.muted);
  });
}

function drawLiabilities(page, font, fontBold, colors, y, rows) {
  const boxH = 68;
  drawSectionBox(page, fontBold, colors, y, boxH, 'Liabilities');
  const shown = limitedRows(rows, 3);

  if (!shown.length) {
    drawText(page, font, MARGIN + 12, y - 36, 'No liabilities listed for this borrower', 8.2, colors.muted);
    return y - boxH - 10;
  }

  shown.forEach((row, idx) => {
    const line = liabilityLine(row);
    const rowY = y - 29 - idx * 15;
    if (idx > 0) {
      page.drawLine({ start: { x: MARGIN + 12, y: rowY + 6 }, end: { x: PAGE_W - MARGIN - 12, y: rowY + 6 }, thickness: 0.35, color: colors.line });
    }
    drawMiniTag(page, fontBold, colors, MARGIN + 12, rowY - 8, 62, line.type || 'Debt');
    drawFittedText(page, fontBold, line.creditor, MARGIN + 84, rowY - 1, 190, 7.8, colors.ink);
    drawFittedText(page, font, line.account, MARGIN + 282, rowY - 1, 64, 7.4, colors.muted);
    drawRightText(page, fontBold, line.payment, MARGIN + 426, rowY - 1, 7.8, colors.ink);
    drawRightText(page, font, line.balance, PAGE_W - MARGIN - 12, rowY - 1, 7.4, colors.muted);
  });

  return y - boxH - 10;
}

function drawDeclarations(page, font, fontBold, colors, y, table) {
  const boxH = 82;
  drawSectionBox(page, fontBold, colors, y, boxH, 'Declarations to confirm');
  const row = (table.rows || [])[0] || [];
  if (!row.some(cleanInline)) {
    drawText(page, font, MARGIN + 12, y - 36, 'No declaration data listed', 8.2, colors.muted);
    return;
  }

  const columns = table.columns || [];
  const chipW = (CONTENT_W - 24 - 16) / 3;
  columns.forEach((column, idx) => {
    const chipX = MARGIN + 12 + (idx % 3) * (chipW + 8);
    const chipY = y - 33 - Math.floor(idx / 3) * 13;
    const value = row[idx] || '';
    drawDeclarationChip(page, font, fontBold, colors, chipX, chipY, chipW, column, value);
  });
}

function drawFooter(page, font, fontBold, colors, index, total) {
  drawSideDisclosure(page, font, colors);
  page.drawLine({ start: { x: MARGIN, y: 22 }, end: { x: PAGE_W - MARGIN, y: 22 }, thickness: 0.45, color: colors.line });
  drawText(page, font, MARGIN, 11, 'Mountain State Financial Group LLC | msfginfo.com', 6.8, colors.muted);
  drawRightText(page, fontBold, `Application ${index + 1} of ${total}`, PAGE_W - MARGIN, 11, 6.8, colors.brandDark);
}

function drawSideDisclosure(page, font, colors) {
  const text = 'Application information will be verified and may be updated during the loan process.';
  page.drawText(text, {
    x: PAGE_W - 18,
    y: 110,
    size: 6.4,
    font,
    color: colors.muted,
    rotate: degrees(90)
  });
}

function drawSectionBox(page, fontBold, colors, y, height, title) {
  drawSoftBox(page, MARGIN, y - height, CONTENT_W, height, colors.white, colors.line);
  page.drawRectangle({ x: MARGIN, y: y - 20, width: CONTENT_W, height: 20, color: colors.faint });
  drawText(page, fontBold, MARGIN + 10, y - 14, title, 9.2, colors.brandDark);
}

function drawSoftBox(page, x, y, width, height, color, borderColor) {
  page.drawRectangle({ x, y, width, height, color, borderColor, borderWidth: 0.6 });
}

function drawLabeledValue(page, font, fontBold, colors, x, y, width, label, value) {
  const clean = cleanInline(value);
  const missing = !clean || /^not provided$/i.test(clean);
  drawText(page, fontBold, x, y + 9, label.toUpperCase(), 5.8, colors.muted);
  drawFittedText(page, font, missing ? 'Not provided' : clean, x, y - 1, width, 7.8, missing ? colors.amber : colors.ink);
}

function drawMiniTag(page, fontBold, colors, x, y, width, label) {
  const clean = cleanInline(label) || 'Listed';
  page.drawRectangle({ x, y, width, height: 13, color: colors.brandPale, borderColor: rgb(0.72, 0.88, 0.78), borderWidth: 0.4 });
  drawCenteredText(page, fontBold, clean, x + width / 2, y + 3.5, width - 6, 6.2, colors.brandDark);
}

function drawDeclarationChip(page, font, fontBold, colors, x, y, width, label, value) {
  const cleanLabel = cleanInline(label);
  const cleanValue = cleanInline(value) || 'Not provided';
  const review = declarationNeedsReview(cleanLabel, cleanValue);
  page.drawRectangle({
    x,
    y: y - 6,
    width,
    height: 12,
    color: review ? colors.amberPale : colors.faintAlt,
    borderColor: review ? colors.amberLine : colors.line,
    borderWidth: 0.4
  });
  drawFittedText(page, font, cleanLabel + ':', x + 4, y - 1, width - 26, 5.3, colors.muted);
  drawRightText(page, fontBold, cleanValue, x + width - 4, y - 1, 5.9, review ? colors.amber : colors.ink);
}

function declarationNeedsReview(label, value) {
  const cleanValue = cleanInline(value).toLowerCase();
  if (!cleanValue || cleanValue === 'not provided') return true;
  if (cleanInline(label).toLowerCase() === 'occupy') return cleanValue !== 'yes';
  return cleanValue !== 'no';
}

function residenceLine(row) {
  const type = row[0] || 'Listed';
  const address = row[1] || row[0] || '';
  const duration = row[2] || '';
  const dates = dateRange(row[3], row[4]);
  return { type, primary: address, secondary: dates, duration };
}

function employmentLine(row) {
  const type = row[0] || 'Listed';
  const employer = row[1] || row[0] || '';
  const title = row[2] || '';
  const duration = row[3] || '';
  const dates = dateRange(row[4], row[5]);
  const income = row[6] ? `${row[6]}/mo` : '';
  return {
    type,
    primary: [employer, title].filter(Boolean).join(' - '),
    secondary: [dates, income].filter(Boolean).join(' | '),
    duration
  };
}

function assetLine(row) {
  return {
    primary: [row[0], row[1]].filter(Boolean).join(' - '),
    secondary: [row[2], row[3], row[4]].filter(Boolean).join(' | ')
  };
}

function reoLine(row) {
  return {
    primary: row[0] || 'Property listed',
    secondary: [row[1], row[2], row[3] ? `Lien ${row[3]}` : '', row[6]].filter(Boolean).join(' | ')
  };
}

function liabilityLine(row) {
  return {
    type: row[0],
    creditor: row[1] || 'Creditor not listed',
    account: row[2],
    balance: row[3] ? `Bal ${row[3]}` : '',
    payment: row[4] ? `Pmt ${row[4]}` : ''
  };
}

function limitedRows(rows, maxRows) {
  const cleaned = (Array.isArray(rows) ? rows : []).filter((row) => row.some((cell) => cleanInline(cell)));
  if (cleaned.length <= maxRows) return cleaned;
  const shown = cleaned.slice(0, Math.max(maxRows - 1, 0));
  const more = Array(cleaned[0] ? cleaned[0].length : 2).fill('');
  more[0] = 'Additional';
  more[1] = `${cleaned.length - shown.length} more listed in MISMO`;
  shown.push(more);
  return shown;
}

function dateRange(start, end) {
  const left = cleanInline(start);
  const right = cleanInline(end);
  if (!left && !right) return '';
  if (left && right) return `${left} to ${right}`;
  if (left) return `Since ${left}`;
  return `Ended ${right}`;
}

function loanMap(table) {
  const out = {};
  (table.rows || []).forEach((row) => {
    for (let i = 0; i < row.length; i += 2) {
      const key = cleanInline(row[i]).toLowerCase();
      if (key) out[key] = row[i + 1] || '';
    }
  });
  return out;
}

function rowMap(table) {
  const out = {};
  const columns = table.columns || [];
  const row = (table.rows || [])[0] || [];
  columns.forEach((column, idx) => {
    out[cleanInline(column).toLowerCase()] = row[idx] || '';
  });
  return out;
}

function pick(map, label) {
  return map[cleanInline(label).toLowerCase()] || '';
}

function reviewLabel(value) {
  const clean = cleanInline(value);
  if (!clean || clean.toLowerCase() === 'none') return 'None';
  return clean.split(/\n/).filter(Boolean).length + ' item(s)';
}

function drawText(page, font, x, y, text, size, color) {
  page.drawText(cleanInline(text), { x, y, size, font, color });
}

function drawRightText(page, font, text, rightX, y, size, color) {
  const clean = cleanInline(text);
  page.drawText(clean, { x: rightX - font.widthOfTextAtSize(clean, size), y, size, font, color });
}

function drawCenteredText(page, font, text, centerX, y, maxWidth, size, color) {
  const clean = truncateToWidth(text, maxWidth, font, size);
  page.drawText(clean, { x: centerX - font.widthOfTextAtSize(clean, size) / 2, y, size, font, color });
}

function drawFittedText(page, font, text, x, y, maxWidth, size, color) {
  const clean = cleanText(text, { preserveNewlines: true }).replace(/\n/g, ' ');
  page.drawText(truncateToWidth(clean, maxWidth, font, size), { x, y, size, font, color });
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
