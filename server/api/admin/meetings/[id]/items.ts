// POST /api/admin/meetings/:id/items {title, body?, preset, ballot?}: a sak on the
// saksliste, before the session opens. `ctr meetings items add`.
export default defineAdminRoute({
  POST: {
    scope: 'meetings:write',
    handler: async (event, caller, audit) => {
      const { v, id, body } = await meetingCall(event, caller, audit, 'item_add', ['title', 'body', 'preset', 'ballot'])
      audit.summary.preset = typeof body.preset === 'string' ? body.preset : null
      audit.summary.ballot = typeof body.ballot === 'string' ? body.ballot : null
      return addItem(v, id, body)
    },
  },
})
