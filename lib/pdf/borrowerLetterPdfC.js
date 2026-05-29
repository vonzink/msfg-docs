'use strict';

/**
 * Borrower-letter PDF renderer — STYLE C ("Plain").
 *
 * The plainest treatment: a traditional business letter. Serif
 * throughout, strictly monochrome, no accent color and no boxes.
 * Reads top-to-bottom: date, title, reference lines ("Label: value"
 * instead of a boxed grid), the letter body, a certification line,
 * a "Sincerely," close, and signature lines.
 *
 * Source Serif 4 / Georgia in the spec are substituted with built-in
 * Times — no embedded font dependencies. Same structured `letter`
 * payload as Styles A and B.
 *
 *   generateBorrowerLetterPdfBufferC({
 *     eyebrow, title, dateLine, fields:[{label,value,full?}],
 *     body:[blocks], certify, signatures:[{caption,name?}]
 *   })
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { wrapTextToLines } = require('./wrapText');

/* ---- Plain monochrome palette (spec §C) ---- */
const C = {
  paper: rgb(1, 1, 1),
  ink: rgb(0.1137, 0.1137, 0.1216),     // #1d1d1f
  soft: rgb(0.2902, 0.2902, 0.3098),    // #4a4a4f
  faint: rgb(0.5294, 0.5294, 0.5529),   // #87878d
  hairline: rgb(0.8784, 0.8784, 0.8863),// #e0e0e2
};

const PX = (px) => px * 0.8;

const SIZE = {
  date: 10.5,
  title: 16,
  refLabel: 10,
  ref: 10.5,
  body: 10.5,
  section: 8,
  tableHead: 8.5,
  tableBody: 10,
  certify: 10,
  close: 10.5,
  sigName: 10.5,
  sigCaption: 7.5,
};
const LEAD = {
  body: SIZE.body * 1.62,
  ref: SIZE.ref * 1.5,
  table: SIZE.tableBody * 1.4,
};

async function generateBorrowerLetterPdfBufferC(letter) {
  const l = letter || {};
  const pdfDoc = await PDFDocument.create();
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  const W = 612, H = 792;
  const M = { top: 0.9 * 72, side: 0.95 * 72, bottom: 0.8 * 72 };
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

  function sanitize(s) {
    return String(s == null ? '' : s)
      .replace(/[‘’‚′]/g, "'")
      .replace(/[“”„″]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/[•·]/g, '*')
      .replace(/ /g, ' ')
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

  function drawRight(xRight, yy, text, opts) {
    opts = opts || {};
    const w = widthOf(text, opts.font || serif, opts.size || SIZE.body);
    drawText(xRight - w, yy, text, opts);
  }

  function drawTracked(x, yy, text, opts) {
    opts = opts || {};
    const size = opts.size || SIZE.section;
    const font = opts.font || serifBold;
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

  /* ---- Date + title ---- */
  function drawMasthead() {
    if (l.dateLine) {
      y -= SIZE.date;
      drawText(left, y, l.dateLine, { size: SIZE.date, font: serif, color: C.soft });
      y -= PX(20);
    }
    y -= SIZE.title;
    drawText(left, y, l.title || '', { size: SIZE.title, font: serifBold, color: C.ink });
    y -= PX(18);
  }

  /* ---- Reference lines: "Label: value" (replaces the boxed grid) ---- */
  function drawReferenceLines(fields) {
    const list = (fields || []).filter(Boolean);
    if (!list.length) return;
    list.forEach((f) => {
      const label = (f.label || '') + ':  ';
      const labelW = widthOf(label, serifBold, SIZE.ref);
      const valX = left + labelW;
      const hasVal = f.value != null && String(f.value).trim() !== '';
      const valStr = hasVal ? String(f.value) : '—';
      const valLines = wrapTextToLines(sanitize(valStr), right - valX, serif, SIZE.ref);
      needRoom(LEAD.ref * valLines.length);
      valLines.forEach((ln, i) => {
        y -= SIZE.ref;
        if (i === 0) drawText(left, y, label, { size: SIZE.ref, font: serifBold, color: C.ink });
        drawText(valX, y, ln, { size: SIZE.ref, font: serif, color: hasVal ? C.ink : C.faint });
        y -= (LEAD.ref - SIZE.ref);
      });
    });
    y -= PX(8);
    page.drawLine({ start: { x: left, y: y }, end: { x: right, y: y }, thickness: 0.75, color: C.hairline });
    y -= PX(16);
  }

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
    y -= PX(opts.gapAfter == null ? 11 : opts.gapAfter);
  }

  function drawSectionHeading(text) {
    needRoom(PX(28));
    y -= SIZE.section;
    drawTracked(left, y, text.toUpperCase(), {
      size: SIZE.section, font: serifBold, color: C.soft, tracking: SIZE.section * 0.12,
    });
    y -= PX(14);
  }

  /* ---- Plain table: header rule + row hairlines, numeric right ---- */
  function drawDataTable(columns, rows, minRows) {
    const widths = columns.map((c) => c.w * contentW);
    const xOf = (i) => left + widths.slice(0, i).reduce((a, b) => a + b, 0);
    const isNumCol = (c) => c.key === 'no' || c.numeric;

    needRoom(PX(26));
    y -= SIZE.tableHead;
    columns.forEach((c, i) => {
      if (isNumCol(c)) {
        drawRight(xOf(i) + widths[i] - PX(4), y, c.header, { size: SIZE.tableHead, font: serifBold, color: C.soft });
      } else {
        drawText(xOf(i) + PX(2), y, c.header, { size: SIZE.tableHead, font: serifBold, color: C.soft });
      }
    });
    y -= PX(6);
    page.drawLine({ start: { x: left, y: y }, end: { x: right, y: y }, thickness: 0.75, color: C.ink });
    y -= PX(2);

    let data = Array.isArray(rows) ? rows.slice() : [];
    if (!data.length && minRows) data = Array.from({ length: minRows }, () => ({}));

    data.forEach((r, ri) => {
      const cellLines = columns.map((c, i) => {
        if (c.key === 'no') return [String(ri + 1) + '.'];
        return wrapTextToLines(sanitize(r[c.key] || ''), widths[i] - PX(8), serif, SIZE.tableBody);
      });
      const maxLines = Math.max(1, ...cellLines.map((a) => a.length));
      const rowH = PX(7) + maxLines * LEAD.table + PX(5);
      needRoom(rowH);
      columns.forEach((c, i) => {
        const numeric = isNumCol(c);
        let ty = y - PX(7) - SIZE.tableBody;
        cellLines[i].forEach((ln) => {
          if (numeric) {
            drawRight(xOf(i) + widths[i] - PX(4), ty, ln, { size: SIZE.tableBody, font: serif, color: c.key === 'no' ? C.faint : C.ink });
          } else {
            drawText(xOf(i) + PX(2), ty, ln, { size: SIZE.tableBody, font: serif, color: C.ink });
          }
          ty -= LEAD.table;
        });
      });
      page.drawLine({ start: { x: left, y: y - rowH }, end: { x: right, y: y - rowH }, thickness: 0.5, color: C.hairline });
      y -= rowH;
    });
    y -= PX(12);
  }

  /* ---- Inline run layout (value runs underlined, monochrome) ---- */
  function tokenize(runs) {
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
    const toks = tokenize(runs);
    const lines = [];
    let line = [], w = 0;
    toks.forEach((t) => {
      const tw = widthOf(t.text, serif, size);
      if (!t.space && w + tw > maxW && line.length) { lines.push(line); line = []; w = 0; }
      if (t.space && line.length === 0) return;
      line.push(t); w += tw;
    });
    if (line.length) lines.push(line);
    return lines.length ? lines : [[]];
  }

  function drawRunLines(x, lines, size, lead) {
    lines.forEach((line) => {
      needRoom(lead);
      y -= size;
      let cx = x;
      line.forEach((t) => {
        const tw = widthOf(t.text, serif, size);
        if (!t.space) {
          drawText(cx, y, t.text, { size, font: t.value ? serifBold : serif, color: C.ink });
          if (t.value) {
            page.drawLine({ start: { x: cx, y: y - PX(2) }, end: { x: cx + tw, y: y - PX(2) }, thickness: 0.6, color: C.soft });
          }
        }
        cx += tw;
      });
      y -= (lead - size);
    });
  }

  /* ---- Native-looking numbered list ---- */
  function drawNumberedList(intro, items) {
    if (intro && intro.runs) {
      drawRunLines(left, layoutRuns(intro.runs, contentW, SIZE.body), SIZE.body, LEAD.body);
      y -= PX(8);
    } else if (typeof intro === 'string' && intro) {
      drawParagraph(intro, { gapAfter: 8 });
    }
    const textX = left + PX(22);
    const maxW = right - textX;
    (items || []).forEach((runs, i) => {
      const lines = layoutRuns(runs, maxW, SIZE.body);
      needRoom(Math.max(LEAD.body, lines.length * LEAD.body) + PX(4));
      const firstBaseline = y - SIZE.body;
      drawText(left, firstBaseline, String(i + 1) + '.', { size: SIZE.body, font: serif, color: C.ink });
      drawRunLines(textX, lines, SIZE.body, LEAD.body);
      y -= PX(4);
    });
    y -= PX(8);
  }

  /* ---- Donor info as definition lines ---- */
  function drawDonorGrid(cells) {
    const list = (cells || []).filter(Boolean);
    list.forEach((c) => {
      const label = (c.label || '') + ':  ';
      const labelW = widthOf(label, serifBold, SIZE.ref);
      const valX = left + labelW;
      const hasVal = c.value != null && String(c.value).trim() !== '';
      const valStr = hasVal ? String(c.value) : '—';
      const valLines = wrapTextToLines(sanitize(valStr), right - valX, serif, SIZE.ref);
      needRoom(LEAD.ref * valLines.length);
      valLines.forEach((ln, i) => {
        y -= SIZE.ref;
        if (i === 0) drawText(left, y, label, { size: SIZE.ref, font: serifBold, color: C.ink });
        drawText(valX, y, ln, { size: SIZE.ref, font: serif, color: hasVal ? C.ink : C.faint });
        y -= (LEAD.ref - SIZE.ref);
      });
    });
    y -= PX(10);
  }

  /* ---- Write-in area ---- */
  function drawExplanationBox(text) {
    const hasText = text != null && String(text).trim() !== '';
    if (hasText) {
      drawParagraph(text, { gapAfter: 12 });
      return;
    }
    let ly = y - PX(8);
    for (let i = 0; i < 6; i++) {
      needRoom(PX(22));
      page.drawLine({ start: { x: left, y: ly }, end: { x: right, y: ly }, thickness: 0.5, color: C.hairline });
      ly -= PX(22);
      y -= PX(22);
    }
    y -= PX(10);
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

  /* ---- Certify + "Sincerely," + signatures ---- */
  function drawCertifyAndSignatures(certify, signatures) {
    const sigs = (signatures || []).filter(Boolean);
    if (certify) {
      y -= PX(4);
      drawParagraph(certify, { size: SIZE.certify, font: serifItalic, color: C.soft, lead: SIZE.certify * 1.5, gapAfter: 18 });
    }
    needRoom(PX(30) + sigs.length * PX(50));
    y -= SIZE.close;
    drawText(left, y, 'Sincerely,', { size: SIZE.close, font: serif, color: C.ink });
    y -= PX(30);

    const dateW = PX(140);
    const gap = PX(24);
    const sigW = contentW - dateW - gap;
    sigs.forEach((sig) => {
      const rowH = PX(50);
      needRoom(rowH);
      const lineY = y - PX(24);
      if (sig.name) {
        drawText(left + PX(2), lineY + PX(4), String(sig.name), { size: SIZE.sigName, font: serif, color: C.ink });
      }
      page.drawLine({ start: { x: left, y: lineY }, end: { x: left + sigW, y: lineY }, thickness: 1, color: C.ink });
      drawTracked(left, lineY - PX(11), (sig.caption || 'Signature').toUpperCase(), {
        size: SIZE.sigCaption, font: serifBold, color: C.faint, tracking: SIZE.sigCaption * 0.12,
      });
      const dx = left + sigW + gap;
      page.drawLine({ start: { x: dx, y: lineY }, end: { x: dx + dateW, y: lineY }, thickness: 1, color: C.ink });
      drawTracked(dx, lineY - PX(11), 'DATE', {
        size: SIZE.sigCaption, font: serifBold, color: C.faint, tracking: SIZE.sigCaption * 0.12,
      });
      y -= rowH;
    });
  }

  /* ---- Compose ---- */
  drawMasthead();
  drawReferenceLines(l.fields);
  (l.body || []).forEach(drawBlock);
  drawCertifyAndSignatures(l.certify, l.signatures);

  return pdfDoc.save();
}

module.exports = { generateBorrowerLetterPdfBufferC };
