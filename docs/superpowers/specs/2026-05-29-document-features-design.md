# Document Features — Design Spec (2026-05-29)

Five independent feature additions to the MSFG docs app. The app renders PDFs
with **pdf-lib** from structured form fields (no headless browser); letter
previews are read-only and rebuilt from the fields. This spec keeps that
architecture.

Delivery is **phased** (see end). Each phase is independently committable.

---

## Feature 1 — Multi-borrower for all letters

### Goal
All five letters (credit-inquiry, gift-letter, address-lox, generic-lox,
pre-approval) support **N borrowers**, seeded from an uploaded MISMO file, with
a per-borrower "include in this letter" checkbox. Selected borrowers drive the
salutation/body and (where applicable) the signature lines — any combination.

### Shared component
- **`views/partials/borrowers-list.ejs`** — a "Borrowers" section: a container
  (`#borrowersList`), an **Add borrower** button. Rendered near the top of each
  letter's form (replaces today's single borrower/co-borrower name inputs).
- **`public/js/shared/borrowers.js`** → `MSFG.Borrowers`:
  - `init({ containerId, onChange, addBtnId })` — renders rows; wires add /
    remove / checkbox; calls `onChange` (the doc's `regenerate`) on any edit.
  - `seed(names[])` — populate from MISMO. Idempotent: fills empty rows / adds
    missing names; does **not** clobber names the user already typed.
  - `getSelected()` → `[{ name }]` for checked rows only. `getAll()` → all rows.
  - Each row = name text input + "include" checkbox (default **checked**) +
    remove button.
- Loaded in `views/layouts/main.ejs` after `letter-doc.js`.

### Data flow
- Each letter's `collectPayload()` adds `borrowers: MSFG.Borrowers.getSelected()`
  (array of `{ name }`). Generators build salutation + signatures from it.
- Name joining helper: `["A"] → "A"`, `["A","B"] → "A and B"`,
  `["A","B","C"] → "A, B, and C"`.

### MISMO seeding
- Each letter's `applyMismo(parsed)` calls
  `MSFG.Borrowers.seed((parsed.borrowers || []).map(b => b.name))`, falling back
  to `[parsed.borrowerName, parsed.coBorrowerName].filter(Boolean)`.
- The existing `MSFG_MISMO` postMessage flow in `letter-doc.js` is unchanged.

### Per-letter semantics
- **credit-inquiry** — Borrowers list replaces `senderName` + `coBorrowerName`.
  Selected names appear in the identification block + salutation; **one
  signature line per selected borrower**. `subjectPropertyAddress`, `loanNumber`
  unchanged.
- **generic-lox** — replaces `loxBorrowerNames` / `loxSigner1` / `loxSigner2`.
  Body "I/We" wording + one signer line per selected borrower.
- **address-lox** — replaces `borrowerName`. One signer line per selected
  borrower. The repeating address rows are unchanged.
- **gift-letter** — the Borrowers list is the **recipient(s)** of the gift. The
  **donor fields stay separate and unchanged.** Selected recipients render as
  "Applicant(s)" and get one **recipient** signature line each; the **donor
  signature line is unchanged**.
- **pre-approval** — lender-authored. Selected borrowers are the **named
  approved parties** in the body ("This letter confirms that A and B have been
  pre-approved…"). **No borrower signature** (the LO signs, as today).
  `borrowerAddress` stays a single field.

### Generators
- The borrower-letter renderers already accept `signatures: [{ caption }]` — emit
  one entry per selected borrower (caption "Signature" / "Co-Borrower Signature"
  / "Borrower N Signature"). The blank-line (no pre-printed name) behavior is
  retained.

---

## Feature 2 — Pre-approval new fields

In `views/documents/pre-approval.ejs` Section 2 (Loan Details),
`public/js/documents/pre-approval.js`, and `lib/pdf/preApprovalPdf.js`:

- **Loan Type** — add `<option>Construction</option>`.
- **Occupancy** — new `<select id="occupancy">`: Owner Occupied / Second Home /
  Investment Property (blank default). Adds an "Occupancy" row to the terms table
  when set.
- **Property Type** — a checkbox `#includePropertyType` + `<select
  id="propertyType">` (Single Family / Multi-Family / Condo / Manufactured Home /
  Town Home / PUD). When the checkbox is on, adds a "Property Type" row.
- Terms-table order: Loan Type, Purpose, Property Type, Occupancy, Approved
  Amount, Interest Rate, Loan Term, Down Payment, Valid Until.
- Wired in `collectPayload()`, the `generateLetter()` preview rows, and
  `termRows` in `generatePreApprovalPdfBuffer()`.

---

## Feature 3 — Income statement & balance sheet: one statement per business + custom rows

Files: `views/documents/income-statement.ejs` + `balance-sheet.ejs`,
`public/js/documents/income-statement.js` + `balance-sheet.js`, and optionally a
shared `public/js/shared/multi-business.js` helper to avoid duplicating the
switcher across both docs. PDF via the existing `/api/pdf/structured` →
`lib/pdf/structuredPdf.js`.

### Business switcher
- A "Business" control at the top: a `<select>` of businesses + **Add business**,
  **Rename**, **Remove**. Defaults to one business.
- Client state: `businesses = [{ id, name, fields: {…standard ids→values},
  customRows: { <section>: [{ label, amount }] } }]` plus an active index.
- On switch: save the current form into the active business, then load the
  selected business into the form (standard fields + custom rows).

### Custom rows
- Keep **every** existing standard line item. Add an **Add line** button +
  container per section:
  - Income statement: **Revenue**, **Expenses**.
  - Balance sheet: **Assets**, **Liabilities**, **Owner's Equity**.
- Each custom row = label input + amount input + remove. Section totals (and the
  balance check) include standard + custom rows. Mirrors the credit-inquiry
  add-row pattern (`renderInquiryRow` / `addInquiryRow`).

### PDF — one statement per business
- The download builds `{ title, sections }` where, **for each business**, a group
  of sections is emitted with the business name in the heading (e.g. "Acme LLC —
  Revenue", "Acme LLC — Expenses", "Acme LLC — Summary"). Businesses render
  sequentially in document order.
- Default rendering: a bold business heading + divider separates businesses (no
  renderer change needed — `structuredPdf` already renders sections in order).
  If businesses read cramped in testing, add an optional `pageBreakBefore` flag
  on the first section of each business and honor it in `structuredPdf.js`.

---

## Feature 4 — Application Summary SSN → last 2

In `public/js/documents/application-summary.js`, `maskTin()`:

```js
// before: return '***-**-' + digits.slice(-4);
return '***-***-' + digits.slice(-2);
```

Shows the last **2** digits (e.g. `***-***-34`). The internal field name
`ssnLast4` is left as-is (cosmetic only); the App Summary "SSN/ITIN" column picks
up the change automatically.

---

## Feature 5 — Equal Housing Lender logo on the pre-approval

- **`config/site.json`** — add `ehlLogo`:
  `"https://msfg-media.s3.us-west-2.amazonaws.com/Assets/LOGOS/EQUAL+HOUSING+LENDER.png"`.
- **`lib/pdf/logoAsset.js`** — add `loadEhlImage()` reusing the existing remote
  fetch + PNG/JPEG sniff + per-source cache (reads `config.ehlLogo`). Network/
  format failures degrade to `null`.
- **`lib/pdf/preApprovalPdf.js`** — pass `brand.ehlLogo = await loadEhlImage()`
  in the `generateLetterPdfBuffer` payload.
- **`lib/pdf/letterPdf.js`** — when `branded` and `l.brand.ehlLogo` is present,
  embed it and draw it small (**~30pt tall**) at the **bottom-right of the page,
  just above the footer band**, opposite the "Mountain State Financial Group LLC
  | msfginfo.com" footer text. Drawn on the branded `letterPdf` renderer only
  (pre-approval). If the image is missing, it is simply omitted (no fallback
  box).

---

## Phasing

1. **Phase 1 (quick wins):** Feature 4 (SSN), Feature 5 (EHL logo), Feature 2
   (pre-approval fields).
2. **Phase 2:** Feature 1 (multi-borrower — touches all 5 letters + shared
   component).
3. **Phase 3:** Feature 3 (income/balance — multi-business + custom rows; largest
   data-model change).

Each phase is verified by rendering the affected PDFs to images and browser-
checking the forms (no console errors, read-only preview intact) before commit.

## Out of scope (YAGNI)
- No per-line "business tag" model (chose one-statement-per-business).
- No borrower address in the multi-borrower list — names only; existing address
  fields are untouched.
- EHL mark only on the pre-approval (borrower letters are borrower-authored).
- No change to the MISMO parser (it already returns `borrowers[]`).
