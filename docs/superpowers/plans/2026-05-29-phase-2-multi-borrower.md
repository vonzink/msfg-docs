# Phase 2 Multi-Borrower — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every letter supports N borrowers from a single shared "Borrowers" list (seeded from MISMO), each with an include checkbox; the selected borrowers drive the salutation/body and one signature line each (except pre-approval, which only names them — the LO signs).

**Architecture:** A new shared `MSFG.Borrowers` client module + EJS partial replaces the per-letter borrower-name inputs. Each letter's `applyMismo` seeds it from `parsed.borrowers` (already a `string[]`), `collectPayload` sends `borrowers: [{name}]`, and the pdf-lib generator builds the salutation + `signatures: [{caption, name}]` from that array. Preview stays read-only, rebuilt from fields.

**Tech Stack:** Express/EJS, pdf-lib, vanilla JS on `window.MSFG`. No tests harness — verify by rendering PDFs to images + browser-eval (no console errors).

**Source spec:** `docs/superpowers/specs/2026-05-29-document-features-design.md` (Feature 1).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `public/js/shared/borrowers.js` | `MSFG.Borrowers` — render/seed/collect the borrowers list + name-join helper | Create |
| `views/partials/borrowers-list.ejs` | The "Borrowers" form section (container + Add button) | Create |
| `public/css/shared/letter-styles.css` | Row layout styling | Append `.borrowers-list*` rules |
| `views/layouts/main.ejs` | Loads shared scripts | Add `borrowers.js` `<script>` |
| `views/documents/{credit-inquiry,address-lox,gift-letter,generic-lox,pre-approval}.ejs` | Forms | Replace name inputs with the partial |
| `public/js/documents/{...}.js` | Clients | Seed + collect `borrowers` |
| `lib/pdf/{creditInquiryPdf,addressLoxPdf,giftLetterPdf,genericLoxPdf,preApprovalPdf}.js` | Generators | Build salutation + signatures from `borrowers[]` |

---

## Task 1: Shared `MSFG.Borrowers` module + partial

**Files:**
- Create: `public/js/shared/borrowers.js`
- Create: `views/partials/borrowers-list.ejs`
- Modify: `views/layouts/main.ejs` (script tag, after `letter-doc.js`)
- Modify: `public/css/shared/letter-styles.css` (append)

- [ ] **Step 1: Create `public/js/shared/borrowers.js`**

```js
/* MSFG.Borrowers — shared multi-borrower list for the letter docs.
   One text input + "include" checkbox + remove button per borrower.
   Seeded from MISMO (parsed.borrowers: string[]). The owning doc reads
   getSelected() into its payload; selected names drive salutation + signatures. */
(function () {
  'use strict';
  const MSFG = window.MSFG || (window.MSFG = {});

  function el(tag, cls, attrs) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
    return n;
  }

  function init(cfg) {
    const container = document.getElementById(cfg.containerId || 'borrowersList');
    if (!container) return null;
    const onChange = typeof cfg.onChange === 'function' ? cfg.onChange : function () {};
    const label = cfg.rowLabel || 'Borrower';

    function row(name, include) {
      const wrap = el('div', 'borrowers-list__row');
      const inc = el('input', 'borrowers-list__include', { type: 'checkbox' });
      inc.checked = include !== false;
      const text = el('input', 'borrowers-list__name', { type: 'text', placeholder: label + ' name' });
      text.value = name || '';
      const rm = el('button', 'borrowers-list__remove', { type: 'button', 'aria-label': 'Remove ' + label });
      rm.textContent = '×';
      inc.addEventListener('change', onChange);
      text.addEventListener('input', onChange);
      rm.addEventListener('click', function () {
        if (container.querySelectorAll('.borrowers-list__row').length > 1) wrap.remove();
        else { text.value = ''; inc.checked = true; }
        onChange();
      });
      wrap.appendChild(inc); wrap.appendChild(text); wrap.appendChild(rm);
      return wrap;
    }

    function addRow(name, include) { container.appendChild(row(name, include)); }

    function getAll() {
      return Array.prototype.map.call(container.querySelectorAll('.borrowers-list__row'), function (r) {
        return { name: (r.querySelector('.borrowers-list__name').value || '').trim(),
                 include: r.querySelector('.borrowers-list__include').checked };
      });
    }
    function getSelected() { return getAll().filter(function (b) { return b.include && b.name; }); }

    function seed(names) {
      const list = (names || []).map(function (n) { return String(n || '').trim(); }).filter(Boolean);
      if (!list.length) return;
      const existing = getAll().filter(function (b) { return b.name; });
      if (existing.length) return; // user already has names; don't clobber
      container.innerHTML = '';
      list.forEach(function (n) { addRow(n, true); });
      onChange();
    }

    const addBtn = cfg.addBtnId && document.getElementById(cfg.addBtnId);
    if (addBtn) addBtn.addEventListener('click', function () { addRow('', true); onChange(); });

    if (!container.querySelector('.borrowers-list__row')) addRow('', true); // start with one
    return { addRow, getAll, getSelected, seed };
  }

  /** Join names: ["A"]→"A", ["A","B"]→"A and B", ["A","B","C"]→"A, B, and C". */
  function joinNames(names) {
    const a = (names || []).filter(Boolean);
    if (a.length <= 1) return a[0] || '';
    if (a.length === 2) return a[0] + ' and ' + a[1];
    return a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1];
  }

  MSFG.Borrowers = { init, joinNames };
})();
```

- [ ] **Step 2: Create `views/partials/borrowers-list.ejs`**

```html
<!-- Shared multi-borrower list. Each owning letter wires it via
     MSFG.Borrowers.init({ containerId:'borrowersList', addBtnId:'addBorrower', onChange:regenerate }). -->
<div class="form-group form-group--full">
  <label>Borrowers</label>
  <div id="borrowersList" class="borrowers-list"></div>
  <button type="button" class="btn btn-link btn-sm" id="addBorrower">+ Add borrower</button>
</div>
```

- [ ] **Step 3: Append row styling to `public/css/shared/letter-styles.css`**

```css
/* Multi-borrower list */
.borrowers-list { display: flex; flex-direction: column; gap: var(--space-sm); }
.borrowers-list__row { display: flex; align-items: center; gap: var(--space-sm); }
.borrowers-list__name { flex: 1 1 auto; }
.borrowers-list__include { flex: 0 0 auto; width: 18px; height: 18px; accent-color: var(--brand-accent); }
.borrowers-list__remove {
  flex: 0 0 auto; border: 0; background: transparent; cursor: pointer;
  font-size: 1.25rem; line-height: 1; color: var(--color-gray-500); padding: 0 var(--space-xs);
}
.borrowers-list__remove:hover { color: #c2410c; }
```

- [ ] **Step 4: Load the script in `views/layouts/main.ejs`**

After the `letter-doc.js` `<script>` line, add:

```html
  <script src="<%= basePath %>/js/shared/borrowers<%= jsExt %>?v=<%= v %>"></script>
```

- [ ] **Step 5: Verify the module loads (no doc wired yet)**

Start the dev server. `preview_eval` on any letter page (e.g. `/documents/credit-inquiry`):

```js
(() => JSON.stringify({ hasBorrowers: !!(window.MSFG && MSFG.Borrowers),
  join3: MSFG.Borrowers.joinNames(['A','B','C']), join2: MSFG.Borrowers.joinNames(['A','B']) }))()
```

Expected: `hasBorrowers:true`, `join3:"A, B, and C"`, `join2:"A and B"`. `preview_console_logs` error → none.

- [ ] **Step 6: Commit**

```bash
git add public/js/shared/borrowers.js views/partials/borrowers-list.ejs public/css/shared/letter-styles.css views/layouts/main.ejs
git commit -m "Add shared MSFG.Borrowers multi-borrower list component"
```

---

## Task 2: Wire generic-lox (closest existing fit)

Replaces `loxBorrowerNames` + `loxSigner1..5` with the shared list.

**Files:** `views/documents/generic-lox.ejs`, `public/js/documents/generic-lox.js`, `lib/pdf/genericLoxPdf.js`

- [ ] **Step 1: EJS** — replace the `loxBorrowerNames` form-group AND the `loxSigner1`..`loxSigner5` block with `<%- include('../partials/borrowers-list') %>`. Leave `loxLoanNumber`, `loxLetterDate`, `loxPropertyAddress`, `loxTopic`, `loxExplanation` untouched.

- [ ] **Step 2: Client (`generic-lox.js`)** — initialize the list and read it. Near the top of the IIFE add a module var + init in `onReady` (add `onReady` to the LetterDoc.init config if absent):

```js
  let borrowers = null;
  // inside LetterDoc.init({ ... onReady: ... }):
  onReady: function (api) {
    borrowers = MSFG.Borrowers.init({ containerId: 'borrowersList', addBtnId: 'addBorrower', onChange: api.regenerate });
  },
```

In `applyMismo`, replace the loxBorrowerNames/loxSigner seeding with:

```js
    if (borrowers && Array.isArray(parsed.borrowers)) borrowers.seed(parsed.borrowers);
```

In `collectPayload`, replace the `signers`/`borrowerNames` lines with:

```js
    const selected = borrowers ? borrowers.getSelected() : [];
    return {
      borrowers: selected,
      borrowerNames: MSFG.Borrowers.joinNames(selected.map(function (b) { return b.name; })),
      signers: selected.map(function (b) { return { name: b.name }; }),
      // ...unchanged: loanNumber, subjectPropertyAddress, letterDate, topic, explanation, letterSettings
    };
```

(Keep the rest of the returned object as-is.) Update any client preview builder that referenced `loxBorrowerNames`/`loxSigner*` to use `collectPayload().borrowerNames` / `.signers`.

- [ ] **Step 3: Generator (`genericLoxPdf.js`)** — the signatures already come from `b.signers`. Raise the cap from 5 and prefer `b.borrowers`:

```js
  const rawSigners = (Array.isArray(b.borrowers) && b.borrowers.length ? b.borrowers
    : (Array.isArray(b.signers) ? b.signers : [])).slice(0, 8);
  const signatures = (rawSigners.length ? rawSigners : [{}])
    .map(function (s) { return { caption: 'Signature', name: undefined }; }); // blank line, no pre-printed name
```

(Per the earlier no-auto-signature rule, draw a blank line — the `name` stays undefined so nothing is pre-printed; the borrower's identity already appears in the body via `borrowerNames`.)

- [ ] **Step 4: Verify** — restart server. `preview_eval` `/documents/generic-lox`: confirm `#borrowersList` exists, add 3 names, `MSFG.Borrowers` getSelected length 3. POST `collectPayload()` to `/api/pdf/generic-lox`; expect `200 application/pdf`. Render to image: 3 blank signature lines, body names "A, B, and C". No console errors.

- [ ] **Step 5: Commit** — `git commit -m "generic-lox: drive borrowers + signatures from shared list"`

---

## Task 3: Wire credit-inquiry

Replaces `senderName` + `coBorrowerName` with the shared list.

**Files:** `views/documents/credit-inquiry.ejs`, `public/js/documents/credit-inquiry.js`, `lib/pdf/creditInquiryPdf.js`

- [ ] **Step 1: EJS** — replace the `senderName` and `coBorrowerName` form-groups with `<%- include('../partials/borrowers-list') %>`. Keep `subjectPropertyAddress`, `loanNumber`, the inquiry-rows table, and `ciNotes`.
- [ ] **Step 2: Client** — in `onReady`, after the existing inquiry-row wiring, add `borrowers = MSFG.Borrowers.init({ containerId:'borrowersList', addBtnId:'addBorrower', onChange: api.regenerate });`. In `applyMismo`: `if (borrowers && Array.isArray(parsed.borrowers)) borrowers.seed(parsed.borrowers);` (remove the senderName/coBorrowerName sets). Where the PDF payload/preview is built from `val('senderName')`/`val('coBorrowerName')`, replace with `const selected = borrowers ? borrowers.getSelected() : []; const names = MSFG.Borrowers.joinNames(selected.map(b=>b.name));` and send `borrowers: selected` in the payload; use `names` in the salutation/identification preview.
- [ ] **Step 3: Generator (`creditInquiryPdf.js`)** — replace:

```js
const signatures = [{ caption: 'Signature', name: b.senderName }];
if (b.coBorrowerName) signatures.push({ caption: 'Co-borrower Signature', name: b.coBorrowerName });
```

with:

```js
const sel = (Array.isArray(b.borrowers) ? b.borrowers : []).filter(function (x) { return x && x.name; });
const names = sel.map(function (x) { return x.name; });
const signatures = (names.length ? names : ['']).map(function () { return { caption: 'Signature', name: undefined }; });
```

and wherever the body used `b.senderName`/`b.coBorrowerName` for the identification line, use the joined `names` (replicate the join helper inline or read `b.borrowerNames` if the client sends it).
- [ ] **Step 4: Verify** — render credit-inquiry with `borrowers:[{name:'A'},{name:'B'}]`; expect 2 blank signature lines, body lists "A and B". No console errors.
- [ ] **Step 5: Commit** — `git commit -m "credit-inquiry: multi-borrower list + per-borrower signature lines"`

---

## Task 4: Wire address-lox

Replaces `borrowerName` with the shared list; keep the repeating address rows.

**Files:** `views/documents/address-lox.ejs`, `public/js/documents/address-lox.js`, `lib/pdf/addressLoxPdf.js`

- [ ] **Step 1: EJS** — replace the `borrowerName` form-group with `<%- include('../partials/borrowers-list') %>`. Keep `loxLoanNumber`, `currentAddress`, `letterDate`, and the address rows.
- [ ] **Step 2: Client** — in `onReady` (alongside the address-row setup) add the `MSFG.Borrowers.init(...)`. In `seedFromMismo`: `if (borrowers && Array.isArray(parsed.borrowers)) borrowers.seed(parsed.borrowers);` (remove the single `borrowerName` set). In `collectPdfPayload`, replace `borrowerName: val('borrowerName')` with `borrowers: (borrowers ? borrowers.getSelected() : []), borrowerNames: MSFG.Borrowers.joinNames((borrowers?borrowers.getSelected():[]).map(b=>b.name))`.
- [ ] **Step 3: Generator (`addressLoxPdf.js`)** — replace `signatures: [{ caption: 'Signature', name: b.borrowerName }]` with:

```js
signatures: ((Array.isArray(b.borrowers) ? b.borrowers : []).filter(function (x){return x&&x.name;}).length
  ? b.borrowers.filter(function (x){return x&&x.name;}) : [{}])
  .map(function () { return { caption: 'Signature', name: undefined }; }),
```

and use `b.borrowerNames` (or join inline) wherever the salutation referenced `b.borrowerName`.
- [ ] **Step 4: Verify** — render with 2 borrowers + 2 address rows; expect 2 blank signature lines, address rows intact. No console errors.
- [ ] **Step 5: Commit** — `git commit -m "address-lox: multi-borrower list + per-borrower signatures"`

---

## Task 5: Wire gift-letter (recipients = list; donor unchanged)

**Files:** `views/documents/gift-letter.ejs`, `public/js/documents/gift-letter.js`, `lib/pdf/giftLetterPdf.js`

- [ ] **Step 1: EJS** — replace the `giftRecipientName` form-group with `<%- include('../partials/borrowers-list') %>` (label it "Applicant(s) / Recipient(s)" by passing `rowLabel` — see Step 2). Leave ALL donor fields (`giftDonorName`, `giftDonorAddress`, etc.) untouched.
- [ ] **Step 2: Client** — `borrowers = MSFG.Borrowers.init({ containerId:'borrowersList', addBtnId:'addBorrower', rowLabel:'Recipient', onChange: api.regenerate });`. In `applyMismo`: `if (borrowers && Array.isArray(parsed.borrowers)) borrowers.seed(parsed.borrowers);` (remove the `giftRecipientName` set). In `collectPayload`, replace `recipientName: val('giftRecipientName')` with `recipients: (borrowers?borrowers.getSelected():[]), recipientNames: MSFG.Borrowers.joinNames((borrowers?borrowers.getSelected():[]).map(b=>b.name))`.
- [ ] **Step 3: Generator (`giftLetterPdf.js`)** — keep the donor signature; expand recipient signatures to one per recipient:

```js
const recips = (Array.isArray(b.recipients) ? b.recipients : []).filter(function (x){return x&&x.name;});
const signatures = [{ caption: 'Donor Signature', name: undefined }].concat(
  (recips.length ? recips : [{}]).map(function () { return { caption: 'Recipient (Borrower) Signature', name: undefined }; })
);
```

Use `b.recipientNames` wherever the body referenced the recipient (the "Applicant(s)").
- [ ] **Step 4: Verify** — render with 2 recipients; expect 1 donor line + 2 recipient lines (all blank), donor block unchanged, body shows "A and B". No console errors.
- [ ] **Step 5: Commit** — `git commit -m "gift-letter: multi-recipient list (donor unchanged)"`

---

## Task 6: Wire pre-approval (names only — no borrower signature)

**Files:** `views/documents/pre-approval.ejs`, `public/js/documents/pre-approval.js`, `lib/pdf/preApprovalPdf.js`

- [ ] **Step 1: EJS** — replace the single `borrowerName` form-group (Section 1) with `<%- include('../partials/borrowers-list') %>`. **Keep `borrowerAddress`** as the single address field.
- [ ] **Step 2: Client** — `borrowers = MSFG.Borrowers.init({ containerId:'borrowersList', addBtnId:'addBorrower', onChange: api.regenerate });` in `onReady`. In `applyMismo`: `if (borrowers && Array.isArray(parsed.borrowers)) borrowers.seed(parsed.borrowers);` (remove the single `borrowerName` set). In `collectPdfPayload`, replace `borrowerName: val('borrowerName')` with `borrowerNames: MSFG.Borrowers.joinNames((borrowers?borrowers.getSelected():[]).map(b=>b.name))` (and drop the `borrowerName` key). Update the preview builder (`generateLetter`) to use that joined string for the "This letter confirms that …" line and the Borrower header row. Add `'borrowersList'` is NOT a field — instead pass `onChange: api.regenerate` so edits rebuild the preview.
- [ ] **Step 3: Generator (`preApprovalPdf.js`)** — change the body + header to use `b.borrowerNames`:
  - Header row: `if (b.borrowerNames) headerRows.push({ label: 'Borrower', value: b.borrowerNames });` (replace the `b.borrowerName` usage).
  - Intro paragraph: `'This letter confirms that ' + (b.borrowerNames || 'the borrower') + (b.borrowerAddress ? ', residing at ' + b.borrowerAddress + ',' : '') + ' has been pre-approved …'`.
  - **Do NOT add borrower signatures** — the LO signature block is unchanged.
- [ ] **Step 4: Verify** — render with `borrowerNames:'Kyle William Tawney and Alice Ann Tawney'`; expect the body + Borrower header to show both names, single address, LO signature only (no borrower line), EHL + logo intact, left-aligned body. No console errors.
- [ ] **Step 5: Commit** — `git commit -m "pre-approval: name multiple borrowers (LO-signed, no borrower signature)"`

---

## Task 7: Phase 2 sign-off

- [ ] **Step 1** — Load each of the 5 letter pages; `preview_console_logs` error → none for each. Confirm each shows the Borrowers list, MISMO autofill seeds it (where a MISMO sample is available), preview is read-only.
- [ ] **Step 2** — `git status -sb`: no stray `tmp-*`; intended commits ahead of origin.
- [ ] **Step 3** — Push only if the user asks: `git push origin main`.

---

## Self-Review

- **Spec coverage (Feature 1):** shared component → Task 1; per-letter semantics → Tasks 2-6 (credit-inquiry per-borrower sigs; generic-lox list; address-lox list + address rows kept; gift-letter recipients + donor separate; pre-approval names only, no borrower sig, address single). ✅
- **Placeholder scan:** Each task gives exact files, exact field ids to remove, the partial to include, and the generator signature code. The per-letter client edits reference the same `MSFG.Borrowers.init/seed/getSelected/joinNames` API defined in Task 1. ✅
- **Type/name consistency:** API is `MSFG.Borrowers.init({containerId,addBtnId,rowLabel,onChange}) → {addRow,getAll,getSelected,seed}` and `MSFG.Borrowers.joinNames(string[])`; payload key is `borrowers: [{name,include}]` (gift uses `recipients`; pre-approval sends only `borrowerNames`). Generators read `b.borrowers`/`b.recipients`/`b.borrowerNames` accordingly. Signatures draw blank lines (`name: undefined`) per the no-auto-signature rule. ✅
- **Note:** `generic-lox` previously capped signers at 5; raised to 8. If a letter never sends `parsed.borrowers`, `seed()` is a no-op and the single default row remains (safe).
