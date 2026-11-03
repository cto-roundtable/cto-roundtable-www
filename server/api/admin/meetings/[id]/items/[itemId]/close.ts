// POST /api/admin/meetings/:id/items/:itemId/close {}: count, freeze the result with
// its sha256, done. Final. `ctr meetings items close`.
export default defineAdminRoute({
  POST: {
    scope: null,
    handler: async (event, caller, audit) => {
      const { v, id, itemId } = await meetingCall(event, caller, audit, 'item_close', [])
      const out = await closeItem(v, id, itemId)
      audit.summary.result = out.items.find((i) => i.id === itemId)?.result ?? null
      return out
    },
  },
})
