// PATCH /api/member/meetings/:id {title?, heldAt?, place?, countBase?, chair?, secretary?}: board only.
export default defineEventHandler(async (event) =>
  updateMeeting(await meetingViewer(event), getRouterParam(event, 'id') ?? '', (await readBody(event)) ?? {}),
)
