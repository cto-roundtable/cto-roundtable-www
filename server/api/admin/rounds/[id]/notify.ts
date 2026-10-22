// POST /api/admin/rounds/:id/notify {kind: open|reminder|result}   ?dryRun=1
// The portal mails the roster and records each notice (deal_round_notices).
// reminder skips members who voted or have a standing default; result attaches
// the protocol. Idempotent per member and kind. Contract: memory votes/admin-api.md.
export default defineAdminRoute({
  POST: {
    scope: 'rounds:write',
    handler: async (event, _caller, audit) => {
      const id = getRouterParam(event, 'id')
      if (!id) throw createError({ statusCode: 400, message: 'Missing round' })
      audit.targetType = 'deal_round'
      audit.targetId = id
      const body = (await readBody(event)) ?? {}
      const dryRun = getQuery(event).dryRun === '1'
      audit.summary.kind = typeof body.kind === 'string' ? body.kind : null
      audit.summary.dryRun = dryRun
      const config = useRuntimeConfig()
      const out = await notifyRound(id, body.kind, {
        dryRun,
        siteUrl: config.siteUrl || getRequestURL(event).origin,
      })
      audit.summary.sent = out.sent.length
      audit.summary.failed = out.failed.length
      return out
    },
  },
})
