// PATCH /api/admin/meetings/:id/items/:itemId {title?, body?, preset?, ballot?}:
// a pending sak, before the session opens. `ctr meetings items edit`.
export default defineAdminRoute({
  PATCH: {
    scope: null,
    handler: async (event, caller, audit) => {
      const { v, id, itemId, body } = await meetingCall(event, caller, audit, 'item_update', [
        'title',
        'body',
        'preset',
        'ballot',
      ])
      audit.summary.fields = Object.keys(body).sort().join(' ')
      return updateItem(v, id, itemId ?? '', body)
    },
  },
})
