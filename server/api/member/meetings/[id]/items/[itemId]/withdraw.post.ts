// POST /api/member/meetings/:id/items/:itemId/withdraw {reason}: a sak not voted on is withdrawn.
export default defineEventHandler(async (event) =>
  withdrawItem(
    await meetingViewer(event),
    getRouterParam(event, 'id') ?? '',
    getRouterParam(event, 'itemId') ?? '',
    (await readBody(event))?.reason,
  ),
)
