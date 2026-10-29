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
  overview only for staff; onboarding only for Norway; the case list and the
  case page agree; nobody sees a case staff cannot; a member in no SPV sees no
  cases and no updates; investor updates exactly for the groups that funded the
  company. Path tricks without a cookie (`//api/member/...`, encoded) never 200.
- `views.spec.ts`: a walk through the member pages per persona (plus the first
  case and the first investor update it can open), full-page screenshots, a
  video, page errors asserted empty. Nothing that writes is clicked.

The run's files are in `e2e/.run/` (gitignored): `personas.json`,
`access/<key>.json`, `views/<key>/`, Playwright's HTML report with traces in
`report/`, and the persona pages in `gallery/`.
