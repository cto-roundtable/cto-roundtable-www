// POST /api/member/invest/:slug/session/times
// The member's ticks on the candidate times for the online session: { timeIds: string[] },
// every time that works. Replaces their ticks. Ticking signs them up for the session if
// they were not (server/utils/investSessionTimes.ts: savePicks). An empty list keeps the
// sign-up with no time ticked. 409 once the committee has chosen a time. Only the caller's own.
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const slug = getRouterParam(event, 'slug') ?? ''
  const { offering, preview } = await requireVisibleOffering(personId, slug)
  await savePicks(offering, personId, await readBody(event), preview)
  const [session, picks] = await Promise.all([
    getMySessionSignup(offering.id, personId),
    getMyPicks(offering.id, personId),
  ])
  return { ok: true, session: session ? { ...session, picks } : null }
})
