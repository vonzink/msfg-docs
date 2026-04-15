'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const templateService = require('../lib/pdf/templateService');

/* ---- file upload config ---- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter(req, file, cb) {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed.'));
    }
    cb(null, true);
  }
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many uploads. Please wait.' }
});

/* ================================================================
   PAGE ROUTES — served by the templates router mounted at /templates
   ================================================================ */

/** List / manage templates */
router.get('/', (req, res) => {
  const ver = res.locals.v;
  res.render('templates/manage', {
    title: 'PDF Templates',
    extraHead: `<link rel="stylesheet" href="/css/templates.css?v=${ver}">`,
    extraScripts: `<script src="/js/templates/manage${res.locals.jsExt}?v=${ver}"></script>`
  });
});

/** Field mapping editor for a specific template */
router.get('/:idOrSlug/edit', (req, res) => {
  const config = templateService.getTemplate(req.params.idOrSlug);
  if (!config) return res.status(404).render('404', { title: 'Template Not Found' });
  const ver = res.locals.v;
  res.render('templates/editor', {
    title: `Edit — ${config.name}`,
    templateConfig: config,
    extraHead: `<link rel="stylesheet" href="/css/templates.css?v=${ver}">`,
    extraScripts: `<script src="/js/templates/editor${res.locals.jsExt}?v=${ver}"></script>`
  });
});

/** Fill form — end-user facing */
router.get('/:idOrSlug/fill', (req, res) => {
  const config = templateService.getTemplate(req.params.idOrSlug);
  if (!config) return res.status(404).render('404', { title: 'Template Not Found' });
  const ver = res.locals.v;
  res.render('templates/fill', {
    title: config.name,
    templateConfig: config,
    doc: { slug: `pdf-template-${config.slug}`, icon: config.icon || '📄', name: config.name, description: config.description },
    bodyClass: req.query && req.query.embed ? 'embed-mode' : undefined,
    extraHead: `<link rel="stylesheet" href="/css/templates.css?v=${ver}">`,
    extraScripts: `<script src="/js/templates/fill${res.locals.jsExt}?v=${ver}"></script>`
  });
});

/* ================================================================
   API ROUTES — JSON endpoints
   ================================================================ */

/** List all templates */
router.get('/api/list', (req, res) => {
  res.json({ success: true, templates: templateService.listTemplates() });
});

/** Upload a new template */
router.post('/api/upload', uploadLimiter, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No PDF file provided.' });
    const meta = {
      name: req.body.name || undefined,
      category: req.body.category || undefined,
      icon: req.body.icon || undefined,
      description: req.body.description || undefined
    };
    const config = await templateService.createTemplate(req.file.buffer, req.file.originalname, meta);
    res.json({ success: true, template: config });
  } catch (err) {
    console.error('[Templates] Upload error:', err);
    const msg = err.message === 'Only PDF files are allowed.'
      ? err.message
      : 'Failed to process PDF template.';
    res.status(400).json({ success: false, message: msg });
  }
});

/** Get template config */
router.get('/api/:idOrSlug', (req, res) => {
  const config = templateService.getTemplate(req.params.idOrSlug);
  if (!config) return res.status(404).json({ success: false, message: 'Template not found.' });
  res.json({ success: true, template: config });
});

/** Update template config (fields, metadata) */
router.put('/api/:idOrSlug', express.json(), async (req, res) => {
  try {
    // Re-detect fields from the PDF
    if (req.body.redetect) {
      const pdfBytes = templateService.getTemplatePdfBytes(req.params.idOrSlug);
      if (!pdfBytes) return res.status(404).json({ success: false, message: 'Template PDF not found.' });
      const freshFields = await templateService.detectFields(pdfBytes);
      req.body.fields = freshFields;
      delete req.body.redetect;
    }
    const config = templateService.updateTemplate(req.params.idOrSlug, req.body);
    if (!config) return res.status(404).json({ success: false, message: 'Template not found.' });
    res.json({ success: true, template: config });
  } catch (err) {
    console.error('[Templates] Update error:', err);
    res.status(500).json({ success: false, message: err.message || 'Update failed.' });
  }
});

/** Delete template */
router.delete('/api/:idOrSlug', (req, res) => {
  const ok = templateService.deleteTemplate(req.params.idOrSlug);
  if (!ok) return res.status(404).json({ success: false, message: 'Template not found.' });
  res.json({ success: true });
});

/** Fill template and return PDF */
router.post('/api/:idOrSlug/fill', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const config = templateService.getTemplate(req.params.idOrSlug);
    if (!config) return res.status(404).json({ success: false, message: 'Template not found.' });

    const bytes = await templateService.fillTemplate(req.params.idOrSlug, req.body.fields || {});
    const safeName = config.slug.replace(/[^a-z0-9-]/g, '') || 'filled';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-filled.pdf"`);
    res.send(Buffer.from(bytes));
  } catch (err) {
    console.error('[Templates] Fill error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fill PDF.' });
  }
});

/** Download blank template PDF */
router.get('/api/:idOrSlug/download', (req, res) => {
  const config = templateService.getTemplate(req.params.idOrSlug);
  if (!config) return res.status(404).json({ success: false, message: 'Template not found.' });

  const bytes = templateService.getTemplatePdfBytes(req.params.idOrSlug);
  if (!bytes) return res.status(404).json({ success: false, message: 'PDF file not found.' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${config.slug}.pdf"`);
  res.send(bytes);
});

module.exports = router;
