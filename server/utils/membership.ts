// THE login gate for the member portal: who may hold a session.
//
// The rule is "an active person in a chapter group" (server/utils/chapter.ts:
// cto-roundtable for Norway, roundtable-sweden for the Swedish chapter). It used to be
// copy-pasted into /api/auth/request and the /api/member/ middleware; passkey
// sign-in is a third caller, so it lives here, once. Every way in (magic link,
// passkey, the per-request session re-check) asks these two functions, which
// is what keeps "a session is valid exactly as long as the holder could obtain
// a fresh one" true. Who counts as a chapter is CHAPTER_GROUPS in chapter.ts.
// Swedish members get in once they are `active`; while they are `prospect`
// (all of them, when this was written) nothing changes for anyone.
export const PORTAL_GROUPS = CHAPTER_SLUGS

/** Whether this person may sign in to (and stay signed in to) the portal. */
export async function isPortalMember(personId: string): Promise<boolean> {
  return (await getChapters(personId)).length > 0
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
      AND ng.slug = ANY(${PORTAL_GROUPS})
    LIMIT 1
  `
  const row = rows[0]
  return row ? { id: row.id, name: row.name } : null
}
