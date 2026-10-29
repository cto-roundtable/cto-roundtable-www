import { neon } from '@neondatabase/serverless'
import { expect, test } from '@playwright/test'
import { e2eEnv } from './support/guard'
import { persona } from './support/run'

// POST /api/sweden/join is public: whoever types an email is not proven to own
// it. Typing a real member's email must not change that member's record (no
// contact_infos, no name, no status, no memberships); what was submitted lands
// on the join_request as unverified notes. A new email still creates a prospect.
// The form is rate limited per client address (the LAST X-Forwarded-For hop) and
// answers no sooner than its floor, so a known and a new email take the same time.
// This spec writes to the branch (the guard refuses production) and cleans up.
// Each test posts as its own made-up client address, so a re-run is not limited;
// the global cap (60 per 15 min per instance) still counts about 15 per run.

const env = e2eEnv()
const sql = neon(env.databaseUrl)
const stamp = Date.now()
const fakeIp = () => `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}`
const join = (body: Record<string, string>, xff = fakeIp()) =>
  fetch(`${env.baseUrl}/api/sweden/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': xff },
    body: JSON.stringify(body),
  })
const FLOOR_MS = 950 // ANSWER_FLOOR_MS is 1000; a little slack for timer granularity

async function emailOf(personId: string): Promise<string> {
  const [row] = await sql`
    SELECT value FROM contact_infos WHERE person_id = ${personId} AND type = 'email' ORDER BY is_primary DESC LIMIT 1
  `
  if (!row) throw new Error(`e2e: person ${personId} has no email on the branch`)
  return row.value
}

async function snapshot(personId: string) {
  const [person] = await sql`SELECT name, status, updated_at FROM persons WHERE id = ${personId}`
  const contacts = await sql`
    SELECT id, type, label, value, is_primary, updated_at FROM contact_infos WHERE person_id = ${personId} ORDER BY id
  `
  const memberships = await sql`SELECT * FROM memberships WHERE person_id = ${personId} ORDER BY id`
  return JSON.parse(JSON.stringify({ person, contacts, memberships }))
}

const swedenRequests = (personId: string) => sql`
  SELECT jr.id, jr.status, jr.why_join, jr.internal_notes
  FROM join_requests jr JOIN network_groups ng ON ng.id = jr.group_id
  WHERE jr.person_id = ${personId} AND ng.slug = 'roundtable-sweden'
  ORDER BY jr.created_at
`

test.describe.configure({ mode: 'serial' })

test('a real member email changes nothing on the member, the request carries the submission', async () => {
  const member = persona('member')
  const email = await emailOf(member.personId)
  const before = await snapshot(member.personId)
  const requestsBefore = await swedenRequests(member.personId)
  const linkedin = `https://www.linkedin.com/in/e2e-impostor-${stamp}`

  const t0 = Date.now()
  const res = await join({
    name: `E2E Impostor ${stamp}`,
    email: email.toUpperCase(),
    linkedin,
    company: 'Impostor AB',
    why: `e2e sweden-join ${stamp}`,
  })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
  expect(Date.now() - t0).toBeGreaterThanOrEqual(FLOOR_MS)

  expect(await snapshot(member.personId)).toEqual(before)
  const [stray] = await sql`SELECT 1 FROM contact_infos WHERE value = ${linkedin}`
  expect(stray).toBeUndefined()

  const requestsAfter = await swedenRequests(member.personId)
  const created = requestsAfter.filter((r) => !requestsBefore.some((b) => b.id === r.id))
  // An existing pending request would swallow this one; the branch has none for a Norwegian member.
  expect(created).toHaveLength(requestsBefore.some((r) => r.status === 'pending') ? 0 : 1)
  for (const r of created) {
    expect(r.status).toBe('pending')
    expect(r.why_join).toBe(`e2e sweden-join ${stamp}`)
    expect(r.internal_notes).toContain('Not verified')
    expect(r.internal_notes).toContain(linkedin)
    expect(r.internal_notes).toContain(`E2E Impostor ${stamp}`)
    await sql`DELETE FROM join_requests WHERE id = ${r.id}`
  }
})

test('a Sweden member email writes nothing at all', async () => {
  const sweden = persona('sweden')
  const email = await emailOf(sweden.personId)
  const before = await snapshot(sweden.personId)
  const requestsBefore = await swedenRequests(sweden.personId)

  const res = await join({ name: 'E2E Impostor', email, linkedin: `https://linkedin.com/in/e2e-se-${stamp}` })
  expect(res.status).toBe(200)

  expect(await snapshot(sweden.personId)).toEqual(before)
  expect(await swedenRequests(sweden.personId)).toEqual(requestsBefore)
})

test('a new email still creates a prospect with its email, LinkedIn and a pending request', async () => {
  const email = `e2e-sweden-join-${stamp}@example.com`
  const linkedin = `https://www.linkedin.com/in/e2e-new-${stamp}`
  const t0 = Date.now()
  const res = await join({ name: `E2E Newcomer ${stamp}`, email, linkedin, company: 'Newco AB', why: 'hej' })
  expect(res.status).toBe(200)
  expect(Date.now() - t0).toBeGreaterThanOrEqual(FLOOR_MS)

  const [person] = await sql`
    SELECT p.id, p.name, p.status FROM persons p
    JOIN contact_infos ci ON ci.person_id = p.id AND ci.type = 'email' AND ci.value = ${email}
  `
  try {
    expect(person).toMatchObject({ name: `E2E Newcomer ${stamp}`, status: 'prospect' })
    const contacts = await sql`SELECT type, value FROM contact_infos WHERE person_id = ${person!.id} ORDER BY type`
    expect(contacts).toEqual([
      { type: 'email', value: email },
      { type: 'linkedin', value: linkedin },
    ])
    const requests = await swedenRequests(person!.id)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ status: 'pending', why_join: 'hej', internal_notes: 'Company: Newco AB' })
  } finally {
    if (person) await sql`DELETE FROM persons WHERE id = ${person.id}`
  }
})

// Five requests per client address per window, valid or not; the sixth is a 429 and writes nothing.
async function exhaust(ip: string) {
  for (let i = 0; i < 5; i++) expect((await join({}, ip)).status).toBe(400)
}

test('over the per-client limit is a 429 that writes nothing, and a spoofed first hop does not escape it', async () => {
  const ip = fakeIp()
  await exhaust(ip)
  const email = `e2e-sweden-limited-${stamp}@example.com`
  const body = { name: 'E2E Limited', email, linkedin: `https://linkedin.com/in/e2e-limited-${stamp}` }

  const res = await join(body, ip)
  expect(res.status).toBe(429)
  expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
  // The client chooses the first hop; Cloud Run appends the address it saw, which is the one counted.
  expect((await join(body, `${fakeIp()}, ${ip}`)).status).toBe(429)
  const [person] = await sql`SELECT 1 FROM contact_infos WHERE type = 'email' AND value = ${email}`
  expect(person).toBeUndefined()

  // Another address is not affected.
  expect((await join({}, fakeIp())).status).toBe(400)
})

test('the /sweden page says so on a 429', async ({ browser }) => {
  const ip = fakeIp()
  await exhaust(ip)
  const context = await browser.newContext({ baseURL: env.baseUrl, extraHTTPHeaders: { 'x-forwarded-for': ip } })
  const page = await context.newPage()
  await page.goto('/sweden')
  const form = page.locator('form')
  const field = (label: string) => form.locator('label.field', { hasText: label }).locator('input')
  await field('Name').fill('E2E Page')
  await field('Email').fill(`e2e-sweden-page-${stamp}@example.com`)
  await field('LinkedIn').fill('https://linkedin.com/in/e2e-page')
  await form.locator('button[type="submit"]').click()
  await expect(page.locator('.error')).toHaveText(/Too many sign-ups from here/)
  await context.close()
})
