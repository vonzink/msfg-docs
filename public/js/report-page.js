/* =====================================================
   MSFG Document Creator — Report Page
   Branded report cards, drag-to-reorder, pdfmake PDF.
   ===================================================== */
(function() {
  'use strict';

  var itemsContainer = document.getElementById('reportItems');
  var emptyState = document.getElementById('reportEmpty');
  var actionsBar = document.getElementById('reportActions');
  var countEl = document.getElementById('reportCount');

  var reportPageEl = document.getElementById('reportPage');
  var cfg = {};
  try { cfg = JSON.parse(reportPageEl.dataset.siteConfig || '{}'); } catch (e) { /* ignore */ }
  var COMPANY_NAME = cfg.companyName || 'Mountain State Financial Group LLC';
  var COMPANY = COMPANY_NAME + (cfg.nmls ? ', NMLS# ' + cfg.nmls : '');
  var LOGO_URL = cfg.logo || '/images/msfg-logo.png';
  var DOMAIN = cfg.domain || 'msfginfo.com';
  var EHL_URL = cfg.equalHousingLogo || '';

  var DRAG_HANDLE_SVG =
    '<svg class="report-item__drag-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">' +
      '<circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/>' +
      '<circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>' +
      '<circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/>' +
    '</svg>';

  function formatTime(iso) {
    var d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) +
           ' — ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  /* ---- Branded card wrapper ---- */
  function brandedHeader(name, icon) {
    return '<div class="rpt-brand-bar">' +
      '<img src="' + LOGO_URL + '" class="rpt-brand-logo" alt="MSFG">' +
      '<div class="rpt-brand-calc">' + icon + ' ' + name + '</div>' +
    '</div>';
  }
  function brandedFooter(timestamp) {
    var ehlHtml = EHL_URL
      ? '<div class="rpt-brand-ehl"><img src="' + EHL_URL + '" alt="Equal Housing Lender" class="rpt-brand-ehl-img" onerror="this.parentElement.innerHTML=\'Equal Housing Lender\'"></div>'
      : '';
    return '<div class="rpt-brand-footer-divider"></div>' +
      ehlHtml +
      '<div class="rpt-brand-footer">' +
        '<span>' + COMPANY + '</span>' +
        '<span>' + formatDate(timestamp) + '</span>' +
        '<span>' + DOMAIN + '</span>' +
      '</div>';
  }

  /* ---- Build a report card element ---- */
  function buildCard(item, bodyContent) {
    var div = document.createElement('div');
    div.className = 'report-item';
    div.setAttribute('data-id', item.id);
    div.setAttribute('draggable', 'true');
    div.innerHTML =
      '<div class="report-item__header">' +
        '<div class="report-item__drag-handle" title="Drag to reorder">' + DRAG_HANDLE_SVG + '</div>' +
        '<div class="report-item__info">' +
          '<span class="report-item__icon">' + item.icon + '</span>' +
          '<span class="report-item__name">' + item.name + '</span>' +
          '<span class="report-item__time">' + formatTime(item.timestamp) + '</span>' +
        '</div>' +
        '<button class="report-item__remove" data-id="' + item.id + '">Remove</button>' +
      '</div>' +
      '<div class="report-item__body">' +
        brandedHeader(item.name, item.icon) +
        bodyContent +
        brandedFooter(item.timestamp) +
      '</div>';
    return div;
  }

  /* ---- Drag & Drop Reordering ---- */
  var dragSrcEl = null;

  function handleDragStart(e) {
    dragSrcEl = this;
    this.classList.add('report-item--dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.id);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var target = e.target.closest('.report-item');
    if (!target || target === dragSrcEl) return;
    var rect = target.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    document.querySelectorAll('.report-item--drag-over-top, .report-item--drag-over-bottom').forEach(function(el) {
      el.classList.remove('report-item--drag-over-top', 'report-item--drag-over-bottom');
    });
    if (e.clientY < midY) {
      target.classList.add('report-item--drag-over-top');
    } else {
      target.classList.add('report-item--drag-over-bottom');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    var target = e.target.closest('.report-item');
    if (!target || !dragSrcEl || target === dragSrcEl) return;

    var rect = target.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      itemsContainer.insertBefore(dragSrcEl, target);
    } else {
      itemsContainer.insertBefore(dragSrcEl, target.nextSibling);
    }

    var orderedIds = [];
    itemsContainer.querySelectorAll('.report-item').forEach(function(el) {
      orderedIds.push(el.dataset.id);
    });
    MSFG.Report.reorderItems(orderedIds);
  }

  function handleDragEnd() {
    this.classList.remove('report-item--dragging');
    document.querySelectorAll('.report-item--drag-over-top, .report-item--drag-over-bottom').forEach(function(el) {
      el.classList.remove('report-item--drag-over-top', 'report-item--drag-over-bottom');
    });
  }

  function attachDragHandlers(card) {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('dragend', handleDragEnd);
  }

  /* ---- Render all items ---- */
  function renderItems(items) {
    itemsContainer.innerHTML = '';
    if (!items.length) {
      emptyState.style.display = '';
      actionsBar.classList.add('u-hidden');
      countEl.textContent = '';
      return;
    }

    emptyState.style.display = 'none';
    actionsBar.classList.remove('u-hidden');
    countEl.textContent = '(' + items.length + ')';

    items.forEach(function(item) {
      var content;
      if (item.version === 2 && item.data && MSFG.ReportTemplates) {
        content = MSFG.ReportTemplates.render(item.slug, item.data);
      } else {
        content = '<p class="rpt-no-template">No template available for this document.</p>';
      }
      var card = buildCard(item, content);
      itemsContainer.appendChild(card);
      attachDragHandlers(card);
    });

    // Wire up remove buttons
    itemsContainer.querySelectorAll('.report-item__remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.dataset.id;
        MSFG.Report.removeItem(id).then(function() {
          loadAndRender();
        });
      });
    });
  }

  function loadAndRender() {
    MSFG.Report.getItems().then(renderItems);
  }

  /* ---- Actions ---- */
  var printBtn = document.getElementById('btnPrintReport');
  var pdfBtn = document.getElementById('btnPdfReport');
  var clearBtn = document.getElementById('btnClearReport');

  if (printBtn) printBtn.addEventListener('click', function() { window.print(); });
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      if (confirm('Remove all items from the session report?')) {
        MSFG.Report.clear().then(loadAndRender);
      }
    });
  }

  if (pdfBtn) {
    pdfBtn.addEventListener('click', function() {
      MSFG.Report.getItems().then(function(items) {
        if (!items.length) return;
        var content = [];
        items.forEach(function(item, idx) {
          if (idx > 0) content.push({ text: '', pageBreak: 'before' });
          content.push({ text: item.icon + ' ' + item.name, style: 'header', margin: [0, 0, 0, 8] });
          if (item.data && item.data.sections) {
            item.data.sections.forEach(function(sec) {
              content.push({ text: sec.heading, style: 'subheader', margin: [0, 8, 0, 4] });
              var tableBody = [];
              sec.rows.forEach(function(row) {
                tableBody.push([
                  { text: row.label || '', fontSize: 9, color: '#555' },
                  { text: row.value || '', fontSize: 9, alignment: 'right', bold: !!row.isTotal }
                ]);
              });
              if (tableBody.length) {
                content.push({
                  table: { widths: ['*', 'auto'], body: tableBody },
                  layout: 'lightHorizontalLines',
                  margin: [0, 0, 0, 4]
                });
              }
            });
          }
        });
        var dd = {
          content: content,
          styles: {
            header: { fontSize: 14, bold: true, color: '#2d6a4f' },
            subheader: { fontSize: 11, bold: true, color: '#1b4332' }
          },
          footer: function(currentPage, pageCount) {
            return {
              columns: [
                { text: COMPANY, fontSize: 7, color: '#999', margin: [40, 0, 0, 0] },
                { text: 'Page ' + currentPage + ' of ' + pageCount, fontSize: 7, color: '#999', alignment: 'right', margin: [0, 0, 40, 0] }
              ]
            };
          },
          pageSize: 'LETTER',
          pageMargins: [40, 40, 40, 30]
        };
        pdfMake.createPdf(dd).download('MSFG-Document-Report.pdf');
      });
    });
  }

  /* ---- Init ---- */
  loadAndRender();
})();
