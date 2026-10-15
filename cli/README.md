# ctr: the member portal, for agents

`ctr` reads and writes member-portal data over `/api/admin/**` with a
per-agent API token. One file, no dependencies, Node 22 or newer.

```bash
export CTR_API_TOKEN=ctr_...            # from the secret store, never in a file in a repo
node cli/ctr.mjs whoami
```

`CTR_API_URL` defaults to `https://www.ctoroundtable.no`. Point it at
`http://localhost:3000` to use a dev server.

## Commands

| command | scope | what it does |
|---|---|---|
| `ctr whoami` | any | the token's name, owner, scopes and expiry |
| `ctr events ls [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--group slug] [--limit N]` | `events:read` | events, newest first (default 20, max 200) |
| `ctr events import-luma [--since 14d] [--dry-run]` | `events:write` | every Luma event that ended in the window, from both network calendars: the events row plus `event_hosted` / `event_attended` rows. Needs the `luma` CLI on this machine |
| `ctr surveys ls [--status draft\|open\|closed]` | `surveys:read` | every survey with its response count |
| `ctr surveys show <id>` | `surveys:read` | one survey and its questions |
| `ctr surveys results <id> [--texts]` | `surveys:read` | aggregates; `--texts` adds the free-text answers with names |
| `ctr surveys create <eventId> [--title T] [--intro T] [--closes-at ISO] [--draft] [--questions-file q.json]` | `surveys:write` | the survey for an event; default template in the event's language |
| `ctr surveys close <id>` / `ctr surveys reopen <id>` | `surveys:write` | close or reopen |
| `ctr surveys sweep [--dry-run] [--window-days N]` | `surveys:write` | open a survey for every event in the last N days (default 14) that has none |

`--json` on any command prints the API response as JSON, for agents. Exit codes:
0 ok, 1 the API refused or failed (status and message on stderr), 2 usage.

## The rules on the server

- 401 for any token problem (missing, malformed, unknown, revoked, expired, owner
  no longer an active `styret` member), with no hint which. 403 when the token
  lacks the route's scope.
- The owner's board membership is checked on every request. Leaving `styret`
  disables every token you answer for.
- Every `/api/admin/` request is written to `api_audit_log`, refusals included:
  token, owner, method, path, scope, target, status and a small summary. Never
  the token, never response bodies, never members' free text.

Code: `server/utils/apiTokens.ts` (the gate and `defineAdminRoute`),
`server/utils/audit.ts`, `server/api/admin/**`. Tables:
`ctoroundtable-hq/infrastructure/db/migrations/026_api_tokens_and_audit.sql`.

## Tokens

Minted by a person with the production `DATABASE_URL`, never by an agent:

```bash
DATABASE_URL=... node scripts/mint-api-token.mjs mint --name cto-roundtable-box \
  --owner <board member email or person uuid> \
  --scopes events:read,events:write,surveys:read,surveys:write --dry-run
```

Without `--dry-run` it prints the token once, alone on stdout, and stores only
its sha256. `list` shows every token and its state; `revoke <id>` stops one from
the next request on. Tokens expire after 365 days unless `--expires-days` says
otherwise.

## Importing from Luma

`ctr events import-luma` reads the two network calendars with the `luma` CLI
(`calendar events --past`, then `event get` for hosts and `event guests` for
approved guests) and posts each finished event to `POST /api/admin/events/import`.
The server upserts the `events` row on `luma_event_id`: Luma owns date, group and
URL, while theme and location are only filled when empty. It then writes one
`event_hosted` per host and one `event_attended` per approved guest, with the same
dedup keys as the track-event-attendance skill. Re-running is safe. Guests whose
Luma email matches no member are listed as unresolved. Approved at a finished
event counts as attended, because QR check-in is almost never used.

## The daily tick

Automatic surveys come from one daily box job, so each automatic write is in the
audit log under the token that made it. Import first, because the sweep only
opens surveys for events with attendance:

```bash
CTR=/workspace/cto-roundtable/cto-roundtable-www/cli/ctr.mjs
node $CTR events import-luma && node $CTR surveys sweep --json
```
