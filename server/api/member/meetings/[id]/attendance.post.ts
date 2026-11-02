// POST /api/member/meetings/:id/attendance {present}: a roster member checks in or out (§ 5.1).
export default defineEventHandler(async (event) =>
  selfAttendance(await meetingViewer(event), getRouterParam(event, 'id') ?? '', (await readBody(event))?.present),
)
