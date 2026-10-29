export default defineEventHandler(async (event) => {
  const session = verifySession(event)

  // Same gate as every /api/member/ request: a session whose holder is no longer
  // a portal member is reported as signed out.
  const chapters = session ? await getChapters(session.personId) : []
  if (!session || chapters.length === 0) {
    return { authenticated: false }
  }

  const sql = useDatabase()
  const rows = await sql`
    SELECT value
    FROM contact_infos
    WHERE person_id = ${session.personId} AND type = 'email'
    ORDER BY is_primary DESC
    LIMIT 1
  `
  const email = rows[0]?.value ?? null

  return {
    authenticated: true,
    name: session.name,
    personId: session.personId,
    email,
    isBoard: await isBoardMember(session.personId),
    isInvestor: await isInvestorMember(session.personId),
    // Whether any case (/member/caser) is visible to them: an SPV member or the committee.
    canSeeCases: await canSeeCases(session.personId),
    // The committee gets the Komiteen view and the role preview under Caser. The board does not.
    isCommittee: await isCommitteeMember(session.personId),
    // The CTORI offering to point at (/member/invest/<slug>), or null. Any chapter.
    investOffering: await currentInvestOffering(session.personId),
    // Chapters (`no`, `se`) pick the nav and the default language.
    chapters,
  }
})
