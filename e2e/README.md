# Persona e2e: the member portal as each kind of member

Answers "what does a member / a CTORI 3 investor / the committee see right now?"
with screenshots, a video per persona, and an access matrix of every member API
route, all on a **copy of production data** that nobody else touches.

```
e2e/preview.sh up        # Neon branch of production (expires in 24 h), build, serve on :3311
e2e/preview.sh test      # access + views specs, then the report in e2e/.run/gallery/
e2e/preview.sh publish   # (box) the report on the artifact shelf, one page per persona
e2e/preview.sh down      # stop the server, delete the branch
```

`npm run e2e` is `preview.sh test`. Narrow a run with Playwright's own
arguments (`e2e/preview.sh test e2e/access.spec.ts`), shorten the walk with
`E2E_PAGES=/member,/member/caser`, and add one exact person with
`E2E_AS=<email or person id>` (an extra `as` persona in the views).

A tour of ONE persona follows that persona's own menu instead of a fixed page
list, on desktop and on a phone, plus one level of the member pages those pages
link to: `E2E_TOUR=sweden e2e/preview.sh test e2e/tour.spec.ts` (output in
`e2e/.run/tour/<persona>/`). Without `E2E_TOUR` the tour is skipped.

## How it signs in

The session is a stateless HMAC cookie (`server/utils/session.ts`). The preview
server gets its **own fresh `SESSION_SECRET`**, so the harness mints the cookie
`issueSession()` would for any person id, without mail or passkeys. The server
still runs the live gate (`getChapters`) on every request, so a minted cookie
for a non-member is refused exactly like a real one. Nothing here can sign in to
production: production's secret is never on the machine running this.

`e2e/support/guard.ts` refuses a `DATABASE_URL` on the production branch and a
base URL on ctoroundtable.no before anything runs. The preview server has no
PostHog token (test traffic stays out of usage analytics) and a dummy Resend
key (no mail goes out).

## Personas

`e2e/support/personas.ts`. A persona is a **shape**, not a name: a person status
plus the exact set of groups the server checks (`cto-roundtable`,
`roundtable-sweden`, `styret`, `current-komite`, `braintrust`, `invest-*`). At
run time it resolves to the first real person on the branch with exactly that
shape, so the screenshots show real data the way that member sees it. A shape
nobody has yet (committee without board) is `synthetic: true`: the harness
creates `E2E persona: <key>` in the branch, never anywhere else.

Add a role: add a line to `PERSONAS`. When a new SPV starts raising (invest-4),
add `invest-4`; if nobody is in it yet, make it synthetic.

## What is checked

- `access.spec.ts`: every persona against every member GET route, every case
  slug and every funded company's investor updates. Hard rules asserted: a
  non-member gets 401 everywhere; board routes only for `styret`; the committee
  overview only for the committee (the board sees cases as a member, #74); the
  invested list is exactly what the persona's own SPVs invested in, one tag per
  SPV; onboarding only for Norway; for a member, what the
  case overview offers to open is exactly what the case page opens; nobody opens
  a case the committee cannot; a new lead (status `incoming`) opens for the committee
  only, everyone else gets the 404 of a missing case, and its move API
  (`POST /api/member/committee/leads/:slug`) is 403 for anyone off the committee (global
  setup adds the investor-visible `e2e-synthetic-lead` so this is probed even on a day
  with no real leads); a member in no SPV and not on the committee sees no
  cases and no updates; investor updates exactly for the groups that funded the
  company. Path tricks without a cookie (`//api/member/...`, encoded) never 200.
- `views.spec.ts`: a walk through the member pages per persona (plus the first
  case and the first investor update it can open), full-page screenshots, a
  video, page errors asserted empty. Nothing that writes is clicked.

- `meeting.spec.ts`: the general meeting (årsmøte) end to end, needs hq migration 045
  on the branch. The board creates and sets it up, the roster is the active Norwegian
  members (no retired, no Swedish-only), a member who is not on the board chairs, members
  check in and vote: an open majority sak, a secret 2/3 sak (no names to anyone), a
  majority tie settled by the chair's lot (once, logged once), the protocol PDF, a trial
  meeting invisible to members. Access: the committee and ordinary members get 403 on
  every board action. Screens of the pages (member, chair, board, desktop and phone) in
  `.run/meeting/`.
- `meeting-admin.spec.ts`: the general meeting through the ADMIN API (`ctr meetings`),
  needs hq migrations 045 and 046 on the branch. The gate: a token whose owner is
  committee-only, a member, Swedish-only or an outsider is refused (401, the token gate),
  a board token with every deal scope but no meetings scope gets a 403, a read token
  cannot write, and a token stops working the moment its owner leaves `styret`. Then a
  whole meeting run from a board token while members vote in the portal: no ballot route
  exists, a secret sak shows no names, a tie needs its lot before the session ends, the
  protocol PDF, every `meeting_events` row names the token's owner, and the audit log
  holds no title, reason or note.
- `deal-vote.spec.ts`: REGRESSION for the deal vote, end to end on the branch: the admin
  API publishes a document and a draft round, the committee opens it (the board cannot),
  SPV members vote with the bundle hash, no early close, the committee closes after the
  48 hours (fast-forwarded on the branch), protocol PDF, `deal_events`, and the CTORI4
  hovedbok's 409 `ledger_incomplete`. Start the preview server with
  `DEAL_DOCUMENTS_DIR` set (documents and protocols go to a folder instead of GCS).

The run's files are in `e2e/.run/` (gitignored): `personas.json`,
`access/<key>.json`, `views/<key>/`, Playwright's HTML report with traces in
`report/`, and the persona pages in `gallery/`.
