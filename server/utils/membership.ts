// THE login gate for the member portal: who may hold a session.
//
// Today the rule is "an active person in group cto-roundtable". It used to be
// copy-pasted into /api/auth/request and the /api/member/ middleware; passkey
// sign-in is a third caller, so it lives here, once. Every way in (magic link,
// passkey, the per-request session re-check) asks these two functions, which
// is what keeps "a session is valid exactly as long as the holder could obtain
// a fresh one" true. Widening who may sign in (e.g. a Swedish chapter) is a
// change to this file and nowhere else.
export const PORTAL_GROUP = 'cto-roundtable'

/** Whether this person may sign in to (and stay signed in to) the portal. */
export async function isPortalMember(personId: string): Promise<boolean> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT 1
    FROM persons p
    JOIN memberships m ON m.person_id = p.id
    JOIN network_groups ng ON ng.id = m.group_id
    WHERE p.id = ${personId}
      AND p.status = 'active'
      AND ng.slug = ${PORTAL_GROUP}
    LIMIT 1
  `
  return rows.length > 0
}

/**
 * The portal member who owns this email address, or null. The caller must not
 * reveal which (see /api/auth/request: same response either way).
 */
export async function findPortalMemberByEmail(email: string): Promise<{ id: string; name: string } | null> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT p.id, p.name
    FROM contact_infos ci
    JOIN persons p ON ci.person_id = p.id
    JOIN memberships m ON p.id = m.person_id
    JOIN network_groups ng ON m.group_id = ng.id
    WHERE ci.type = 'email'
      AND LOWER(ci.value) = ${email.trim().toLowerCase()}
      AND p.status = 'active'
      AND ng.slug = ${PORTAL_GROUP}
    LIMIT 1
  `
  const row = rows[0]
  return row ? { id: row.id, name: row.name } : null
}
