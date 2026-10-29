import { neon } from '@neondatabase/serverless'
import { expect, test } from '@playwright/test'
import { e2eEnv } from './support/guard'
import { persona } from './support/run'

// POST /api/sweden/join is public: whoever types an email is not proven to own
// it. Typing a real member's email must not change that member's record (no
// contact_infos, no name, no status, no memberships); what was submitted lands
// on the join_request as unverified notes. A new email still creates a prospect.
// This spec writes to the branch (the guard refuses production) and cleans up.

const env = e2eEnv()
const sql = neon(env.databaseUrl)
const stamp = Date.now()
const join = (body: Record<string, string>) =>
  fetch(`${env.baseUrl}/api/sweden/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

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

  const res = await join({
    name: `E2E Impostor ${stamp}`,
    email: email.toUpperCase(),
    linkedin,
    company: 'Impostor AB',
    why: `e2e sweden-join ${stamp}`,
  })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })

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
  const res = await join({ name: `E2E Newcomer ${stamp}`, email, linkedin, company: 'Newco AB', why: 'hej' })
  expect(res.status).toBe(200)

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
