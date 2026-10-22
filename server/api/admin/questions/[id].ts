// /api/admin/questions/:id
// GET   one question with its current answers. `ctr qa show`.
// PATCH {status: agent_working, agentRef} claims it (409 unless new);
//       {status: routed, note} sends it to the deal owner (mails them);
//       {status: new} releases a claim; {status: closed}.
// Contract: memory votes/admin-api.md in ctori-4.
function idParam(event: Parameters<typeof getRouterParam>[0]): string {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing question' })
  return id
}

export default defineAdminRoute({
  GET: {
    scope: 'qa:read',
    handler: async (event, _caller, audit) => {
      const id = idParam(event)
      audit.targetType = 'deal_question'
      audit.targetId = id
      return { question: await adminGetQuestion(id) }
    },
  },
  PATCH: {
    scope: 'qa:write',
    handler: async (event, _caller, audit) => {
      const id = idParam(event)
      audit.targetType = 'deal_question'
      audit.targetId = id
      const body = (await readBody(event)) ?? {}
      audit.summary.status = typeof body.status === 'string' ? body.status : null
      return { question: await adminPatchQuestion(id, body) }
    },
  },
})
