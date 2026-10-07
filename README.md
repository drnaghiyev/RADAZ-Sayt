# RADAZ website

Azerbaijani, Russian and English radiology portal with persistent accounts, private DICOM uploads, separate report and image pages, grouped rich-text templates, and owner-only settings.

## Deployed architecture

The Sites publication now runs `cloud/worker.mjs` with **D1** for accounts, profiles, reports and settings and **R2** for files. It is not a static browser demo. Public registration creates only doctor accounts; doctors require owner approval before accepting cases. Patients submit consultations without account registration using a private guest session and receipt key. Each doctor manages their own clinics from the profile. Only assigned approved radiologists and the owner can edit reports.

The site owner uses **Administrator girişi** on the sign-in page. The Worker checks the trusted Sites authenticated user ID against `OWNER_PLATFORM_ID`, then issues an HttpOnly session. `TRUST_SITES_IDENTITY=true` is valid only behind the Sites dispatcher, which controls identity headers. Do not enable it on an internet-facing server that accepts caller-supplied identity headers. The owner can create an email-login password in `#/account` after platform sign-in; subsequent logins use email/password without ChatGPT. Password changes require the current password and revoke previous sessions. No default owner password is committed.

Required production environment variables (managed in Sites, never in Git):

- `PUBLIC_ORIGIN`: exact HTTPS site origin.
- `SETTINGS_ENCRYPTION_KEY`: random 32-byte base64 key; keep a private backup and preserve it across deployments.
- `OWNER_PLATFORM_ID`: the owner's Site-specific authenticated identity, not the account UUID.
- `OWNER_EMAIL`: reserves the owner email against public registration.
- `TRUST_SITES_IDENTITY=true`: only for Sites dispatch.

## Localhost — Windows

Double-click `RADAZ-Local.cmd`, or run `npm ci` once and then `npm start` with Node.js 24+. Open **http://127.0.0.1:5195**. First create your local administrator with your own email and password; there is no default password. Later use email/password sign-in. Registration creates doctor accounts only.

Localhost runs the **same Worker API and frontend** as the published site, through Miniflare, with persistent D1/R2 storage in ignored `data/local/`. Keep this whole folder, including `encryption.key`, when backing up or moving the installation. Stop the server before copying a backup. Closing the server stops the website, but does not erase accounts or files. The online site has a separate database; its accounts do not automatically appear on localhost. `RADAZ_PORT` and `RADAZ_LOCAL_DATA` override the port and storage directory. It listens on loopback only.

Python `venv` is used for the clinic DICOM receiver below. The website uses Node.js; activating a Python environment does not start the website.

## Developer checks

Node.js 24+:

```sh
npm ci
npm run build
npx wrangler d1 migrations apply DB --local
npm run dev:cloud
```

Set local variables in ignored `.dev.vars`. Local D1/R2 data remains in ignored `.wrangler/`. Production data is separate. `npm run build` creates `dist/client` and `dist/server/index.js`; generated Drizzle migrations are packaged with the Worker. Never edit an applied migration.

```sh
npm run verify
npm run build
npm test
```

Tests use the Workers runtime with D1/R2 and separately check the retained Node backend. They cover account persistence, authorization, CSRF, encrypted/write-only settings, streamed uploads, template ownership, report locking/conflicts, single-use Viewer grants and payment confirmation signatures/amounts/idempotency.

The earlier Express/SQLite backend remains under `server/` with explicitly named `npm run setup:legacy` / `npm run start:legacy`. Use `npm start` for the current local version. GitHub Pages cannot run the server APIs.

## Owner settings and payments

**Ödəniş ayarları** (`#/admin/payments`) stores bank details and provider keys with AES-256-GCM. Secret keys are write-only, blank fields preserve existing values, and explicit checkboxes delete a stored key. Every request checks the owner role on the server.

Payments default to **demo**: no card details or charges. The provider has not been selected. A server-side Epoint adapter is included as an optional integration; Epoint public key in Merchant ID, private key in Secret key, AZN and Live enable hosted checkout. Bank details alone do not activate a payment gateway. Other providers require their own adapter. Real merchant checkout still needs verification with the selected provider before accepting real payments.

The Epoint adapter signs requests, verifies callback signatures and stored order/amount/transaction, and supports status reconciliation from the payment/receipt page. A browser success redirect never marks an order paid. The owner authorized public Site access. The homepage and doctor registration do not require ChatGPT; admin, case, image and financial APIs still enforce their own authorization.

**Əlaqə ayarları** (`#/admin/contact`) controls the displayed call center (initially `*006`) and optional phone number. No additional phone number has been invented. The two-hour response message is shown to the submitting patient only after explicit test-payment completion or confirmed live payment. Unpaid cases do not enter the doctor queue.

## Reports and templates

Cases open `#/report/<case-id>`. **Görüntülər** opens `#/images/<case-id>` in a separate tab. Long reports scroll to the bottom. Drafts persist on the server, concurrent edits produce a conflict, approved reports are locked, and report versions are retained. Templates use rich text and belong to KT/CT, MRT/MR, Rentgen/CR or USM/US groups.

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

## Screenshots and scope

The gallery contains actual screenshots of the RADAZ application. The CT image is the public deidentified `693_J2KR.dcm` fixture from [pydicom-data](https://github.com/pydicom/pydicom-data), originally CQ500-CT-310. No private patient archive is included in the repository. The sample file itself is not deployed; only application screenshots are used.

Email/WhatsApp delivery, MFA enrollment, PACS provisioning, mobile home services, advanced peer-review/team operations and automatic clinical interpretation are not configured in this portal. Demo controls for unavailable services are removed from the normal navigation. There are no seeded patient accounts or medical records in production migrations.

Payment protocol reference: [Epoint developer documentation](https://developer.epoint.az/az/callbacks). Account and file permissions are enforced by the server; configure organizational access, retention and backups for your deployment.

## Admin və həkim qazancı

`#/admin/overview`: sahibə məxsus admin paneli, qeydiyyat və rapor sayları, həkim təsdiqi. `#/admin/earnings-settings`: hər həkim üçün ayrı faiz (0–100%) və ya sabit AZN/rapor. `#/admin/earnings`: tarix aralığı, həkim filtri, ay seçimi, xülasə və CSV; həkim yalnız `#/earnings` vasitəsilə öz qazancını görür.

Hesablama yalnız serverdə təsdiqlənmiş AZN ödənişi və təsdiqlənmiş rapor üçün aparılır. Qazanc tarixi raporun təsdiqidir; gün sərhədləri Asia/Baku, hər iki tarix daxil. Qəpik və faiz üçün tam ədədlər istifadə edilir, nəticə ən yaxın qəpiyə yuvarlaqlaşdırılır. Qayda, ödəniş və qazanc hər rapor üçün saxlanılır, sonrakı qayda dəyişiklikləri tarixçəni dəyişmir. Qaydasız təsdiqlənən raporlar hesablanmamış kimi görünür; admin bunları ayrıca cari qayda ilə hesablayır. Demo və geri qaytarılmış ödənişlər cəmə daxil edilmir. Bu panel qazanc hesablayır, bank köçürməsi etmir.


## Individual consultation prices

In **Qazanc ayarları**, select a doctor, then set their consultation price and either percentage or fixed AZN share. The calculation preview shows doctor and platform shares. A doctor cannot override an admin-managed price. New prices affect new consultations; historical case prices and accrued earnings are preserved. The doctor dashboard shows their monthly earnings, completed paid report count and consultation price. The date-filtered report remains private to that doctor.

## Clinic local server and devices

Doctors add their own clinics in their profile. **Klinika bağlantıları** in the admin panel, or the connection button beside the doctor's clinic, configures destination AE Title, local server IP/name, listening IP, TCP port, allowed calling AE Titles and optional device IP restrictions. Clinic keys only authorize that clinic's incoming studies; they cannot access admin or other clinics. Disable intake or revoke its key to stop the connection. Creating another connection file rotates the key.

On the clinic's Windows server with Python 3.10+:

1. Run `integrations/clinic/setup.ps1`. It creates `.venv` and installs pinned `pynetdicom`/`pydicom` dependencies.
2. Save connection settings and download **Bağlantı faylı yarat**. Place the secret `radaz-clinic.json` in `integrations/clinic/`.
3. From that folder run `.venv/Scripts/python.exe bridge.py --config radaz-clinic.json --check`, then the same command without `--check` to receive studies.
4. On the CT/MR/PACS device, configure the clinic server's LAN IP, destination AE Title and TCP port. Listening IP must be the server's LAN address or `0.0.0.0` for LAN devices. Permit the selected TCP port only from those devices in the clinic firewall. The website HTTPS address is not a DICOM port.

The C-STORE receiver checks calling AE/IP, queues original DICOM bytes to disk before acknowledging, waits 120 seconds of study inactivity, then sends a ZIP to the site's scoped HTTPS endpoint. Its local queue survives restart and retries after network errors. Duplicates do not create duplicate cases. Additional images update a pending untouched study; once report editing starts, a changed study is rejected for manual reconciliation and local files remain. Incoming studies are assigned to the clinic's doctor and marked `clinic_unbilled`; they do not invent a patient payment or earnings. The receiver accepts up to 64 MiB compressed per study. Larger studies remain local and can use the site's 256 MiB upload. A C-STORE success means queued locally; **Son qəbul** confirms receipt by the site. Local copies are retained until the clinic applies its retention policy.

Protocol check: `integrations/clinic/.venv/Scripts/python.exe tests/bridge_test.py`. It sends a synthetic DICOM through C-STORE, verifies durable storage and the outgoing ZIP, and checks restart deduplication. No real medical device is connected by this test.

## Professional template editor

`#/templates` has a searchable KT/MRT/Rentgen/USM library and a Tiptap editor with fonts, size, color, headings, alignment, lists, tables and cell operations, undo/redo, preview, duplicate and Ctrl+S. Rich content is sanitized on the server and remains private to the account. Sources: [Tiptap TextStyleKit](https://tiptap.dev/docs/editor/extensions/functionality/text-style-kit), [TableKit](https://tiptap.dev/docs/editor/extensions/nodes/table), [pynetdicom Storage SCP](https://pydicom.github.io/pynetdicom/stable/examples/storage.html).
