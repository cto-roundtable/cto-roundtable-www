// PATCH /api/member/meetings/:id/items/:itemId {title?, body?, preset?, ballot?}: before the session opens.
export default defineEventHandler(async (event) =>
  updateItem(
    await meetingViewer(event),
    getRouterParam(event, 'id') ?? '',
    getRouterParam(event, 'itemId') ?? '',
    (await readBody(event)) ?? {},
  ),
)
