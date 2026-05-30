'use strict';

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', '..', 'config', 'site.json');
const publicDir = path.join(__dirname, '..', '..', 'public');

// Embedded-once-per-process cache, keyed by the resolved logo source.
const cache = new Map();

/** PNG magic = 89 50 4E 47; JPEG magic = FF D8 FF. pdf-lib can only embed
 *  PNG or JPEG, so sniff the bytes rather than trust the extension/URL. */
function sniffFormat(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

function readConfigLogoSrc() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const logo = config && config.logo;
    if (!logo) return null;
    const src = typeof logo === 'string' ? logo : logo.src;
    return (src && typeof src === 'string') ? src.trim() : null;
  } catch (_e) {
    return null;
  }
}

/** Read the Equal Housing Lender logo URL from config (config.equalHousingLogo). */
function readConfigEhlSrc() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const src = config && config.equalHousingLogo;
    return (src && typeof src === 'string') ? src.trim() : null;
  } catch (_e) {
    return null;
  }
}

/** Load a local path served from public/ (e.g. '/images/logo.png'). */
function loadLocal(rel) {
  const abs = path.join(publicDir, rel.replace(/^\/+/, ''));
  if (!abs.startsWith(publicDir)) return null; // guard path traversal
  const bytes = fs.readFileSync(abs);
  const format = sniffFormat(bytes);
  return format ? { bytes, format } : null;
}

/** Fetch a remote logo (https) and return its bytes. Network failures or
 *  non-embeddable formats degrade to null so the caller falls back to the
 *  text wordmark. */
async function loadRemote(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  const format = sniffFormat(bytes);
  return format ? { bytes, format } : null;
}

/**
 * Load the company logo configured in config/site.json for stamping onto
 * branded PDFs (Pre-Approval, Application Summary). Supports both a local
 * public/ path and a remote http(s) URL. Result is cached per source.
 *
 * @returns {Promise<{bytes: Buffer, format: 'png'|'jpg'}|null>}
 */
async function loadLogoImage() {
  const src = readConfigLogoSrc();
  if (!src) return null;
  if (cache.has(src)) return cache.get(src);

  let result = null;
  try {
    result = /^https?:\/\//i.test(src) ? await loadRemote(src) : loadLocal(src);
  } catch (_e) {
    result = null;
  }
  cache.set(src, result);
  return result;
}

/**
 * Load the Equal Housing Lender mark configured in config/site.json
 * (equalHousingLogo) for stamping onto branded PDFs. Same remote/local + sniff
 * + cache behavior as loadLogoImage; failures degrade to null (mark omitted).
 *
 * @returns {Promise<{bytes: Buffer, format: 'png'|'jpg'}|null>}
 */
async function loadEhlImage() {
  const src = readConfigEhlSrc();
  if (!src) return null;
  if (cache.has(src)) return cache.get(src);

  let result = null;
  try {
    result = /^https?:\/\//i.test(src) ? await loadRemote(src) : loadLocal(src);
  } catch (_e) {
    result = null;
  }
  cache.set(src, result);
  return result;
}

module.exports = { loadLogoImage, loadEhlImage };
