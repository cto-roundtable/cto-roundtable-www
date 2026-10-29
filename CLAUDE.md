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

### Persona e2e (who sees what)

`e2e/preview.sh up|test|publish|down` runs the built portal on a Neon branch of
production and walks it as each kind of member (screenshots, video, and an
access matrix of every member API route). See `e2e/README.md`. Run it before
merging anything that changes who can see what, and add a persona to
`e2e/support/personas.ts` when the code starts checking a new group (a new
`invest-N`, a new role). Never point it at production: the guard refuses.

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
  track-event-attendance dedup keys; only the two network calendars), `deals`, `deals/:slug`, `deals/:slug/documents/:key`, `deals/:slug/rounds`, `rounds`, `rounds/:id` and its actions, `comments`, `deals/:slug/digests`, `pipeline-digests` and its actions, `questions`, `questions/:id`, `questions/:id/answers`, `answers` (see Caser below), `surveys` (list, create), `surveys/:id` (show; PATCH
  close/reopen only), `surveys/:id/results` (names and free text only with
  `?texts=1`), `surveys/sweep` (`sweepPastEventSurveys`, `?dryRun=1`). The survey
  routes call the helpers in `server/utils/surveys.ts` and have no SQL of their own.
- **CLI**: `ctr`, in Rust, in its own repo (cto-roundtable/ctr-cli), `--json` everywhere.
  `ctr login` (device flow below) or env `CTR_API_TOKEN`; `CTR_API_URL`. The daily job
  on the cto-roundtable box (`members-portal-daily`, 06:00) is
  `ctr events import-luma && ctr surveys sweep` (import first: surveys go only to
  attendees). The old Node `cli/ctr.mjs` is gone.
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
- **Break-glass only**: `scripts/mint-api-token.mjs mint|list|revoke` with `DATABASE_URL`,
  for when the device flow is unavailable. Normal agents use `ctr login`.
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
  - committee (`current-komite`, `server/utils/committee.ts`): every case in active
    work, investor-visible, with a round or invested in, drafts included;
  - members of the ACTIVE SPV (`network_groups.invest_phase = 'deploying'`): every
    deal in active work (`ACTIVE_STATUSES`: reviewing, waiting, to_be_voted,
    pending_transfer) or marked investor-visible that no SPV has invested in yet
    (the working pipeline; unreviewed leads are left out, dc-33 2026-10-23), and a
    case once a round for the active SPV is open;
  - members of an SPV that invested (`investments`): that company, always, whatever
    the visible flag or rounds say (dc-59 H1, 2026-10-30). A completed SPV (Invest 1,
    2) sees the companies it invested in and nothing of the working pipeline.
  Visibility comes from the person's own memberships only (`viewer.groupIds`). The
  board (`styret`) adds nothing to what anyone sees of investments, anywhere in the
  portal (Snorre, 2026-10-29 and 10-30); board-only are the admin pages (styremøter,
  protocols, Aktivitet (styret), API tokens). A case you may not see is
  the same 404 as one that does not exist. Seeing a case
  is not seeing its material: the blurb and the documents are shared only once the
  committee marks it investor-visible or a round has opened (`materialSharedSql`);
  before that a member sees name, stage, ansvarlig and date, and can ask and give input.
- **Ansvarlig** is the deal's CURRENT `lead` and `co_lead` rows in `deal_people`
  (`valid_to IS NULL`), read through `dealOwnerJoin` in `server/utils/deals.ts`, on the
  overview, the case page, `/member/komite`, the admin API and question routing; never
  `pipeline_deals.driver_person_id` or a file (Snorre, 2026-10-30). hq migration 042
  refuses a current lead or co-lead who has no row in `memberships`.
- **Documents** (`deal_documents`): versioned, never overwritten (a ballot attests
  to a hash). Shown raw material first, the committee memo last. Bytes are in the
  private bucket `cto-roundtable-deal-documents` (`infrastructure/tofu/storage.tf`;
  Cloud Run gets it as `NUXT_GCS_DEAL_DOCUMENTS_BUCKET`, since only `NUXT_` names
  override runtimeConfig at runtime), proxied after the case check
  (`/api/member/deals/:slug/documents/:id`). Vote protocols go in the same bucket.
  Locally, `DEAL_DOCUMENTS_DIR` points the same keys at a folder (ignored on Cloud
  Run and whenever a bucket is set).
- **Publishing** (`ctr deals publish`): `PUT /api/admin/deals/:slug/documents/:key`
  uploads a version (same bytes as the current one change nothing), and
  `POST /api/admin/deals/:slug/rounds` creates a DRAFT round (`server/utils/dealRounds.ts`):
  the proposal and the current version of each named document are snapshotted and
  hashed into `bundle_sha256`, which every ballot attests to. The rules (A+, 48 h,
  2/3 of yes + no, choices to the committee only) are the server's, never the caller's.
- **Q&A** (`server/utils/dealQuestions.ts`, `deal_questions` / `deal_answers`): a
  member asks on the case page; the `deal-qa` job on the box claims the question
  (`PATCH /api/admin/questions/:id` `agent_working`, a compare-and-set), answers from
  the deal's investor pack with sources, or routes it to the deal's current lead
  (`deal_people`); the lead or a co-lead answers on the case page. The ANSWER is shown
  to everyone who can see the case, but its `sources` (investor-pack quotes) only once
  the material is shared with them (Snorre, 2026-10-29); WHO ASKED only to the
  committee, never in the admin API. An agent answer is labelled as unchecked until the owner or a committee member
  confirms it; a correction supersedes it. The asker gets a mail when it is answered
  and the owner when a question is routed to them (`server/utils/mail.ts`).
- **Comments** (`server/utils/dealComments.ts`, `deal_comments`): input that does not
  count as a vote (comment, objection, suggestion, question for the founder, "I know
  them"). Named to the committee, hidden from every other member (the board included): a
  member sees only their own and can withdraw it (the row is kept). Nothing is sealed
  in the database (decision 2026-10-22 §5, which replaced the plan's anonymous
  comments). The digest agent reads them with names.
- **Digests** (`server/utils/dealDigests.ts`, `deal_digests`): the `deal-digest` job
  reads comments with names (`GET /api/admin/comments`) and posts a summary with
  themes, new information and questions for the founder
  (`POST /api/admin/deals/:slug/digests`). The committee's digest shows on the case
  page for staff; an `spv` digest ("what we heard") shows to everyone who can see the
  case and has its material (it is free text that may quote the pack, so it is
  withheld until then, Snorre 2026-10-29; the pipeline-digest source leaves it out too). `/member/komite` (committee only) lists every case in active work with what
  waits for the committee: questions with the owner, agent answers to confirm, new
  comments since the last digest, questions still with the agent (zeros shown), the
  vote, and the newest digest, grouped like the overview.
- **The overview** (`/member/caser`, `listCaseOverview`) is the one list of cases, and
  it is always the MEMBER view, the committee's own memberships included (the
  committee's view is `/member/komite`). Sections: decided, being carried out
  (`pending_transfer`); under review now (an open vote, `to_be_voted`, or
  reviewing/waiting with activity in the last `INACTIVE_AFTER_DAYS` = 56 days, on
  `last_activity_at`, else `updated_at`); inactive (folded); what the member's own SPVs
  invested in (`investments` joined to their memberships, one tag per SPV, newest
  `investments.invested_at` first, sortable by last activity or name, filterable by
  SPV, each row linking to `/member/updates/<slug>`); the declined ones on request
  (name, stage and date). `/member/pipeline` redirects here. The actions (ask, object,
  "I know them", "Jeg er inhabil") live on the case page, in their sections, never on
  the list.
- **Follow-up page**: the case page of an invested company (status `invested`, or an
  `investments` row) follows up instead of reviewing: a link to its investor updates,
  no vote, no "Jeg er inhabil", no objection chips. Q&A becomes "Spørsmål om status"
  and input "Oppfølging" (kinds shown as follow-up idea, I can help, other; stored as
  032's `suggestion`, `signal`, `comment`), with the same routing and visibility.
- **Nav**: "Caser" always opens the member view. The committee gets two sub-items,
  "Som medlem" and "Komiteen". There is no "see as another role" (Snorre, 2026-10-30).
  Sub-menus start folded and open on one of their pages or with their chevron.
- **"Jeg er inhabil"** (`server/utils/dealConflicts.ts`, `deal_conflicts`, hq migration
  033, mandate §9, dc-33 H3): a member declares a conflict on a company on its case
  page (also linked from each feed row). It freezes into the roster when a round
  opens (`freezeRoster`), and then the member can only vote blank there. It can be
  withdrawn until a round is open. The committee sees who declared.
- **Pipeline digest** (`server/utils/pipelineDigests.ts`, `pipeline_digests`, hq
  migration 033, dc-33 H4): every second Monday the box job reads
  `GET /api/admin/pipeline-digests/source` (stages, dates and event KINDS, never the
  committee's event text), an agent drafts, and the job posts it. For the first four
  weeks a committee member approves each draft on `/member/komite` (optionally
  edited); once the group's first approved digest is 28 days old, new drafts are
  approved on their own. The job then calls `.../:id/send` (the portal mails the
  group; marked sent before the first mail, so a retry never mails twice) and posts
  to Slack itself (`PATCH .../:id {slackRef}`). The newest sent one sits on top of
  the feed.
- **The vote** (`server/utils/dealRounds.ts`, `deal_rounds` / `deal_ballots` /
  `deal_round_notices`, protocol `server/utils/votePdf.ts`). A committee member opens a
  draft on the case page (or the job does, `PATCH /api/admin/rounds/:id`): the roster
  of the SPV group is frozen and the 48 hours start. A roster member votes yes, no or
  blank with one tap and can change until the deadline; every cast is a new row
  (append-only) attesting to the round's `bundle_sha256`, and the latest on-time one
  counts. Members see the live counts and turnout, never names; only the committee
  sees the named list (dc-59 H3, 2026-10-30; the rule's name `choices_board_only` is
  older). A standing `memberships.default_vote = 'blank'` counts as blank until the
  member votes: each member sets it on `/member` per SPV ("Hvis jeg ikke stemmer, regn
  meg som blank", `POST /api/member/default-vote`, audited by 032's trigger, never
  'yes'). It is frozen into the roster at open, so a change counts from the next vote;
  the committee's named list shows each member's setting and flags a change since. At the deadline `POST /api/admin/rounds/:id/close`
  computes 2/3 of yes + no, freezes `result_snapshot` (named) and renders the
  protocol PDF (who took part, NOT what they chose) to the deal-documents bucket.
  The portal sends every vote mail itself (`POST .../notify`: open, reminder,
  result with the protocol attached) and records each in `deal_round_notices`; the
  `deal-rounds` job only triggers it and records its Slack posts (`.../notices`).
  Mail and on-behalf ballots come in through `.../ballots` while the round is open.
  A banner on `/member` points at open votes the member has not cast.
- **Hovedbok** (`server/utils/dealLedger.ts`, hq migration 039, dc-39): CTORI4 pays 10%
  of the gain, 4 to the follow-up owner, 3 to the committee, 3 to the case drivers.
  The model is the round's group's `network_groups.incentive_model` (`incentive_models`,
  never a hard-coded slug); CTORI1-3 have none and keep no ledger. Drivers are the
  deal's current `lead` + `co_lead` rows in `deal_people`, the follow-up owner its
  current `follow_up_owner` row, the committee `current-komite` at close. `closeRound`
  writes the snapshot (`deal_rounds.ledger`) in the UPDATE that closes the round, and
  the 039 trigger checks it against `deal_people`. A passed CTORI4 vote with no lead or
  owner is a 409 `{code: 'ledger_incomplete', missing}`; the committee's close screen on
  the case page (`POST /api/member/deals/:slug/rounds/:id/close`) names them, written as
  `deal_people` rows in the same transaction. A close through the admin API records
  `recorded_by: null`. The committee-only Hovedbok panel shows each snapshot with its
  shares (equal, follow-up by months held from `deal_follow_up_months`, or the newest
  `deal_ledger_splits` row) and hands the follow-up over (close the row, open a new one,
  dated). Members never see any of it.
- **Mail**: every portal mail goes through `server/utils/mail.ts` (Resend). Without
  `RESEND_API_KEY` a local run logs instead of sending.
- **Admin API**: `/api/admin/deals` and `/api/admin/deals/:slug` (GET; PATCH sets
  `investorVisible` / `investorBlurb`), `deals/:slug/documents/:key` (PUT),
  `deals/:slug/rounds` (POST); `/api/admin/questions` (queue),
  `/api/admin/questions/:id` (GET; PATCH claim, release, route, close),
  `/api/admin/questions/:id/answers` (POST, the agent's answer), `/api/admin/answers`
  (answers since a time, for the nightly `qa-investors.md` sync); `/api/admin/rounds`
  (GET), `rounds/:id` (GET with roster, named ballots and notices; PATCH open),
  `rounds/:id/close`, `cancel`, `ballots`, `notify`, `notices` (POST),
  `rounds/:id/protocol` (GET, the PDF); `/api/admin/comments` (GET, with names),
  `deals/:slug/digests` (GET, POST); `/api/admin/pipeline-digests` (GET, POST),
  `pipeline-digests/source` (GET), `pipeline-digests/:id` (GET, PATCH slackRef),
  `pipeline-digests/:id/send` (POST). Scopes `deals:read deals:write rounds:write
  comments:read digests:write qa:read qa:write`. The route list with request and
  response JSON is memory `votes/admin-api.md` in ctori-4; `ctr` calls only what
  it lists.
- i18n keys live under `deals.*` (and `nav.deals`).

### CTORI signup (`/member/invest/<slug>`)

A CTORI cohort is an **offering** (`invest_offerings`: `ctori-1` … `ctori-4`) and a
member's answer to it is one `invest_subscriptions` row per offering and person, moving
interest → committed → signed → paid (or declined). Schema: hq migrations 031 and 041.
Design and plan: `research/portal-signup-mapping.md` in the ctori-4 project (huddle).
Built so far: step 3, the **interest** phase ("er du med, og omtrent hvor mye"), which
binds nobody.

- **All SQL is in `server/utils/invest.ts`.** Who sees an offering: every portal member
  in either chapter (decision D6) while it is `interest` or `committing`; only the
  investment committee (`current-komite`) while it is a `draft` (a preview, labelled as
  one). Anything else is a 404. The board (`styret`) is network only and gets nothing
  extra on investment pages (Snorre, 2026-10-29).
- **Amounts are data**: `amount_options` (50/100/200/300k for ctori-4, dc-32), plus
  `amount_min` / `amount_step` for "annet beløp" (ctori-4: at least 50 000, in whole
  10 000s). `parseInterestInput` validates every write against the offering; nothing is
  hard-coded. "Kanskje" is interest with `interest_level = 'maybe'` and always asks for
  information; "Nei takk" is phase `declined`.
- **Prefill** comes from the CTORI1-3 import (hq `backfill/import-ctori-subscribers.mjs`):
  "last time" (offering, amount, holding name) and the holdings the member owns. A
  holding is linked to the answer only when they own exactly one. Names only: no org
  number, address, phone or national ID is read here.
- **Totals** shown to members are anonymous and hidden below 3 yes/maybe answers.
- **Documents** (the deck now; vedtekter, aksjonæravtale, mandat at tegning) are
  `invest_offering_documents`: versioned rows with the bytes in Postgres (an HTML deck
  is ~25 KB), never edited. Served by `/api/member/invest/:slug/documents/:key` with a
  `sandbox` CSP (no scripts, opaque origin, framed only by the portal), shown in an
  iframe on `/member/invest/:slug/dokument/:key`. The invitation links there, not to
  share links.
- **Entry points**: `InvestOfferingBanner` on `/member` and `/member/sweden` until the
  member has answered, and a nav item from `session.investOffering`. A magic-link
  sign-in lands on `/member`, not on the deep link; the banner is what bridges that.
- **Operating it from a box** until the committee's view exists (step 4):
  `scripts/invest-offering.mjs show|publish|status` with `DATABASE_URL`. `publish`
  writes a new document version (same bytes write nothing). `status <slug> interest`
  is the launch, so it changes nothing without `--confirm`.

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
