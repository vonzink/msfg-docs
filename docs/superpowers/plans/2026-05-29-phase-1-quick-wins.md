# Phase 1 Quick Wins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three low-risk pre-approval / app-summary improvements from the design spec: SSN shows last 2 digits, the Equal Housing Lender logo prints on the pre-approval, and the pre-approval gains Construction loan type + Occupancy + Property Type fields.

**Architecture:** Express/EJS app. PDFs are drawn with **pdf-lib** from a structured JSON payload POSTed to `/api/pdf/{slug}`; the on-screen letter preview is **read-only** and rebuilt client-side from the form fields. No build step, no tests harness for the client IIFE modules — this codebase verifies by **rendering the PDF to an image** (PDF Tools MCP `render_pdf_page`) and **browser-evaluating** the page (Claude Preview MCP). We follow that pattern.

**Tech Stack:** Node 24, Express 5, EJS, pdf-lib 1.17, vanilla browser JS on the `window.MSFG` namespace.

**Scope:** Spec features 4 (SSN), 5 (EHL logo), 2 (pre-approval fields). Spec features 1 (multi-borrower) and 3 (income/balance) are **out of scope here** — each gets its own plan.

**Source spec:** `docs/superpowers/specs/2026-05-29-document-features-design.md`

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `public/js/documents/application-summary.js` | App-summary client (MISMO → review packet) | Modify `maskTin()` (1 line) |
| `config/site.json` | Branding config read per request | Add `ehlLogo` URL |
| `lib/pdf/logoAsset.js` | Remote/local image loader for branded PDFs | Add `loadEhlImage()` |
| `lib/pdf/preApprovalPdf.js` | Builds the pre-approval payload for the shared letter renderer | Pass `ehlLogo`; add Occupancy/Property Type term rows |
| `lib/pdf/letterPdf.js` | Shared branded letter renderer (pdf-lib) | Embed + draw EHL logo in the footer band |
| `views/documents/pre-approval.ejs` | Pre-approval form | Add Construction option, Property Type + Occupancy controls |
| `public/js/documents/pre-approval.js` | Pre-approval client (preview + payload) | Read + render the new fields |

---

## Task 1: Application Summary — SSN shows last 2 digits

**Files:**
- Modify: `public/js/documents/application-summary.js:165-168`

- [ ] **Step 1: Change the mask format**

In `maskTin()`, change the masked return so only the last **2** digits are shown. Current code:

```js
  function maskTin(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 4) return value ? String(value) : '';
    return '***-**-' + digits.slice(-4);
  }
```

Replace the last two lines with:

```js
    if (digits.length < 2) return value ? String(value) : '';
    return '***-***-' + digits.slice(-2);
  }
```

(Result: a TIN like `123-45-6789` renders as `***-***-89`.)

- [ ] **Step 2: Verify the page still loads and the mask works**

Start the dev server (Claude Preview MCP `preview_start` name `msfg-docs`), then `preview_eval` on `/documents/application-summary`:

```js
(() => {
  // maskTin is private; exercise it indirectly via a known-good sample render path is not available
  // without MISMO, so just confirm the page mounts with no error and the source line is correct.
  return JSON.stringify({ path: location.pathname, hasPreview: !!document.getElementById('applicationSummaryPreview') });
})()
```

Then `preview_console_logs` level `error` → expect **No console logs**. Confirm by reading the changed lines that the format is `***-***-` + last 2.

- [ ] **Step 3: Commit**

```bash
git add public/js/documents/application-summary.js
git commit -m "App Summary: mask SSN to last 2 digits"
```

---

## Task 2: Equal Housing Lender logo on the pre-approval

**Files:**
- Modify: `config/site.json` (add `ehlLogo`)
- Modify: `lib/pdf/logoAsset.js` (add `loadEhlImage`)
- Modify: `lib/pdf/preApprovalPdf.js:5` and `:95` (require + payload)
- Modify: `lib/pdf/letterPdf.js` (embed ~line 207 + draw in `drawFooterBand` ~line 287)
- Temp: `tmp-verify-ehl.js` (deleted in the last step)

- [ ] **Step 1: Add the EHL URL to site config**

In `config/site.json`, add a top-level key next to `logo` (it's a JSON object — add the line, mind the trailing comma):

```json
  "ehlLogo": "https://msfg-media.s3.us-west-2.amazonaws.com/Assets/LOGOS/EQUAL+HOUSING+LENDER.png",
```

- [ ] **Step 2: Add `loadEhlImage()` to the loader**

In `lib/pdf/logoAsset.js`, the file already has `sniffFormat`, `loadLocal`, `loadRemote`, a `cache` Map, and `readConfigLogoSrc()` (reads `config.logo.src`). Add a sibling reader + loader, and export it. Add **after** `readConfigLogoSrc()`:

```js
/** Read the Equal Housing Lender logo URL from config (config.ehlLogo). */
function readConfigEhlSrc() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const src = config && config.ehlLogo;
    return (src && typeof src === 'string') ? src.trim() : null;
  } catch (_e) {
    return null;
  }
}
```

Add **before** `module.exports`:

```js
/**
 * Load the Equal Housing Lender mark configured in config/site.json (ehlLogo)
 * for stamping onto branded PDFs. Same remote/local + sniff + cache behavior as
 * loadLogoImage; failures degrade to null (logo simply omitted).
 *
 * @returns {Promise<{bytes: Buffer, format: 'png'|'jpg'}|null>}
 */
async function loadEhlImage() {
  const src = readConfigEhlSrc();
  if (!src) return null;
  if (cache.has(src)) return cache.get(src);

  let result = null;
  try {
    result = /^https?:\/\//i.test(src) ? await loadRemote(src) : loadLocal(src);
  } catch (_e) {
    result = null;
  }
  cache.set(src, result);
  return result;
}
```

Change the export line from:

```js
module.exports = { loadLogoImage };
```

to:

```js
module.exports = { loadLogoImage, loadEhlImage };
```

- [ ] **Step 3: Pass the EHL image into the pre-approval payload**

In `lib/pdf/preApprovalPdf.js`, line 5 currently:

```js
const { loadLogoImage } = require('./logoAsset');
```

Change to:

```js
const { loadLogoImage, loadEhlImage } = require('./logoAsset');
```

Then in the `brand:` object passed to `generateLetterPdfBuffer` (currently line ~95):

```js
    brand: { logo: await loadLogoImage(), company: 'Mountain State Financial Group' },
```

Change to:

```js
    brand: { logo: await loadLogoImage(), ehlLogo: await loadEhlImage(), company: 'Mountain State Financial Group' },
```

- [ ] **Step 4: Embed the EHL image in `letterPdf.js`**

In `lib/pdf/letterPdf.js`, the company logo is embedded around lines 197-206. **Immediately after** that `let logoImage = null; … }` block (before `const W = 612, H = 792;`), add:

```js
  // Optional Equal Housing Lender mark for the branded footer (pre-approval).
  let ehlImage = null;
  if (branded && l.brand.ehlLogo && l.brand.ehlLogo.bytes) {
    try {
      ehlImage = l.brand.ehlLogo.format === 'jpg'
        ? await pdfDoc.embedJpg(l.brand.ehlLogo.bytes)
        : await pdfDoc.embedPng(l.brand.ehlLogo.bytes);
    } catch (_e) {
      ehlImage = null;
    }
  }
```

- [ ] **Step 5: Draw the EHL mark in the footer band**

In `lib/pdf/letterPdf.js`, `drawFooterBand(pg)` (lines 287-294) currently draws the band + the company text. Add the EHL draw at the end of the function, **before** its closing `}`:

```js
    if (ehlImage) {
      const maxH = 30;
      const s = maxH / ehlImage.height;
      const w = ehlImage.width * s;
      // Bottom-right, sitting just above the 26pt footer band.
      pg.drawImage(ehlImage, { x: W - margin - w, y: 30, width: w, height: maxH });
    }
```

(`ehlImage`, `W`, `margin` are all in the enclosing function scope; `drawFooterBand` is only called after they're initialized.)

- [ ] **Step 6: Render a sample pre-approval and confirm the EHL mark**

Create `tmp-verify-ehl.js` at the repo root:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generatePreApprovalPdfBuffer } = require('./lib/pdf/preApprovalPdf');
const OUT = path.join(os.homedir(), '.pdf-toolkit-files', 'msfg-verify');
(async () => {
  const bytes = await generatePreApprovalPdfBuffer({
    borrowerName: 'Kyle William Tawney', borrowerAddress: '742 Evergreen Terrace, Springfield, IL 62704',
    loanType: 'Conventional', loanPurpose: 'Purchase', approvalAmount: '$350,000',
    interestRate: '6.500%', loanTerm: '30-Year Fixed', downPayment: '$70,000', expirationDate: '2026-08-31',
    loName: 'Jordan Banks', loNMLS: '123456', loPhone: '(555) 123-4567', loEmail: 'jordan@msfginfo.com',
    letterSettings: { templateStyle: 'A' }
  });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'ehl-A.pdf'), bytes);
  console.log('ehl-A.pdf', bytes.length + 'b');
})().catch((e) => { console.error('ERR', e && e.message); process.exit(1); });
```

Run: `node tmp-verify-ehl.js`
Expected: prints `ehl-A.pdf <N>b` (no error; N > 150000 — the embedded logos are large PNGs).

Then PDF Tools MCP `render_pdf_page` on `~/.pdf-toolkit-files/msfg-verify/ehl-A.pdf` page 1. **Confirm visually:** the Equal Housing Lender mark appears bottom-right, just above the green footer band, opposite the "Mountain State Financial Group LLC | msfginfo.com" text, not overlapping the signature lines.

- [ ] **Step 7: Delete the temp file and commit**

```bash
rm -f tmp-verify-ehl.js
git add config/site.json lib/pdf/logoAsset.js lib/pdf/preApprovalPdf.js lib/pdf/letterPdf.js
git commit -m "Pre-approval: print Equal Housing Lender logo in the footer"
```

---

## Task 3: Pre-approval — Construction type + Occupancy + Property Type

**Files:**
- Modify: `views/documents/pre-approval.ejs` (loanType option + 2 new form-groups)
- Modify: `public/js/documents/pre-approval.js` (preview builder ~lines 19-58 + `collectPdfPayload` ~lines 128-148)
- Modify: `lib/pdf/preApprovalPdf.js` (termRows ~lines 32-34)

- [ ] **Step 1: Add the Construction option + the two new controls (EJS)**

In `views/documents/pre-approval.ejs`, the `loanType` select (lines 30-37) lists Conventional/FHA/VA/USDA/Jumbo. Add a Construction option as the last `<option>`:

```html
            <option value="Construction">Construction</option>
```

Then, immediately **after** the `loanPurpose` form-group `</div>` (the select closes at line 43, its wrapping `</div>` follows), insert two new form-groups:

```html
        <div class="form-group">
          <label for="propertyType">
            Property Type
            <label style="font-weight:normal;font-size:0.82rem;margin-left:var(--space-sm);">
              <input type="checkbox" id="includePropertyType"> Include in letter
            </label>
          </label>
          <select id="propertyType">
            <option value="Single Family">Single Family</option>
            <option value="Multi-Family">Multi-Family</option>
            <option value="Condo">Condo</option>
            <option value="Manufactured Home">Manufactured Home</option>
            <option value="Town Home">Town Home</option>
            <option value="PUD">PUD</option>
          </select>
        </div>
        <div class="form-group">
          <label for="occupancy">Occupancy</label>
          <select id="occupancy">
            <option value="">—</option>
            <option value="Owner Occupied">Owner Occupied</option>
            <option value="Second Home">Second Home</option>
            <option value="Investment Property">Investment Property</option>
          </select>
        </div>
```

- [ ] **Step 2: Read + render the new fields in the preview (pre-approval.js)**

In `public/js/documents/pre-approval.js`, in the preview builder add reads next to the other `val()` calls (after line 20, `const loanPurpose = val('loanPurpose');`):

```js
    const propertyType = val('propertyType');
    const includePropertyType = isChecked('includePropertyType');
    const occupancy = val('occupancy');
```

Then in the preview table (after the Purpose row, line 49), add Property Type + Occupancy rows in spec order:

```js
    if (propertyType && includePropertyType) html += '<tr><td><strong>Property Type</strong></td><td>' + MSFG.escHtml(propertyType) + '</td></tr>';
    if (occupancy) html += '<tr><td><strong>Occupancy</strong></td><td>' + MSFG.escHtml(occupancy) + '</td></tr>';
```

- [ ] **Step 3: Add the new fields to the download payload (pre-approval.js)**

In `collectPdfPayload()` (lines 128-148), add three keys to the returned object (after `loanPurpose: val('loanPurpose'),` on line 134):

```js
      propertyType: val('propertyType'),
      includePropertyType: isChecked('includePropertyType'),
      occupancy: val('occupancy'),
```

- [ ] **Step 4: Add the term rows in the PDF generator (preApprovalPdf.js)**

In `lib/pdf/preApprovalPdf.js`, the term-rows block (lines 31-45). After the Purpose push (line 33: `if (b.loanPurpose) termRows.push({ label: 'Purpose', value: b.loanPurpose });`), insert:

```js
  if (b.includePropertyType && b.propertyType) termRows.push({ label: 'Property Type', value: b.propertyType });
  if (b.occupancy) termRows.push({ label: 'Occupancy', value: b.occupancy });
```

- [ ] **Step 5: Verify the form + the PDF**

Restart the dev server (server-side change in `preApprovalPdf.js` — `preview_stop` then `preview_start`). `preview_eval` on `/documents/pre-approval`:

```js
(() => {
  const set = (id,v)=>{const e=document.getElementById(id); if(e){e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));}};
  const check = (id,v)=>{const e=document.getElementById(id); if(e){e.checked=v; e.dispatchEvent(new Event('change',{bubbles:true}));}};
  set('borrowerName','Kyle William Tawney'); set('approvalAmount','$350,000');
  set('loanType','Construction'); set('propertyType','Condo'); check('includePropertyType',true); set('occupancy','Owner Occupied');
  const t = document.getElementById('letterPreview').innerText;
  return JSON.stringify({ hasConstruction: !!document.querySelector('#loanType option[value="Construction"]'),
    hasPropertyType: !!document.getElementById('propertyType'), hasOccupancy: !!document.getElementById('occupancy'),
    previewHasPropertyType: /Property Type/.test(t), previewHasOccupancy: /Occupancy/.test(t) });
})()
```

Expected: all five booleans `true`. Then `preview_console_logs` level `error` → **No console logs**.

Then render the PDF: with the same dev server up, `preview_eval` a `fetch` to `/api/pdf/pre-approval`:

```js
(async () => {
  const body = { borrowerName:'Kyle William Tawney', approvalAmount:'$350,000', loanType:'Construction',
    loanPurpose:'Purchase', propertyType:'Condo', includePropertyType:true, occupancy:'Owner Occupied',
    interestRate:'6.500%', loanTerm:'30-Year Fixed', downPayment:'$70,000', loName:'Jordan Banks', loNMLS:'123456',
    letterSettings:{ templateStyle:'A' } };
  const r = await MSFG.fetch(MSFG.apiUrl('/api/pdf/pre-approval'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const buf = await r.arrayBuffer();
  return JSON.stringify({ status:r.status, type:r.headers.get('content-type'), bytes:buf.byteLength });
})()
```

Expected: `status 200`, `type application/pdf`, `bytes > 150000`. (Optional: save + `render_pdf_page` to eyeball that the terms table shows **Loan Type: Construction**, **Property Type: Condo**, **Occupancy: Owner Occupied** in that order.)

- [ ] **Step 6: Commit**

```bash
git add views/documents/pre-approval.ejs public/js/documents/pre-approval.js lib/pdf/preApprovalPdf.js
git commit -m "Pre-approval: add Construction loan type, Occupancy, and Property Type"
```

---

## Task 4: Phase 1 sign-off

- [ ] **Step 1: Smoke-test all touched pages**

With the dev server up, `preview_eval` to load each of `/documents/application-summary` and `/documents/pre-approval`; run `preview_console_logs` level `error` for each → expect **No console logs**. Confirm the pre-approval preview is still **read-only** (no `contenteditable` on `#letterPreview`) and still shows the branded letterhead frame.

- [ ] **Step 2: Confirm clean tree**

```bash
git status -sb
```

Expected: no stray `tmp-*` files; only intended commits ahead of `origin/main`.

- [ ] **Step 3: Push (only if the user asks)**

This repo pushes on explicit request. When asked: `git push origin main`.

---

## Self-Review

- **Spec coverage:** Feature 4 (SSN last-2) → Task 1. Feature 5 (EHL logo) → Task 2. Feature 2 (Construction/Occupancy/Property Type) → Task 3. Features 1 & 3 are explicitly deferred to their own plans. ✅
- **Placeholder scan:** No TBD/TODO; every code step shows the exact code; every verify step shows the exact eval/command + expected result. ✅
- **Type/name consistency:** `loadEhlImage` (logoAsset export → preApprovalPdf require → payload `ehlLogo` → letterPdf `l.brand.ehlLogo` → `ehlImage`); field ids `propertyType` / `includePropertyType` / `occupancy` consistent across EJS, preview reads, `collectPdfPayload`, and `preApprovalPdf` (`b.propertyType` / `b.includePropertyType` / `b.occupancy`). ✅
