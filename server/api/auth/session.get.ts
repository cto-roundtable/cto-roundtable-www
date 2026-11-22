export default defineEventHandler(async (event) => {
  const session = verifySession(event)

  // Same gate as every /api/member/ request: a session whose holder is no longer
  // a portal member is reported as signed out.
  const access = session ? await getPortalAccess(session.personId) : null
  if (!session || !access) {
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

  // A retired session (a pensjonist in no SPV) gets nothing of the invest part, whatever
  // is open: the server refuses those routes to them, so the nav must not offer them.
  const invests = access.level !== 'retired'
  return {
    authenticated: true,
    name: session.name,
    personId: session.personId,
    email,
    isBoard: await isBoardMember(session.personId),
    isInvestor: invests && (await isInvestorMember(session.personId)),
    // Whether any case (/member/caser) is visible to them: an SPV member or the committee.
    canSeeCases: invests && (await canSeeCases(session.personId)),
    // The committee gets the Komiteen view and the role preview under Caser. The board does not.
    isCommittee: await isCommitteeMember(session.personId),
    // The CTORI offering to point at (/member/invest/<slug>), or null. Any chapter.
    investOffering: invests ? await currentInvestOffering(session.personId) : null,
    // `member`: the whole portal. `investor`: a pensjonist in an SPV, the invest part only.
    // `retired`: any other pensjonist, their profile and the rejoin application only
    // (server/utils/portalAccess.ts). Picks the nav.
    access: access.level,
    // Chapters (`no`, `se`) pick the nav and the default language.
    chapters: access.chapters,
    // Feature flag: member admission votes (server/utils/admissionsFlag.ts). Off: the
    // nav hides Opptak from members, and styret sees it labelled as not visible yet.
    admissionsEnabled: admissionsEnabled(),
    // Sweden admission votes (server/utils/swedenAdmission.ts), on their own flag. The nav
    // shows them to a Sweden manager (labelled while off) and, once on, to a Sweden voter.
    swedenAdmission: { enabled: swedenAdmissionsEnabled(), ...(await swedenAdmissionSessionRoles(session.personId)) },
  }
})

// The session must never fail on Sweden admission: before hq migration 051 is in a
// database (admission_roles missing), or on any other error here, the member is simply
// no Sweden voter or manager, and sign-in works as before.
async function swedenAdmissionSessionRoles(personId: string) {
  try {
    return await swedenAdmissionRoles(personId)
  } catch (err: any) {
    console.error(JSON.stringify({ warn: 'sweden-admission-roles', code: err?.code ?? null }))
    return { isManager: false, isVoter: false }
  }
}
