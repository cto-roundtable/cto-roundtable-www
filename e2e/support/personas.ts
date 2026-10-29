import { neon } from '@neondatabase/serverless'

// Who we look at the portal as. A persona is a SHAPE (a person status and an
// exact set of the groups the code branches on), not a name: at run time it
// resolves to a real person on the branch with exactly that shape, so the run
// shows real data the way that kind of member sees it. A shape nobody has yet
// (a committee member outside the board) is `synthetic`: the harness creates
// the person in the branch, never anywhere else.
//
// The groups that matter are the ones the server checks (server/utils/chapter.ts,
// board.ts, committee.ts, investorUpdates.ts, deals.ts). Any other membership
// (wants-updates, ex-komite, ...) is ignored when matching.
export const ACCESS_GROUPS = ['cto-roundtable', 'roundtable-sweden', 'styret', 'current-komite', 'braintrust']
const isAccessGroup = (slug: string) => ACCESS_GROUPS.includes(slug) || slug.startsWith('invest-')

export interface PersonaSpec {
  key: string
  label: string
  status?: 'active' | 'retired'
  groups: string[]
  synthetic?: boolean
  /** May sign in at all (has a chapter and is active). */
  member: boolean
}

export const PERSONAS: PersonaSpec[] = [
  { key: 'outsider', label: 'Active person, no network group', groups: [], member: false },
  {
    key: 'retired',
    label: 'Retired member (pensjonist)',
    status: 'retired',
    groups: ['cto-roundtable'],
    member: false,
  },
  { key: 'member', label: 'Member, Norway, no SPV', groups: ['cto-roundtable'], member: true },
  { key: 'sweden', label: 'Member, Sweden only', groups: ['roundtable-sweden'], member: true },
  { key: 'invest-1', label: 'CTORI 1 investor (completed SPV)', groups: ['cto-roundtable', 'invest-1'], member: true },
  { key: 'invest-2', label: 'CTORI 2 investor (completed SPV)', groups: ['cto-roundtable', 'invest-2'], member: true },
  { key: 'invest-3', label: 'CTORI 3 investor (deploying SPV)', groups: ['cto-roundtable', 'invest-3'], member: true },
  { key: 'board', label: 'Board, not committee', groups: ['cto-roundtable', 'invest-3', 'styret'], member: true },
  {
    key: 'committee-board',
    label: 'Committee and board',
    groups: ['cto-roundtable', 'current-komite', 'invest-3', 'styret'],
    member: true,
  },
  {
    key: 'committee-only',
    label: 'Committee, not board (synthetic)',
    groups: ['cto-roundtable', 'current-komite'],
    synthetic: true,
    member: true,
  },
]

export interface Persona extends PersonaSpec {
  personId: string
  name: string
}

const SYNTHETIC_PREFIX = 'E2E persona: '

/** Resolve every persona against the branch. `as` adds an ad-hoc persona for one email or person id. */
export async function resolvePersonas(databaseUrl: string, as?: string): Promise<Persona[]> {
  const sql = neon(databaseUrl)
  const rows = (await sql`
    SELECT p.id, p.name, p.status,
           coalesce(array_agg(g.slug ORDER BY g.slug) FILTER (WHERE g.slug IS NOT NULL), '{}') AS slugs
    FROM persons p
    LEFT JOIN memberships m ON m.person_id = p.id
    LEFT JOIN network_groups g ON g.id = m.group_id
    WHERE p.name NOT LIKE ${`${SYNTHETIC_PREFIX}%`}
    GROUP BY p.id, p.name, p.status, p.created_at
    ORDER BY p.created_at, p.id
  `) as { id: string; name: string; status: string; slugs: string[] }[]

  const shape = (slugs: string[]) => slugs.filter(isAccessGroup).sort().join(',')
  const out: Persona[] = []
  for (const spec of PERSONAS) {
    if (spec.synthetic) {
      out.push({ ...spec, ...(await ensureSynthetic(sql, spec)) })
      continue
    }
    const want = [...spec.groups].sort().join(',')
    const status = spec.status ?? 'active'
    const hit = rows.find((r) => r.status === status && shape(r.slugs) === want)
    if (!hit)
      throw new Error(
        `e2e: no person on the branch has the shape of "${spec.key}" (${status}: ${want || 'no groups'}); make it synthetic`,
      )
    out.push({ ...spec, personId: hit.id, name: hit.name })
  }

  if (as) {
    const [hit] = (await sql`
      SELECT p.id, p.name, p.status FROM persons p
      WHERE p.id::text = ${as}
         OR p.id IN (SELECT person_id FROM contact_infos WHERE type = 'email' AND lower(value) = lower(${as}))
      LIMIT 1
    `) as { id: string; name: string; status: string }[]
    if (!hit) throw new Error(`e2e: E2E_AS=${as} matches no person on the branch`)
    out.push({ key: 'as', label: `As ${hit.name}`, groups: [], member: true, personId: hit.id, name: hit.name })
  }
  return out
}

// Create (or reset) a synthetic person with exactly the persona's groups. Runs
// only on the branch: e2eEnv() refused production before we got here.
async function ensureSynthetic(sql: ReturnType<typeof neon>, spec: PersonaSpec) {
  const name = `${SYNTHETIC_PREFIX}${spec.key}`
  let [p] = (await sql`SELECT id FROM persons WHERE name = ${name}`) as { id: string }[]
  if (!p)
    [p] = (await sql`INSERT INTO persons (name, status) VALUES (${name}, ${spec.status ?? 'active'}) RETURNING id`) as {
      id: string
    }[]
  await sql`DELETE FROM memberships WHERE person_id = ${p.id}`
  await sql`
    INSERT INTO memberships (person_id, group_id)
    SELECT ${p.id}, g.id FROM network_groups g WHERE g.slug = ANY(${spec.groups})
  `
  return { personId: p.id, name }
}
