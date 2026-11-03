// /api/admin/meetings/:id
// GET   the meeting as the board sees it: saker, roster with who is present, live
//       progress, frozen counts (names only for open ballots). `ctr meetings show`.
// PATCH {title?, heldAt?, place?, countBase?, chair?, secretary?}: setup until the
//       session opens, chair (møteleder) and secretary (referent) until it closes.
//       `ctr meetings edit`, `ctr meetings chair`.
export default defineAdminRoute({
  GET: {
    scope: null,
    handler: async (event, caller, audit) => {
      const { v, id } = await meetingCall(event, caller, audit, 'show')
      return meetingView(v, id)
    },
  },
  PATCH: {
    scope: null,
    handler: async (event, caller, audit) => {
      const { v, id, body } = await meetingCall(event, caller, audit, 'update', [
        'title',
        'heldAt',
        'place',
        'countBase',
        'chair',
        'secretary',
      ])
      audit.summary.fields = Object.keys(body).sort().join(' ')
      return updateMeeting(v, id, body)
    },
  },
})
