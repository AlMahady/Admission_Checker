# JU Admission Checker

Connected Windows desktop prototype for the 2025–2026 GCE admission circular. It implements candidate entry, immutable academic/test/practical revisions, the seven unit checks, 37 department checks, explanation rows, history and printing. The Electron renderer uses React Native for Web; a separate Fastify API uses PostgreSQL (including Neon).

## Run locally

Requires Node.js 22+, npm, and PostgreSQL or a Neon connection. Copy `.env.example` to `.env` and set `DATABASE_URL`; set `MIGRATION_DATABASE_URL` to a direct migration connection when using Neon. For local development only, set a long random `DEV_STAFF_TOKEN`. Keep `.env` private. The desktop configuration needs only `VITE_API_ORIGIN`; no database credential is bundled.

```powershell
npm install
npm run db:migrate
npm run dev:api
```

In another terminal:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173` for renderer development, or run `npm run dev:desktop` in a third terminal. Paste the development staff token into the sign-in screen. For a central deployment, configure a staff identity provider with `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `AUTH_JWKS_URL`, then use short-lived access tokens with a `roles` claim containing `operator` or `administrator`. The API should be exposed behind HTTPS; set `HOST` appropriately for that host.

To build:

```powershell
npm test
npm run build
npm run build:api
npm run package:win
```

The compiled API entry is `dist-api/apps/api/src/server.js`. Run migrations from the source tree before deployment. Set `VITE_API_ORIGIN` to the HTTPS API origin when building the desktop installer.
The Windows installer is written to `release/`. The local build uses the default Electron icon and is unsigned until the university supplies code-signing credentials.

## Policy state and release limits

The eligibility engine applies the user's GCE matrix through the working assumptions in [Unresolved_Policy_Questions.md](Unresolved_Policy_Questions.md). Unit and department results are definite **Eligible** or **Not eligible** decisions. Missing required data is treated as not eligible until entered, and assumptions appear as short notes beside the affected requirement. These are implementation assumptions, not university sign-offs. This build does not calculate merit rank or authorize official choice-list access or seat allocation.

The workspace does not include the underlying circular PDF or university sign-offs. Merit GPA aggregation and later admission procedures remain outside this eligibility checker. Policy editing/publication, staff account administration, system-browser PKCE sign-in, Bangla localization, candidate-specific access controls, signed installer updates, backup/restore verification, and a Windows end-to-end pilot remain release work. The development token is disabled when `NODE_ENV=production`.
The API currently uses parameterized `pg` queries and a SQL migration; the draft's Drizzle ORM layer and fuller normalized rule tables remain release work.

## Transcript OCR

The candidate academic form supports separate O-Level and A-Level PDF uploads. The API uses Azure AI Document Intelligence's `prebuilt-layout` model to read digital and scanned pages, then shows subject and grade suggestions with OCR confidence for officer review. Only confirmed rows enter the existing academic form and revision flow. Uploads are held in memory while the API calls Azure; this app does not write the PDF or OCR payload to PostgreSQL or local storage. Transcript content is sent to the Azure resource configured by the university.

Configure `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` and `AZURE_DOCUMENT_INTELLIGENCE_KEY` in the API server environment. Keep the key server-side. The upload limit is 20 MB and 100 pages. Use an Azure Standard (S0) resource for multipage transcripts: the free tier processes only the first two pages, and this app checks the uploaded page count against the OCR response and refuses partial results. See Microsoft's [layout model documentation](https://learn.microsoft.com/azure/ai-services/document-intelligence/prebuilt/layout) and [analyze API reference](https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/analyze-document?view=rest-aiservices-v4.0+%282024-11-30%29).

## Code map

- `packages/eligibility-engine/src`: pure rules, catalog and boundary tests.
- `packages/policy-fixtures/src`: active 2025-2026 working assumptions and version.
- `apps/api/src`: authenticated API, revision and evaluation persistence, audit rows, migration.
- `apps/desktop/src`: operator forms, results, history and printable snapshot.
- `apps/desktop/electron`: sandboxed window and restricted print bridge.

The original [engineering draft](JU_Admission_Desktop_Application_Draft.md) remains the product and source-extraction reference. Any later admission session needs its own source and rule set. The [working assumptions](Unresolved_Policy_Questions.md) document records the choices used by the current checker and the parts it does not calculate.
# Admission_Checker
