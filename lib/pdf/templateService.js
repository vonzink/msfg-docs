'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');

const TEMPLATES_DIR = path.join(__dirname, '../../data/templates');
const REGISTRY_PATH = path.join(TEMPLATES_DIR, 'registry.json');

/* ---- helpers ---- */

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readRegistry() {
  ensureDir(TEMPLATES_DIR);
  if (!fs.existsSync(REGISTRY_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')); }
  catch { return []; }
}

function writeRegistry(list) {
  ensureDir(TEMPLATES_DIR);
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(list, null, 2));
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'template';
}

function uniqueSlug(slug, existingSlugs) {
  let candidate = slug;
  let i = 2;
  while (existingSlugs.includes(candidate)) {
    candidate = `${slug}-${i++}`;
  }
  return candidate;
}

/* ---- field detection ---- */

function detectFieldType(field) {
  const constructor = field.constructor.name;
  if (constructor === 'PDFCheckBox') return 'checkbox';
  if (constructor === 'PDFDropdown') return 'dropdown';
  if (constructor === 'PDFRadioGroup') return 'radio';
  if (constructor === 'PDFTextField') return 'text';
  if (constructor === 'PDFOptionList') return 'select';
  return 'text';
}

function friendlyLabel(pdfFieldName) {
  // Turn "form1[0].page_1[0].name_shown[0].first_name[0]" into "First Name"
  const last = pdfFieldName.split('.').pop() || pdfFieldName;
  return last
    .replace(/\[\d+\]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/#/g, '')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || pdfFieldName;
}

function getDropdownOptions(field) {
  try { return field.getOptions(); }
  catch { return []; }
}

/**
 * Load a PDF and extract all AcroForm fields.
 * @param {Buffer|Uint8Array} pdfBytes
 * @returns {Promise<Array<{pdfField, type, label, options?, group}>>}
 */
async function detectFields(pdfBytes) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const raw = form.getFields();

  return raw.map((field, idx) => {
    const name = field.getName();
    const type = detectFieldType(field);
    const entry = {
      pdfField: name,
      type,
      label: friendlyLabel(name),
      group: 'General',
      placeholder: '',
      order: idx
    };
    if (type === 'dropdown' || type === 'select') {
      entry.options = getDropdownOptions(field);
    }
    return entry;
  });
}

/* ---- Per-user scoping helpers ----
   Every list / get / update / delete is scoped to the calling user's
   Cognito sub. Templates carry an ownerSub on disk; legacy templates
   uploaded before this scoping (no ownerSub set) are treated as
   orphaned — visible to nobody from the standard surface so they can't
   leak across users. Pass ownerSub === null to bypass scoping (used
   by internal/admin paths only — none today). */

function ownerOf(entry) {
  return (entry && entry.ownerSub) || null;
}

function visibleToUser(entry, ownerSub) {
  if (!ownerSub) return false;            // require an explicit owner identity
  return ownerOf(entry) === ownerSub;     // strict match — no inheritance
}

/* ---- CRUD ---- */

/**
 * Upload a new PDF template — stores file, detects fields, creates config.
 * @param {Buffer} pdfBuffer
 * @param {string} originalName
 * @param {object} [meta] - { name, category, icon, description, investorName }
 * @param {string} ownerSub - Cognito sub of the user uploading
 * @returns {Promise<object>} template config
 */
async function createTemplate(pdfBuffer, originalName, meta, ownerSub) {
  if (!ownerSub) throw new Error('createTemplate: ownerSub required');

  const id = crypto.randomUUID();
  const registry = readRegistry();
  // Slug uniqueness is per-user — two different users can each have a
  // "form-4506-c" template. Disambiguates with a suffix if collision.
  const existingSlugs = registry
    .filter(t => t.ownerSub === ownerSub)
    .map(t => t.slug);

  const baseName = (meta && meta.name) || path.basename(originalName, path.extname(originalName));
  const slug = uniqueSlug(slugify(baseName), existingSlugs);

  const templateDir = path.join(TEMPLATES_DIR, id);
  ensureDir(templateDir);

  // Save the PDF
  const pdfPath = path.join(templateDir, 'template.pdf');
  fs.writeFileSync(pdfPath, pdfBuffer);

  // Detect fields
  const fields = await detectFields(pdfBuffer);

  const config = {
    id,
    slug,
    ownerSub,
    name: baseName,
    filename: originalName,
    category: (meta && meta.category) || 'other',
    icon: (meta && meta.icon) || '',
    description: (meta && meta.description) || '',
    investorName: (meta && meta.investorName) || '',
    fields,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Save config
  fs.writeFileSync(path.join(templateDir, 'config.json'), JSON.stringify(config, null, 2));

  // Update registry
  registry.push({
    id,
    slug,
    ownerSub,
    name: config.name,
    category: config.category,
    icon: config.icon,
    investorName: config.investorName,
    fieldCount: fields.length
  });
  writeRegistry(registry);

  return config;
}

function listTemplates(ownerSub) {
  return readRegistry().filter(t => visibleToUser(t, ownerSub));
}

function getTemplate(idOrSlug, ownerSub) {
  const registry = readRegistry();
  // Slug isn't globally unique anymore — must match BOTH slug AND owner.
  const entry = registry.find(t =>
    visibleToUser(t, ownerSub) &&
    (t.id === idOrSlug || t.slug === idOrSlug)
  );
  if (!entry) return null;
  const configPath = path.join(TEMPLATES_DIR, entry.id, 'config.json');
  if (!fs.existsSync(configPath)) return null;
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function updateTemplate(idOrSlug, updates, ownerSub) {
  const config = getTemplate(idOrSlug, ownerSub);
  if (!config) return null;

  // Merge allowed updates (ownerSub is intentionally NOT in the allow-list
  // — once owned, can't be reassigned via the editor)
  if (updates.name !== undefined) config.name = updates.name;
  if (updates.category !== undefined) config.category = updates.category;
  if (updates.icon !== undefined) config.icon = updates.icon;
  if (updates.description !== undefined) config.description = updates.description;
  if (updates.investorName !== undefined) config.investorName = updates.investorName;
  if (updates.fields !== undefined) config.fields = updates.fields;

  // Update slug if name changed (uniqueness scoped to this user)
  if (updates.name !== undefined) {
    const registry = readRegistry();
    const existingSlugs = registry
      .filter(t => t.ownerSub === ownerSub && t.id !== config.id)
      .map(t => t.slug);
    config.slug = uniqueSlug(slugify(updates.name), existingSlugs);
  }

  config.updatedAt = new Date().toISOString();

  // Save config
  const configPath = path.join(TEMPLATES_DIR, config.id, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Update registry
  const registry = readRegistry();
  const idx = registry.findIndex(t => t.id === config.id);
  if (idx !== -1) {
    registry[idx] = {
      id: config.id,
      slug: config.slug,
      ownerSub: config.ownerSub,
      name: config.name,
      category: config.category,
      icon: config.icon,
      investorName: config.investorName || '',
      fieldCount: config.fields.length
    };
    writeRegistry(registry);
  }

  return config;
}

function deleteTemplate(idOrSlug, ownerSub) {
  const config = getTemplate(idOrSlug, ownerSub);
  if (!config) return false;

  const templateDir = path.join(TEMPLATES_DIR, config.id);
  if (fs.existsSync(templateDir)) {
    fs.rmSync(templateDir, { recursive: true, force: true });
  }

  const registry = readRegistry().filter(t => t.id !== config.id);
  writeRegistry(registry);
  return true;
}

/**
 * Fill a template PDF with data and return the bytes.
 * @param {string} idOrSlug
 * @param {object} formData - { pdfFieldName: value, ... }
 * @param {string} ownerSub - Cognito sub of the calling user (must own template)
 * @returns {Promise<Uint8Array>}
 */
async function fillTemplate(idOrSlug, formData, ownerSub) {
  const config = getTemplate(idOrSlug, ownerSub);
  if (!config) throw new Error('Template not found');

  const pdfPath = path.join(TEMPLATES_DIR, config.id, 'template.pdf');
  if (!fs.existsSync(pdfPath)) throw new Error('Template PDF file missing');

  const bytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  for (const fieldConfig of config.fields) {
    const value = formData[fieldConfig.pdfField];
    if (value == null || value === '') continue;

    try {
      if (fieldConfig.type === 'checkbox') {
        const cb = form.getCheckBox(fieldConfig.pdfField);
        if (value === true || value === 'true' || value === 'on' || value === '1') {
          cb.check();
        } else {
          cb.uncheck();
        }
      } else if (fieldConfig.type === 'dropdown' || fieldConfig.type === 'select') {
        const dd = form.getDropdown(fieldConfig.pdfField);
        dd.select(String(value));
      } else if (fieldConfig.type === 'radio') {
        const rg = form.getRadioGroup(fieldConfig.pdfField);
        rg.select(String(value));
      } else {
        const tf = form.getTextField(fieldConfig.pdfField);
        tf.setText(String(value).slice(0, 2000));
      }
    } catch (e) {
      // Field may not exist or type mismatch — skip silently
    }
  }

  return pdfDoc.save();
}

/**
 * Get the raw PDF bytes for a template (for preview/download of blank).
 * Owner-scoped — non-owner reads return null.
 */
function getTemplatePdfBytes(idOrSlug, ownerSub) {
  const config = getTemplate(idOrSlug, ownerSub);
  if (!config) return null;
  const pdfPath = path.join(TEMPLATES_DIR, config.id, 'template.pdf');
  if (!fs.existsSync(pdfPath)) return null;
  return fs.readFileSync(pdfPath);
}

module.exports = {
  detectFields,
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  fillTemplate,
  getTemplatePdfBytes
};
