'use strict';

/**
 * Shared document email + print module.
 *
 * Each document registers an email-data provider via:
 *   MSFG.DocActions.register(getEmailData)
 *
 * getEmailData() should return:
 *   { title: 'Document Name', sections: [ { heading, rows: [{label, value}] } ] }
 */
(function () {
  'use strict';

  let _getEmailData = null;

  /* ---- Print ---- */
  function handlePrint() {
    window.print();
  }

  /* ---- Email modal ---- */
  const overlay = document.getElementById('emailModalOverlay');
  const closeBtn = document.getElementById('emailModalClose');
  const cancelBtn = document.getElementById('emailModalCancel');
  const sendBtn = document.getElementById('emailSendBtn');
  const previewToggle = document.getElementById('emailPreviewToggle');
  const previewWrap = document.getElementById('emailPreview');
  const previewContent = document.getElementById('emailPreviewContent');
  const statusEl = document.getElementById('emailStatus');
  const toInput = document.getElementById('emailTo');
  const subjectInput = document.getElementById('emailSubject');
  const messageInput = document.getElementById('emailMessage');

  function openModal() {
    if (!overlay) return;

    /* Pre-fill subject from page title */
    const docTitle = document.querySelector('.doc-page__header h1');
    if (docTitle && subjectInput && !subjectInput.value) {
      subjectInput.value = docTitle.textContent.trim();
    }

    window.scrollTo(0, 0);
    overlay.classList.remove('u-hidden');
    if (statusEl) statusEl.textContent = '';
    if (previewWrap) previewWrap.classList.add('u-hidden');
    if (toInput) toInput.focus();
  }

  function closeModal() {
    if (overlay) overlay.classList.add('u-hidden');
  }

  function buildPreviewHTML(data) {
    if (!data || !data.sections) return '<p>No document data available.</p>';
    let html = '<div style="font-family: Arial, sans-serif; font-size: 13px;">';
    html += '<h3 style="color:#2d6a4f; margin:0 0 12px;">' + MSFG.escHtml(data.title) + '</h3>';
    data.sections.forEach(function (sec) {
      html += '<h4 style="color:#333; margin:12px 0 6px;"><span style="border-bottom:1px solid #e0e0e0; padding-bottom:4px;">' + MSFG.escHtml(sec.heading) + '</span></h4>';
      html += '<table style="width:100%; border-collapse:collapse; font-size:13px;">';
      sec.rows.forEach(function (row) {
        var valueLong = row.value && row.value.length > 60;
        if (row.stacked) {
          var bullet = row.bulletColor
            ? '<span style="color:' + row.bulletColor + ';">&#9679;</span>&nbsp;&nbsp;'
            : '';
          html += '<tr><td colspan="2" style="padding:4px 8px ' + (row.value ? '0' : '4px') + ' 0; color:#333; font-size:13px;">' + bullet + MSFG.escHtml(row.label) + '</td></tr>';
          if (row.value) {
            html += '<tr><td colspan="2" style="padding:0 8px 4px ' + (row.bulletColor ? '22px' : '16px') + '; color:#999; font-size:11px; line-height:1.3;">' + MSFG.escHtml(row.value) + '</td></tr>';
          }
        } else if (valueLong) {
          html += '<tr><td colspan="2" style="padding:3px 8px 0 0; color:#555; font-size:12px;">' + MSFG.escHtml(row.label) + '</td></tr>';
          html += '<tr><td colspan="2" style="padding:0 8px 4px 0; color:#222; line-height:1.4;">' + MSFG.escHtml(row.value) + '</td></tr>';
        } else {
          var boldStyle = row.bold ? 'font-weight:700;font-size:1.05em;' : '';
          html += '<tr><td style="padding:3px 8px 3px 0; color:#555;">' + MSFG.escHtml(row.label) + '</td>';
          html += '<td style="padding:3px 0; font-weight:600; text-align:right;' + boldStyle + '">' + MSFG.escHtml(row.value) + '</td></tr>';
        }
      });
      html += '</table>';
    });
    html += '</div>';
    return html;
  }

  function togglePreview() {
    if (!previewWrap) return;
    const visible = !previewWrap.classList.contains('u-hidden');
    if (visible) {
      previewWrap.classList.add('u-hidden');
      if (previewToggle) previewToggle.textContent = 'Preview Email';
    } else {
      const data = _getEmailData ? _getEmailData() : null;
      if (previewContent) previewContent.innerHTML = buildPreviewHTML(data);
      previewWrap.classList.remove('u-hidden');
      if (previewToggle) previewToggle.textContent = 'Hide Preview';
    }
  }

  const copyBtn = document.getElementById('emailCopyBtn');

  async function copyPreview() {
    const data = _getEmailData ? _getEmailData() : null;
    if (!data) {
      setStatus('No document data to copy.', 'error');
      return;
    }
    const html = buildPreviewHTML(data);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([previewToPlainText(data)], { type: 'text/plain' })
        })
      ]);
      setStatus('Copied to clipboard!', 'success');
      setTimeout(function () { if (statusEl) statusEl.textContent = ''; }, 2000);
    } catch (err) {
      try {
        await navigator.clipboard.writeText(previewToPlainText(data));
        setStatus('Copied as plain text.', 'success');
        setTimeout(function () { if (statusEl) statusEl.textContent = ''; }, 2000);
      } catch (e) {
        setStatus('Copy failed — check browser permissions.', 'error');
      }
    }
  }

  function previewToPlainText(data) {
    let text = data.title + '\n' + '='.repeat(data.title.length) + '\n\n';
    data.sections.forEach(function (sec) {
      text += sec.heading + '\n' + '-'.repeat(sec.heading.length) + '\n';
      sec.rows.forEach(function (row) {
        if (row.stacked) {
          text += '  ' + row.label + (row.value ? '\n    ' + row.value : '') + '\n';
        } else if (row.isTotal) {
          text += row.label + ':  ' + row.value + '\n';
        } else {
          text += '  ' + row.label + ':  ' + row.value + '\n';
        }
      });
      text += '\n';
    });
    return text.trim();
  }

  function setStatus(msg, type) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = 'email-modal__status' + (type ? ' email-modal__status--' + type : '');
  }

  async function sendEmail() {
    const to = toInput ? toInput.value.trim() : '';
    const subject = subjectInput ? subjectInput.value.trim() : '';
    const message = messageInput ? messageInput.value.trim() : '';

    if (!to) {
      setStatus('Please enter a recipient email.', 'error');
      toInput.focus();
      return;
    }

    if (!subject) {
      setStatus('Please enter a subject.', 'error');
      subjectInput.focus();
      return;
    }

    const data = _getEmailData ? _getEmailData() : null;
    if (!data) {
      setStatus('No document data to send.', 'error');
      return;
    }

    sendBtn.disabled = true;
    setStatus('Sending...', '');

    try {
      const resp = await MSFG.fetch(MSFG.apiUrl('/api/email/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to, subject: subject, message: message, calcData: data })
      });
      const result = await resp.json();

      if (result.success) {
        setStatus('Email sent successfully!', 'success');
        setTimeout(closeModal, 1500);
      } else {
        setStatus(result.message || 'Failed to send email.', 'error');
      }
    } catch (err) {
      setStatus('Network error. Please try again.', 'error');
    } finally {
      sendBtn.disabled = false;
    }
  }

  /* ---- Wire up buttons ---- */
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (sendBtn) sendBtn.addEventListener('click', sendEmail);
  if (previewToggle) previewToggle.addEventListener('click', togglePreview);
  if (copyBtn) copyBtn.addEventListener('click', copyPreview);

  /* Close on overlay click */
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
  }

  /* Close on Escape */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay && !overlay.classList.contains('u-hidden')) {
      closeModal();
    }
  });

  /* ---- Bind data-action buttons (Print + Email) ---- */
  function bindActionButtons() {
    document.querySelectorAll('[data-action="doc-print"]').forEach(function (el) {
      el.addEventListener('click', handlePrint);
    });
    document.querySelectorAll('[data-action="doc-email"]').forEach(function (el) {
      el.addEventListener('click', openModal);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindActionButtons);
  } else {
    bindActionButtons();
  }

  /* ---- Public API ----
     register(getEmailDataFn): structured data for the email modal +
       printable summary (existing, unchanged).
     registerCapture(asyncFn):  capture for the workspace's
       "Add to Session Report". asyncFn returns
         Promise<{ pdfBytes, name?, icon?, slug?, data?, filename? }>
       Workspace POSTs the result to MSFG.Report.addItem so the actual
       filled PDF lands in the session report (not just a text extract). */
  let _captureForReport = null;

  window.MSFG = window.MSFG || {};
  window.MSFG.DocActions = {
    register: function (getEmailDataFn) {
      _getEmailData = getEmailDataFn;
    },
    registerCapture: function (asyncFn) {
      _captureForReport = asyncFn;
    },
    captureForReport: function () {
      if (_captureForReport) return Promise.resolve(_captureForReport());

      // Default fallback — any document that registered a getEmailData
      // handler can be captured via /api/pdf/structured. The output is
      // a simple branded PDF built from { title, sections } so missing
      // per-doc generators no longer block "Add to Session".
      if (!_getEmailData) {
        return Promise.reject(new Error('No capture handler registered for this document.'));
      }
      var data = _getEmailData();
      return MSFG.fetch(MSFG.apiUrl('/api/pdf/structured'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (resp) {
        if (!resp.ok) return resp.text().then(function (t) { throw new Error('PDF generation failed: ' + t.slice(0, 120)); });
        return resp.arrayBuffer();
      }).then(function (buf) {
        var titleText = String((data && data.title) || 'Document');
        // First glyph (icon emoji) becomes the report-card icon.
        var iconMatch = titleText.match(/^(\S+)\s+/);
        var icon = iconMatch ? iconMatch[1] : '📄';
        var name = iconMatch ? titleText.slice(iconMatch[0].length) : titleText;
        var slug = (window.__docSlug || 'document').toString();
        return {
          pdfBytes: new Uint8Array(buf),
          name: name,
          icon: icon,
          slug: slug,
          data: data,
          filename: slug.replace(/[^a-z0-9-]+/gi, '-') + '.pdf'
        };
      });
    },
    openEmail: openModal,
    print: handlePrint
  };

})();
