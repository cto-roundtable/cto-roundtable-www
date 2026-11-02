// POST /api/member/meetings/:id/announce: the board publishes the saksliste to the members.
export default defineEventHandler(async (event) =>
  announceMeeting(await meetingViewer(event), getRouterParam(event, 'id') ?? ''),
)
