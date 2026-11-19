import type { H3Event } from 'h3'

// POST /api/apply: apply to CTO Roundtable (Norway) from /bli-medlem. Public.
//
// Lands on the list the board already has: a prospect person + contact_infos and a
// pending join_request to the 'cto-roundtable' group, the same shapes the /sweden form
// writes (server/api/sweden/join.post.ts; its comments explain the unverified-email
// rule and the timing floor, both kept here). Admission CLOSED does not refuse the
// application: it is stored the same way and the page says they wait for the next
// opening. The board starts the member vote from the list (/member/opptak, § 4.1).
//
// The rate limit is the /sweden form's, per instance and best effort. Duplicated
// rather than shared for now so the Sweden form is not touched in this change.

const GROUP = 'cto-roundtable'
const WINDOW_MS = 15 * 60 * 1000
const PER_CLIENT = 5
const GLOBAL = 60
const ANSWER_FLOOR_MS = 1000
let globalWindow = { start: 0, count: 0 }
const clients = new Map<string, { start: number; count: number }>()

function clientKey(event: H3Event): string {
  const xff = getRequestHeader(event, 'x-forwarded-for')
  const last = xff?.split(',').pop()?.trim()
  return (last || getRequestIP(event) || 'unknown').slice(0, 64)
}
function overLimit(key: string, now = Date.now()): boolean {
  if (now - globalWindow.start >= WINDOW_MS) globalWindow = { start: now, count: 0 }
  if (clients.size > 5000) clients.clear()
  let w = clients.get(key)
  if (!w || now - w.start >= WINDOW_MS) {
    w = { start: now, count: 0 }
    clients.set(key, w)
  }
  w.count++
  globalWindow.count++
  return w.count > PER_CLIENT || globalWindow.count > GLOBAL
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  if (overLimit(clientKey(event))) {
    setResponseHeader(event, 'Retry-After', Math.ceil(WINDOW_MS / 1000))
    throw createError({ statusCode: 429, message: 'For mange søknader herfra akkurat nå. Prøv igjen senere.' })
  }
  const body = await readBody(event)
  if (clean(body?.website, 200)) return { ok: true }
  const name = clean(body?.name, 200)
  const email = clean(body?.email, 200).toLowerCase()
  const linkedin = clean(body?.linkedin, 500)
  const company = clean(body?.company, 200)
  const why = clean(body?.why, 4000)
  if (!name) throw createError({ statusCode: 400, message: 'Navn mangler' })
  if (!EMAIL_RE.test(email)) throw createError({ statusCode: 400, message: 'Skriv en gyldig e-postadresse' })
  if (!linkedin) throw createError({ statusCode: 400, message: 'LinkedIn-profil mangler' })
  const started = Date.now()
  try {
    await record({ name, email, linkedin, company, why })
    return { ok: true, status: (await admissionStatusOf(GROUP)) ?? 'open' }
  } finally {
    await sleep(ANSWER_FLOOR_MS - (Date.now() - started))
  }
})

async function record({ name, email, linkedin, company, why }: Record<string, string>) {
  const sql = useDatabase()
  const [group] = (await sql`SELECT id FROM network_groups WHERE slug = ${GROUP}`) as any[]
  if (!group) throw createError({ statusCode: 500, message: 'Group not configured' })
  const existing = (await sql`
    SELECT person_id FROM contact_infos WHERE type = 'email' AND LOWER(value) = ${email} LIMIT 1
  `) as any[]
  let personId: string
  let notes: string | null
  if (existing.length) {
    personId = existing[0].person_id
    const member = await sql`SELECT 1 FROM memberships WHERE person_id = ${personId} AND group_id = ${group.id} LIMIT 1`
    if (member.length) return
    notes = [
      'Submitted via /bli-medlem for an email we already had. Not verified: the sender may',
      'not be this person. Nothing was written onto the person record.',
      `Name: ${name}`,
      `LinkedIn: ${linkedin}`,
      ...(company ? [`Company: ${company}`] : []),
    ].join('\n')
  } else {
    const [created] = (await sql`INSERT INTO persons (name, status) VALUES (${name}, 'prospect') RETURNING id`) as any[]
    personId = created.id
    await sql`
      INSERT INTO contact_infos (person_id, type, label, value, is_primary)
      VALUES (${personId}, 'email', 'primary', ${email}, true), (${personId}, 'linkedin', 'primary', ${linkedin}, true)
    `
    notes = company ? `Company: ${company}` : null
  }
  await sql`
    INSERT INTO join_requests (person_id, group_id, why_join, internal_notes, source, status)
    SELECT ${personId}, ${group.id}, ${why || null}, ${notes}, 'form', 'pending'
    WHERE NOT EXISTS (SELECT 1 FROM join_requests WHERE person_id = ${personId} AND status = 'pending')
  `
}
