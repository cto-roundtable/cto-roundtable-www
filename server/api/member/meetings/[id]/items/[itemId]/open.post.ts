// POST /api/member/meetings/:id/items/:itemId/open: the chair (or the board) opens the sak, live.
export default defineEventHandler(async (event) =>
  openItem(await meetingViewer(event), getRouterParam(event, 'id') ?? '', getRouterParam(event, 'itemId')),
)
