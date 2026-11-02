// POST /api/member/meetings/:id/roster: the board freezes the roster ("Lås manntallet") now.
export default defineEventHandler(async (event) =>
  freezeMeetingRoster(await meetingViewer(event), getRouterParam(event, 'id') ?? ''),
)
