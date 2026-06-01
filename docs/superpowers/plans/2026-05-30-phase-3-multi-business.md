# Phase 3 — Income Statement & Balance Sheet: per-business statements + custom rows

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the income statement and balance sheet (a) add custom line items to each section, and (b) hold several businesses in one form, emitting one statement per business in the downloaded PDF.

**Architecture:** Two small shared vanilla-JS components on `window.MSFG`:
- `MSFG.CustomRows` — manages a `<tbody>` of `{label, amount}` rows for one section (add/remove, total, get/set).
- `MSFG.MultiBusiness` — a business switcher that snapshots the whole form (standard fields + every CustomRows section) per business and restores it on switch, via doc-supplied `serialize`/`deserialize` callbacks.
Both docs keep their existing `calculate()` + `getEmailData()` + `/api/pdf/structured` flow; we extend them. The structured renderer is unchanged — multiple businesses are just more `sections` (one heading group per business).

**Tech stack:** Express/EJS, vanilla JS IIFE modules on `window.MSFG` (no bundler), pdf-lib via `lib/pdf/structuredPdf.js`, `MSFG.parseNum`/`MSFG.formatCurrency`/`MSFG.val` helpers.

---

## File structure

- **Create** `public/js/shared/custom-rows.js` — `MSFG.CustomRows` (section line-item rows).
- **Create** `public/js/shared/multi-business.js` — `MSFG.MultiBusiness` (business switcher + snapshots).
- **Modify** `public/css/components.css` (append) — `.custom-rows*` + `.business-switcher*` styles.
- **Modify** `views/layouts/main.ejs` — load the two new scripts.
- **Modify** `views/documents/income-statement.ejs` + `balance-sheet.ejs` — add a business switcher control above Section 1, and an "Add line" button + `<tbody>` per section.
- **Modify** `public/js/documents/income-statement.js` + `balance-sheet.js` — init CustomRows per section + MultiBusiness; fold custom rows into `calculate()` + `getEmailData()`; emit one section-group per business.

Data shapes (unchanged consumer = `structuredPdf.js`):
- Section: `{ heading: string, rows: [{label, value, isTotal?, bold?}] }`
- CustomRows row (internal): `{ label: string, amount: number }`
- MultiBusiness business (internal): `{ id: string, name: string, snapshot: object }`
- snapshot (doc-defined): `{ fields: {<id>: <stringValue>}, custom: {<sectionKey>: [{label, amount}]} }`

---

## Task 1: `MSFG.CustomRows` shared component

**Files:**
- Create: `public/js/shared/custom-rows.js`
- Modify: `public/css/components.css` (append)
- Modify: `views/layouts/main.ejs`

- [ ] **Step 1: Create `public/js/shared/custom-rows.js`**

```javascript
/* =====================================================
   MSFG.CustomRows — dynamic {label, amount} line items for a
   financial-statement section. One instance per section (e.g.
   Revenue, Expenses, Assets). Rows live in a <tbody>; each row is
   a label input + amount input + remove button. Mirrors the
   credit-inquiry add-row pattern.
   ===================================================== */
(function () {
  'use strict';
  const MSFG = window.MSFG || (window.MSFG = {});

  function init(opts) {
    const tbody = document.getElementById(opts.tbodyId);
    const addBtn = document.getElementById(opts.addBtnId);
    const onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};
    if (!tbody) return null;

    function makeRow(data) {
      data = data || {};
      const tr = document.createElement('tr');
      tr.className = 'custom-rows__row';
      tr.innerHTML =
        '<td><input type="text" class="custom-rows__label" placeholder="' +
          (opts.labelPlaceholder || 'Description') + '"></td>' +
        '<td><input type="text" inputmode="decimal" class="custom-rows__amount" placeholder="0.00"></td>' +
        '<td><button type="button" class="custom-rows__remove" title="Remove line">×</button></td>';
      tr.querySelector('.custom-rows__label').value = data.label != null ? String(data.label) : '';
      tr.querySelector('.custom-rows__amount').value = data.amount != null && data.amount !== '' ? String(data.amount) : '';
      tr.querySelectorAll('input').forEach(function (el) {
        el.addEventListener('input', onChange);
        el.addEventListener('change', onChange);
      });
      tr.querySelector('.custom-rows__remove').addEventListener('click', function () {
        tr.remove();
        onChange();
      });
      return tr;
    }

    function addRow(data) { const tr = makeRow(data); tbody.appendChild(tr); return tr; }

    if (addBtn) addBtn.addEventListener('click', function () { addRow(); onChange(); });

    return {
      addRow: addRow,
      // [{label, amount(number)}] — blank rows (no label AND no amount) are dropped.
      getRows: function () {
        return Array.prototype.slice.call(tbody.querySelectorAll('.custom-rows__row')).map(function (tr) {
          const label = tr.querySelector('.custom-rows__label').value.trim();
          const amount = MSFG.parseNum(tr.querySelector('.custom-rows__amount').value);
          return { label: label, amount: amount };
        }).filter(function (r) { return r.label !== '' || r.amount !== 0; });
      },
      total: function () {
        return this.getRows().reduce(function (a, r) { return a + r.amount; }, 0);
      },
      setRows: function (rows) {
        tbody.innerHTML = '';
        (rows || []).forEach(function (r) { addRow(r); });
      }
    };
  }

  MSFG.CustomRows = { init: init };
})();
```

- [ ] **Step 2: Append styles to `public/css/components.css`**

```css
/* Custom line-item rows (financial statements) + business switcher */
.custom-rows { width: 100%; border-collapse: collapse; margin-top: var(--space-sm); }
.custom-rows td { padding: 4px 6px 4px 0; vertical-align: middle; }
.custom-rows__label { width: 100%; }
.custom-rows__amount { width: 120px; text-align: right; }
.custom-rows__remove {
  border: 0; background: transparent; color: var(--color-gray-500);
  font-size: 1.1rem; line-height: 1; cursor: pointer; padding: 0 6px;
}
.custom-rows__remove:hover { color: #b91c1c; }
.business-switcher { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; margin-bottom: var(--space-md); }
.business-switcher select { min-width: 220px; }
```

- [ ] **Step 3: Load the script in `views/layouts/main.ejs`**

Add immediately after the `letter-doc.js` script line, matching the existing `<%= basePath %>.../...<%= jsExt %>?v=<%= v %>` pattern:

```html
  <script src="<%= basePath %>/js/shared/custom-rows<%= jsExt %>?v=<%= v %>"></script>
```

- [ ] **Step 4: Verify** — `node --check public/js/shared/custom-rows.js` (exit 0). The orchestrator will load a doc page in the browser and confirm `MSFG.CustomRows.init` exists and add/remove/get/total work (no test harness for browser IIFEs).

- [ ] **Step 5: Commit**

```bash
git add public/js/shared/custom-rows.js public/css/components.css views/layouts/main.ejs
git commit -m "Add MSFG.CustomRows shared line-item component"
```

---

## Task 2: Custom rows in the income statement

**Files:**
- Modify: `views/documents/income-statement.ejs`
- Modify: `public/js/documents/income-statement.js`

- [ ] **Step 1: EJS — add an "Add line" button + `<tbody>` to Revenue and Expenses.**

In Section 2 (Revenue), AFTER the `otherIncome`/`returnsAllowances` inputs and BEFORE the `totalRevenue` readonly field, insert:

```html
        <table class="custom-rows"><tbody id="revenueCustomRows"></tbody></table>
        <button type="button" class="btn btn-link btn-sm" id="addRevenueRow">+ Add revenue line</button>
```

In Section 3 (Expenses), AFTER the standard expense inputs and BEFORE `totalExpenses`, insert:

```html
        <table class="custom-rows"><tbody id="expenseCustomRows"></tbody></table>
        <button type="button" class="btn btn-link btn-sm" id="addExpenseRow">+ Add expense line</button>
```

- [ ] **Step 2: JS — init the two CustomRows instances and fold into totals + payload.**

In `public/js/documents/income-statement.js`:

(a) Add module vars near the top of the IIFE:
```javascript
  let revenueRowsCtl = null;
  let expenseRowsCtl = null;
```

(b) In `calculate()`, add the custom totals (read the actual current variable names from the file; the custom totals add to the existing `totalRevenue` / `totalExpenses` BEFORE `netIncome` is computed):
```javascript
  const revenueCustom = revenueRowsCtl ? revenueRowsCtl.total() : 0;
  const expenseCustom = expenseRowsCtl ? expenseRowsCtl.total() : 0;
  // ...existing standard sums...
  const totalRevenue = grossSales + otherIncome - returns + revenueCustom;
  const totalExpenses = costOfGoods + wages + rent + utilities + insurance + depreciation + interest + other + expenseCustom;
```

(c) In `getEmailData()`, splice custom rows into each section's `rows` BEFORE the `Total` row:
```javascript
  const revRows = [ /* existing standard {label,value} items */ ];
  (revenueRowsCtl ? revenueRowsCtl.getRows() : []).forEach(function (r) {
    revRows.push({ label: r.label || 'Other revenue', value: MSFG.formatCurrency(r.amount) });
  });
  revRows.push({ label: 'Total Revenue', value: val('totalRevenue'), isTotal: true });
```
(and the same shape for the expense section with `expenseRowsCtl`).

(d) In the `DOMContentLoaded` handler, init the controllers BEFORE the first `calculate()` and re-use `calculate` as `onChange`:
```javascript
  revenueRowsCtl = MSFG.CustomRows.init({ tbodyId: 'revenueCustomRows', addBtnId: 'addRevenueRow', labelPlaceholder: 'Revenue line', onChange: calculate });
  expenseRowsCtl = MSFG.CustomRows.init({ tbodyId: 'expenseCustomRows', addBtnId: 'addExpenseRow', labelPlaceholder: 'Expense line', onChange: calculate });
  calculate();
```

- [ ] **Step 3: Verify** — `node --check public/js/documents/income-statement.js`. Orchestrator: in-browser add a revenue line ($1,000) + expense line ($400), confirm Total Revenue / Total Expenses / Net Income update, then POST `getEmailData()` to `/api/pdf/structured` and render — the custom lines appear under the right sections, no console errors.

- [ ] **Step 4: Commit**

```bash
git add views/documents/income-statement.ejs public/js/documents/income-statement.js
git commit -m "income-statement: custom revenue/expense line items"
```

---

## Task 3: Custom rows in the balance sheet

**Files:**
- Modify: `views/documents/balance-sheet.ejs`
- Modify: `public/js/documents/balance-sheet.js`

- [ ] **Step 1: EJS — add "Add line" + `<tbody>` to Assets, Liabilities, Owner's Equity.**

In Section 2 (Assets) before `totalAssets`:
```html
        <table class="custom-rows"><tbody id="assetCustomRows"></tbody></table>
        <button type="button" class="btn btn-link btn-sm" id="addAssetRow">+ Add asset line</button>
```
In Section 3 (Liabilities) before `totalLiabilities`:
```html
        <table class="custom-rows"><tbody id="liabilityCustomRows"></tbody></table>
        <button type="button" class="btn btn-link btn-sm" id="addLiabilityRow">+ Add liability line</button>
```
In Section 4 (Owner's Equity) before `totalEquity`:
```html
        <table class="custom-rows"><tbody id="equityCustomRows"></tbody></table>
        <button type="button" class="btn btn-link btn-sm" id="addEquityRow">+ Add equity line</button>
```

- [ ] **Step 2: JS — mirror Task 2 with three controllers.**

In `public/js/documents/balance-sheet.js`:
```javascript
  let assetRowsCtl = null, liabilityRowsCtl = null, equityRowsCtl = null;
```
In `calculate()` add each custom total into the matching section total BEFORE the balance check:
```javascript
  const totalAssets = cash + ar + inventory + prepaid + property + otherA + (assetRowsCtl ? assetRowsCtl.total() : 0);
  const totalLiabilities = ap + shortDebt + longDebt + otherL + (liabilityRowsCtl ? liabilityRowsCtl.total() : 0);
  const totalEquity = ownerCap + retained + (equityRowsCtl ? equityRowsCtl.total() : 0);
```
In `getEmailData()` splice each section's custom rows in BEFORE its Total row (same shape as Task 2 Step 2c). In `DOMContentLoaded`, init the three controllers with `onChange: calculate` before the first `calculate()`.

- [ ] **Step 3: Verify** — `node --check public/js/documents/balance-sheet.js`. Orchestrator: add an asset line + liability line in-browser, confirm Total Assets/Liabilities/Equity update and the balance-check alert recomputes; render the structured PDF and confirm the lines appear, no console errors.

- [ ] **Step 4: Commit**

```bash
git add views/documents/balance-sheet.ejs public/js/documents/balance-sheet.js
git commit -m "balance-sheet: custom asset/liability/equity line items"
```

---

## Task 4: `MSFG.MultiBusiness` shared component

**Files:**
- Create: `public/js/shared/multi-business.js`
- Modify: `views/layouts/main.ejs`

- [ ] **Step 1: Create `public/js/shared/multi-business.js`**

```javascript
/* =====================================================
   MSFG.MultiBusiness — hold several businesses in one financial
   form. Snapshots the whole form (via doc-supplied serialize) per
   business and restores it on switch (deserialize). The doc owns
   what a snapshot contains (standard fields + custom rows); this
   module owns the list + the switcher UI.
   ===================================================== */
(function () {
  'use strict';
  const MSFG = window.MSFG || (window.MSFG = {});
  let _seq = 0;
  function nextId() { _seq += 1; return 'biz_' + _seq; }

  function init(opts) {
    const select = document.getElementById(opts.selectId);
    const addBtn = document.getElementById(opts.addBtnId);
    const renameBtn = opts.renameBtnId ? document.getElementById(opts.renameBtnId) : null;
    const removeBtn = opts.removeBtnId ? document.getElementById(opts.removeBtnId) : null;
    const serialize = opts.serialize;     // () => snapshot
    const deserialize = opts.deserialize; // (snapshot) => void
    if (!select || typeof serialize !== 'function' || typeof deserialize !== 'function') return null;

    const businesses = [{ id: nextId(), name: 'Business 1', snapshot: null }];
    let active = 0;

    function label(b, i) { return b.name && b.name.trim() ? b.name : ('Business ' + (i + 1)); }
    function refresh() {
      select.innerHTML = '';
      businesses.forEach(function (b, i) {
        const o = document.createElement('option');
        o.value = String(i); o.textContent = label(b, i);
        select.appendChild(o);
      });
      select.value = String(active);
    }
    function saveActive() { businesses[active].snapshot = serialize(); }
    function loadActive() { deserialize(businesses[active].snapshot || { fields: {}, custom: {} }); }

    select.addEventListener('change', function () {
      saveActive();
      active = parseInt(select.value, 10) || 0;
      loadActive();
    });
    if (addBtn) addBtn.addEventListener('click', function () {
      saveActive();
      businesses.push({ id: nextId(), name: 'Business ' + (businesses.length + 1), snapshot: null });
      active = businesses.length - 1;
      deserialize({ fields: {}, custom: {} }); // clear the form for the new business
      refresh();
    });
    if (renameBtn) renameBtn.addEventListener('click', function () {
      const name = window.prompt('Business name:', businesses[active].name);
      if (name != null) { businesses[active].name = name.trim() || businesses[active].name; refresh(); }
    });
    if (removeBtn) removeBtn.addEventListener('click', function () {
      if (businesses.length <= 1) return;
      businesses.splice(active, 1);
      active = Math.max(0, active - 1);
      loadActive();
      refresh();
    });

    refresh();

    return {
      // Snapshot the current form into the active business, then return all
      // businesses (so the PDF builder can emit one statement each).
      getAll: function () { saveActive(); return businesses.map(function (b, i) { return { name: label(b, i), snapshot: b.snapshot }; }); },
      activeName: function () { return label(businesses[active], active); }
    };
  }

  MSFG.MultiBusiness = { init: init };
})();
```

- [ ] **Step 2: Load it in `views/layouts/main.ejs`** (after the `custom-rows.js` line):

```html
  <script src="<%= basePath %>/js/shared/multi-business<%= jsExt %>?v=<%= v %>"></script>
```

- [ ] **Step 3: Verify** — `node --check public/js/shared/multi-business.js`. Orchestrator verifies the switcher in Task 5.

- [ ] **Step 4: Commit**

```bash
git add public/js/shared/multi-business.js views/layouts/main.ejs
git commit -m "Add MSFG.MultiBusiness shared business-switcher component"
```

---

## Task 5: Wire MultiBusiness into the income statement (per-business PDF)

**Files:**
- Modify: `views/documents/income-statement.ejs`
- Modify: `public/js/documents/income-statement.js`

- [ ] **Step 1: EJS — add the switcher control above Section 1.**

```html
    <div class="business-switcher">
      <label for="businessSelect" class="form-label">Business</label>
      <select id="businessSelect"></select>
      <button type="button" class="btn btn-sm btn-secondary" id="addBusiness">+ Add business</button>
      <button type="button" class="btn btn-sm btn-link" id="renameBusiness">Rename</button>
      <button type="button" class="btn btn-sm btn-link" id="removeBusiness">Remove</button>
    </div>
```

- [ ] **Step 2: JS — serialize/deserialize the form (standard fields + custom rows), and emit one section-group per business.**

(a) Define the standard field id list + serialize/deserialize:
```javascript
  const FIELD_IDS = ['businessName','ownerName','periodStart','periodEnd','grossSales','otherIncome','returnsAllowances','costOfGoods','wages','rent','utilities','insurance','depreciation','interestExpense','otherExpenses'];
  let businessCtl = null;

  function serialize() {
    const fields = {};
    FIELD_IDS.forEach(function (id) { fields[id] = val(id); });
    return { fields: fields, custom: {
      revenue: revenueRowsCtl ? revenueRowsCtl.getRows() : [],
      expense: expenseRowsCtl ? expenseRowsCtl.getRows() : []
    } };
  }
  function deserialize(snap) {
    snap = snap || { fields: {}, custom: {} };
    FIELD_IDS.forEach(function (id) { setVal(id, (snap.fields && snap.fields[id]) || ''); });
    if (revenueRowsCtl) revenueRowsCtl.setRows((snap.custom && snap.custom.revenue) || []);
    if (expenseRowsCtl) expenseRowsCtl.setRows((snap.custom && snap.custom.expense) || []);
    calculate();
  }
```

(b) Refactor the section-building out of `getEmailData()` into `sectionsFor(snap)` that builds the Revenue/Expenses/Summary section group from a snapshot (NOT the live form), prefixing each heading with the business name. Then:
```javascript
  function getEmailData() {
    const all = businessCtl ? businessCtl.getAll() : [{ name: cleanName(), snapshot: serialize() }];
    const sections = [];
    all.forEach(function (biz) {
      sectionsFor(biz.snapshot, biz.name).forEach(function (s) { sections.push(s); });
    });
    return { title: 'Income Statement', sections: sections };
  }
```
Where `sectionsFor(snap, bizName)` computes totals from `snap.fields` + `snap.custom` (same math as `calculate()`) and returns `[{heading: bizName + ' — Revenue', rows}, {heading: bizName + ' — Expenses', rows}, {heading: bizName + ' — Summary', rows:[{label:'Net Income', value, bold:true, isTotal:true}]}]`. Custom rows from `snap.custom.revenue/expense` are spliced before each Total row.

(c) In `DOMContentLoaded`, init MultiBusiness AFTER the CustomRows controllers:
```javascript
  businessCtl = MSFG.MultiBusiness.init({ selectId: 'businessSelect', addBtnId: 'addBusiness', renameBtnId: 'renameBusiness', removeBtnId: 'removeBusiness', serialize: serialize, deserialize: deserialize });
```

- [ ] **Step 3: Verify** — `node --check`. Orchestrator: fill Business 1 (name + revenue), Add business, fill Business 2, Download → render the structured PDF and confirm **two** statement groups ("Acme — Revenue/Expenses/Summary", "Beta — ..."), each with its own totals; switching back to Business 1 restores its values; no console errors.

- [ ] **Step 4: Commit**

```bash
git add views/documents/income-statement.ejs public/js/documents/income-statement.js
git commit -m "income-statement: one statement per business via MSFG.MultiBusiness"
```

---

## Task 6: Wire MultiBusiness into the balance sheet

**Files:**
- Modify: `views/documents/balance-sheet.ejs`
- Modify: `public/js/documents/balance-sheet.js`

- [ ] **Step 1: EJS** — add the same `.business-switcher` block above Section 1 (ids: `businessSelect`, `addBusiness`, `renameBusiness`, `removeBusiness`).

- [ ] **Step 2: JS** — mirror Task 5 with the balance-sheet field set and three custom sections:
```javascript
  const FIELD_IDS = ['businessName','ownerName','asOfDate','cash','accountsReceivable','inventory','prepaidExpenses','propertyEquipment','otherAssets','accountsPayable','shortTermDebt','longTermDebt','otherLiabilities','ownerCapital','retainedEarnings'];
```
`serialize().custom = { asset: assetRowsCtl.getRows(), liability: liabilityRowsCtl.getRows(), equity: equityRowsCtl.getRows() }`. `sectionsFor(snap, bizName)` returns Assets/Liabilities/Owner's-Equity groups (+ optionally a balance note) per business, headings prefixed with the business name. `getEmailData()` concatenates groups across `businessCtl.getAll()`. Init MultiBusiness after the three CustomRows controllers.

- [ ] **Step 3: Verify** — `node --check`. Orchestrator: two businesses, Download → render → two balance-sheet groups with correct per-business totals; switch restores values; no console errors.

- [ ] **Step 4: Commit**

```bash
git add views/documents/balance-sheet.ejs public/js/documents/balance-sheet.js
git commit -m "balance-sheet: one statement per business via MSFG.MultiBusiness"
```

---

## Task 7: Phase 3 sign-off

- [ ] **Step 1:** Load both pages — no console errors; switcher + Add-line work; single-business download still produces a clean one-statement PDF (back-compat).
- [ ] **Step 2:** Render a 2-business income statement and a 2-business balance sheet to images; confirm one labeled group per business with correct totals and custom lines.
- [ ] **Step 3:** `git status` clean (only `.claude/` noise + untracked plan docs). Final inline review of the diff for the two shared components.
- [ ] **Step 4:** Report Phase 3 complete; push to `main` if the user approves.

---

## Out of scope (YAGNI)
- No persistence of businesses across page reloads (in-memory only, like the rest of the app).
- No per-line "business tag" — businesses are independent snapshots.
- No page-break-per-business in the renderer; businesses are separated by their bold heading groups (revisit only if it reads cramped).
- No MISMO seeding for these docs (none exists today).
