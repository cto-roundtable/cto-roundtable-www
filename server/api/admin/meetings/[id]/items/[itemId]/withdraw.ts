// POST /api/admin/meetings/:id/items/:itemId/withdraw {reason}: a sak not yet voted
// on is withdrawn. `ctr meetings items withdraw`.
export default defineAdminRoute({
  POST: {
    scope: 'meetings:write',
    handler: async (event, caller, audit) => {
      const { v, id, itemId, body } = await meetingCall(event, caller, audit, 'item_withdraw', ['reason'])
      return withdrawItem(v, id, itemId ?? '', body.reason)
    },
  },
})
