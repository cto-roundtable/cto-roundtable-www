// POST /api/member/meetings {kind, title, heldAt?, place?, countBase?}: the board creates a draft.
export default defineEventHandler(async (event) =>
  createMeeting(await meetingViewer(event), (await readBody(event)) ?? {}),
)
