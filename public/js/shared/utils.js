/* =====================================================
   MSFG Document Creator — Shared Utilities
   ===================================================== */
'use strict';

const MSFG = window.MSFG || {};

MSFG.parseNum = function(val) {
  if (typeof val === 'string') val = val.replace(/[,$]/g, '');
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

MSFG.formatCurrency = function(amount, decimals) {
  if (typeof decimals === 'undefined') decimals = 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(amount);
};

MSFG.formatPercent = function(rate, decimals) {
  if (typeof decimals === 'undefined') decimals = 3;
  return rate.toFixed(decimals) + '%';
};

MSFG.formatNumber = function(num, decimals) {
  if (typeof decimals === 'undefined') decimals = 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num);
};

MSFG.escHtml = function(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

MSFG.el = function(id) { return document.getElementById(id); };
MSFG.qs = function(sel, ctx) { return (ctx || document).querySelector(sel); };
MSFG.qsa = function(sel, ctx) { return (ctx || document).querySelectorAll(sel); };

/**
 * Build an absolute-on-origin URL from an app-relative path.
 * Prepends window.__MSFG_BASE_PATH__ (when the app is mounted under a
 * sub-path like "/docs"), and — if set — window.__MSFG_APP_ORIGIN__ for
 * cross-origin embeds.
 *
 * MSFG.apiUrl('/api/pdf/credit-inquiry') →
 *    '/api/pdf/credit-inquiry'                    (dev, root mount)
 *    '/docs/api/pdf/credit-inquiry'               (behind /docs)
 *    'https://dashboard.msfgco.com/docs/api/...'  (cross-origin)
 */
function _readMeta(name) {
  if (typeof document === 'undefined') return '';
  const m = document.querySelector('meta[name="' + name + '"]');
  return m ? (m.getAttribute('content') || '') : '';
}

MSFG.apiUrl = function(path) {
  const p = String(path || '');
  const abs = p.startsWith('/') ? p : '/' + p;
  // Prefer meta-tag (CSP-safe). Fall back to legacy window globals.
  let basePath = _readMeta('msfg-base-path')
    || (typeof window !== 'undefined' && window.__MSFG_BASE_PATH__) || '';
  basePath = String(basePath).trim().replace(/\/$/, '');
  // Avoid double-prefixing if caller already included the basePath.
  const withBase = basePath && !abs.startsWith(basePath + '/') && abs !== basePath
    ? basePath + abs
    : abs;
  let origin = _readMeta('msfg-app-origin')
    || (typeof window !== 'undefined' && window.__MSFG_APP_ORIGIN__) || '';
  origin = String(origin).trim().replace(/\/$/, '');
  if (origin.endsWith('/api')) origin = origin.slice(0, -4).replace(/\/$/, '');
  if (!origin) return withBase;
  return origin + withBase;
};

/** Short alias for building app-relative URLs in dynamic HTML. */
MSFG.appUrl = MSFG.apiUrl;

/**
 * Read the Cognito auth token from where the parent dashboard stores it.
 * The dashboard writes the same JWT to localStorage, sessionStorage, and a
 * shared *.msfgco.com cookie. The cookie path and SameSite settings can vary
 * across browsers and iframe contexts, so we explicitly source from storage
 * (most reliable across same-origin iframes) before falling back to cookie.
 */
MSFG.getAuthToken = function() {
  try {
    if (typeof localStorage !== 'undefined') {
      var ls = localStorage.getItem('auth_token');
      if (ls) return ls;
    }
  } catch (_e) { /* storage may be blocked */ }
  try {
    if (typeof sessionStorage !== 'undefined') {
      var ss = sessionStorage.getItem('auth_token');
      if (ss) return ss;
    }
  } catch (_e) { /* storage may be blocked */ }
  try {
    if (typeof document !== 'undefined' && document.cookie) {
      var m = document.cookie.match(/(?:^|;\s*)auth_token=([^;]*)/);
      if (m) return decodeURIComponent(m[1]);
    }
  } catch (_e) { /* cookie may be blocked */ }
  return null;
};

/**
 * Wrapper around fetch that automatically attaches the Cognito Bearer token
 * from MSFG.getAuthToken(). Use for all calls to /docs/api/* — the dashboard
 * does not auto-share its token with this app, so we must attach it ourselves.
 */
MSFG.fetch = function(input, init) {
  init = init || {};
  var headers = new Headers(init.headers || {});
  var token = MSFG.getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', 'Bearer ' + token);
  }
  init.headers = headers;
  // Same-origin by default; explicit so cookies still flow in case fallback
  // auth via cookie ever becomes available.
  if (!init.credentials) init.credentials = 'same-origin';
  return fetch(input, init);
};

/* Mobile menu toggle + doc metadata from data attributes */
document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.getElementById('mobileMenuToggle');
  if (toggle) {
    toggle.addEventListener('click', function() {
      const nav = document.querySelector('.site-header__nav');
      if (nav) nav.classList.toggle('open');
    });
  }

  // Read document metadata from data attributes
  const main = document.querySelector('.site-main');
  if (main) {
    if (main.dataset.docIcon) window.__docIcon = main.dataset.docIcon;
    if (main.dataset.docSlug) window.__docSlug = main.dataset.docSlug;
  }

  // Apply dynamic colors from data attributes (CSP-safe)
  document.querySelectorAll('[data-color]').forEach(function(el) {
    el.style.backgroundColor = el.dataset.color;
  });
  document.querySelectorAll('[data-border-color]').forEach(function(el) {
    el.style.borderLeftColor = el.dataset.borderColor;
  });
  document.querySelectorAll('[data-max-width]').forEach(function(el) {
    el.style.maxWidth = el.dataset.maxWidth + 'px';
  });
});

window.MSFG = MSFG;
