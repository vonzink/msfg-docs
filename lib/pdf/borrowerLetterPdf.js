'use strict';

/**
 * Borrower-letter PDF renderer (redesign).
 *
 * Implements the professional, single-design letter layout from the
 * redesign spec for the four BORROWER-AUTHORED letters:
 *   Credit Inquiry, Address LOE, Gift Letter, Letter of Explanation.
 *
 * These letters are written by the borrower ("To Whom It May Concern"),
 * so they carry NO lender letterhead and NO footer — just a document
 * masthead, an identification field grid, the letter body, and a
 * signature block. (Pre-Approval is lender-authored and intentionally
 * stays on the older lib/pdf/letterPdf.js renderer with its letterhead.)
 *
 * pdf-lib draws at explicit coordinates, so this module owns all the
 * layout math. Fonts are the built-in StandardFonts: Times (serif body
 * and titles) and Helvetica (uppercase labels) — Source Serif 4 / Archivo
 * substitutes per the spec's sanctioned fallback.
 *
 *   generateBorrowerLetterPdfBuffer({
 *     eyebrow,            // gold category label, e.g. 'Borrower Correspondence'
 *     title,              // serif masthead title
 *     dateLine,           // right-aligned date string
 *     fields,             // [{ label, value, full? }] identification grid
 *     body,               // ordered blocks (see drawBlock)
 *     certify,            // italic certify sentence above signatures
 *     signatures,         // [{ caption, name? }]  (Gift passes two rows)
 *   })
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { wrapTextToLines } = require('./wrapText');

/* ---- Evergreen palette (spec §3, Evergreen alternate) ---- */
const C = {
  paper: rgb(0.9843, 0.9804, 0.9686), // #fbfaf7
  ink: rgb(0.1098, 0.1451, 0.1882),   // #1c2530
  muted: rgb(0.3647, 0.4000, 0.4471), // #5d6672
  faint: rgb(0.5451, 0.5725, 0.6078), // #8b929b
  brand: rgb(0.1137, 0.3020, 0.2431), // #1d4d3e evergreen
  accent: rgb(0.6275, 0.4784, 0.2353),// #a07a3c gold
  line: rgb(0.8667, 0.8510, 0.8157),  // #ddd9d0
  fieldBg: rgb(0.9608, 0.9529, 0.9333),// #f5f3ee
  white: rgb(1, 1, 1),
};

/* Mockup measurements are in px (96dpi); scale to PDF points. Margins
   come from the spec in inches and are applied as absolute points. */
const PX = (px) => px * 0.8;

const SIZE = {
  title: 21,
  eyebrow: 8.5,
  body: 10.5,
  value: 11,
  label: 6.8,
  date: 9,
  tableHead: 6.8,
  tableBody: 9.8,
  sigCaption: 6.8,
  certify: 9.6,
  section: 7.5,
};
const LEAD = {
  body: SIZE.body * 1.55,
  table: SIZE.tableBody * 1.32,
  certify: SIZE.certify * 1.45,
};

async function generateBorrowerLetterPdfBuffer(letter) {
  const l = letter || {};
  const pdfDoc = await PDFDocument.create();
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const W = 612, H = 792;
  const M = { top: 0.95 * 72, side: 0.9 * 72, bottom: 0.78 * 72 };
  const left = M.side;
  const right = W - M.side;
  const contentW = right - left;

  let page;
  let y;

  function startPage() {
    page = pdfDoc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.paper });
    y = H - M.top;
  }
  startPage();

  /** Normalize common typographic chars to WinAnsi-safe equivalents, then
   *  strip anything still outside the encoding so StandardFonts embedding
   *  never throws. Keeps real user text (curly quotes, dashes) clean. */
  function sanitize(s) {
    return String(s == null ? '' : s)
      .replace(/[‘’‚′]/g, "'")
      .replace(/[“”„″]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/[•·]/g, '*')
      .replace(/ /g, ' ')
      .replace(/[-­]|[Ā-￿]|[\uD800-\uDFFF][\uDC00-\uDFFF]/g, ' ');
  }

  function widthOf(text, font, size) {
    return font.widthOfTextAtSize(sanitize(text), size);
  }

  function drawText(x, yy, text, opts) {
    opts = opts || {};
    page.drawText(sanitize(text), {
      x, y: yy,
      size: opts.size || SIZE.body,
      font: opts.font || serif,
      color: opts.color || C.ink,
    });
  }

  /** Draw text with per-character tracking (letter-spacing). Returns end x. */
  function drawTracked(x, yy, text, opts) {
    opts = opts || {};
    const size = opts.size || SIZE.label;
    const font = opts.font || sansBold;
    const color = opts.color || C.faint;
    const tracking = opts.tracking || 0;
    const str = sanitize(text);
    let cx = x;
    for (const ch of str) {
      page.drawText(ch, { x: cx, y: yy, size, font, color });
      cx += font.widthOfTextAtSize(ch, size) + tracking;
    }
    return cx - tracking;
  }

  function needRoom(h) {
    if (y - h < M.bottom) startPage();
  }

  /* ---- Masthead (spec §4) ---- */
  function drawMasthead() {
    if (l.eyebrow) {
      y -= SIZE.eyebrow;
      drawTracked(left, y, l.eyebrow.toUpperCase(), {
        size: SIZE.eyebrow, font: sans, color: C.accent, tracking: SIZE.eyebrow * 0.12,
      });
      y -= PX(10);
    }
    // Title (left) + date (right) share the title baseline.
    y -= SIZE.title;
    drawText(left, y, l.title || '', { size: SIZE.title, font: serifBold, color: C.ink });
    if (l.dateLine) {
      const w = widthOf(l.dateLine, sans, SIZE.date);
      drawText(right - w, y + (SIZE.title - SIZE.date) * 0.18, l.dateLine, {
        size: SIZE.date, font: sans, color: C.muted,
      });
    }
    // Navy rule with overlapping gold segment.
    y -= PX(15);
    page.drawRectangle({ x: left, y: y, width: contentW, height: 1.5, color: C.brand });
    page.drawRectangle({ x: left, y: y, width: PX(84), height: 1.5, color: C.accent });
    y -= PX(26);
  }

  /* ---- Identification field grid (spec §5) ---- */
  function drawFieldGrid(fields) {
    const list = (fields || []).filter(Boolean);
    if (!list.length) return;
    // Arrange into rows: full-width fields own a row; others pair up.
    const rows = [];
    for (let i = 0; i < list.length;) {
      if (list[i].full) { rows.push([list[i]]); i += 1; }
      else if (i + 1 < list.length && !list[i + 1].full) { rows.push([list[i], list[i + 1]]); i += 2; }
      else { rows.push([list[i]]); i += 1; }
    }
    const rowH = PX(44);
    const padX = PX(12);
    rows.forEach((row) => {
      needRoom(rowH);
      const cols = row.length;
      const cellW = contentW / cols;
      row.forEach((f, ci) => {
        const cx = left + ci * cellW;
        page.drawRectangle({
          x: cx, y: y - rowH, width: cellW, height: rowH,
          color: C.paper, borderColor: C.line, borderWidth: 0.75,
        });
        drawTracked(cx + padX, y - PX(15), (f.label || '').toUpperCase(), {
          size: SIZE.label, font: sansBold, color: C.faint, tracking: SIZE.label * 0.13,
        });
        const hasVal = f.value != null && String(f.value).trim() !== '';
        drawText(cx + padX, y - PX(34), hasVal ? String(f.value) : '—', {
          size: SIZE.value, font: serif, color: hasVal ? C.brand : C.faint,
        });
      });
      y -= rowH;
    });
    y -= PX(22);
  }

  /* ---- Plain body paragraph ---- */
  function drawParagraph(text, opts) {
    opts = opts || {};
    const size = opts.size || SIZE.body;
    const font = opts.font || serif;
    const color = opts.color || C.ink;
    const lead = opts.lead || LEAD.body;
    const lines = wrapTextToLines(sanitize(text), contentW, font, size);
    lines.forEach((ln) => {
      needRoom(lead);
      y -= size;
      drawText(left, y, ln, { size, font, color });
      y -= (lead - size);
    });
    y -= PX(opts.gapAfter == null ? 9 : opts.gapAfter);
  }

  /* ---- Section heading with underline (Donor Info / Explanation) ---- */
  function drawSectionHeading(text) {
    needRoom(PX(34));
    y -= SIZE.section;
    drawTracked(left, y, text.toUpperCase(), {
      size: SIZE.section, font: sansBold, color: C.brand, tracking: SIZE.section * 0.13,
    });
    y -= PX(9);
    page.drawLine({ start: { x: left, y: y }, end: { x: right, y: y }, thickness: 0.75, color: C.line });
    y -= PX(14);
  }

  /* ---- Multi-column data table (spec §7a) ---- */
  function drawDataTable(columns, rows, minRows) {
    const widths = columns.map((c) => c.w * contentW);
    const xOf = (i) => left + widths.slice(0, i).reduce((a, b) => a + b, 0);

    // Header
    needRoom(PX(26));
    y -= SIZE.tableHead;
    columns.forEach((c, i) => {
      drawTracked(xOf(i) + PX(3), y, c.header.toUpperCase(), {
        size: SIZE.tableHead, font: sansBold, color: C.brand, tracking: SIZE.tableHead * 0.08,
      });
    });
    y -= PX(7);
    page.drawRectangle({ x: left, y: y, width: contentW, height: 1.5, color: C.brand });
    y -= PX(2);

    // Rows (one per record, else `minRows` blank numbered rows)
    let data = Array.isArray(rows) ? rows.slice() : [];
    if (!data.length && minRows) {
      data = Array.from({ length: minRows }, () => ({}));
    }
    data.forEach((r, ri) => {
      const cellLines = columns.map((c, i) => {
        if (c.key === 'no') return [String(ri + 1)];
        return wrapTextToLines(sanitize(r[c.key] || ''), widths[i] - PX(8), serif, SIZE.tableBody);
      });
      const maxLines = Math.max(1, ...cellLines.map((a) => a.length));
      const rowH = PX(7) + maxLines * LEAD.table + PX(6);
      needRoom(rowH);
      if (ri % 2 === 1) {
        page.drawRectangle({ x: left, y: y - rowH, width: contentW, height: rowH, color: C.fieldBg });
      }
      columns.forEach((c, i) => {
        let ty = y - PX(7) - SIZE.tableBody;
        const isNum = c.key === 'no';
        cellLines[i].forEach((ln) => {
          drawText(xOf(i) + PX(4), ty, ln, {
            size: SIZE.tableBody,
            font: serif,
            color: isNum ? C.muted : (c.brand ? C.brand : C.ink),
          });
          ty -= LEAD.table;
        });
      });
      page.drawLine({
        start: { x: left, y: y - rowH }, end: { x: right, y: y - rowH },
        thickness: 0.75, color: C.line,
      });
      y -= rowH;
    });
    y -= PX(12);
  }

  /* ---- Word/run tokenizer for inline-styled paragraphs ----
     value runs stay one token so the fill-in underline is continuous and
     empty values still render a visible blank; plain runs split on words. */
  function tokenizeRuns(runs) {
    const toks = [];
    (runs || []).forEach((run) => {
      if (run.value) {
        const raw = String(run.text == null ? '' : run.text);
        toks.push({ text: raw.trim() === '' ? '          ' : raw, value: true, space: false });
      } else {
        String(run.text).split(/(\s+)/).forEach((p) => {
          if (p === '') return;
          toks.push({ text: p, value: false, space: /^\s+$/.test(p) });
        });
      }
    });
    return toks;
  }

  function layoutRuns(runs, maxW, size) {
    const toks = tokenizeRuns(runs);
    const lines = [];
    let line = [];
    let w = 0;
    toks.forEach((t) => {
      const tw = widthOf(t.text, serif, size);
      if (!t.space && w + tw > maxW && line.length) { lines.push(line); line = []; w = 0; }
      if (t.space && line.length === 0) return;
      line.push(t); w += tw;
    });
    if (line.length) lines.push(line);
    return lines.length ? lines : [[]];
  }

  /** Draw pre-laid-out run lines starting at the current y. value tokens
   *  render in evergreen with an underline (fill-in blanks). */
  function drawRunLines(x, lines, size, lead) {
    lines.forEach((line) => {
      needRoom(lead);
      y -= size;
      let cx = x;
      line.forEach((t) => {
        const tw = widthOf(t.text, serif, size);
        if (!t.space) {
          drawText(cx, y, t.text, { size, font: serif, color: t.value ? C.brand : C.ink });
          if (t.value) {
            page.drawLine({
              start: { x: cx, y: y - PX(2) }, end: { x: cx + tw, y: y - PX(2) },
              thickness: 0.6, color: C.brand,
            });
          }
        }
        cx += tw;
      });
      y -= (lead - size);
    });
  }

  /* ---- Numbered certification list with circular badges (spec §7b) ---- */
  function drawNumberedList(intro, items) {
    if (intro && intro.runs) {
      const lines = layoutRuns(intro.runs, contentW, SIZE.body);
      drawRunLines(left, lines, SIZE.body, LEAD.body);
      y -= PX(8);
    } else if (typeof intro === 'string' && intro) {
      drawParagraph(intro, { gapAfter: 8 });
    }
    const badgeR = PX(10); // ~20px badge
    const textX = left + PX(30);
    const maxW = right - textX;
    (items || []).forEach((runs, i) => {
      const lines = layoutRuns(runs, maxW, SIZE.body);
      const blockH = Math.max(badgeR * 2 + PX(2), lines.length * LEAD.body);
      needRoom(blockH + PX(6));
      const firstBaseline = y - SIZE.body;
      const badgeCy = firstBaseline + SIZE.body * 0.30;
      page.drawEllipse({ x: left + badgeR, y: badgeCy, xScale: badgeR, yScale: badgeR, color: C.brand });
      const num = String(i + 1);
      const nw = widthOf(num, sansBold, SIZE.body - 1);
      drawText(left + badgeR - nw / 2, badgeCy - (SIZE.body - 1) * 0.34, num, {
        size: SIZE.body - 1, font: sansBold, color: C.white,
      });
      drawRunLines(textX, lines, SIZE.body, LEAD.body);
      y -= PX(6);
    });
    y -= PX(8);
  }

  /* ---- Donor information grid of labeled underlines (spec §7c) ---- */
  function drawDonorGrid(cells) {
    const list = (cells || []).filter(Boolean);
    const rows = [];
    for (let i = 0; i < list.length;) {
      if (list[i].full) { rows.push([list[i]]); i += 1; }
      else if (i + 1 < list.length && !list[i + 1].full) { rows.push([list[i], list[i + 1]]); i += 2; }
      else { rows.push([list[i]]); i += 1; }
    }
    const rowH = PX(40);
    rows.forEach((row) => {
      needRoom(rowH);
      const cols = row.length;
      const cellW = contentW / cols;
      row.forEach((c, ci) => {
        const cx = left + ci * cellW;
        const lineRight = cx + cellW - (cols > 1 && ci === 0 ? PX(18) : 0);
        drawTracked(cx, y - SIZE.label, (c.label || '').toUpperCase(), {
          size: SIZE.label, font: sansBold, color: C.faint, tracking: SIZE.label * 0.13,
        });
        const hasVal = c.value != null && String(c.value).trim() !== '';
        if (hasVal) {
          drawText(cx, y - PX(28), String(c.value), { size: SIZE.value, font: serif, color: C.brand });
        }
        const lineY = y - PX(31);
        page.drawLine({ start: { x: cx, y: lineY }, end: { x: lineRight, y: lineY }, thickness: 0.75, color: C.faint });
      });
      y -= rowH;
    });
    y -= PX(10);
  }

  /* ---- Ruled explanation box (spec §7d) ---- */
  function drawExplanationBox(text) {
    const maxW = contentW - PX(20);
    const hasText = text != null && String(text).trim() !== '';
    const lines = hasText ? wrapTextToLines(sanitize(text), maxW, serif, SIZE.body) : [];
    const minH = PX(150);
    const boxH = Math.max(minH, lines.length * LEAD.body + PX(26));
    needRoom(boxH + PX(8));
    page.drawRectangle({
      x: left, y: y - boxH, width: contentW, height: boxH,
      color: C.fieldBg, borderColor: C.line, borderWidth: 0.75,
    });
    if (hasText) {
      let ty = y - PX(16);
      lines.forEach((ln) => {
        ty -= SIZE.body;
        drawText(left + PX(10), ty, ln, { size: SIZE.body, font: serif, color: C.ink });
        ty -= (LEAD.body - SIZE.body);
      });
    } else {
      drawText(left + PX(10), y - PX(16), "Borrower's written explanation", {
        size: SIZE.label + 0.5, font: sans, color: C.faint,
      });
      let ly = y - PX(40);
      while (ly > y - boxH + PX(14)) {
        page.drawLine({ start: { x: left + PX(10), y: ly }, end: { x: right - PX(10), y: ly }, thickness: 0.5, color: C.line });
        ly -= PX(24);
      }
    }
    y -= boxH + PX(14);
  }

  function drawBlock(b) {
    if (!b) return;
    switch (b.type) {
      case 'paragraph': return drawParagraph(b.text, b);
      case 'dataTable': return drawDataTable(b.columns, b.rows, b.minRows);
      case 'numberedList': return drawNumberedList(b.intro, b.items);
      case 'donorGrid': { drawSectionHeading(b.heading || 'Donor Information'); return drawDonorGrid(b.cells); }
      case 'explanationBox': { drawSectionHeading(b.heading || 'Explanation'); return drawExplanationBox(b.text); }
      default: return undefined;
    }
  }

  /* ---- Certify line + signature block (spec §8) ---- */
  function drawCertifyAndSignatures(certify, signatures) {
    const sigs = (signatures || []).filter(Boolean);
    y -= PX(8);
    needRoom(PX(40) + sigs.length * PX(46));
    page.drawLine({ start: { x: left, y: y }, end: { x: right, y: y }, thickness: 0.75, color: C.line });
    y -= PX(14);
    if (certify) {
      drawParagraph(certify, { size: SIZE.certify, font: serifItalic, color: C.muted, lead: LEAD.certify, gapAfter: 22 });
    }
    const dateW = PX(150);
    const gap = PX(20);
    const sigW = contentW - dateW - gap;
    sigs.forEach((sig) => {
      const rowH = PX(46);
      needRoom(rowH);
      const lineY = y - PX(26);
      if (sig.name) {
        drawText(left + PX(2), lineY + PX(3), String(sig.name), { size: SIZE.value, font: serif, color: C.brand });
      }
      page.drawLine({ start: { x: left, y: lineY }, end: { x: left + sigW, y: lineY }, thickness: 1.5, color: C.ink });
      drawTracked(left, lineY - PX(11), (sig.caption || 'Signature').toUpperCase(), {
        size: SIZE.sigCaption, font: sansBold, color: C.faint, tracking: SIZE.sigCaption * 0.13,
      });
      const dx = left + sigW + gap;
      page.drawLine({ start: { x: dx, y: lineY }, end: { x: dx + dateW, y: lineY }, thickness: 1.5, color: C.ink });
      drawTracked(dx, lineY - PX(11), 'DATE', {
        size: SIZE.sigCaption, font: sansBold, color: C.faint, tracking: SIZE.sigCaption * 0.13,
      });
      y -= rowH;
    });
  }

  /* ---- Compose ---- */
  drawMasthead();
  drawFieldGrid(l.fields);
  (l.body || []).forEach(drawBlock);
  drawCertifyAndSignatures(l.certify, l.signatures);

  return pdfDoc.save();
}

module.exports = { generateBorrowerLetterPdfBuffer };
