# RADAZ website

Three-language RADAZ website with a portable Node.js server, persistent SQLite storage, an owner-only encrypted payment settings page, separate reporting/imaging pages, grouped rich-text templates, and a receiver for the existing RADAZ Viewer.

## Run on your own hosting

Node.js 24 or later is required. This is a server application; GitHub Pages cannot run its authenticated APIs.

```sh
npm ci
npm run setup
npm start
```

`setup` creates the first and only owner administrator through a local terminal. It asks for the owner email, site origin, and a hidden password of at least 12 characters. It creates a private `.env` file with a random encryption key. There are no default administrator credentials and no public administrator registration or demo login on the server.

For local use, choose `http://127.0.0.1:5188`. For hosting, use the final HTTPS origin in `PUBLIC_ORIGIN`, set `NODE_ENV=production`, and place an HTTPS reverse proxy in front of the server. `HOST=127.0.0.1` is the default. Set `TRUST_PROXY=1` only behind one trusted reverse proxy. Container deployments can use the included Dockerfile, a private environment file, and a persistent `/app/data` volume.

Back up **both** the data directory and `SETTINGS_ENCRYPTION_KEY` privately. Losing the key makes stored payment settings unreadable. The key, database, medical archives and `.env` must never be committed. Public assets alone are in `dist/`; private data is served only through authorized API routes. Use encrypted disks/backups and restrict server access before handling real medical records.

## Owner payment settings

Sign in as the owner and open **Ödəniş ayarları** in the sidebar (`#/admin/payments`). Bank name, account holder, IBAN, SWIFT, tax ID, merchant ID and provider keys are encrypted together using AES-256-GCM. Secret keys are write-only: GET responses report whether a key is present, never its value. Blank fields preserve existing keys; explicit checkboxes remove them. Every settings API request checks the owner identity server-side. Doctor and clinic accounts cannot access it, including by calling the API directly.

Saving settings does **not** activate card charging. The provider's signed payment callback, reconciliation and payment adapter must be implemented once the provider is chosen. Current consultation requests are stored as `pending / not_charged`, with no simulated charge or automatic payment confirmation. No payment credentials are in this repository.

## Reports and templates

The case list opens `#/report/<case-id>`. **Görüntülər** opens `#/images/<case-id>` in another tab, while the report remains available. Reports have rich text, draft saving, server-side version conflict checks, approval locking and stored versions. Only the assigned approved doctor can edit a report.

Templates are private to each doctor. **Şablon kitabxanası** supports headings, bold/italic/underline, lists, tables, undo/redo, and create/edit/delete. Each template belongs to exactly one group: `CT` (KT), `MR` (MRT), `CR` (Rentgen), or `US` (USM). Grouping also appears when inserting a template into a report. HTML is sanitized on the server.

## Connect the existing RADAZ Viewer

The existing RADAZ application needs the included receiver. From this repository:

```sh
node integrations/radaz/install-receiver.mjs /absolute/path/to/RADAZ-D-COM
```

This copies `lib/site-import.ts` and connects it to the application's existing `openSources()` import pipeline. Before building RADAZ, set `NEXT_PUBLIC_RADAZ_SITE_ORIGINS` to the exact website origin, for example `https://radaz.example.com`. Multiple explicitly trusted origins can be comma-separated. Same-origin use is allowed automatically. Rebuild and redeploy/repackage RADAZ after this source change; an already installed older EXE does not gain the receiver automatically.

In **RADAZ bağlantısı** (`#/admin/viewer`), enter the actual Viewer URL. `/viewer/` is accepted for a future shared host; ensure the host routes that path and the viewer's assets to the RADAZ application. A separate HTTPS origin is also supported. For installed RADAZ, the default address is `http://localhost:5173/`.

Clicking **RADAZ-da görüntüləri aç** creates a one-time, two-minute launch grant after checking the doctor's case access. The grant goes in the URL fragment, never the query string or patient name. The receiver removes it from browser history, redeems it from an allowlisted origin, and imports the ZIP through the existing RADAZ importer. Grants are stored only as hashes and cannot be reused. Launching again creates a fresh grant.

### Start the installed Windows program

Once the installed RADAZ build includes the receiver, register the current-user launcher:

```powershell
.\integrations\windows\install-radaz-link.ps1 -SiteOrigin 'https://radaz.example.com' -ViewerOrigin 'http://localhost:5173'
```

The script registers `radaz://open`, tied to the exact website origin, localhost Viewer origin, and existing installed `launcher.ps1`. The handler validates the URL and ticket before starting the installed RADAZ program, then opens its local Viewer. It does not run commands supplied by a URL. Enable the desktop button in the site's connection settings. The browser may show its normal external-application confirmation. The Windows launcher must be installed on each workstation that needs this feature.

## Deployment and preview

The `.openai/hosting.json` configuration keeps the existing Sites link as a **static UI preview**. It cannot store payment settings or real records and clearly refuses credential storage. The Node server serves the same interface with `RADAZ_PRODUCTION=true` and standalone fallback disabled. Deploy the Node server for real accounts and persistence; publishing the GitHub repository or static preview alone does not deploy the backend.

The retained presentation includes additional service concepts. Email/WhatsApp delivery, card charging, MFA enrollment, PACS provisioning and advanced review/team operations are not enabled by this server; unsupported API actions return an explicit error instead of simulating success. Configure clinical service availability and privacy/retention policy for your organization before going public.

## Verification

```sh
npm run verify
npm test
```

Tests cover owner-only access, CSRF rejection, encrypted/write-only keys and restart persistence, template ownership and sanitization, report locking/conflicts, single-use Viewer grants, expiration/origin restrictions, session revocation and private-file isolation. GitHub Actions runs the same checks on Node 24.

Security implementation references: [Express security guidance](https://expressjs.com/en/advanced/best-practice-security/), [Node SQLite](https://nodejs.org/api/sqlite.html), and [sanitize-html](https://www.npmjs.com/package/sanitize-html).
