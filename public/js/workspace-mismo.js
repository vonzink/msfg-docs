/* =====================================================
   Workspace MISMO Import (Documents)
   - Drag/drop or browse MISMO XML
   - Parses + broadcasts to open document iframes
   ===================================================== */
'use strict';

(function() {
  const drop = document.getElementById('mismoDrop');
  const fileInput = document.getElementById('mismoFile');
  const browseBtn = document.getElementById('mismoBrowse');
  const activeBar = document.getElementById('mismoActive');
  const metaEl = document.getElementById('mismoMeta');
  const clearBtn = document.getElementById('mismoClear');

  if (!drop || !fileInput || !browseBtn || !activeBar || !metaEl || !clearBtn) return;
  if (!window.MSFG || !MSFG.MISMO || typeof MSFG.MISMO.parseXml !== 'function') return;

  const STORAGE_KEY = 'msfg_docs_mismo_xml_v1';

  function setUiLoaded(metaText) {
    drop.classList.add('has-data');
    activeBar.classList.remove('u-hidden');
    metaEl.textContent = metaText || 'Loaded';
  }

  function setUiLoading(metaText) {
    drop.classList.add('has-data');
    activeBar.classList.remove('u-hidden');
    metaEl.textContent = metaText || 'Loading…';
  }

  function setUiError(msg) {
    drop.classList.remove('has-data');
    activeBar.classList.remove('u-hidden');
    metaEl.textContent = msg || 'Could not load MISMO XML';
  }

  function setUiEmpty() {
    drop.classList.remove('has-data');
    activeBar.classList.add('u-hidden');
    metaEl.textContent = '—';
  }

  function broadcastToIframes(payload) {
    const iframes = document.querySelectorAll('.ws-panel__iframe');
    iframes.forEach((iframe) => {
      try {
        if (!iframe.contentWindow) return;
        iframe.contentWindow.postMessage({ type: 'MSFG_MISMO', payload }, window.location.origin);
      } catch (e) {
        /* ignore */
      }
    });
  }

  function getCurrentPayload() {
    const xmlString = sessionStorage.getItem(STORAGE_KEY) || '';
    if (!xmlString.trim()) return null;
    try {
      const parsed = MSFG.MISMO.parseXml(xmlString);
      return { xmlString, parsed };
    } catch (e) {
      return null;
    }
  }

  async function handleXml(xmlString, metaText) {
    const parsed = MSFG.MISMO.parseXml(xmlString);
    const payload = { xmlString, parsed };
    sessionStorage.setItem(STORAGE_KEY, xmlString);
    setUiLoaded(metaText);
    broadcastToIframes(payload);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsText(file);
    });
  }

  async function handleFile(file) {
    if (!file) return;
    setUiLoading(`${file.name} • reading…`);
    const text = await readFileAsText(file);
    if (!text.trim()) throw new Error('Empty file');
    await handleXml(text, `${file.name} • ${(file.size / 1024).toFixed(0)} KB`);
  }

  drop.addEventListener('click', (e) => {
    const target = e.target;
    if (target && (target.id === 'mismoClear' || target.closest && target.closest('#mismoClear'))) return;
    if (target && (target.id === 'mismoBrowse' || target.closest && target.closest('#mismoBrowse'))) return;
    fileInput.click();
  });

  let lastSig = '';
  async function onPicked() {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const sig = `${file.name}|${file.size}|${file.lastModified}`;
    if (sig === lastSig) return;
    lastSig = sig;
    try {
      await handleFile(file);
    } catch (err) {
      console.error('MISMO import failed:', err);
      setUiError('Could not load MISMO XML');
    } finally {
      fileInput.value = '';
    }
  }

  fileInput.addEventListener('change', onPicked);
  fileInput.addEventListener('input', onPicked);

  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('drag-over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.classList.remove('drag-over');
    try {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      await handleFile(file);
    } catch (err) {
      console.error('MISMO drop failed:', err);
      setUiError('Could not load MISMO XML');
    }
  });

  clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    sessionStorage.removeItem(STORAGE_KEY);
    setUiEmpty();
    broadcastToIframes({ xmlString: '', parsed: null });
  });

  window.addEventListener('message', function(e) {
    if (e.origin !== window.location.origin) return;
    if (!e.data || e.data.type !== 'MSFG_MISMO_REQUEST') return;
    const payload = getCurrentPayload();
    if (!payload) return;
    try {
      e.source && e.source.postMessage({ type: 'MSFG_MISMO', payload }, window.location.origin);
    } catch (err) {
      /* ignore */
    }
  });

  const existing = sessionStorage.getItem(STORAGE_KEY);
  if (existing && existing.trim()) {
    try {
      const parsed = MSFG.MISMO.parseXml(existing);
      setUiLoaded('Loaded from session');
      broadcastToIframes({ xmlString: existing, parsed });
    } catch (e) {
      sessionStorage.removeItem(STORAGE_KEY);
      setUiEmpty();
    }
  }
})();
