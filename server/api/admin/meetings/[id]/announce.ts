// POST /api/admin/meetings/:id/announce {}: members see the saksliste. Needs a frozen
// roster and a sak. Sends nothing (the innkalling goes out as today). `ctr meetings announce`.
export default defineAdminRoute({
  POST: {
    scope: 'meetings:write',
    handler: async (event, caller, audit) => {
      const { v, id } = await meetingCall(event, caller, audit, 'announce', [])
      return announceMeeting(v, id)
    },
  },
})
