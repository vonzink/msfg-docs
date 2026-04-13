/* =====================================================
   MSFG Document Creator — Report Manager
   Captures structured document data for session reports.
   Uses IndexedDB for storage.
   ===================================================== */

(function() {
  'use strict';

  const DB_NAME = 'msfg-docs-report';
  const STORE_NAME = 'items';
  const DB_VERSION = 1;
  const MAX_ITEMS = 30;
  let _db = null;
  let _ready = null;

  window.MSFG = window.MSFG || {};

  /* ---- IndexedDB setup ---- */
  function openDB() {
    if (_ready) return _ready;
    _ready = new Promise(function(resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = function(e) {
        _db = e.target.result;
        resolve(_db);
      };
      req.onerror = function() {
        console.warn('IndexedDB unavailable, report will not persist.');
        reject(req.error);
      };
    });
    return _ready;
  }

  function dbGetAll() {
    return openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = function() {
          const items = req.result || [];
          items.sort(function(a, b) {
            const aOrd = typeof a.order === 'number' ? a.order : Infinity;
            const bOrd = typeof b.order === 'number' ? b.order : Infinity;
            if (aOrd !== bOrd) return aOrd - bOrd;
            return new Date(a.timestamp) - new Date(b.timestamp);
          });
          resolve(items);
        };
        req.onerror = function() { reject(req.error); };
      });
    }).catch(function() { return []; });
  }

  function dbPut(item) {
    return openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(item);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  function dbDelete(id) {
    return openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  function dbClear() {
    return openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  function dbCount() {
    return openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.count();
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
      });
    }).catch(function() { return 0; });
  }

  function enforceMax() {
    return dbGetAll().then(function(items) {
      if (items.length <= MAX_ITEMS) return;
      const toRemove = items.slice(0, items.length - MAX_ITEMS);
      const promises = toRemove.map(function(item) { return dbDelete(item.id); });
      return Promise.all(promises);
    });
  }

  function generateId() {
    return 'rpt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  }

  /* ---- Shared toast notification ---- */
  function showToast(message, type) {
    const hasToastCSS = !!document.querySelector('link[href*="components.css"]');
    const toast = document.createElement('div');

    if (hasToastCSS) {
      toast.className = 'report-toast report-toast--' + (type || 'success');
      toast.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
        '<span>' + message + '</span>';
      document.body.appendChild(toast);
      requestAnimationFrame(function() { toast.classList.add('show'); });
      setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 300);
      }, 2500);
    } else {
      toast.style.cssText =
        'position:fixed;bottom:24px;right:24px;display:flex;align-items:center;gap:8px;' +
        'padding:12px 20px;background:' + (type === 'error' ? '#dc3545' : '#2d6a4f') + ';color:#fff;' +
        'font-size:.88rem;font-weight:500;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);' +
        'z-index:10000;transform:translateY(20px);opacity:0;transition:all .3s ease;pointer-events:none;';
      toast.textContent = message;
      document.body.appendChild(toast);
      requestAnimationFrame(function() { toast.style.transform = 'translateY(0)'; toast.style.opacity = '1'; });
      setTimeout(function() {
        toast.style.transform = 'translateY(20px)'; toast.style.opacity = '0';
        setTimeout(function() { toast.remove(); }, 300);
      }, 2500);
    }
  }

  /* ---- Lazy-load report templates on first capture ---- */
  let _templatesLoaded = false;
  let _templatesPromise = null;

  function loadScript(src) {
    return new Promise(function(resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function() { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function loadTemplates() {
    if (_templatesLoaded || (MSFG.ReportTemplates && MSFG.ReportTemplates.extractors && Object.keys(MSFG.ReportTemplates.extractors).length > 0)) {
      _templatesLoaded = true;
      return Promise.resolve();
    }
    if (_templatesPromise) return _templatesPromise;

    let ver = '';
    const main = document.querySelector('.site-main');
    if (main && main.dataset.ver) ver = '?v=' + main.dataset.ver;
    const ext = (main && main.dataset.jsExt) || '.js';

    let basePath = '';
    const reportScript = document.querySelector('script[src*="report"]');
    if (reportScript && reportScript.src) {
      const match = reportScript.src.match(/^https?:\/\/[^/]+(\/.*?)\/js\/shared\/report/);
      if (match && match[1]) basePath = match[1];
    }

    _templatesPromise = loadScript(basePath + '/js/shared/report-templates' + ext + ver).then(function() {
      _templatesLoaded = true;
    });

    return _templatesPromise;
  }

  /* ---- Public API ---- */
  MSFG.Report = {

    getItems: function() {
      return dbGetAll();
    },

    addItem: function(item) {
      const self = this;
      return dbGetAll().then(function(items) {
        let maxOrder = 0;
        items.forEach(function(it) {
          if (typeof it.order === 'number' && it.order > maxOrder) maxOrder = it.order;
        });

        const newItem = {
          id: generateId(),
          name: item.name || 'Document',
          icon: item.icon || '',
          slug: item.slug || '',
          timestamp: new Date().toISOString(),
          data: item.data || null,
          version: 2,
          order: maxOrder + 1
        };

        return dbPut(newItem).then(function() {
          return enforceMax();
        }).then(function() {
          self._updateBadge();
          return newItem.id;
        });
      });
    },

    removeItem: function(id) {
      const self = this;
      return dbDelete(id).then(function() {
        self._updateBadge();
      });
    },

    clear: function() {
      const self = this;
      return dbClear().then(function() {
        self._updateBadge();
      });
    },

    getCount: function() {
      return dbCount();
    },

    reorderItems: function(orderedIds) {
      return dbGetAll().then(function(items) {
        const byId = {};
        items.forEach(function(item) { byId[item.id] = item; });
        const promises = [];
        orderedIds.forEach(function(id, idx) {
          if (byId[id]) {
            byId[id].order = idx + 1;
            promises.push(dbPut(byId[id]));
          }
        });
        return Promise.all(promises);
      });
    },

    _updateBadge: function() {
      const badge = document.getElementById('reportBadge');
      if (!badge) return;
      dbCount().then(function(count) {
        badge.textContent = count;
        badge.classList.toggle('u-hidden', count === 0);
      });
    },

    _showToast: showToast,

    /**
     * Capture structured data from a document and add to report.
     */
    captureStructured: function(slug, docName, docIcon, baseDoc) {
      const self = this;

      return loadTemplates().then(function() {
        if (!MSFG.ReportTemplates || !MSFG.ReportTemplates.extractors[slug]) {
          showToast('No report template for this document', 'error');
          return Promise.reject(new Error('No extractor for: ' + slug));
        }

        const data = MSFG.ReportTemplates.extract(slug, baseDoc);

        if (!data) {
          showToast('Could not extract data', 'error');
          return Promise.reject(new Error('Extraction returned null'));
        }

        return self.addItem({
          name: docName,
          icon: docIcon,
          slug: slug,
          data: data
        }).then(function() {
          showToast('Added to report');
        });
      }).catch(function(err) {
        console.error('Report save failed:', err);
        showToast('Failed to save — try again', 'error');
        throw err;
      });
    },

    captureCurrentDocument: function(docName, docIcon) {
      const self = this;
      const slug = window.__docSlug || '';

      if (!slug) {
        showToast('No report template available', 'error');
        return Promise.reject(new Error('No slug'));
      }

      return loadTemplates().then(function() {
        if (MSFG.ReportTemplates && MSFG.ReportTemplates.extractors[slug]) {
          return self.captureStructured(slug, docName, docIcon, document);
        }
        showToast('No report template available', 'error');
        return Promise.reject(new Error('No extractor for: ' + slug));
      });
    }
  };

  /* ---- SVG icons ---- */
  const SVG_ADD =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
      '<polyline points="14 2 14 8 20 8"/>' +
      '<line x1="12" y1="18" x2="12" y2="12"/>' +
      '<line x1="9" y1="15" x2="15" y2="15"/>' +
    '</svg>';

  const SVG_CHECK =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
      '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' +
    '</svg>';

  const SVG_SPINNER =
    '<svg class="report-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
      '<circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-dashoffset="0"/>' +
    '</svg>';

  /* ---- Shared click handler ---- */
  function handleReportClick(btn, docName, docIcon, defaultContent) {
    btn.disabled = true;
    btn.innerHTML = SVG_SPINNER;

    MSFG.Report.captureCurrentDocument(docName, docIcon).then(function() {
      btn.disabled = false;
      btn.innerHTML = SVG_CHECK;
      btn.style.color = 'var(--brand-primary)';
      btn.style.borderColor = 'var(--brand-primary)';
      setTimeout(function() {
        btn.innerHTML = defaultContent;
        btn.style.color = '';
        btn.style.borderColor = '';
      }, 1500);
    }).catch(function() {
      btn.disabled = false;
      btn.innerHTML = defaultContent;
    });
  }

  /* ---- Auto-inject button on DOMContentLoaded ---- */
  document.addEventListener('DOMContentLoaded', function() {
    MSFG.Report._updateBadge();

    if (window.location.search.indexOf('embed=1') !== -1) return;
    if (window.top !== window && !document.querySelector('.doc-page__header')) return;

    const docHeader = document.querySelector('.doc-page__header');

    if (docHeader) {
      const h1 = docHeader.querySelector('h1');
      const docName = h1 ? h1.textContent.trim() : document.title;
      const docIcon = (typeof window.__docIcon !== 'undefined') ? window.__docIcon : '';

      const btn = document.createElement('button');
      btn.className = 'report-add-btn';
      btn.title = 'Add to Report';
      const defaultContent = SVG_ADD;
      btn.innerHTML = defaultContent;

      btn.addEventListener('click', function() {
        handleReportClick(btn, docName, docIcon, defaultContent);
      });

      const headerWrapper = document.createElement('div');
      headerWrapper.className = 'doc-page__header-actions';
      headerWrapper.appendChild(btn);
      docHeader.appendChild(headerWrapper);
    }
  });
})();
