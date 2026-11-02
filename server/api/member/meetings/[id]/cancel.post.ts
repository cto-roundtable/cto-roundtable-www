// POST /api/member/meetings/:id/cancel {reason}: the board cancels before the session opens.
export default defineEventHandler(async (event) =>
  cancelMeeting(await meetingViewer(event), getRouterParam(event, 'id') ?? '', (await readBody(event))?.reason),
)
