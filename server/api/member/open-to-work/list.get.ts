// GET /api/member/open-to-work/list
// Members who are open to new opportunities. Investment cohorts and board only
// (see server/utils/openToWork.ts). Only active cto-roundtable members are
// listed, so someone who leaves the network drops off without anyone closing
// their flag. Most recently updated first, so a stale flag sinks.
export default defineEventHandler(async (event) => {
  await requireOpenToWorkViewer(event)
  const sql = useDatabase()

  const rows = await sql`
    SELECT p.id AS person_id, p.name,
           otw.looking_for, otw.availability, otw.note,
           otw.created_at, otw.updated_at,
           email.value AS email, li.value AS linkedin,
           org.name AS company, org.role_title
    FROM open_to_work otw
    JOIN persons p ON p.id = otw.person_id AND p.status = 'active'
    LEFT JOIN LATERAL (
      SELECT value FROM contact_infos
      WHERE person_id = p.id AND type = 'email'
      ORDER BY is_primary DESC NULLS LAST LIMIT 1
    ) email ON true
    LEFT JOIN LATERAL (
      SELECT value FROM contact_infos
      WHERE person_id = p.id AND type = 'linkedin'
      ORDER BY is_primary DESC NULLS LAST LIMIT 1
    ) li ON true
    LEFT JOIN LATERAL (
      SELECT o.name, po.role_title
      FROM person_organizations po
      JOIN organizations o ON o.id = po.organization_id
      WHERE po.person_id = p.id
        AND po.ended_at IS NULL
        AND po.relationship_type IN ('employee', 'founder')
      ORDER BY po.is_primary DESC NULLS LAST, po.started_at DESC NULLS LAST
      LIMIT 1
    ) org ON true
    WHERE otw.status = 'open'
      AND EXISTS (
        SELECT 1 FROM memberships m
        JOIN network_groups ng ON ng.id = m.group_id
        WHERE m.person_id = p.id AND ng.slug = 'cto-roundtable'
      )
    ORDER BY otw.updated_at DESC
  `

  return {
    members: rows.map((r: any) => ({
      personId: r.person_id,
      name: r.name,
      email: r.email,
      linkedin: r.linkedin,
      company: r.company,
      roleTitle: r.role_title,
      lookingFor: r.looking_for,
      availability: r.availability,
      note: r.note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  }
})
