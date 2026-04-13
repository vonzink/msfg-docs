/* =====================================================
   MSFG Document Creator — Report Template Registry
   Extractors for each document type.
   ===================================================== */
(function() {
  'use strict';

  window.MSFG = window.MSFG || {};

  const extractors = {};
  const renderers = {};

  MSFG.ReportTemplates = {

    extractors: extractors,
    renderers: renderers,

    registerExtractor: function(slug, fn) {
      extractors[slug] = fn;
    },

    registerRenderer: function(slug, fn) {
      renderers[slug] = fn;
    },

    extract: function(slug, doc) {
      const fn = extractors[slug];
      if (!fn) return null;
      try {
        return fn(doc);
      } catch (e) {
        console.error('Extractor error for ' + slug + ':', e);
        return null;
      }
    },

    render: function(slug, data) {
      const fn = renderers[slug];
      if (fn) {
        try { return fn(data); } catch (e) { console.error('Renderer error:', e); }
      }
      // Default table-based renderer
      return MSFG.ReportTemplates.defaultRender(data);
    },

    defaultRender: function(data) {
      if (!data || !data.sections) return '<p class="rpt-no-template">No data available.</p>';
      let html = '';
      data.sections.forEach(function(sec) {
        html += '<div class="rpt-section">';
        html += '<div class="rpt-section-title">' + MSFG.escHtml(sec.heading) + '</div>';
        html += '<table class="rpt-table"><tbody>';
        sec.rows.forEach(function(row) {
          if (row.isTotal) {
            html += '</tbody></table>';
            html += '<div class="rpt-grand-total"><span>' + MSFG.escHtml(row.label) + '</span><span>' + MSFG.escHtml(row.value) + '</span></div>';
            html += '<table class="rpt-table"><tbody>';
          } else {
            html += '<tr><td>' + MSFG.escHtml(row.label) + '</td><td class="rpt-num">' + MSFG.escHtml(row.value) + '</td></tr>';
          }
        });
        html += '</tbody></table></div>';
      });
      return html;
    }
  };
})();
