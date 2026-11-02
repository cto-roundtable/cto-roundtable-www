// POST /api/member/meetings/:id/session {action: open|close}: the board opens or closes the session.
export default defineEventHandler(async (event) =>
  setSession(await meetingViewer(event), getRouterParam(event, 'id') ?? '', (await readBody(event))?.action),
)
