// POST /api/admin/meetings/:id/roster {}: "Lås manntallet", the active members of the
// meeting's group, frozen now (again until the session opens). `ctr meetings roster freeze`.
export default defineAdminRoute({
  POST: {
    scope: 'meetings:write',
    handler: async (event, caller, audit) => {
      const { v, id } = await meetingCall(event, caller, audit, 'roster_freeze', [])
      const out = await freezeMeetingRoster(v, id)
      audit.summary.count = out.meeting.rosterCount
      return out
    },
  },
})
