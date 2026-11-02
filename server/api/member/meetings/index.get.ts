// GET /api/member/meetings: the general meetings this viewer may see (server/utils/generalMeetings.ts).
export default defineEventHandler(async (event) => listMeetings(await meetingViewer(event)))
