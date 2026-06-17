// Interest signup for the Swedish chapter (/sweden page).
// Creates a prospect person + contact info and a pending join_request tagged
// to the roundtable-sweden group. Public endpoint: validate and rate-guard.

const SWEDEN_GROUP_SLUG = 'roundtable-sweden'

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Honeypot: real users never fill this hidden field.
  if (clean(body?.website, 200)) {
    return { ok: true }
  }

  const name = clean(body?.name, 200)
  const email = clean(body?.email, 200).toLowerCase()
  const linkedin = clean(body?.linkedin, 500)
  const company = clean(body?.company, 200)
  const why = clean(body?.why, 4000)

  if (!name) throw createError({ statusCode: 400, message: 'Name is required' })
  if (!EMAIL_RE.test(email)) throw createError({ statusCode: 400, message: 'A valid email is required' })
  if (!linkedin) throw createError({ statusCode: 400, message: 'LinkedIn profile is required' })

  const sql = useDatabase()

  const groups = await sql`SELECT id FROM network_groups WHERE slug = ${SWEDEN_GROUP_SLUG} LIMIT 1`
  const groupId = groups[0]?.id
  if (!groupId) throw createError({ statusCode: 500, message: 'Sweden group not configured' })

  // Find existing person by email, otherwise create a prospect.
  const existing = await sql`
    SELECT person_id FROM contact_infos
    WHERE type = 'email' AND LOWER(value) = ${email}
    LIMIT 1
  `
  let personId: string
  if (existing.length) {
    personId = existing[0]!.person_id
  } else {
    const created = await sql`
      INSERT INTO persons (name, status) VALUES (${name}, 'prospect') RETURNING id
    `
    personId = created[0]!.id
    await sql`
      INSERT INTO contact_infos (person_id, type, label, value, is_primary)
      VALUES (${personId}, 'email', 'primary', ${email}, true)
    `
  }

  // Add LinkedIn if we don't already have one for this person.
  const hasLinkedin = await sql`
    SELECT 1 FROM contact_infos WHERE person_id = ${personId} AND type = 'linkedin' LIMIT 1
  `
  if (!hasLinkedin.length) {
    await sql`
      INSERT INTO contact_infos (person_id, type, label, value, is_primary)
      VALUES (${personId}, 'linkedin', 'primary', ${linkedin}, true)
    `
  }

  // Don't create duplicate pending requests for the same person + group.
  const pending = await sql`
    SELECT 1 FROM join_requests
    WHERE person_id = ${personId} AND group_id = ${groupId} AND status = 'pending'
    LIMIT 1
  `
  if (pending.length) {
    return { ok: true }
  }

  const internalNotes = company ? `Company: ${company}` : null
  await sql`
    INSERT INTO join_requests (person_id, group_id, why_join, internal_notes, source, status)
    VALUES (${personId}, ${groupId}, ${why || null}, ${internalNotes}, 'form', 'pending')
  `

  return { ok: true }
})
