'use strict';

/** Word-wrap using pdf-lib font metrics (Helvetica-compatible widths). */
function wrapTextToLines(text, maxWidth, font, fontSize) {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  const paragraphs = raw.split(/\n/);
  const lines = [];
  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
        cur = next;
      } else {
        if (cur) lines.push(cur);
        if (font.widthOfTextAtSize(w, fontSize) <= maxWidth) {
          cur = w;
        } else {
          let s = w;
          while (s.length) {
            let cut = s.length;
            while (cut > 1 && font.widthOfTextAtSize(s.slice(0, cut), fontSize) > maxWidth) cut--;
            lines.push(s.slice(0, cut));
            s = s.slice(cut);
          }
          cur = '';
        }
      }
    }
    if (cur) lines.push(cur);
    if (words.length === 0 && paragraphs.length > 1) lines.push('');
  }
  return lines.length ? lines : [''];
}

module.exports = { wrapTextToLines };
