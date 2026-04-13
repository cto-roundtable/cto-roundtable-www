function companyOf(row: any): string {
  const current = row.positions?.filter((p: any) => p.type === 'employee' || p.type === 'founder')
  const former = row.positions?.filter((p: any) => p.type === 'former_employee')
  const primary = current?.find((p: any) => p.is_primary)
  const best = primary || current?.[0] || former?.[0]
  return best?.org || row.name || ''
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i]!, arr[j]!] = [arr[j]!, arr[i]!]
  }
  return arr
}

const sortStrategies = [
  { key: 'name', fn: (a: any, b: any) => a.name.localeCompare(b.name) },
  { key: 'company', fn: (a: any, b: any) => companyOf(a).localeCompare(companyOf(b)) },
  { key: 'joined', fn: (a: any, b: any) => (a.created_at instanceof Date ? a.created_at.getTime() : new Date(a.created_at).getTime()) - (b.created_at instanceof Date ? b.created_at.getTime() : new Date(b.created_at).getTime()) },
  { key: 'random', fn: () => 0 },
]

const validSorts = new Set(sortStrategies.map((s) => s.key))

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sql = useDatabase()

  // Fetch per-person-org rows so we can capture role_title per position
  const rows = await sql`
    SELECT
      p.id,
      p.name,
      p.status,
      p.created_at,
      o.name AS org_name,
      o.website AS org_website,
      po.relationship_type,
      po.role_title,
      po.is_primary,
      MAX(ci.value) FILTER (WHERE ci.type = 'linkedin') AS linkedin
    FROM persons p
    INNER JOIN memberships m ON p.id = m.person_id
    INNER JOIN network_groups ng ON m.group_id = ng.id
    LEFT JOIN person_organizations po ON p.id = po.person_id
    LEFT JOIN organizations o ON po.organization_id = o.id
    LEFT JOIN contact_infos ci ON p.id = ci.person_id
    WHERE p.status IN ('active', 'retired')
      AND ng.slug = 'cto-roundtable'
    GROUP BY p.id, p.name, p.status, p.created_at,
             o.name, o.website, po.relationship_type, po.role_title, po.is_primary
    ORDER BY p.name
  `

  // Group rows by person
  const byPerson = new Map<string, { name: string; status: string; created_at: any; linkedin: string; positions: { org: string; url: string; type: string; role_title: string | null; is_primary: boolean }[] }>()
  for (const row of rows) {
    if (!byPerson.has(row.id)) {
      byPerson.set(row.id, { name: row.name, status: row.status, created_at: row.created_at, linkedin: row.linkedin || '', positions: [] })
    }
    if (row.org_name) {
      byPerson.get(row.id)!.positions.push({
        org: row.org_name,
        url: row.org_website || '',
        type: row.relationship_type,
        role_title: row.role_title || null,
        is_primary: row.is_primary,
      })
    }
  }

  const persons = [...byPerson.values()]

  const requested = typeof query.sort === 'string' && validSorts.has(query.sort)
    ? sortStrategies.find((s) => s.key === query.sort)!
    : null
  const strategy = requested || sortStrategies[Math.floor(Math.random() * sortStrategies.length)]!
  const sorted = strategy!.key === 'random' ? shuffle([...persons]) : [...persons].sort(strategy!.fn)

  return {
    sort: strategy.key,
    members: sorted.map((person) => {
      const current = person.positions
        .filter((p) => p.type === 'employee' || p.type === 'founder')
        .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
      const former = person.positions.filter((p) => p.type === 'former_employee')
      const primary = person.positions.find((p) => p.is_primary)

      return {
        name: person.name,
        // Backwards-compatible: company is comma-joined current orgs (empty if none)
        company: current.map((p) => p.org).join(', '),
        formerCompanies: former.map((p) => p.org),
        url: primary?.url || person.linkedin || '',
        // New: detailed positions with role titles (only included when any have role_title)
        positions: [...current, ...former].map((p) => ({
          org: p.org,
          url: p.url,
          roleTitle: p.role_title,
          isCurrent: p.type !== 'former_employee',
        })),
      }
    }),
  }
})
