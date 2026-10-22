// POST /api/member/deals/:slug/rounds/:id/ballot {choice: yes|no|blank, attested}
// A roster member votes, or changes their vote, until the deadline. `attested`
// is the bundle hash the page showed; every cast is a new row (append-only) and
// the latest one counts. The member gets back the counts, never anyone's name.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const id = getRouterParam(event, 'id')
  if (!slug || !id) throw createError({ statusCode: 400, message: 'Missing round' })
  const viewer = await caseViewer(event.context.session.personId)
  const deal = await requireCase(viewer, slug)
  const round = await requireRoundOfDeal(deal.id, id)
  const body = (await readBody(event)) ?? {}
  await castPortalBallot(viewer.personId, round.id, {
    choice: body.choice,
    attested: body.attested,
    ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
    userAgent: getHeader(event, 'user-agent') ?? null,
  })
  return { ok: true }
})
