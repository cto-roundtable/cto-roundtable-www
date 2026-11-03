// POST /api/admin/meetings/:id/items/:itemId/lot {outcome: passed|failed, note}:
// § 5.5, what the lot drawn IN the meeting decided for a tied sak. Once. The server
// never draws. `ctr meetings items lot`.
export default defineAdminRoute({
  POST: {
    scope: null,
    handler: async (event, caller, audit) => {
      const { v, id, itemId, body } = await meetingCall(event, caller, audit, 'lot', ['outcome', 'note'])
      audit.summary.outcome = typeof body.outcome === 'string' ? body.outcome : null
      return recordLot(v, id, itemId, body)
    },
  },
})
