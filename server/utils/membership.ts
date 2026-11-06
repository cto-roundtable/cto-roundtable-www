// THE login gate for the member portal: who may hold a session, and at which level.
//
// The rule (server/utils/portalAccess.ts, pure): an active person in a chapter group
// (server/utils/chapter.ts: cto-roundtable for Norway, roundtable-sweden for the
// Swedish chapter) is a member; a pensjonist in an SPV is an investor, who gets the
// invest part only. Every way in (magic link, passkey, the per-request session
// re-check in the /api/member/ middleware, /api/auth/session) asks these functions,
// which is what keeps "a session is valid exactly as long as the holder could obtain
// a fresh one" true. Swedish members get in once they are `active`; while they are
// `prospect` nothing changes for anyone.
import { type GroupRef, type PortalAccess, portalAccessOf } from './portalAccess.ts'

const personGroups = (sql: ReturnType<typeof useDatabase>) => sql`
  coalesce(json_agg(json_build_object('slug', ng.slug, 'investPhase', ng.invest_phase))
           FILTER (WHERE ng.id IS NOT NULL), '[]') AS groups`

/** How much of the portal this person gets, or null when they may not sign in. */
export async function getPortalAccess(personId: string): Promise<PortalAccess | null> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT p.status, ${personGroups(sql)}
    FROM persons p
    LEFT JOIN memberships m ON m.person_id = p.id
    LEFT JOIN network_groups ng ON ng.id = m.group_id
    WHERE p.id = ${personId}
    GROUP BY p.id
  `) as { status: string; groups: GroupRef[] }[]
  const r = rows[0]
  return r ? portalAccessOf(r.status, r.groups) : null
}

/** Whether this person may sign in to (and stay signed in to) the portal, at any level. */
export async function isPortalMember(personId: string): Promise<boolean> {
  return (await getPortalAccess(personId)) !== null
}

/**
 * The person who owns this email address, with their portal access (null: may not
 * sign in), or null when nobody has it. One query either way, so the answer takes
 * the same time. The caller must not reveal which (see /api/auth/request: same
 * response either way). When two persons share the address, the one who may sign in wins.
 */
export async function findSignInPerson(
  email: string,
): Promise<{ id: string; name: string; status: string; access: PortalAccess | null } | null> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT p.id, p.name, p.status, ${personGroups(sql)}
    FROM contact_infos ci
    JOIN persons p ON ci.person_id = p.id
    LEFT JOIN memberships m ON m.person_id = p.id
    LEFT JOIN network_groups ng ON ng.id = m.group_id
    WHERE ci.type = 'email'
      AND LOWER(ci.value) = ${email.trim().toLowerCase()}
    GROUP BY p.id
    ORDER BY p.created_at
  `) as { id: string; name: string; status: string; groups: GroupRef[] }[]
  const people = rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    access: portalAccessOf(r.status, r.groups),
  }))
  return people.find((p) => p.access) ?? people[0] ?? null
}
