# CTO Roundtable Website

## Stack
- **Framework**: Nuxt 4 (Vue 3, TypeScript)
- **UI**: Vuetify 3, custom dark theme (#111 background)
- **Database**: Neon Serverless Postgres via `@neondatabase/serverless`
- **Analytics**: PostHog
- **Deployment**: Google Cloud Run (europe-north1) via Artifact Registry
- **Linting**: Biome
- **Design**: Pencil.dev (`design/design.pen`)

## Development

```bash
npm install
npm run dev        # starts Nuxt dev server via openlogs
npm run build      # production build
npm run preview    # preview production build
```

### Logs (openlogs)

The `dev` script runs via `openlogs` which captures all output to `.openlogs/`. To read logs:

```bash
# Clean text logs (no ANSI codes) — best for reading
cat .openlogs/nuxt-dev.txt

# Latest run (any command)
cat .openlogs/latest.txt

# Raw logs (with ANSI codes)
cat .openlogs/nuxt-dev.raw.log
```

Logs are per-run with timestamps (e.g. `nuxt-dev.2026-03-28T13-26-17Z.txt`). The `nuxt-dev.txt` symlink always points to the latest dev server run. The `.openlogs/` directory is gitignored.

## Architecture

### Server API routes (`server/`)
Database credentials and sensitive tokens live in **private** `runtimeConfig` (never exposed to the browser). API routes in `server/api/` handle all DB queries.

- `server/utils/db.ts` — Neon connection helper
- `server/api/members.get.ts` — GET /api/members (from Postgres)

### Client pages (in `app/`)
- `app/pages/index.vue` — Home page, uses `WhoAreWe` component
- `app/pages/investment.vue` — Portfolio companies
- `app/pages/members.vue` — Legacy hardcoded member list
- `app/components/WhoAreWe.vue` — Member list with two-line layout, calls `/api/members`

### Styreprotokoll (board minutes as signed PDF)

Styremøte 2 (20.8.2026), vedtak 4: minutes are issued as a PDF and signed by two,
møteleder plus one. The motivation is styreansvar, so the design optimises for
evidence rather than convenience.

- `server/utils/protocolMarkdown.ts` — referat markdown -> blocks, and picks the
  sections that make up the formal protocol (til stede, vedtak, action points).
  Refuses characters the PDF font cannot set instead of mangling them.
- `server/utils/protocolPdf.ts` — pdfkit renderer. Base-14 fonts on purpose; see
  the header comment for why embedding a font and why headless Chrome are both out.
- `server/utils/boardProtocols.ts` — issuing, listing, archive verification.
- `npm run render:protocol -- <referat.md>` — render a PDF offline, no database.

The register lives in Neon (`board_protocols`, `board_protocol_signatures`, see
`ctoroundtable-hq/infrastructure/db/migrations/018_board_protocols.sql`) and the
PDFs in the `cto-roundtable-board-protocols` GCS bucket. Issuing freezes a copy
of the referat and hashes it; `scripts/sync-board-meetings.mjs` warns when the
referat later drifts away from a protocol that has already been issued.

Signing itself happens outside the portal, with BankID in an external service.
The portal generates the PDF, holds the signed file that comes back, and records
who signed what and when. The generated PDF prints its content hash on every
page so an externally signed copy, whose bytes necessarily differ, still names
the register row it came from.

### Data sources
- **Members**: Neon Postgres (`persons`, `memberships`, `organizations` tables)
- **Portfolio companies**: Coda API (migration pending)

## Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | Server only | Neon Postgres connection string |
| `POSTHOG_TOKEN` | Public | PostHog analytics |

See `.env.example` for template.

## Deployment (Google Cloud Run)

The site runs on Cloud Run in `europe-north1`, project `cto-roundtable`.

```bash
# Build and push Docker image to Artifact Registry
gcloud builds submit --tag europe-north1-docker.pkg.dev/cto-roundtable/ctoroundtable/www:latest

# Deploy new revision
gcloud run deploy cto-roundtable-www \
  --image europe-north1-docker.pkg.dev/cto-roundtable/ctoroundtable/www:latest \
  --region europe-north1

# Check current revision
gcloud run revisions list --service cto-roundtable-www --region europe-north1
```

**Secrets** are managed via Google Secret Manager and injected as env vars:
- `www-database-url` → `NUXT_DATABASE_URL`
- `www-posthog-token` → `NUXT_PUBLIC_POSTHOG_TOKEN`

**Note**: Nuxt runtime config reads env vars with `NUXT_` prefix in production. `DATABASE_URL` in `.env` becomes `NUXT_DATABASE_URL` in Cloud Run.

**CI/CD**: Cloud Build auto-deploys on push to `main` (trigger: `www-deploy-on-push`). Render is legacy (still connected to main but has wrong secrets).
