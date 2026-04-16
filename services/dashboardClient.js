'use strict';

/**
 * Server-side client for the dashboard.msfgco.com backend.
 *
 * Used by the dashboard-docs flow: list investors, list an investor's
 * uploaded documents, and download a single document's bytes from the
 * presigned S3 URL the dashboard returns.
 *
 * Auth: forward the user's Cognito Bearer token. msfg-docs and dashboard
 * share the same Cognito user pool, so the same JWT validates on both
 * sides. Endpoints that require requireAdmin will reject non-admin users
 * — that's the dashboard's call, we just pass the token through.
 *
 * Origin: defaults to the dashboard backend prod origin (api.msfgco.com,
 * NOT dashboard.msfgco.com — the latter serves only the static SPA via
 * CloudFront/S3, the API lives on a separate subdomain). Override with
 * DASHBOARD_API_ORIGIN in .env for staging or local dev. A trailing /api
 * is tolerated — we strip it so callers can always do origin + '/api/x'.
 */

function dashboardOrigin() {
  let o = String(process.env.DASHBOARD_API_ORIGIN || 'https://api.msfgco.com').trim();
  o = o.replace(/\/$/, '');
  if (o.endsWith('/api')) o = o.slice(0, -4).replace(/\/$/, '');
  return o;
}

async function fetchJson(url, token) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { headers });
  const text = await r.text();
  if (!r.ok) {
    const snippet = text.length > 200 ? text.slice(0, 200) + '…' : text;
    const err = new Error('Dashboard API ' + r.status + ' ' + url + ' — ' + snippet);
    err.status = r.status;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (_e) {
    throw new Error('Dashboard API returned non-JSON for ' + url);
  }
}

/**
 * GET /api/investors → [{ id, investor_key, name, is_active, ... }]
 * Lightweight list — the dashboard's public investor endpoint.
 */
async function listInvestors(token) {
  return fetchJson(dashboardOrigin() + '/api/investors', token);
}

/**
 * GET /api/investors/:id/documents
 * → [{ id, investor_id, file_name, file_key, file_size, file_type,
 *       doc_type, uploaded_by, created_at, download_url }]
 *
 * download_url is a presigned S3 URL valid ~20 minutes — fine for both
 * end-user downloads and our server-side PDF fetch.
 */
async function listInvestorDocuments(investorId, token) {
  return fetchJson(
    dashboardOrigin() + '/api/investors/' + encodeURIComponent(investorId) + '/documents',
    token
  );
}

/**
 * Download a document's bytes from its presigned S3 URL. No auth needed —
 * the URL itself carries the signature. Returns a Buffer.
 */
async function fetchDocumentBytes(downloadUrl) {
  const r = await fetch(downloadUrl);
  if (!r.ok) throw new Error('S3 download failed (HTTP ' + r.status + ')');
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

module.exports = {
  dashboardOrigin,
  listInvestors,
  listInvestorDocuments,
  fetchDocumentBytes,
};
