'use strict';

/**
 * Local persistence for dashboard-sourced template configs.
 *
 * Each dashboard investor document we open gets a config file stored under
 *   data/dashboard-cache/{investorId}/{docId}.json
 * containing:
 *   - lastSeen    (ISO timestamp, when we last fetched metadata)
 *   - meta        (file_key, file_name, file_size, doc_type, etc.)
 *   - fields      (detected AcroForm fields + user-set source mappings)
 *
 * The PDF binary itself is cached at
 *   data/dashboard-cache/{investorId}/{docId}.pdf
 * so we don't re-download from S3 on every fill request. We invalidate
 * the PDF cache when meta.file_key changes (i.e. the user re-uploaded).
 *
 * Field mappings (which AcroForm field → MISMO source) survive across
 * re-uploads because the JSON config is keyed by docId, which the
 * dashboard reuses as long as the user doesn't delete + re-create.
 */

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'data', 'dashboard-cache');

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function investorDir(investorId) {
  return path.join(CACHE_DIR, String(investorId));
}

function configPath(investorId, docId) {
  return path.join(investorDir(investorId), String(docId) + '.json');
}

function pdfPath(investorId, docId) {
  return path.join(investorDir(investorId), String(docId) + '.pdf');
}

function readConfig(investorId, docId) {
  const p = configPath(investorId, docId);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (_e) { return null; }
}

function writeConfig(investorId, docId, config) {
  ensureDir(investorDir(investorId));
  fs.writeFileSync(configPath(investorId, docId), JSON.stringify(config, null, 2));
}

function readPdfBytes(investorId, docId) {
  const p = pdfPath(investorId, docId);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

function writePdfBytes(investorId, docId, buffer) {
  ensureDir(investorDir(investorId));
  fs.writeFileSync(pdfPath(investorId, docId), buffer);
}

function deleteEntry(investorId, docId) {
  const cp = configPath(investorId, docId);
  const pp = pdfPath(investorId, docId);
  if (fs.existsSync(cp)) fs.unlinkSync(cp);
  if (fs.existsSync(pp)) fs.unlinkSync(pp);
}

module.exports = {
  CACHE_DIR,
  readConfig,
  writeConfig,
  readPdfBytes,
  writePdfBytes,
  deleteEntry,
};
