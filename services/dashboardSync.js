'use strict';

/**
 * Lightweight helpers for the per-tool investor-PDF flow.
 *
 * Used by routes/pdf.js when the 4506-C / SSA-89 generator should
 * stamp worksheet fields onto an investor's pre-filled PDF instead
 * of the blank IRS template. routes/dashboardDocs.js still owns the
 * heavier loadOrSyncDashboardDoc path (metadata + AcroForm detection
 * + field-mapping persistence) used by the editor.
 */

const dashboardClient = require('./dashboardClient');
const dashboardDocStore = require('./dashboardDocStore');

/**
 * Ensure the investor's PDF is cached locally and return its bytes.
 * Re-fetches from S3 (via the dashboard's presigned URL) when the
 * file_key has changed since the last sync, so admins can re-upload
 * a corrected PDF and msfg-docs will pick it up next request.
 *
 * @param {number|string} investorId
 * @param {number|string} docId
 * @param {string|null} token  Cognito Bearer to forward to the dashboard
 * @returns {Promise<Buffer|null>} PDF bytes, or null if the doc is gone
 */
async function ensurePdfBytes(investorId, docId, token) {
  const docs = await dashboardClient.listInvestorDocuments(investorId, token);
  const doc = (docs || []).find((d) => String(d.id) === String(docId));
  if (!doc) return null;

  const persisted = dashboardDocStore.readConfig(investorId, docId);
  const cachedBytes = dashboardDocStore.readPdfBytes(investorId, docId);
  const fresh = persisted
    && persisted.dashboardMeta
    && persisted.dashboardMeta.fileKey === doc.file_key
    && cachedBytes;

  if (fresh) return cachedBytes;

  if (!doc.download_url) {
    throw new Error('Dashboard returned no download_url for doc ' + docId);
  }
  const bytes = await dashboardClient.fetchDocumentBytes(doc.download_url);
  dashboardDocStore.writePdfBytes(investorId, docId, bytes);
  return bytes;
}

module.exports = { ensurePdfBytes };
