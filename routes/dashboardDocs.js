'use strict';

/**
 * Routes for dashboard-sourced investor documents.
 *
 * Mounted at /dashboard-docs. Mirrors the structure of routes/templates.js
 * but pulls PDFs from the dashboard.msfgco.com investor Documents tab
 * instead of from local uploads. Per-document field mapping config (which
 * AcroForm field → which MISMO source) is persisted locally via
 * services/dashboardDocStore.js, keyed by (investorId, docId), so it
 * survives across re-uploads of the same document.
 *
 * Route map:
 *   GET    /dashboard-docs/list                           — list all editable investor docs (workspace selector)
 *   GET    /dashboard-docs/:investorId/:docId/fill        — fill page (renders views/templates/fill.ejs)
 *   GET    /dashboard-docs/:investorId/:docId/edit        — editor page (renders views/templates/editor.ejs)
 *   GET    /dashboard-docs/api/:investorId/:docId         — get config JSON
 *   PUT    /dashboard-docs/api/:investorId/:docId         — update config JSON
 *   POST   /dashboard-docs/api/:investorId/:docId/fill    — generate filled PDF
 *   GET    /dashboard-docs/api/:investorId/:docId/download — serve cached blank PDF
 */

const express = require('express');
const router = express.Router();

const dashboardClient = require('../services/dashboardClient');
const dashboardDocStore = require('../services/dashboardDocStore');
const { suggestForField, applySuggestions } = require('../services/irsFieldAutoSuggest');
const templateService = require('../lib/pdf/templateService');

// Doc types we consider "editable" — these get listed in the workspace
// selector and routed through the fill UI. Everything else (reference,
// null) is a static doc the user just downloads from the dashboard.
const EDITABLE_DOC_TYPES = new Set(['form-4506c', 'form-ssa89', 'template']);

/** Pull the user's Cognito token off the request. We forward it to the
 *  dashboard for both list and per-investor calls — same JWT, same user. */
function getAuthToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  if (req.cookies && req.cookies.auth_token) return req.cookies.auth_token;
  return null;
}

/** Build the synthetic config a fill/edit page needs. Combines metadata
 *  fetched from the dashboard with field mapping persisted locally. */
function buildSyntheticConfig({ investor, doc, persistedConfig }) {
  const investorId = investor.id;
  const docId = doc.id;
  const apiBase = '/dashboard-docs/api/' + investorId + '/' + docId;
  const editUrl = '/dashboard-docs/' + investorId + '/' + docId + '/edit';

  return {
    // The fill/edit views read these directly. id and slug aren't useful
    // to the dashboard flow but are kept non-empty for backward compat
    // with code paths that read them.
    id: 'inv-' + investorId + '-doc-' + docId,
    slug: 'inv-' + investorId + '-doc-' + docId,
    name: doc.file_name,
    filename: doc.file_name,
    category: 'other',
    icon: doc.doc_type === 'form-4506c' ? '📋'
        : doc.doc_type === 'form-ssa89' ? '🆔'
        : '📄',
    description: '',
    investorName: investor.name,
    fields: (persistedConfig && persistedConfig.fields) || [],
    // URL hooks the fill/editor JS uses instead of the hard-coded
    // /templates/api/{id} paths. See public/js/templates/fill.js +
    // editor.js — both check apiBase before falling back.
    apiBase,
    editUrl,
    fillUrl: '/dashboard-docs/' + investorId + '/' + docId + '/fill',
    // Provenance — useful for the editor UI to show "synced from
    // dashboard at <time>" instead of "Re-detect from PDF".
    dashboardMeta: {
      investorId,
      investorName: investor.name,
      docId,
      fileKey: doc.file_key,
      fileType: doc.file_type,
      docType: doc.doc_type || null,
      fileSize: doc.file_size,
      uploadedAt: doc.created_at,
      fetchedAt: new Date().toISOString(),
    },
  };
}

/** Fetch from the dashboard, populate local cache (PDF + config) on first
 *  open or when the upstream file_key changed (re-uploaded). Returns the
 *  ready-to-render synthetic config or null if the doc doesn't exist. */
async function loadOrSyncDashboardDoc(investorId, docId, token) {
  // 1. Resolve investor + doc metadata from the dashboard.
  const [investorList, docs] = await Promise.all([
    dashboardClient.listInvestors(token),
    dashboardClient.listInvestorDocuments(investorId, token),
  ]);
  const investor = (investorList || []).find((i) => String(i.id) === String(investorId));
  if (!investor) return null;
  const doc = (docs || []).find((d) => String(d.id) === String(docId));
  if (!doc) return null;

  // 2. Compare with what we have cached locally.
  const persisted = dashboardDocStore.readConfig(investorId, docId);
  const fileKeyChanged = !persisted
    || !persisted.dashboardMeta
    || persisted.dashboardMeta.fileKey !== doc.file_key;

  if (fileKeyChanged) {
    // Re-fetch the PDF and re-detect AcroForm fields. Preserve any
    // existing user-set mappings (source / mismoPath / label / group /
    // type / placeholder) by docId-keyed merge below.
    if (!doc.download_url) {
      throw new Error('Dashboard returned no download_url for doc ' + docId);
    }
    const bytes = await dashboardClient.fetchDocumentBytes(doc.download_url);
    dashboardDocStore.writePdfBytes(investorId, docId, bytes);

    let detected = await templateService.detectFields(bytes);

    // Merge user customizations from the previous version, if any. Match
    // on pdfField name — re-uploads of the same form will share names.
    if (persisted && Array.isArray(persisted.fields)) {
      const prevByName = {};
      persisted.fields.forEach((p) => { prevByName[p.pdfField] = p; });
      detected = detected.map((d) => {
        const prev = prevByName[d.pdfField];
        if (!prev) return d;
        return Object.assign({}, d, {
          label: prev.label || d.label,
          group: prev.group || d.group,
          placeholder: prev.placeholder || d.placeholder || '',
          source: prev.source || '',
          mismoPath: prev.mismoPath || undefined,
        });
      });
    }

    // Auto-suggest IRS field mappings on first open of a known doc type.
    // Only fields without a user-set source get a suggestion.
    applySuggestions(detected, doc.doc_type);

    const synthetic = buildSyntheticConfig({
      investor,
      doc,
      persistedConfig: { fields: detected },
    });
    dashboardDocStore.writeConfig(investorId, docId, synthetic);
    return synthetic;
  }

  // Cache hit — refresh the live metadata fields (file size etc.) without
  // touching the user-edited fields array.
  const merged = buildSyntheticConfig({ investor, doc, persistedConfig: persisted });
  return merged;
}

/* ================================================================
   PAGE ROUTES
   ================================================================ */

router.get('/:investorId/:docId/fill', async (req, res) => {
  try {
    const token = getAuthToken(req);
    const config = await loadOrSyncDashboardDoc(req.params.investorId, req.params.docId, token);
    if (!config) return res.status(404).render('404', { title: 'Document Not Found' });

    const ver = res.locals.v;
    const bp = res.locals.basePath || '';
    res.render('templates/fill', {
      title: config.name,
      templateConfig: config,
      doc: { slug: 'pdf-template-' + config.slug, icon: config.icon, name: config.name, description: config.description },
      bodyClass: req.query && req.query.embed ? 'embed-mode' : undefined,
      extraHead: `<link rel="stylesheet" href="${bp}/css/templates.css?v=${ver}">`,
      extraScripts: `<script src="${bp}/js/templates/fill${res.locals.jsExt}?v=${ver}"></script>`,
    });
  } catch (err) {
    console.error('[DashboardDocs] fill page error:', err);
    res.status(500).render('500', { title: 'Error', error: err.message });
  }
});

router.get('/:investorId/:docId/edit', async (req, res) => {
  try {
    const token = getAuthToken(req);
    const config = await loadOrSyncDashboardDoc(req.params.investorId, req.params.docId, token);
    if (!config) return res.status(404).render('404', { title: 'Document Not Found' });

    const ver = res.locals.v;
    const bp = res.locals.basePath || '';
    res.render('templates/editor', {
      title: 'Edit — ' + config.name,
      templateConfig: config,
      extraHead: `<link rel="stylesheet" href="${bp}/css/templates.css?v=${ver}">`,
      extraScripts: `<script src="${bp}/js/templates/editor${res.locals.jsExt}?v=${ver}"></script>`,
    });
  } catch (err) {
    console.error('[DashboardDocs] editor page error:', err);
    res.status(500).render('500', { title: 'Error', error: err.message });
  }
});

/* ================================================================
   API ROUTES
   ================================================================ */

/** Flat list of all editable investor docs across all investors. Used
 *  by the workspace selector. We fetch the investor list once and then
 *  fan out per-investor document fetches in parallel. */
router.get('/list', async (req, res) => {
  try {
    const token = getAuthToken(req);
    const investors = await dashboardClient.listInvestors(token);
    const active = (investors || []).filter((i) => i.is_active !== false);

    // Fan out per-investor document fetches. For ~20-30 investors this is
    // ~200ms total. If it grows past that, fold a server-side cache in here.
    const buckets = await Promise.all(active.map(async (inv) => {
      try {
        const docs = await dashboardClient.listInvestorDocuments(inv.id, token);
        const editable = (docs || []).filter((d) => EDITABLE_DOC_TYPES.has(d.doc_type));
        if (!editable.length) return null;
        return {
          investorId: inv.id,
          investorName: inv.name,
          docs: editable.map((d) => ({
            docId: d.id,
            fileName: d.file_name,
            docType: d.doc_type,
            fileSize: d.file_size,
            uploadedAt: d.created_at,
          })),
        };
      } catch (perInvErr) {
        // One investor failing shouldn't take down the whole list.
        console.error('[DashboardDocs] failed to load docs for investor ' + inv.id, perInvErr.message);
        return null;
      }
    }));

    res.json({ success: true, investors: buckets.filter(Boolean) });
  } catch (err) {
    console.error('[DashboardDocs] list error:', err);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.get('/api/:investorId/:docId', async (req, res) => {
  try {
    const token = getAuthToken(req);
    const config = await loadOrSyncDashboardDoc(req.params.investorId, req.params.docId, token);
    if (!config) return res.status(404).json({ success: false, message: 'Document not found' });
    res.json({ success: true, template: config });
  } catch (err) {
    console.error('[DashboardDocs] get config error:', err);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.put('/api/:investorId/:docId', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const token = getAuthToken(req);
    const config = await loadOrSyncDashboardDoc(req.params.investorId, req.params.docId, token);
    if (!config) return res.status(404).json({ success: false, message: 'Document not found' });

    // Only fields are user-editable on dashboard docs (everything else
    // comes from the dashboard). We accept the same-shape PUT body the
    // local templates route accepts so editor.js needs no changes.
    if (Array.isArray(req.body.fields)) {
      config.fields = req.body.fields;
    }
    dashboardDocStore.writeConfig(req.params.investorId, req.params.docId, config);
    res.json({ success: true, template: config });
  } catch (err) {
    console.error('[DashboardDocs] put config error:', err);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.post('/api/:investorId/:docId/fill', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const token = getAuthToken(req);
    const config = await loadOrSyncDashboardDoc(req.params.investorId, req.params.docId, token);
    if (!config) return res.status(404).json({ success: false, message: 'Document not found' });

    const bytes = dashboardDocStore.readPdfBytes(req.params.investorId, req.params.docId);
    if (!bytes) return res.status(404).json({ success: false, message: 'Cached PDF missing' });

    // Reuse templateService's pdf-lib filler. It expects a real config
    // file at lib/pdf/templateService.js's storage path, so we go through
    // the lower-level fillBytes helper instead.
    const filled = await fillPdfBytes(bytes, config.fields, req.body.fields || {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + safeFilename(config.name) + '-filled.pdf"');
    res.send(Buffer.from(filled));
  } catch (err) {
    console.error('[DashboardDocs] fill error:', err);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.get('/api/:investorId/:docId/download', async (req, res) => {
  try {
    const token = getAuthToken(req);
    // Trigger a sync so first-time downloaders also get a cached copy.
    const config = await loadOrSyncDashboardDoc(req.params.investorId, req.params.docId, token);
    if (!config) return res.status(404).json({ success: false, message: 'Document not found' });

    const bytes = dashboardDocStore.readPdfBytes(req.params.investorId, req.params.docId);
    if (!bytes) return res.status(404).json({ success: false, message: 'Cached PDF missing' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="' + safeFilename(config.name) + '"');
    res.send(bytes);
  } catch (err) {
    console.error('[DashboardDocs] download error:', err);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

/* ---- helpers ---- */

function safeFilename(name) {
  return String(name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'document';
}

/** Inline AcroForm filler that mirrors templateService.fillTemplate but
 *  works on raw bytes + a fields-config array (rather than reading from
 *  the local templates registry). Intentionally a near-copy so any future
 *  fix to one path can be ported to the other. */
async function fillPdfBytes(pdfBytes, fieldsConfig, formData) {
  const { PDFDocument } = require('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  for (const fc of fieldsConfig || []) {
    const value = formData[fc.pdfField];
    if (value == null || value === '') continue;
    try {
      if (fc.type === 'checkbox') {
        const cb = form.getCheckBox(fc.pdfField);
        if (value === true || value === 'true' || value === 'on' || value === '1') cb.check();
        else cb.uncheck();
      } else if (fc.type === 'dropdown' || fc.type === 'select') {
        form.getDropdown(fc.pdfField).select(String(value));
      } else if (fc.type === 'radio') {
        form.getRadioGroup(fc.pdfField).select(String(value));
      } else {
        form.getTextField(fc.pdfField).setText(String(value).slice(0, 2000));
      }
    } catch (_e) {
      // Field missing or type mismatch — skip silently, matches templateService behavior.
    }
  }

  return pdfDoc.save();
}

module.exports = router;
