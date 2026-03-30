# CTO Roundtable Website

## Stack
- **Framework**: Nuxt 3 (Vue 3, TypeScript)
- **UI**: Vuetify 3, custom dark theme (#111 background)
- **Database**: Neon Serverless Postgres via `@neondatabase/serverless`
- **Analytics**: PostHog
- **Deployment**: Render (auto-deploys on merge to main)
- **Linting**: Biome

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

### Client pages
- `pages/index.vue` — Home page, uses `WhoAreWe` component
- `pages/investment.vue` — Portfolio companies (still fetches from Coda API)
- `pages/members.vue` — Legacy hardcoded member list
- `components/WhoAreWe.vue` — Member list, calls `/api/members`

### Data sources
- **Members**: Neon Postgres (`persons`, `memberships`, `organizations` tables)
- **Portfolio companies**: Coda API (migration pending)

## Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | Server only | Neon Postgres connection string |
| `POSTHOG_TOKEN` | Public | PostHog analytics |

See `.env.example` for template.
