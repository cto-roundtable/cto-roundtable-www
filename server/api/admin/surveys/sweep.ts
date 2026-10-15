// POST /api/admin/surveys/sweep[?dryRun=1][&windowDays=N]
// Open a survey (default template, created_by NULL = system) for every event in
// the last windowDays (default 14) that has none. Idempotent. This is the tick
// for automatic surveys: a daily box job runs `ctr surveys sweep`, so every
// automatic write is in the audit log under the token that made it.
export default defineAdminRoute({
  POST: {
    scope: 'surveys:write',
    handler: async (event, _caller, audit) => {
      const q = getQuery(event)
      const dryRun = q.dryRun === '1' || q.dryRun === 'true'
      let windowDays: number | undefined
      if (q.windowDays !== undefined) {
        windowDays = Number(q.windowDays)
        if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 60) {
          throw createError({ statusCode: 400, message: 'windowDays must be 1 to 60' })
        }
      }
      audit.summary.dryRun = dryRun
      if (windowDays !== undefined) audit.summary.windowDays = windowDays
      const result = await sweepPastEventSurveys({ dryRun, windowDays })
      audit.summary.created = result.created.length
      audit.summary.existing = result.existing
      audit.summary.skipped = result.skipped.length
      return { dryRun, ...result }
    },
  },
})
