// POST /api/member/meetings/:id/items/:itemId/ballot {choice: yes|no|blank}: a present roster member votes.
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) ?? {}
  return castMeetingBallot(
    await meetingViewer(event),
    getRouterParam(event, 'id') ?? '',
    getRouterParam(event, 'itemId'),
    {
      choice: body.choice,
      ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
      userAgent: getHeader(event, 'user-agent') ?? null,
    },
  )
})
