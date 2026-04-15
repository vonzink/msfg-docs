# msfg-docs

MSFG Document Creator Hub — generate, edit, and export mortgage documents.

## Local dev

```bash
npm install
cp .env.example .env   # edit as needed
npm run dev            # nodemon, restarts on changes
# or
npm start              # production-style single process
```

The app listens on `PORT` (default `3004`). Open `http://localhost:3004/`.

## What's in the box

- **Hub (`/`)** — landing page listing available documents by category.
- **Documents (`/documents/:slug`)** — per-document pages that produce a preview and export a PDF. Current documents: Credit Inquiry Letter, Pre-Approval Letter, Address LOX, Income Statement, Balance Sheet, Generic Invoice, IRS Form 4506-C.
- **Workspace (`/workspace`)** — multi-panel view with MISMO XML upload for auto-fill across docs.
- **Templates (`/templates`)** — upload an AcroForm PDF, map fields, let end users fill and export.
- **Report (`/report`)** — captures structured data from completed docs for a session-level report.

## Config

- `config/documents.json` — document registry (slug, name, category, icon, description).
- `config/site.json` — site branding (read fresh each request so changes take effect immediately).

## APIs

- `GET  /api/health` — service check.
- `POST /api/email/send` — send an HTML email of a document via SMTP (rate-limited; requires SMTP config in `site.json`).
- `POST /api/pdf/credit-inquiry` — returns a generated Credit Inquiry Letter PDF.
- `POST /api/pdf/form-4506-c` — returns a filled IRS Form 4506-C PDF.
- `GET  /api/investors/for-form-4506c` — list investors from the MySQL `investors` table for the 4506-C dropdown.
- `GET  /api/investors/:id/form-4506c-fields` — return field values for a given investor.
- `/templates/api/*` — CRUD + fill for user-uploaded PDF templates.
