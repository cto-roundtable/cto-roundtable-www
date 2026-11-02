// POST /api/member/meetings/:id/attendance/:personId {present, reason}: the chair or board, on a member's behalf.
export default defineEventHandler(async (event) =>
  registerAttendance(
    await meetingViewer(event),
    getRouterParam(event, 'id') ?? '',
    getRouterParam(event, 'personId'),
    (await readBody(event)) ?? {},
  ),
)
