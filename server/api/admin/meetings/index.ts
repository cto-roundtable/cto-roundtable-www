// /api/admin/meetings
// GET   the general meetings, newest first (at most 50). `ctr meetings ls`.
// POST  {kind, title, heldAt?, place?, countBase?} creates a draft. `ctr meetings create`.
// The board only (token owner in styret, checked on every request). Same functions
// as /api/member/meetings (server/utils/generalMeetings.ts); see meetingsAdmin.ts.
export default defineAdminRoute({
  GET: {
    scope: null,
    handler: async (event, caller, audit) => {
      const { v } = await meetingCall(event, caller, audit, 'list')
      const out = await listMeetings(v)
      audit.summary.count = out.meetings.length
      return { meetings: out.meetings }
    },
  },
  POST: {
    scope: null,
    handler: async (event, caller, audit) => {
      const { v, body } = await meetingCall(event, caller, audit, 'create', [
        'kind',
        'title',
        'heldAt',
        'place',
        'countBase',
      ])
      const out = await createMeeting(v, body)
      audit.targetId = out.meeting.id
      audit.summary.kind = out.meeting.kind
      return out
    },
  },
})
