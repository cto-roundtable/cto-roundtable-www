// POST /api/member/meetings/:id/items/:itemId/ballot-on-behalf {person, choice, reason}: open ballots only.
export default defineEventHandler(async (event) =>
  registerMeetingBallot(
    await meetingViewer(event),
    getRouterParam(event, 'id') ?? '',
    getRouterParam(event, 'itemId'),
    (await readBody(event)) ?? {},
  ),
)
