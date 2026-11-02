// POST /api/member/meetings/:id/items/:itemId/close: the chair (or the board) closes the sak, live.
export default defineEventHandler(async (event) =>
  closeItem(await meetingViewer(event), getRouterParam(event, 'id') ?? '', getRouterParam(event, 'itemId')),
)
