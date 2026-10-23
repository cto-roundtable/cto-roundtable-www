// GET /api/admin/pipeline-digests/source?group=invest-3&since=<ISO>
// What the group's members see on the feed, with what happened since `since`:
// stages, dates, event kinds (never the committee's event text), blurbs already
// shared, and SPV summaries. The job's agent drafts the digest from this alone.
export default defineAdminRoute({
  GET: {
    scope: 'deals:read',
    handler: async (event, _caller, audit) => {
      const q = getQuery(event)
      audit.targetType = 'network_group'
      audit.targetId = typeof q.group === 'string' ? q.group : null
      return pipelineSource(q.group, q.since)
    },
  },
})
