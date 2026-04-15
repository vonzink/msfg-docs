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
MSFG.apiUrl = function(path) {
  const p = String(path || '');
  const abs = p.startsWith('/') ? p : '/' + p;
  let basePath = (typeof window !== 'undefined' && window.__MSFG_BASE_PATH__) || '';
  basePath = String(basePath).trim().replace(/\/$/, '');
  // Avoid double-prefixing if caller already included the basePath.
  const withBase = basePath && !abs.startsWith(basePath + '/') && abs !== basePath
    ? basePath + abs
    : abs;
  let origin = (typeof window !== 'undefined' && window.__MSFG_APP_ORIGIN__) || '';
  origin = String(origin).trim().replace(/\/$/, '');
  if (origin.endsWith('/api')) origin = origin.slice(0, -4).replace(/\/$/, '');
  if (!origin) return withBase;
  return origin + withBase;
};

/** Short alias for building app-relative URLs in dynamic HTML. */
MSFG.appUrl = MSFG.apiUrl;

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
