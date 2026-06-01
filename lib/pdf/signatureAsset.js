'use strict';

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', '..', 'config', 'site.json');
const publicDir = path.join(__dirname, '..', '..', 'public');

/** PNG magic = 89 50 4E 47; JPEG magic = FF D8 FF. The settings upload
 *  forces a `.png` filename regardless of the real type, so we sniff the
 *  bytes rather than trust the extension. */
function sniffFormat(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

/**
 * Load the site-wide signature image configured on the settings page.
 * Returns { bytes, format: 'png'|'jpg' } for stamping into letter PDFs,
 * or null when none is configured / the file is missing / the format
 * isn't embeddable by pdf-lib (e.g. WebP).
 */
function loadSignatureImage() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const rel = config && config.signature;
    if (!rel || typeof rel !== 'string') return null;

    // rel looks like '/images/signature.png' (served from public/).
    const abs = path.join(publicDir, rel.replace(/^\/+/, ''));
    // Guard against path traversal via a malformed config value.
    if (!abs.startsWith(publicDir)) return null;

    const bytes = fs.readFileSync(abs);
    const format = sniffFormat(bytes);
    if (!format) return null;
    // Max stamped width (points) configured on the settings page; null = default.
    const maxWidth = (typeof config.signatureWidth === 'number' && config.signatureWidth > 0)
      ? config.signatureWidth : null;
    return { bytes, format, maxWidth };
  } catch (_e) {
    return null;
  }
}

module.exports = { loadSignatureImage };
