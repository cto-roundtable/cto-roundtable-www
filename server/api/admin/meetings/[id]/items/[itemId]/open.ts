// POST /api/admin/meetings/:id/items/:itemId/open {}: voting on one sak starts
// (one at a time, in session only). `ctr meetings items open`.
export default defineAdminRoute({
  POST: {
    scope: 'meetings:write',
    handler: async (event, caller, audit) => {
      const { v, id, itemId } = await meetingCall(event, caller, audit, 'item_open', [])
      return openItem(v, id, itemId)
    },
  },
})
