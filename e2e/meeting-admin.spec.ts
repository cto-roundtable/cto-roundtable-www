import { createHash, randomBytes } from 'node:crypto'
import { type APIRequestContext, expect, request, test } from '@playwright/test'
import { e2eEnv } from './support/guard'
import { apiAs, branchApiToken, db } from './support/meeting'
import { persona } from './support/run'

// The general meeting through the ADMIN API (/api/admin/meetings/**, what `ctr
// meetings` calls), on the e2e branch (needs hq migrations 045 and 047 there).
// The gate: a token works only while its OWNER is in styret, and only with a
// meetings scope; current-komite gives nothing; a deal token gets nothing. Then a
// whole meeting run from a board token while members vote in the portal, and
// what the API never does: vote, or show who voted what on a secret ballot.
//
// Run: e2e/preview.sh test e2e/meeting-admin.spec.ts

test.describe.configure({ mode: 'serial', timeout: 180_000 })

const MEETINGS = ['meetings:read', 'meetings:write']
const tokens: Record<string, APIRequestContext> = {}
type Member = Awaited<ReturnType<typeof apiAs>>
const members: Record<string, Member> = {}
let meetingId = ''
const items: Record<number, string> = {}
let leaver = ''

async function bearer(token: string) {
  return request.newContext({ baseURL: e2eEnv().baseUrl, extraHTTPHeaders: { authorization: `Bearer ${token}` } })
}

async function json(res: Awaited<ReturnType<APIRequestContext['get']>>, want = 200) {
  const body = await res.json().catch(() => null)
  expect(res.status(), JSON.stringify(body)).toBe(want)
  return body
}

const A = (path = '') => `/api/admin/meetings${meetingId ? `/${meetingId}` : ''}${path}`
const adminPost = (who: string, path: string, data: object = {}) =>
  tokens[who]!.post(A(path), { data, failOnStatusCode: false })
const memberPost = (who: string, path: string, data: object = {}) =>
  members[who]!.post(`/api/member/meetings/${meetingId}${path}`, { data, failOnStatusCode: false })

test.beforeAll(async () => {
  tokens.board = await bearer(await branchApiToken('board', MEETINGS))
  tokens.boardRead = await bearer(await branchApiToken('board', ['meetings:read']))
  // Every deal scope there is, on a board AND committee owner: still nothing here.
  tokens.dealsOnly = await bearer(
    await branchApiToken('committee-board', [
      'deals:read',
      'deals:write',
      'rounds:write',
      'comments:read',
      'digests:write',
      'qa:read',
      'qa:write',
    ]),
  )
  for (const k of ['committee-only', 'member', 'outsider', 'sweden']) {
    tokens[k] = await bearer(await branchApiToken(k, MEETINGS))
  }
  for (const k of ['member', 'invest-1', 'invest-2', 'invest-3', 'committee-only']) members[k] = await apiAs(k)
  // A board member who leaves the board mid-way (synthetic, this branch only).
  const [p] = (await db()`
    INSERT INTO persons (name, status) VALUES ('E2E persona: ctr-meetings board leaver', 'active') RETURNING id
  `) as { id: string }[]
  leaver = p!.id
  await db()`
    INSERT INTO memberships (person_id, group_id)
    SELECT ${leaver}, g.id FROM network_groups g WHERE g.slug = 'styret'
  `
  const t = `ctr_${randomBytes(32).toString('base64url')}`
  await db()`
    INSERT INTO api_tokens (name, owner_person_id, token_hash, scopes, expires_at)
    VALUES ('e2e board leaver', ${leaver}, ${createHash('sha256').update(t).digest('hex')}, ${MEETINGS},
            NOW() + interval '1 day')
  `
  tokens.leaver = await bearer(t)
})

test.afterAll(async () => {
  if (leaver) await db()`DELETE FROM memberships WHERE person_id = ${leaver}`
})

test('the scopes exist in the database (hq 047)', async () => {
  const [{ ok }] = (await db()`
    SELECT pg_get_constraintdef(oid) LIKE '%meetings:write%' AS ok
    FROM pg_constraint WHERE conname = 'device_authorizations_scopes_check'
  `) as { ok: boolean }[]
  expect(ok).toBe(true)
})

test('gate: only a styret owner with a meetings scope gets in; committee, member, outsider do not', async () => {
  const before = (await db()`SELECT count(*)::int AS n FROM general_meetings`) as { n: number }[]
  // Owner not in styret: the token gate's 401 (any token problem is a 401, CLAUDE.md), reads and writes.
  for (const k of ['committee-only', 'member', 'outsider', 'sweden']) {
    expect((await tokens[k]!.get(A(), { failOnStatusCode: false })).status(), k).toBe(401)
    const res = await tokens[k]!.post(A(), { data: { kind: 'ordinary', title: 'x' }, failOnStatusCode: false })
    expect(res.status(), k).toBe(401)
  }
  // In styret but no meetings scope: 403, even with every deal scope and the committee.
  expect((await tokens.dealsOnly!.get(A(), { failOnStatusCode: false })).status()).toBe(403)
  expect(
    (await tokens.dealsOnly!.post(A(), { data: { kind: 'ordinary', title: 'x' }, failOnStatusCode: false })).status(),
  ).toBe(403)
  // Read scope reads, does not write.
  await json(await tokens.boardRead!.get(A()))
  expect(
    (await tokens.boardRead!.post(A(), { data: { kind: 'ordinary', title: 'x' }, failOnStatusCode: false })).status(),
  ).toBe(403)
  const after = (await db()`SELECT count(*)::int AS n FROM general_meetings`) as { n: number }[]
  expect(after[0]!.n).toBe(before[0]!.n)
  // Every refusal is in the audit log, with why.
  const reasons = (await db()`
    SELECT DISTINCT summary->>'reason' AS r FROM api_audit_log
    WHERE path LIKE '/api/admin/meetings%' AND status IN (401, 403) AND at > NOW() - interval '10 minutes'
  `) as { r: string }[]
  expect(reasons.map((x) => x.r).sort()).toEqual(expect.arrayContaining(['missing_scope', 'owner_not_board']))
})

test('gate: checked at request time, so leaving the board ends the token', async () => {
  await json(await tokens.leaver!.get(A()))
  await db()`
    DELETE FROM memberships WHERE person_id = ${leaver}
      AND group_id = (SELECT id FROM network_groups WHERE slug = 'styret')
  `
  expect((await tokens.leaver!.get(A(), { failOnStatusCode: false })).status()).toBe(401)
})

test('setup from the API: create, saker (add, edit), roster, announce', async () => {
  const created = await json(
    await tokens.board!.post(A(), {
      data: { kind: 'ordinary', title: `E2E årsmøte via ctr ${new Date().toISOString().slice(0, 16)}` },
    }),
  )
  meetingId = created.meeting.id
  expect(created.meeting.status).toBe('draft')
  expect((await adminPost('board', '/items', { title: 'x', preset: 'majority', colour: 'red' })).status()).toBe(400)
  await json(await adminPost('board', '/items', { title: 'Godkjenning av innkalling', preset: 'majority' }))
  await json(await adminPost('board', '/items', { title: 'Vedtektsendring', preset: 'two_thirds', ballot: 'secret' }))
  const v = await json(await adminPost('board', '/items', { title: 'Kontingent', preset: 'majority' }))
  for (const it of v.items) items[it.position] = it.id
  const edited = await json(
    await tokens.board!.patch(A(`/items/${items[1]}`), { data: { title: 'Godkjenning av innkalling og saksliste' } }),
  )
  expect(edited.items[0].title).toBe('Godkjenning av innkalling og saksliste')
  expect((await adminPost('board', '/announce')).status()).toBe(409) // roster first
  const frozen = await json(await adminPost('board', '/roster'))
  expect(frozen.meeting.rosterSha256).toMatch(/^[0-9a-f]{64}$/)
  expect((await adminPost('board', '/roster', { force: true })).status()).toBe(400)
  const a = await json(await adminPost('board', '/announce'))
  expect(a.meeting.status).toBe('announced')
  // Show and list agree.
  const list = await json(await tokens.boardRead!.get('/api/admin/meetings'))
  expect(list.meetings.some((m: { id: string }) => m.id === meetingId)).toBe(true)
})

test('the session: open, chair and referent, attendance on a member’s behalf', async () => {
  expect(
    (await adminPost('board', `/attendance/${persona('invest-2').personId}`, { present: true, reason: 'x' })).status(),
  ).toBe(409)
  await json(await adminPost('board', '/session', { action: 'open' }))
  const chaired = await json(
    await tokens.board!.patch(A(), {
      data: { chair: persona('member').personId, secretary: persona('invest-1').personId },
    }),
  )
  expect(chaired.meeting.chair.id).toBe(persona('member').personId)
  expect(chaired.meeting.secretary.id).toBe(persona('invest-1').personId)
  // In session the setup is locked, through the API as in the portal.
  expect((await tokens.board!.patch(A(), { data: { title: 'nytt' }, failOnStatusCode: false })).status()).toBe(409)
  expect((await adminPost('board', `/attendance/${persona('invest-2').personId}`, { present: true })).status()).toBe(
    400,
  )
  await json(
    await adminPost('board', `/attendance/${persona('invest-2').personId}`, { present: true, reason: 'Ringte inn' }),
  )
  expect(
    (await adminPost('board', `/attendance/${persona('sweden').personId}`, { present: true, reason: 'x' })).status(),
  ).toBe(400)
  for (const k of ['member', 'invest-1', 'invest-3']) {
    expect((await memberPost(k, '/attendance', { present: true })).status(), k).toBe(200)
  }
  const v = await json(await tokens.boardRead!.get(A()))
  const present = v.roster.filter((r: { present: boolean }) => r.present).map((r: { personId: string }) => r.personId)
  expect(present.sort()).toEqual(['member', 'invest-1', 'invest-2', 'invest-3'].map((k) => persona(k).personId).sort())
})

test('the API never votes: no ballot route, for oneself or on behalf', async () => {
  await json(await adminPost('board', `/items/${items[1]}/open`))
  for (const path of [`/items/${items[1]}/ballot`, `/items/${items[1]}/ballot-on-behalf`, '/attendance']) {
    const res = await adminPost('board', path, { choice: 'yes', person: persona('invest-2').personId, reason: 'x' })
    expect(res.status(), path).toBe(404)
  }
  const [{ n }] = (await db()`
    SELECT count(*)::int AS n FROM meeting_ballots WHERE item_id = ${items[1]}
  `) as { n: number }[]
  expect(n).toBe(0)
})

test('sak 1, open majority: members vote in the portal, the API closes it', async () => {
  for (const [k, c] of [
    ['member', 'yes'],
    ['invest-1', 'yes'],
    ['invest-2', 'no'],
    ['invest-3', 'yes'],
  ] as const) {
    expect((await memberPost(k, `/items/${items[1]}/ballot`, { choice: c })).status(), k).toBe(200)
  }
  const live = await json(await tokens.boardRead!.get(A()))
  expect(live.items[0].progress).toEqual({ voted: 4, present: 4 })
  expect(live.items[0].counts).toBeNull()
  // The read token cannot close.
  expect((await tokens.boardRead!.post(A(`/items/${items[1]}/close`), { failOnStatusCode: false })).status()).toBe(403)
  const v = await json(await adminPost('board', `/items/${items[1]}/close`))
  expect(v.items[0].counts).toEqual({ yes: 3, no: 1, blank: 0, present: 4 })
  expect(v.items[0].finalOutcome).toBe('passed')
  expect(v.items[0].named).toHaveLength(4)
})

test('sak 2, secret 2/3: through the API there are no names on a secret ballot', async () => {
  await json(await adminPost('board', `/items/${items[2]}/open`))
  for (const [k, c] of [
    ['member', 'yes'],
    ['invest-1', 'no'],
    ['invest-2', 'yes'],
    ['invest-3', 'yes'],
  ] as const) {
    expect((await memberPost(k, `/items/${items[2]}/ballot`, { choice: c })).status(), k).toBe(200)
  }
  const v = await json(await adminPost('board', `/items/${items[2]}/close`))
  const it = v.items[1]
  expect(it.counts).toEqual({ yes: 3, no: 1, blank: 0, present: 4 })
  expect(it.finalOutcome).toBe('passed') // 3 of 4 ≥ 2/3
  expect(it.named).toBeNull()
  expect(it.voters).toHaveLength(4) // who voted, never what
  const shown = await json(await tokens.boardRead!.get(A()))
  const secret = shown.items[1]
  expect(secret.named).toBeNull()
  expect(JSON.stringify(secret)).not.toMatch(/"choice":"(yes|no|blank)"/)
})

test('sak 3, a tie: the session cannot end until the lot is entered, once', async () => {
  await json(await adminPost('board', `/items/${items[3]}/open`))
  for (const [k, c] of [
    ['member', 'yes'],
    ['invest-1', 'yes'],
    ['invest-2', 'no'],
    ['invest-3', 'no'],
  ] as const) {
    expect((await memberPost(k, `/items/${items[3]}/ballot`, { choice: c })).status(), k).toBe(200)
  }
  const closed = await json(await adminPost('board', `/items/${items[3]}/close`))
  expect(closed.items[2].result).toBe('tie')
  expect((await adminPost('board', '/session', { action: 'close' })).status()).toBe(409)
  expect((await adminPost('board', `/items/${items[3]}/lot`, { outcome: 'passed' })).status()).toBe(400)
  const v = await json(
    await adminPost('board', `/items/${items[3]}/lot`, { outcome: 'failed', note: 'Mynt, møteleder trakk' }),
  )
  expect(v.items[2].finalOutcome).toBe('failed')
  expect((await adminPost('board', `/items/${items[3]}/lot`, { outcome: 'passed', note: 'igjen' })).status()).toBe(409)
})

test('the protocol PDF, the session closes, and the trail names the token owner', async () => {
  const pdf = await tokens.boardRead!.get(A('/protocol'))
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toContain('application/pdf')
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
  const v = await json(await adminPost('board', '/session', { action: 'close' }))
  expect(v.meeting.status).toBe('closed')
  const events = (await db()`
    SELECT kind, by_person_id FROM meeting_events WHERE meeting_id = ${meetingId} ORDER BY at, id
  `) as { kind: string; by_person_id: string | null }[]
  for (const kind of [
    'created',
    'roster_frozen',
    'announced',
    'session_opened',
    'item_opened',
    'item_closed',
    'lot_recorded',
    'session_closed',
  ]) {
    const row = events.find((e) => e.kind === kind)
    expect(row?.by_person_id, kind).toBe(persona('board').personId)
  }
  // The audit log has every call, and never a title, a reason or a lot note.
  const audit = (await db()`
    SELECT summary::text AS s FROM api_audit_log WHERE target_type = 'general_meeting' AND target_id = ${meetingId}
  `) as { s: string }[]
  expect(audit.length).toBeGreaterThan(15)
  for (const { s } of audit) expect(s).not.toMatch(/Mynt|Ringte inn|Kontingent|Vedtektsendring/)
})
