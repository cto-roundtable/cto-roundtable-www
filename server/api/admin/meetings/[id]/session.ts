// POST /api/admin/meetings/:id/session {action: open|close}: the board opens the
// session (check-in starts) or closes it once no sak is open or awaiting its lot.
// `ctr meetings session open|close`.
export default defineAdminRoute({
  POST: {
    scope: null,
    handler: async (event, caller, audit) => {
      const { v, id, body } = await meetingCall(event, caller, audit, 'session', ['action'])
      audit.summary.session = typeof body.action === 'string' ? body.action : null
      return setSession(v, id, body.action)
    },
  },
})
