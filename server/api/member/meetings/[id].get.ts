// GET /api/member/meetings/:id: the meeting, its saker and what this viewer may do.
export default defineEventHandler(async (event) =>
  meetingView(await meetingViewer(event), getRouterParam(event, 'id') ?? ''),
)
