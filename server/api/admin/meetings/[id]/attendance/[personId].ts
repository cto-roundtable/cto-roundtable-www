// POST /api/admin/meetings/:id/attendance/:personId {present, reason}: check a roster
// member in or out on their behalf, in session, with a reason (logged). The chair's
// action in the portal; nobody votes through this. `ctr meetings attend`.
export default defineAdminRoute({
  POST: {
    scope: 'meetings:write',
    handler: async (event, caller, audit) => {
      const { v, id, body } = await meetingCall(event, caller, audit, 'attendance', ['present', 'reason'])
      const personId = getRouterParam(event, 'personId')
      audit.summary.personId = personId ?? null
      audit.summary.present = typeof body.present === 'boolean' ? body.present : null
      return registerAttendance(v, id, personId, body)
    },
  },
})
