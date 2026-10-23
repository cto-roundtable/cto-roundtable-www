// POST /api/admin/questions/:id/answers {bodyMd, sources, byKind: 'agent', agentRef}
// The deal-qa agent's answer, from the investor pack, with its sources. 409
// unless the question is claimed (agent_working). Mails the asker. ?dryRun=1
// validates and changes nothing. Contract: memory votes/admin-api.md in ctori-4.
export default defineAdminRoute({
  POST: {
    scope: 'qa:write',
    handler: async (event, _caller, audit) => {
      const id = getRouterParam(event, 'id')
      if (!id) throw createError({ statusCode: 400, message: 'Missing question' })
      audit.targetType = 'deal_question'
      audit.targetId = id
      const dryRun = getQuery(event).dryRun === '1'
      audit.summary.dryRun = dryRun
      const body = (await readBody(event)) ?? {}
      audit.summary.sources = Array.isArray(body.sources) ? body.sources.length : 0
      return adminPostAnswer(id, body, dryRun)
    },
  },
})
