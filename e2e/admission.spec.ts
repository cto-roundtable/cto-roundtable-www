import { type APIRequestContext, expect, test } from '@playwright/test'
import { anonymous, apiAs, db } from './support/meeting'

// Member admission (vedtekter § 4.1) end to end through the API, on the e2e branch
// (needs hq migration 050 applied there). The board starts a vote for ONE prospect
// from the list (a join_request is created for it), a member votes, the tally stays
// hidden while it runs, the board closes it, a tie goes to the board's lot, and the
// application follows the result. Who may do what: only the board starts, closes and
// toggles admission; a Swedish-only member and an outsider never see the vote.
//
// Needs the admissions flag ON on the preview server (NUXT_ADMISSIONS_ENABLED=true);
// with it off the whole spec is skipped (the off gate is tests/unit/admissions-flag.test.ts).
//
// Run: e2e/preview.sh test e2e/admission.spec.ts

test.describe.configure({ mode: 'serial', timeout: 120_000 })

type Api = Awaited<ReturnType<typeof apiAs>>
const api: Record<string, Api> = {}
let anon: APIRequestContext
let candidateId = ''
let voteId = ''

async function json(res: Awaited<ReturnType<Api['get']>>, want = 200) {
  const body = await res.json().catch(() => null)
  expect(res.status(), JSON.stringify(body)).toBe(want)
  return body
}

test.beforeAll(async () => {
  for (const k of ['board', 'member', 'sweden', 'retired']) api[k] = await apiAs(k)
  anon = await anonymous()
  const session = await (await api.member!.get('/api/auth/session')).json()
  test.skip(session.admissionsEnabled !== true, 'admissions flag is off on this server')
  const [p] = await db()`
    INSERT INTO persons (name, status) VALUES (${`E2E kandidat ${Date.now()}`}, 'prospect') RETURNING id
  `
  candidateId = p!.id
})

test('the board sees the prospect on the list, with no application yet', async () => {
  const body = await json(await api.board!.get('/api/member/admission'))
  expect(body.isBoard).toBe(true)
  const c = body.candidates.find((x: any) => x.personId === candidateId)
  expect(c).toBeTruthy()
  expect(c.votable).toBe(true)
  expect(c.joinRequestId).toBeNull()
  const member = await json(await api.member!.get('/api/member/admission'))
  expect(member.candidates).toBeNull()
  expect(member.groups).toBeNull()
})

test('only the board starts a vote; it creates the join_request', async () => {
  await json(await api.member!.post('/api/member/admission/votes', { data: { personId: candidateId } }), 403)
  const res = await json(
    await api.board!.post('/api/member/admission/votes', {
      data: { personId: candidateId, days: 7, note: 'E2E: styret anbefaler.' },
    }),
  )
  voteId = res.id
  const [jr] = await db()`SELECT source, status, invited_by FROM join_requests WHERE person_id = ${candidateId}`
  expect(jr).toMatchObject({ source: 'manual', status: 'pending', invited_by: api.board!.persona.personId })
  await json(await api.board!.post('/api/member/admission/votes', { data: { personId: candidateId } }), 409)
})

test('a member votes once, secretly; nobody sees a tally while it runs', async () => {
  const before = await json(await api.member!.get(`/api/member/admission/votes/${voteId}`))
  expect(before).toMatchObject({ state: 'open', onRoster: true, hasVoted: false, result: null })
  expect(before.boardNote).toBe('E2E: styret anbefaler.')
  const after = await json(
    await api.member!.post(`/api/member/admission/votes/${voteId}/ballot`, { data: { choice: 'yes' } }),
  )
  expect(after.hasVoted).toBe(true)
  expect(after.result).toBeNull()
  await json(await api.member!.post(`/api/member/admission/votes/${voteId}/ballot`, { data: { choice: 'no' } }), 409)
  await json(await api.board!.post(`/api/member/admission/votes/${voteId}/ballot`, { data: { choice: 'no' } }))
  const board = await json(await api.board!.get(`/api/member/admission/votes/${voteId}`))
  expect(board.result).toBeNull()
  expect(board.turnout.voted).toBe(2)
  // The secret half has no person in it.
  const rows = await db()`SELECT * FROM admission_secret_ballots WHERE vote_id = ${voteId}`
  expect(Object.keys(rows[0]!).sort()).toEqual(['choice', 'id', 'vote_id'])
})

test('outside the roster: 404 to read, refused to vote; no session: 401', async () => {
  await json(await api.sweden!.get(`/api/member/admission/votes/${voteId}`), 404)
  const res = await api.sweden!.post(`/api/member/admission/votes/${voteId}/ballot`, { data: { choice: 'yes' } })
  expect([403, 404]).toContain(res.status())
  expect((await anon.get('/api/member/admission')).status()).toBe(401)
})

test('the board closes it: a 1-1 tie, then the lot decides the application', async () => {
  await json(await api.member!.post(`/api/member/admission/votes/${voteId}/close`), 403)
  const closed = await json(await api.board!.post(`/api/member/admission/votes/${voteId}/close`))
  expect(closed.state).toBe('closed')
  expect(closed.result).toMatchObject({ yes: 1, no: 1, blank: 0, outcome: 'tie' })
  let [jr] = await db()`SELECT status FROM join_requests WHERE person_id = ${candidateId}`
  expect(jr!.status).toBe('pending')
  await json(
    await api.board!.post(`/api/member/admission/votes/${voteId}/lot`, { data: { outcome: 'passed', note: 'mynt' } }),
  )
  ;[jr] = await db()`SELECT status FROM join_requests WHERE person_id = ${candidateId}`
  expect(jr!.status).toBe('accepted')
  await json(
    await api.board!.post(`/api/member/admission/votes/${voteId}/lot`, { data: { outcome: 'failed', note: 'igjen' } }),
    409,
  )
  const [p] = await db()`SELECT status FROM persons WHERE id = ${candidateId}`
  expect(p!.status).toBe('prospect') // activation stays the add-new-member step
})

test('only the board opens and closes admission; closed still takes applications', async () => {
  await json(
    await api.member!.post('/api/member/admission/groups', { data: { slug: 'cto-roundtable', status: 'closed' } }),
    403,
  )
  const res = await json(
    await api.board!.post('/api/member/admission/groups', { data: { slug: 'cto-roundtable', status: 'closed' } }),
  )
  expect(res.groups.find((g: any) => g.slug === 'cto-roundtable').status).toBe('closed')
  const email = `e2e-apply-${Date.now()}@example.com`
  const applied = await json(
    await anon.post('/api/apply', {
      data: { name: 'E2E søker', email, linkedin: 'https://www.linkedin.com/in/e2e' },
    }),
  )
  expect(applied).toMatchObject({ ok: true, status: 'closed' })
  const [jr] = await db()`
    SELECT jr.status FROM join_requests jr JOIN contact_infos ci ON ci.person_id = jr.person_id
    WHERE ci.type = 'email' AND ci.value = ${email}
  `
  expect(jr!.status).toBe('pending')
  await json(
    await api.board!.post('/api/member/admission/groups', { data: { slug: 'cto-roundtable', status: 'open' } }),
  )
})
