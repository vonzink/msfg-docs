/* =====================================================
   MSFG Document Creator — Workspace helpers
   Zoom-into-iframe + toast — ported from msfg-calc so the
   workspace panel UX stays in sync between the two apps.
   ===================================================== */
(function() {
  'use strict';

  var MSFG = window.MSFG || (window.MSFG = {});

  /** Stamp `body.embed-mode { zoom: N% }` into the iframe's document so
   *  every nested layout shrinks together. CSS `zoom` is non-standard but
   *  every browser we care about supports it; transform: scale would
   *  leave layout sized for the original viewport. */
  function applyZoomToNestedIframe(nested, zoomDecimal) {
    try {
      var nestedDoc = nested.contentDocument || nested.contentWindow.document;
      if (nestedDoc && nestedDoc.body) {
        nestedDoc.body.classList.add('embed-mode');
        var existing = nestedDoc.getElementById('ws-embed-zoom');
        if (existing) {
          existing.textContent = 'body.embed-mode { zoom: ' + zoomDecimal + '; }';
        } else {
          var style = nestedDoc.createElement('style');
          style.id = 'ws-embed-zoom';
          style.textContent = 'body.embed-mode { zoom: ' + zoomDecimal + '; }';
          nestedDoc.head.appendChild(style);
        }
      }
    } catch (_e) { /* cross-origin nested */ }
  }

  function applyZoomToIframe(iframe, zoomValue) {
    var zoomDecimal = zoomValue / 100;
    try {
      var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc || !iframeDoc.body) return;
      iframeDoc.body.classList.add('embed-mode');
      var existing = iframeDoc.getElementById('ws-embed-zoom');
      if (existing) {
        existing.textContent = 'body.embed-mode { zoom: ' + zoomDecimal + '; }';
      } else {
        var style = iframeDoc.createElement('style');
        style.id = 'ws-embed-zoom';
        style.textContent = 'body.embed-mode { zoom: ' + zoomDecimal + '; }';
        iframeDoc.head.appendChild(style);
      }
      // Re-apply to nested iframes (the template / dashboard-doc fill
      // page itself may host an iframe for PDF preview).
      var nested = iframeDoc.querySelectorAll('iframe');
      nested.forEach(function(inner) {
        applyZoomToNestedIframe(inner, zoomDecimal);
        inner.removeEventListener('load', inner._wsZoomHandler);
        inner._wsZoomHandler = function() { applyZoomToNestedIframe(inner, zoomDecimal); };
        inner.addEventListener('load', inner._wsZoomHandler);
      });
    } catch (_e) { /* cross-origin */ }
  }

  function showToast(msg, type) {
    var t = document.createElement('div');
    t.style.cssText =
      'position:fixed;bottom:24px;right:24px;display:flex;align-items:center;gap:8px;' +
      'padding:12px 20px;background:' + (type === 'error' ? '#dc3545' : '#2d6a4f') + ';color:#fff;' +
      'font-size:.88rem;font-weight:500;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);' +
      'z-index:10000;transform:translateY(20px);opacity:0;transition:all .3s ease;pointer-events:none;';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function() { t.style.transform = 'translateY(0)'; t.style.opacity = '1'; });
    setTimeout(function() {
      t.style.transform = 'translateY(20px)'; t.style.opacity = '0';
      setTimeout(function() { t.remove(); }, 300);
    }, 2500);
  }

  MSFG.WS = MSFG.WS || {};
  MSFG.WS.applyZoomToIframe = applyZoomToIframe;
  MSFG.WS.showToast = showToast;
})();
