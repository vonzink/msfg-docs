'use strict';

/**
 * Per-user, per-template draft store.
 *
 * When a user is mid-way through filling out a template and wants to
 * step away, "Save Draft" persists the current form values so they can
 * resume next visit. Stored on disk at
 *   data/template-drafts/{ownerSub}/{templateId}.json
 * to stay consistent with the rest of the filesystem-backed stores in
 * this app.
 *
 * Drafts are scoped to the user who created them (ownerSub is part of
 * the path) and to the specific template (templateId). Deleting the
 * template or draft cleans up its file.
 */

const fs = require('fs');
const path = require('path');

const DRAFTS_DIR = path.join(__dirname, '..', 'data', 'template-drafts');

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function userDir(ownerSub) {
  return path.join(DRAFTS_DIR, String(ownerSub));
}

function draftPath(ownerSub, templateId) {
  return path.join(userDir(ownerSub), String(templateId) + '.json');
}

function readDraft(ownerSub, templateId) {
  if (!ownerSub || !templateId) return null;
  const p = draftPath(ownerSub, templateId);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (_e) { return null; }
}

/** Persist a draft. `values` is the pdfField → value map the fill page
 *  collects; we also stamp savedAt so the UI can show "last saved 2m ago". */
function writeDraft(ownerSub, templateId, values) {
  if (!ownerSub || !templateId) throw new Error('ownerSub and templateId required');
  ensureDir(userDir(ownerSub));
  const payload = {
    templateId: String(templateId),
    values: values || {},
    savedAt: new Date().toISOString()
  };
  fs.writeFileSync(draftPath(ownerSub, templateId), JSON.stringify(payload, null, 2));
  return payload;
}

function deleteDraft(ownerSub, templateId) {
  const p = draftPath(ownerSub, templateId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { readDraft, writeDraft, deleteDraft };
