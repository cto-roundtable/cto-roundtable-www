// POST /api/member/meetings/:id/items {title, body?, preset, ballot?}: the board adds a sak.
export default defineEventHandler(async (event) =>
  addItem(await meetingViewer(event), getRouterParam(event, 'id') ?? '', (await readBody(event)) ?? {}),
)
