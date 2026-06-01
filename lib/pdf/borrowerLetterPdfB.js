'use strict';

/**
 * Borrower-letter PDF renderer — STYLE B ("Compact Ledger").
 *
 * Cool, monochrome, ledger-like treatment with a single teal accent:
 * a mono kicker + heavy sans title, a thin accent flag at the page
 * corner, hairline "ribbon" identification cells, borderless tables
 * with right-aligned monospace figures, a dashed write-in area, and a
 * 2-up signature grid. Same structured `letter` payload as Style A.
 *
 * Hanken Grotesk / Spline Sans Mono in the spec are substituted with
 * the built-in Helvetica (sans) + Courier (mono) per the sanctioned
 * built-in-font fallback — no embedded font dependencies.
 *
 *   generateBorrowerLetterPdfBufferB({
 *     eyebrow, title, dateLine, fields:[{label,value,full?}],
 *     body:[blocks], certify, signatures:[{caption,name?}]
 *   })
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { wrapTextToLines } = require('./wrapText');

/* ---- Compact Ledger palette (spec §B, teal accent) ---- */
const C = {
  paper: rgb(1, 1, 1),                  // #ffffff
  ink: rgb(0.0824, 0.0902, 0.1098),     // #15171c
  muted: rgb(0.3569, 0.3804, 0.4196),   // #5b616b
  faint: rgb(0.5882, 0.6078, 0.6431),   // #969ba4
  line: rgb(0.9020, 0.9059, 0.9176),    // #e6e7ea
  line2: rgb(0.9412, 0.9451, 0.9529),   // #f0f1f3
  accent: rgb(0.0588, 0.5412, 0.5569),  // ~oklch(0.52 0.10 192) teal
  accentD: rgb(0.0431, 0.4157, 0.4314), // darker teal
  soft: rgb(0.9176, 0.9647, 0.9647),    // very light teal wash
  white: rgb(1, 1, 1),
};

/* Mockup px (96dpi) → PDF points, tightened for the compact look. */
const PX = (px) => px * 0.75;

const SIZE = {
  kicker: 7.5,
  title: 18,
  meta: 8,
  label: 6.5,
  value: 10,
  body: 10,
  section: 7.5,
  tableHead: 6.5,
  tableBody: 9.5,
  certify: 9,
  sigCaption: 6.5,
};
const LEAD = {
  body: SIZE.body * 1.5,
  table: SIZE.tableBody * 1.32,
  certify: SIZE.certify * 1.45,
};

async function generateBorrowerLetterPdfBufferB(letter) {
  const l = letter || {};
  const pdfDoc = await PDFDocument.create();
  const sans = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdfDoc.embedFont(StandardFonts.Courier);
  const monoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const W = 612, H = 792;
  const M = { top: 0.62 * 72, side: 0.66 * 72, bottom: 0.55 * 72 };
  const left = M.side;
  const right = W - M.side;
  const contentW = right - left;

  let page;
  let y;

  function startPage() {
    page = pdfDoc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.paper });
    // Accent flag flush to the page top-left corner.
    page.drawRectangle({ x: 0, y: H - PX(78), width: PX(5), height: PX(78), color: C.accent });
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
      .replace(/ /g, ' ')
      .replace(/[­-]|[Ā-￿]|[\uD800-\uDFFF][\uDC00-\uDFFF]/g, ' ');
  }

  function widthOf(text, font, size) {
    return font.widthOfTextAtSize(sanitize(text), size);
  }

  function drawText(x, yy, text, opts) {
    opts = opts || {};
    page.drawText(sanitize(text), {
      x, y: yy,
      size: opts.size || SIZE.body,
      font: opts.font || sans,
      color: opts.color || C.ink,
    });
  }

  function drawRight(xRight, yy, text, opts) {
    opts = opts || {};
    const w = widthOf(text, opts.font || sans, opts.size || SIZE.body);
    drawText(xRight - w, yy, text, opts);
  }

  /** Letter-spaced label text. Returns end x. */
  function drawTracked(x, yy, text, opts) {
    opts = opts || {};
    const size = opts.size || SIZE.label;
    const font = opts.font || monoBold;
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

  /* ---- Masthead ---- */
  function drawMasthead() {
    if (l.eyebrow) {
      y -= SIZE.kicker;
      drawTracked(left, y, l.eyebrow.toUpperCase(), {
        size: SIZE.kicker, font: monoBold, color: C.accentD, tracking: SIZE.kicker * 0.18,
      });
      y -= PX(13);
    }
    y -= SIZE.title;
    drawText(left, y, l.title || '', { size: SIZE.title, font: sansBold, color: C.ink });
    if (l.dateLine) {
      drawRight(right, y + PX(4), l.dateLine, { size: SIZE.meta, font: mono, color: C.muted });
    }
    y -= PX(13);
    page.drawRectangle({ x: left, y: y, width: contentW, height: 0.75, color: C.line });
    page.drawRectangle({ x: left, y: y, width: PX(64), height: 1.75, color: C.accent });
    y -= PX(22);
  }

  /* ---- Identification ribbon (hairline cells, mono labels) ---- */
  function drawFieldGrid(fields) {
    const list = (fields || []).filter(Boolean);
    if (!list.length) return;
    const rows = [];
    for (let i = 0; i < list.length;) {
      if (list[i].full) { rows.push([list[i]]); i += 1; }
      else if (i + 1 < list.length && !list[i + 1].full) { rows.push([list[i], list[i + 1]]); i += 2; }
      else { rows.push([list[i]]); i += 1; }
    }
    const rowH = PX(40);
    const padX = PX(10);
    const gap = PX(8);
    rows.forEach((row) => {
      needRoom(rowH + PX(8));
      const cols = row.length;
      const cellW = (contentW - gap * (cols - 1)) / cols;
      row.forEach((f, ci) => {
        const cx = left + ci * (cellW + gap);
        page.drawRectangle({
          x: cx, y: y - rowH, width: cellW, height: rowH,
          color: C.paper, borderColor: C.line, borderWidth: 0.75,
        });
        drawTracked(cx + padX, y - PX(14), (f.label || '').toUpperCase(), {
          size: SIZE.label, font: monoBold, color: C.faint, tracking: SIZE.label * 0.14,
        });
        const hasVal = f.value != null && String(f.value).trim() !== '';
        drawText(cx + padX, y - PX(31), hasVal ? String(f.value) : '—', {
          size: SIZE.value, font: hasVal ? sansBold : sans, color: hasVal ? C.ink : C.faint,
        });
      });
      y -= rowH + PX(8);
    });
    y -= PX(8);
  }

  function drawParagraph(text, opts) {
    opts = opts || {};
    const size = opts.size || SIZE.body;
    const font = opts.font || sans;
    const color = opts.color || C.ink;
    const lead = opts.lead || LEAD.body;
    const lines = wrapTextToLines(sanitize(text), contentW, font, size);
    lines.forEach((ln) => {
      needRoom(lead);
      y -= size;
      drawText(left, y, ln, { size, font, color });
      y -= (lead - size);
    });
    y -= PX(opts.gapAfter == null ? 8 : opts.gapAfter);
  }

  function drawSectionHeading(text) {
    needRoom(PX(30));
    y -= SIZE.section;
    drawTracked(left, y, text.toUpperCase(), {
      size: SIZE.section, font: monoBold, color: C.accentD, tracking: SIZE.section * 0.16,
    });
    y -= PX(8);
    page.drawLine({ start: { x: left, y: y }, end: { x: right, y: y }, thickness: 0.75, color: C.line });
    y -= PX(12);
  }

  /* ---- Borderless data table — hairline row rules, mono figures ---- */
  function drawDataTable(columns, rows, minRows) {
    const widths = columns.map((c) => c.w * contentW);
    const xOf = (i) => left + widths.slice(0, i).reduce((a, b) => a + b, 0);
    const isNumCol = (c) => c.key === 'no' || c.numeric;

    needRoom(PX(24));
    y -= SIZE.tableHead;
    columns.forEach((c, i) => {
      const tx = xOf(i) + PX(3);
      if (isNumCol(c)) {
        drawRight(xOf(i) + widths[i] - PX(3), y, c.header.toUpperCase(), {
          size: SIZE.tableHead, font: monoBold, color: C.muted,
        });
      } else {
        drawTracked(tx, y, c.header.toUpperCase(), {
          size: SIZE.tableHead, font: monoBold, color: C.muted, tracking: SIZE.tableHead * 0.1,
        });
      }
    });
    y -= PX(6);
    page.drawRectangle({ x: left, y: y, width: contentW, height: 1, color: C.accent });
    y -= PX(2);

    let data = Array.isArray(rows) ? rows.slice() : [];
    if (!data.length && minRows) data = Array.from({ length: minRows }, () => ({}));

    data.forEach((r, ri) => {
      const cellLines = columns.map((c, i) => {
        if (c.key === 'no') return [String(ri + 1).padStart(2, '0')];
        return wrapTextToLines(sanitize(r[c.key] || ''), widths[i] - PX(8),
          isNumCol(c) ? mono : sans, SIZE.tableBody);
      });
      const maxLines = Math.max(1, ...cellLines.map((a) => a.length));
      const rowH = PX(6) + maxLines * LEAD.table + PX(5);
      needRoom(rowH);
      columns.forEach((c, i) => {
        const numeric = isNumCol(c);
        let ty = y - PX(6) - SIZE.tableBody;
        cellLines[i].forEach((ln) => {
          if (numeric) {
            drawRight(xOf(i) + widths[i] - PX(4), ty, ln, {
              size: SIZE.tableBody, font: mono, color: c.key === 'no' ? C.faint : C.ink,
            });
          } else {
            drawText(xOf(i) + PX(4), ty, ln, {
              size: SIZE.tableBody, font: sans, color: c.brand ? C.accentD : C.ink,
            });
          }
          ty -= LEAD.table;
        });
      });
      page.drawLine({
        start: { x: left, y: y - rowH }, end: { x: right, y: y - rowH },
        thickness: 0.5, color: C.line,
      });
      y -= rowH;
    });
    y -= PX(12);
  }

  /* ---- Inline run layout (value runs = mono, teal underline) ---- */
  function tokenize(runs) {
    const toks = [];
    (runs || []).forEach((run) => {
      if (run.value) {
        const raw = String(run.text == null ? '' : run.text);
        toks.push({ text: raw.trim() === '' ? '        ' : raw, value: true, space: false });
      } else {
        String(run.text).split(/(\s+)/).forEach((p) => {
          if (p === '') return;
          toks.push({ text: p, value: false, space: /^\s+$/.test(p) });
        });
      }
    });
    return toks;
  }
  const tokFont = (t) => (t.value ? mono : sans);

  function layoutRuns(runs, maxW, size) {
    const toks = tokenize(runs);
    const lines = [];
    let line = [], w = 0;
    toks.forEach((t) => {
      const tw = widthOf(t.text, tokFont(t), size);
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
        const f = tokFont(t);
        const tw = widthOf(t.text, f, size);
        if (!t.space) {
          drawText(cx, y, t.text, { size, font: f, color: t.value ? C.accentD : C.ink });
          if (t.value) {
            page.drawLine({
              start: { x: cx, y: y - PX(2) }, end: { x: cx + tw, y: y - PX(2) },
              thickness: 0.6, color: C.accent,
            });
          }
        }
        cx += tw;
      });
      y -= (lead - size);
    });
  }

  /* ---- Numbered certification list — mono teal figures ---- */
  function drawNumberedList(intro, items) {
    if (intro && intro.runs) {
      drawRunLines(left, layoutRuns(intro.runs, contentW, SIZE.body), SIZE.body, LEAD.body);
      y -= PX(7);
    } else if (typeof intro === 'string' && intro) {
      drawParagraph(intro, { gapAfter: 7 });
    }
    const textX = left + PX(26);
    const maxW = right - textX;
    (items || []).forEach((runs, i) => {
      const lines = layoutRuns(runs, maxW, SIZE.body);
      const blockH = Math.max(LEAD.body, lines.length * LEAD.body);
      needRoom(blockH + PX(5));
      const firstBaseline = y - SIZE.body;
      drawText(left, firstBaseline, String(i + 1).padStart(2, '0'), {
        size: SIZE.body, font: monoBold, color: C.accent,
      });
      drawRunLines(textX, lines, SIZE.body, LEAD.body);
      y -= PX(5);
    });
    y -= PX(8);
  }

  /* ---- Donor info — labeled key/value cells, hairline under each ---- */
  function drawDonorGrid(cells) {
    const list = (cells || []).filter(Boolean);
    const rows = [];
    for (let i = 0; i < list.length;) {
      if (list[i].full) { rows.push([list[i]]); i += 1; }
      else if (i + 1 < list.length && !list[i + 1].full) { rows.push([list[i], list[i + 1]]); i += 2; }
      else { rows.push([list[i]]); i += 1; }
    }
    const rowH = PX(38);
    const gap = PX(16);
    rows.forEach((row) => {
      needRoom(rowH);
      const cols = row.length;
      const cellW = (contentW - gap * (cols - 1)) / cols;
      row.forEach((c, ci) => {
        const cx = left + ci * (cellW + gap);
        drawTracked(cx, y - SIZE.label, (c.label || '').toUpperCase(), {
          size: SIZE.label, font: monoBold, color: C.faint, tracking: SIZE.label * 0.14,
        });
        const hasVal = c.value != null && String(c.value).trim() !== '';
        if (hasVal) {
          drawText(cx, y - PX(26), String(c.value), { size: SIZE.value, font: sansBold, color: C.ink });
        }
        const lineY = y - PX(30);
        page.drawLine({ start: { x: cx, y: lineY }, end: { x: cx + cellW, y: lineY }, thickness: 0.75, color: C.line });
      });
      y -= rowH;
    });
    y -= PX(8);
  }

  /* ---- Dashed write-in area ---- */
  function dashedRect(x, yy, w, h) {
    const opts = { thickness: 0.75, color: C.line, dashArray: [3, 2] };
    page.drawLine({ start: { x: x, y: yy }, end: { x: x + w, y: yy }, ...opts });
    page.drawLine({ start: { x: x, y: yy - h }, end: { x: x + w, y: yy - h }, ...opts });
    page.drawLine({ start: { x: x, y: yy }, end: { x: x, y: yy - h }, ...opts });
    page.drawLine({ start: { x: x + w, y: yy }, end: { x: x + w, y: yy - h }, ...opts });
  }

  function drawExplanationBox(text) {
    const padX = PX(10);
    const maxW = contentW - padX * 2;
    const hasText = text != null && String(text).trim() !== '';
    const lines = hasText ? wrapTextToLines(sanitize(text), maxW, sans, SIZE.body) : [];
    const minH = PX(140);
    const boxH = Math.max(minH, lines.length * LEAD.body + PX(24));
    needRoom(boxH + PX(8));
    page.drawRectangle({ x: left, y: y - boxH, width: contentW, height: boxH, color: C.soft });
    dashedRect(left, y, contentW, boxH);
    if (hasText) {
      let ty = y - PX(16);
      lines.forEach((ln) => {
        ty -= SIZE.body;
        drawText(left + padX, ty, ln, { size: SIZE.body, font: sans, color: C.ink });
        ty -= (LEAD.body - SIZE.body);
      });
    } else {
      drawTracked(left + padX, y - PX(15), 'WRITE-IN', {
        size: SIZE.label, font: monoBold, color: C.faint, tracking: SIZE.label * 0.14,
      });
      let ly = y - PX(36);
      while (ly > y - boxH + PX(12)) {
        page.drawLine({ start: { x: left + padX, y: ly }, end: { x: right - padX, y: ly }, thickness: 0.5, color: C.line });
        ly -= PX(22);
      }
    }
    y -= boxH + PX(12);
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

  /* ---- Certify + 2-up signature grid ---- */
  function drawCertifyAndSignatures(certify, signatures) {
    const sigs = (signatures || []).filter(Boolean);
    y -= PX(6);
    page.drawLine({ start: { x: left, y: y }, end: { x: right, y: y }, thickness: 0.75, color: C.line });
    y -= PX(13);
    if (certify) {
      drawParagraph(certify, { size: SIZE.certify, font: sans, color: C.muted, lead: LEAD.certify, gapAfter: 18 });
    }
    const gap = PX(22);
    const colW = (contentW - gap) / 2;
    const anyName = sigs.some(function (s) { return s.name != null && String(s.name).trim() !== ''; });
    const cellH = anyName ? PX(62) : PX(50);
    for (let i = 0; i < sigs.length; i += 2) {
      const pair = sigs.slice(i, i + 2);
      needRoom(cellH);
      pair.forEach((sig, ci) => {
        const cx = left + ci * (colW + gap);
        const lineY = y - PX(24);
        // The line itself stays blank for the borrower's handwritten signature.
        page.drawLine({ start: { x: cx, y: lineY }, end: { x: cx + colW, y: lineY }, thickness: 1.25, color: C.ink });
        const printedName = sig.name != null && String(sig.name).trim() !== '' ? String(sig.name).trim() : '';
        if (printedName) {
          drawText(cx, lineY - PX(12), printedName, { size: SIZE.value, font: mono, color: C.ink });
          drawTracked(cx, lineY - PX(24), (sig.caption || 'Signature').toUpperCase(), {
            size: SIZE.sigCaption, font: monoBold, color: C.faint, tracking: SIZE.sigCaption * 0.14,
          });
        } else {
          drawTracked(cx, lineY - PX(11), (sig.caption || 'Signature').toUpperCase(), {
            size: SIZE.sigCaption, font: monoBold, color: C.faint, tracking: SIZE.sigCaption * 0.14,
          });
        }
      });
      y -= cellH + PX(14);
    }
  }

  /* ---- Compose ---- */
  drawMasthead();
  drawFieldGrid(l.fields);
  (l.body || []).forEach(drawBlock);
  drawCertifyAndSignatures(l.certify, l.signatures);

  return pdfDoc.save();
}

module.exports = { generateBorrowerLetterPdfBufferB };
