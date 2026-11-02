// POST /api/member/meetings/:id/items/:itemId/lot {outcome: passed|failed, note}: § 5.5, the chair's lot.
export default defineEventHandler(async (event) =>
  recordLot(
    await meetingViewer(event),
    getRouterParam(event, 'id') ?? '',
    getRouterParam(event, 'itemId'),
    (await readBody(event)) ?? {},
  ),
)
