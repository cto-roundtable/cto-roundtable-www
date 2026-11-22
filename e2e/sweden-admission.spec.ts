import { type APIRequestContext, expect, test } from '@playwright/test'
import { anonymous, apiAs, db } from './support/meeting'

// Sweden admission votes (roundtable-sweden, hq migration 051) end to end through the API,
// on the e2e branch. The Sweden managers (not styret) start a vote on a pending Sweden
// application; the voters on Sweden's explicit list vote yes/no/blank with an optional
// note; nobody sees a tally or a note while it runs; at close the rule is at least 2/3 of
// yes + no, and the managers read the notes with their choice and without an author.
// Styret sees nothing of it, and Norway's admission routes cannot touch a Sweden vote.
//
// The branch's Sweden list is replaced for the run (every current admission_roles row for
// roundtable-sweden is ended, on the BRANCH only): manager = the Sweden-only persona;
// voters = the Sweden-only persona, a Norwegian member (like Snorre, who votes from the
// Norwegian portal) and a CTORI 3 investor. The board and the committee are on no list.
//
// Needs the Sweden flag ON on the preview server (NUXT_ADMISSIONS_SWEDEN_ENABLED=true,
// exported before e2e/preview.sh up); off, the spec is skipped (the off gate is
// tests/unit/sweden-admission.test.ts).
//
// Run: e2e/preview.sh test e2e/sweden-admission.spec.ts

test.describe.configure({ mode: 'serial', timeout: 120_000 })

type Api = Awaited<ReturnType<typeof apiAs>>
const api: Record<string, Api> = {}
let anon: APIRequestContext
let sweden = ''
// An 'active' person with no membership who applied (Arash's shape on 2026-11-22): still an applicant.
let activeNoMembership = ''
const cand: Record<'a' | 'b', { personId: string; joinRequestId: string; voteId: string }> = {
  a: { personId: '', joinRequestId: '', voteId: '' },
  b: { personId: '', joinRequestId: '', voteId: '' },
}

async function json(res: Awaited<ReturnType<Api['get']>>, want = 200) {
  const body = await res.json().catch(() => null)
  expect(res.status(), JSON.stringify(body)).toBe(want)
  return body
}

async function applicant(label: string, status: 'prospect' | 'active' = 'prospect') {
  const [p] = await db()`
    INSERT INTO persons (name, status) VALUES (${`E2E Sweden ${label} ${Date.now()}`}, ${status}) RETURNING id
  `
  const [jr] = await db()`
    INSERT INTO join_requests (person_id, group_id, why_join, source, status)
    VALUES (${p!.id}, ${sweden}, 'E2E: I want to join the Stockholm table.', 'form', 'pending') RETURNING id
  `
  return { personId: p!.id as string, joinRequestId: jr!.id as string, voteId: '' }
}

test.beforeAll(async () => {
  for (const k of ['sweden', 'member', 'invest-3', 'board', 'committee-board']) api[k] = await apiAs(k)
  anon = await anonymous()
  const session = await (await api.sweden!.get('/api/auth/session')).json()
  test.skip(session.swedenAdmission?.enabled !== true, 'the Sweden admissions flag is off on this server')
  const [g] = await db()`SELECT id FROM network_groups WHERE slug = 'roundtable-sweden'`
  sweden = g!.id
  await db()`UPDATE admission_roles SET valid_to = NOW() WHERE group_id = ${sweden} AND valid_to IS NULL`
  const add = async (key: string, role: 'voter' | 'manager') =>
    db()`INSERT INTO admission_roles (group_id, person_id, role, note) VALUES (${sweden}, ${api[key]!.persona.personId}, ${role}, 'e2e')`
  await add('sweden', 'manager')
  for (const k of ['sweden', 'member', 'invest-3']) await add(k, 'voter')
  cand.a = await applicant('A')
  cand.b = await applicant('B')
  activeNoMembership = (await applicant('C', 'active')).joinRequestId
})

test('the session says who is what; off the list there is no page', async () => {
  const s = await (await api.sweden!.get('/api/auth/session')).json()
  expect(s.swedenAdmission).toEqual({ enabled: true, isManager: true, isVoter: true })
  const m = await (await api.member!.get('/api/auth/session')).json()
  expect(m.swedenAdmission).toMatchObject({ isManager: false, isVoter: true })
  const b = await (await api.board!.get('/api/auth/session')).json()
  expect(b.swedenAdmission).toMatchObject({ isManager: false, isVoter: false })
  await json(await api.board!.get('/api/member/sweden/admission'), 404)
  expect((await anon.get('/api/member/sweden/admission')).status()).toBe(401)
})

test('a manager sees the applicants and the list; a voter sees neither', async () => {
  const body = await json(await api.sweden!.get('/api/member/sweden/admission'))
  expect(body.isManager).toBe(true)
  const a = body.candidates.find((c: any) => c.joinRequestId === cand.a.joinRequestId)
  expect(a).toMatchObject({ votable: true, liveVote: null })
  expect(body.candidates.find((c: any) => c.joinRequestId === activeNoMembership)).toMatchObject({ votable: true })
  expect(body.roles.managers.map((p: any) => p.personId)).toEqual([api.sweden!.persona.personId])
  expect(body.roles.voters).toHaveLength(3)
  const voter = await json(await api.member!.get('/api/member/sweden/admission'))
  expect(voter).toMatchObject({ isManager: false, candidates: null, roles: null })
})

test('only a manager starts a vote, styret cannot, and only once per application', async () => {
  for (const k of ['member', 'board']) {
    await json(
      await api[k]!.post('/api/member/sweden/admission/votes', { data: { joinRequestId: cand.a.joinRequestId } }),
      403,
    )
  }
  const res = await json(
    await api.sweden!.post('/api/member/sweden/admission/votes', {
      data: { joinRequestId: cand.a.joinRequestId, days: 7, note: 'E2E: met at the first evening.' },
    }),
  )
  cand.a.voteId = res.id
  await json(
    await api.sweden!.post('/api/member/sweden/admission/votes', { data: { joinRequestId: cand.a.joinRequestId } }),
    409,
  )
  const [v] =
    await db()`SELECT roster_group, preset, jsonb_array_length(roster) AS n FROM admission_votes WHERE id = ${res.id}`
  expect(v).toMatchObject({ roster_group: 'roundtable-sweden', preset: 'two_thirds', n: 3 })
})

test("Norway's admission never shows or touches a Sweden vote", async () => {
  const norway = await json(await api.board!.get('/api/member/admission'))
  expect(norway.votes.map((v: any) => v.id)).not.toContain(cand.a.voteId)
  await json(await api.board!.get(`/api/member/admission/votes/${cand.a.voteId}`), 404)
  await json(await api.board!.post(`/api/member/admission/votes/${cand.a.voteId}/close`), 409)
  await json(await api.board!.post(`/api/member/admission/votes/${cand.a.voteId}/cancel`), 409)
  await json(
    await api.member!.post(`/api/member/admission/votes/${cand.a.voteId}/ballot`, { data: { choice: 'yes' } }),
    404,
  )
})

test('voters vote once with a note; nobody sees a tally or a note while it runs', async () => {
  const url = `/api/member/sweden/admission/votes/${cand.a.voteId}`
  const before = await json(await api.member!.get(url))
  expect(before).toMatchObject({ state: 'open', onRoster: true, hasVoted: false, result: null, manager: null })
  expect(before.managerNote).toBe('E2E: met at the first evening.')
  await json(await api.member!.post(`${url}/ballot`, { data: { choice: 'yes', note: 'x'.repeat(2001) } }), 400)
  await json(await api.member!.post(`${url}/ballot`, { data: { choice: 'yes' } }))
  await json(await api.member!.post(`${url}/ballot`, { data: { choice: 'no' } }), 409)
  await json(await api.sweden!.post(`${url}/ballot`, { data: { choice: 'yes', note: '  E2E note: strong yes.  ' } }))
  await json(await api['invest-3']!.post(`${url}/ballot`, { data: { choice: 'no', note: 'E2E note: too early.' } }))
  // Not on the list: 404 to read, refused to vote.
  await json(await api['committee-board']!.get(url), 404)
  const res = await api['committee-board']!.post(`${url}/ballot`, { data: { choice: 'yes' } })
  expect([403, 404]).toContain(res.status())
  const mgr = await json(await api.sweden!.get(url))
  expect(mgr.result).toBeNull()
  expect(mgr.turnout).toEqual({ voted: 3, roster: 3 })
  expect(mgr.manager.notes).toBeNull()
  // The secret half has no person and no time, and holds the trimmed note.
  const rows = await db()`SELECT * FROM admission_secret_ballots WHERE vote_id = ${cand.a.voteId}`
  expect(Object.keys(rows[0]!).sort()).toEqual(['choice', 'id', 'note', 'vote_id'])
  expect(rows.map((r) => r.note).sort()).toEqual([null, 'E2E note: strong yes.', 'E2E note: too early.'].sort())
})

test('a manager closes it: 2 yes 1 no is two-thirds, passed; the managers read the notes, no author', async () => {
  const url = `/api/member/sweden/admission/votes/${cand.a.voteId}`
  await json(await api.member!.post(`${url}/close`), 403)
  const closed = await json(await api.sweden!.post(`${url}/close`))
  expect(closed.state).toBe('closed')
  expect(closed.result).toMatchObject({ yes: 2, no: 1, blank: 0, outcome: 'passed', needed: 2 })
  expect(closed.manager.notes).toHaveLength(2)
  for (const n of closed.manager.notes) expect(Object.keys(n).sort()).toEqual(['choice', 'note'])
  expect(closed.manager.notes).toContainEqual({ choice: 'no', note: 'E2E note: too early.' })
  // A voter sees the result, never the notes.
  const voter = await json(await api.member!.get(url))
  expect(voter.result.outcome).toBe('passed')
  expect(voter.manager).toBeNull()
  const [jr] = await db()`SELECT status, resolved_at FROM join_requests WHERE id = ${cand.a.joinRequestId}`
  expect(jr!.status).toBe('accepted')
  expect(jr!.resolved_at).not.toBeNull()
  const [p] = await db()`SELECT status FROM persons WHERE id = ${cand.a.personId}`
  expect(p!.status).toBe('prospect') // becoming a member stays the add-new-member step
})

test('1 yes 1 no is below two-thirds (no tie, no lot): failed, the application is rejected', async () => {
  const res = await json(
    await api.sweden!.post('/api/member/sweden/admission/votes', { data: { joinRequestId: cand.b.joinRequestId } }),
  )
  cand.b.voteId = res.id
  const url = `/api/member/sweden/admission/votes/${res.id}`
  await json(await api.member!.post(`${url}/ballot`, { data: { choice: 'yes' } }))
  await json(await api['invest-3']!.post(`${url}/ballot`, { data: { choice: 'no' } }))
  const closed = await json(await api.sweden!.post(`${url}/close`))
  expect(closed.result).toMatchObject({ yes: 1, no: 1, outcome: 'failed', needed: 2 })
  expect(closed.manager.notes).toEqual([])
  const [jr] = await db()`SELECT status FROM join_requests WHERE id = ${cand.b.joinRequestId}`
  expect(jr!.status).toBe('rejected')
  // A closed vote takes no more ballots.
  await json(await api.sweden!.post(`${url}/ballot`, { data: { choice: 'yes' } }), 409)
})
