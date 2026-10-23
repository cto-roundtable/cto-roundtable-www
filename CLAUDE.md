# CTO Roundtable Website

## Stack
- **Framework**: Nuxt 4 (Vue 3, TypeScript)
- **UI**: Vuetify 3, custom dark theme (#111 background)
- **Database**: Neon Serverless Postgres via `@neondatabase/serverless`
- **Analytics**: PostHog
- **Deployment**: Google Cloud Run (europe-north1) via Artifact Registry
- **Linting**: Biome
- **i18n**: `@nuxtjs/i18n` v10 for the member portal (nb, en, sv)
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

### Auth (member portal sign-in)

Two ways in, one session. Both end in `issueSession(event, personId, name)`
(`server/utils/session.ts`): a stateless 30-day `ctr_session` cookie plus its HMAC
(`ctr_session_sig`, keyed by `SESSION_SECRET`). The payload carries `iat` (issued
at), so a sensitive step can ask for a recent sign-in. Cookies issued before `iat`
existed count as old.

- **Magic link** (the anchor, always there): `POST /api/auth/request` mails a
  15-minute one-shot token (`auth_tokens`). `GET /api/auth/verify` consumes it and
  redirects to `/member?via=link`. The request answers before it does any member
  work (rate limit, token, mail run un-awaited), so members and non-members get the
  same answer in the same time. The link host comes from `config.siteUrl`, never
  the Host header.
- **Passkeys** (an option): SimpleWebAuthn v13. Helpers are in
  `server/utils/passkeys.ts`, routes under `server/api/auth/passkey/`. Tables:
  `webauthn_credentials` (hq migration 022) and `webauthn_spent_challenges` (027).
  - *Adding one*: on `/member/security` (nav "Innlogging"), and as a one-time
    onboarding step right after a mail sign-in (`?onboarding=1`; "Ikke nå" stops it
    and the nudge on that browser). Adding needs a session issued in the last 10
    minutes (`REAUTH_WINDOW_MS`, else 403 `{code:'reauth'}`). The cap is 10 per
    member (409 `{code:'limit'}`). Every new passkey mails the member (Resend,
    fire-and-forget), so one added from a stolen session gets noticed. The page
    names the account ("for <name> (<email>)") before anything is bound to it.
  - *Signing in*: "Sign in with passkey" on the login card, or the email field's
    autofill (conditional UI; restarted on an expired challenge and on returning
    to a stale tab).
  - *Challenges*: a 5-minute `ctr_webauthn` cookie (httpOnly, strict, HMAC over
    `'webauthn-challenge:' + body` with `SESSION_SECRET`), bound to purpose and,
    for registration, the person. Every verify records sha256(challenge) in
    `webauthn_spent_challenges` and refuses a second use, so each challenge is
    one-shot. Expired rows are purged opportunistically.
  - *Checks*: rpID is `config.siteUrl`'s host without `www.` (`ctoroundtable.no`,
    so a passkey works on both hosts). Accepted origins are siteUrl and its
    www/apex twin. In production an empty siteUrl makes the passkey routes 500
    instead of trusting the Host header. User verification is `required`. The
    counter must move forward (synced passkeys report 0, which is allowed). The
    userHandle must name the owner. Credential ids over 1366 characters are
    refused. Every login failure gets the same 401. Members list, rename and
    delete only their own passkeys.
  - *Audit*: one JSON line per event on stdout (`{"audit":"passkey","action":...}`:
    registered, renamed, deleted, login_ok, login_failed with a reason). These
    hold person and credential row ids only, and Cloud Logging keeps them.
  - Losing a device costs a mail: sign in by link, then delete the passkey.

**The login gate is `server/utils/membership.ts`**: `isPortalMember(personId)` and
`findPortalMemberByEmail(email)`: "active person in a chapter group" (`PORTAL_GROUPS`,
see Chapters below). Every way in uses it: the magic-link request, passkey login, the
`/api/member/` middleware on every request, and `/api/auth/session` (a session
that fails the gate is reported as signed out). So a session lives exactly as long
as its holder could get a new one. Widening who may sign in is a change to that
file only. Routes under `/api/auth/` are outside the middleware and must call the
gate themselves (`requirePortalSession` in `server/utils/passkeys.ts`).

**Known gaps (follow-ups, from the passkeys security review, 2026-10-15):**
- Deleting a passkey does not end sessions already issued with it. Sessions are
  stateless; the fix is a per-person `sessions_valid_after` or a sessions table
  ("sign out everywhere"). Never write copy that promises otherwise.
- There is no `frame-ancestors 'self'` yet. It belongs site-wide in
  `nuxt.config.ts` routeRules (anti-framing, and it stops a cross-site page from
  clobbering the challenge cookie).
- `attestationType: 'none'` and no aaguid stored: accepted on purpose.

### Member portal languages (i18n)

The member portal (`/member/**`) speaks Norwegian (`nb`, default), English (`en`) and Swedish (`sv`) through `@nuxtjs/i18n` with `strategy: 'no_prefix'`, so URLs do not change. The public site is not translated.

- **Messages** live in `i18n/locales/{nb,en,sv}.json`, grouped per page: `nav.*`, `layout.*`, `auth.*`, `common.*` (words used by several pages), `member.<page>.*`. The three files have identical keys. When you add a string, add it to all three. The Swedish texts were machine-drafted and want a native check.
- **In a page**: `const { t, n } = useI18n()` and `t('member.page.key')`. Whole sentences go in one key with named interpolation (`{name}`). Plurals use `t(key, count)` with `singular | plural`. Bold or links inside a sentence use `<i18n-t>` with slots, never `v-html`. Labels in script arrays must be resolved in a `computed`, or they won't follow a language switch.
- **Dates** go through `useLocaleDate()` (`formatDate(value, 'long' | 'short')`, `format(value, options)`): nb-NO, en-GB or sv-SE, always `Europe/Oslo`. Do not hard-code `'nb-NO'`.
- **Which language** (`app/composables/useMemberLocale.ts`, applied in `app/layouts/member.vue`):
  1. The member's own choice from the switcher (`MemberLocaleSwitcher.vue`, cookie `ctr_locale`, one year).
  2. Otherwise, after sign-in, their chapter (`chapters` on `/api/auth/session`): Swedish chapter only means `sv`, everyone else gets `nb`.
  3. Otherwise, on the login card, the browser language, or English if it names none of ours.

  The module's own browser detection is off because it would write the cookie on the first visit and hide the chapter default.
- **Not translated**:
  - the board-only pages (`/member/board/**`, `/member/activity`, `BoardProtocolPanel`, `BoardMeetingDoc`), which hold the Norwegian association's board documents;
  - messages that come from the server (API errors, the onboarding prompt);
  - survey content stored in the database. The page around a survey follows the visitor's language, and the questions stay in the language the survey was written in.

### Chapters: Norway and Sweden

The network has two chapters, and a chapter is a group, not a column (`server/utils/chapter.ts`): `no` = `cto-roundtable`, `se` = `roundtable-sweden`. They run separately (board vedtak 6, 2026-08-20); offers and the investment side are shared. Decision: `decisions/sweden-portal-scope.md` in the members-portal project; research: `ctoroundtable-hq/expansion/sweden/portal-segregation.md`.

- **Who gets in**: an active person in either chapter group (`isPortalMember` is "has a chapter"). Swedes become `active` when Snorre says so; while they are `prospect` nothing changes.
- **Never add a Swede to `cto-roundtable`.** The public directory (`/api/members`), the `alle@` alias, the `#roundtable` Slack sync and the `/sweden` "sitting CTOs" count key on that group and must stay Norwegian.
- **The session** carries `chapters`. The `/api/member/` middleware puts them on `event.context.chapters` and refuses `NORWAY_ONLY_API_PREFIXES` (AI onboarding) to a session without `no`.
- **A Swedish-only member** gets the Swedish nav and `/member/sweden` (overview: the chapter's evenings by `events.group_id`, its surveys, its channel) and `/member/sweden/faq`; `/member`, `/member/faq` and `/member/onboarding` redirect there. A member in both chapters gets the Norwegian portal plus a "Sverige" entry.
- **Shared pages, per chapter**: a hosting offer carries its chapter (`event_locations.group_id`, hq migration 025; a two-chapter member picks); the open-to-work list spans both chapters and marks Swedes; the board activity report has a chapter switch (Norway default).
- **Data that is Snorre's, not code's**: who is `active`, Oliver's Swedish membership, `roundtable-sweden.slack_channel`, a Sweden email alias, the Stockholm `events` rows.

### Undersøkelser etter arrangement (`/member/surveys`)

A short survey tied to an `events` row, answered in the portal. The board (`styret`, `requireBoard`) creates one per event from the default template, or as a draft to edit first. It can open, close and reopen the survey and set a deadline (`closes_at`). Members of the event's group (`events.group_id`) answer it and can edit their answer while it is open. A `roundtable-sweden` event gives an English survey. Results: the board sees everything, with text answers and names (a small circle that shares in trust, and the page says so). A respondent sees aggregates only, after answering. Answers are validated against the question schema in `server/utils/surveys.ts` on every write, and questions lock once the first answer is in. Tables: `event_surveys` and `event_survey_responses` (`ctoroundtable-hq/infrastructure/db/migrations/023_event_surveys.sql`). A banner on `/member` points at open surveys the member has not answered.

### Admin API for agents (`/api/admin/**`, the `ctr` CLI)

Machine access to portal data for agents on the boxes, so nothing automatic needs a
browser session or the shared `INGEST_API_KEY`. Each agent has its own bearer token
(`ctr_` + 43 base64url chars), owned by a board member who answers for it. Only the
token's sha256 is stored (`api_tokens`, hq migration 026), so a request is a hash
lookup. Scopes: `events:read`, `events:write`, `surveys:read`, `surveys:write`, and for
deal votes `deals:read`, `deals:write`, `rounds:write`, `comments:read`, `digests:write`,
`qa:read`, `qa:write` (hq migration 032).

- **The gate** is `requireApiToken` in `server/utils/apiTokens.ts`, checked on every
  request: not revoked, not expired, the owner an active `styret` member right now
  (leaving the board disables every token you answer for), and the route's scope.
  Any token problem is the same 401 `Unauthorized`; a missing scope is a 403.
- **Every route uses `defineAdminRoute({ GET: { scope, handler }, ... })`**. Route files
  have no method suffix, so a wrong method is an authenticated, logged 405 rather than
  a silent fall-through. `server/api/admin/[...].ts` logs and 404s everything else.
- **Audit**: every `/api/admin/` request, refusals included, is one row in
  `api_audit_log` (`server/utils/audit.ts`). The row holds the token, owner, method,
  path, scope, target, status and a small `summary` (refusal reason, counts, dryRun).
  It never holds the token, a response body, or a member's free text. A trigger refuses
  UPDATE, DELETE and TRUNCATE.
- **Routes**: `whoami`, `events`, `events/import` (one finished Luma event: upserts
  `events` on `luma_event_id` and writes `event_hosted`/`event_attended` with the
  track-event-attendance dedup keys; only the two network calendars), `deals`, `deals/:slug`, `deals/:slug/documents/:key`, `deals/:slug/rounds` (see Caser below), `surveys` (list, create), `surveys/:id` (show; PATCH
  close/reopen only), `surveys/:id/results` (names and free text only with
  `?texts=1`), `surveys/sweep` (`sweepPastEventSurveys`, `?dryRun=1`). The survey
  routes call the helpers in `server/utils/surveys.ts` and have no SQL of their own.
- **CLI**: `cli/ctr.mjs`, zero deps, `--json` everywhere. Env `CTR_API_TOKEN` and
  `CTR_API_URL`. Docs: `cli/README.md`. The daily tick on the cto-roundtable box is
  `ctr events import-luma && ctr surveys sweep` (import first: surveys go only to
  attendees).
- **Getting a token: the device flow** (RFC 8628 shape, `server/utils/deviceAuth.ts`,
  table `device_authorizations`, hq migration 029). The agent calls
  `POST /api/auth/device/code` with `{client_name, scopes}` and prints the `user_code`
  and `/member/device?code=…`. A `styret` member signed in within the last 10 minutes
  (`REAUTH_WINDOW_MS`) checks the name, scopes and IP there and approves or denies. The
  agent polls `POST /api/auth/device/token` (`authorization_pending`, `slow_down` under
  5 s, `expired_token`, `access_denied`, `invalid_grant`) and gets the token once. The
  `api_tokens` row is created at that pickup, owned by the approver, for 90 days, so the
  plaintext never sits anywhere in between. Codes live 10 minutes, at most 5 pending
  per IP. Only sha256(device_code) is stored, and every step (code, view, approve,
  deny, every poll) is an `api_audit_log` row.
- **Break-glass**: `scripts/mint-api-token.mjs mint|list|revoke` with `DATABASE_URL`.
  The token is printed once and revoked, never deleted. Revoking is still done here.

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

### Åpen for jobb (`/member/jobb`)

Members opt in as open to new opportunities; the default is not listed. Any
member can set or withdraw their own flag. The list of who is open is for the
investment cohorts (`invest-*`) and the board (`styret`) only, because founders
asking "do you know a CTO" come in through the invest side. The gate is
`requireOpenToWorkViewer` in `server/utils/openToWork.ts`, checked per request.
Table: `open_to_work` (`ctoroundtable-hq/infrastructure/db/migrations/021_open_to_work.sql`),
one open row per person, withdrawn rows kept as `closed` history.

### Caser: deal votes, Q&A and input (`/member/caser`)

A case is a deal as an SPV sees it before and during its vote. Built in steps
(V2 read-only case page, then Q&A, comments, the ballot, the committee digest
and the pipeline feed); plan and rules: `research/portal-deal-votes-plan.md`
and `decisions/2026-10-22-vote-model.md` in the ctori-4 project (huddle). Schema:
`ctoroundtable-hq/infrastructure/db/migrations/032_deal_rounds.sql`.

- **All case SQL is in `server/utils/deals.ts`.** Who sees a case is one SQL
  condition (`caseVisibleSql`), shared by the list, the page and the document
  download, re-checked on every request:
  - committee (`current-komite`, `server/utils/committee.ts`) and board: every case
    that is investor-visible or has a round, drafts included;
  - members of the ACTIVE SPV (`network_groups.invest_phase = 'deploying'`):
    investor-visible deals no SPV has invested in yet (the working pipeline);
  - members of a round's group: that case once the round is open;
  - members of an SPV that invested: that company. A completed SPV sees its own
    companies and nothing else.
  A case you may not see is the same 404 as one that does not exist.
- **Documents** (`deal_documents`): versioned, never overwritten (a ballot attests
  to a hash). Shown raw material first, the committee memo last. Bytes are in the
  private `GCS_DEAL_DOCUMENTS_BUCKET`, proxied after the case check
  (`/api/member/deals/:slug/documents/:id`). Locally, `DEAL_DOCUMENTS_DIR` points the
  same keys at a folder (ignored on Cloud Run and whenever a bucket is set).
- **Publishing** (`ctr deals publish`): `PUT /api/admin/deals/:slug/documents/:key`
  uploads a version (same bytes as the current one change nothing), and
  `POST /api/admin/deals/:slug/rounds` creates a DRAFT round (`server/utils/dealRounds.ts`):
  the proposal and the current version of each named document are snapshotted and
  hashed into `bundle_sha256`, which every ballot attests to. The rules (A+, 48 h,
  2/3 of yes + no, choices to the committee only) are the server's, never the caller's.
- **Admin API**: `/api/admin/deals` and `/api/admin/deals/:slug` (GET; PATCH sets
  `investorVisible` / `investorBlurb`), `deals/:slug/documents/:key` (PUT),
  `deals/:slug/rounds` (POST). Scopes `deals:read deals:write rounds:write
  comments:read digests:write qa:read qa:write`. The route list with request and
  response JSON is memory `votes/admin-api.md` in ctori-4; `ctr` calls only what
  it lists.
- i18n keys live under `deals.*` (and `nav.deals`).

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
