// POST /api/admin/meetings/:id/cancel {reason}: before the session opens. `ctr meetings cancel`.
export default defineAdminRoute({
  POST: {
    scope: null,
    handler: async (event, caller, audit) => {
      const { v, id, body } = await meetingCall(event, caller, audit, 'cancel', ['reason'])
      return cancelMeeting(v, id, body.reason)
    },
  },
})
