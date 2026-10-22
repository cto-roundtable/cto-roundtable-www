// /api/admin/deals/:slug
// GET   the deal, every document version (current marked), its rounds and which
//       SPVs invested. `ctr deals show`.
// PATCH {investorVisible?, investorBlurb?}  what the SPV sees before a round.
//       `ctr deals set`. Writes a deal_events note.
// Contract: memory votes/admin-api.md in the ctori-4 project.
const PATCH_KEYS = ['investorVisible', 'investorBlurb']

function slugParam(event: Parameters<typeof getRouterParam>[0]): string {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing deal' })
  return slug
}

export default defineAdminRoute({
  GET: {
    scope: 'deals:read',
    handler: async (event, _caller, audit) => {
      const slug = slugParam(event)
      audit.targetType = 'deal'
      audit.targetId = slug
      return adminLoadDeal(slug)
    },
  },
  PATCH: {
    scope: 'deals:write',
    handler: async (event, caller, audit) => {
      const slug = slugParam(event)
      audit.targetType = 'deal'
      audit.targetId = slug
      const body = (await readBody(event)) ?? {}
      const keys = Object.keys(body)
      const extra = keys.filter((k) => !PATCH_KEYS.includes(k))
      if (extra.length) {
        throw createError({
          statusCode: 400,
          message: `Only ${PATCH_KEYS.join(' and ')} can change here, not ${extra.join(', ')}`,
        })
      }
      if (keys.length === 0) throw createError({ statusCode: 400, message: 'Nothing to change' })
      if (body.investorVisible !== undefined && typeof body.investorVisible !== 'boolean') {
        throw createError({ statusCode: 400, message: 'investorVisible must be true or false' })
      }
      let blurb: string | null | undefined
      if (body.investorBlurb !== undefined) {
        if (body.investorBlurb !== null && typeof body.investorBlurb !== 'string') {
          throw createError({ statusCode: 400, message: 'investorBlurb must be a string or null' })
        }
        blurb = body.investorBlurb === null ? null : body.investorBlurb.trim() || null
        if (blurb && blurb.length > MAX_BLURB) {
          throw createError({ statusCode: 400, message: `investorBlurb is at most ${MAX_BLURB} characters` })
        }
      }

      const deal = await adminRequireDeal(slug)
      await setDealInvestorFields(
        deal.id,
        { investorVisible: body.investorVisible, investorBlurb: blurb },
        caller.ownerPersonId,
      )
      if (body.investorVisible !== undefined) audit.summary.investorVisible = body.investorVisible
      if (blurb !== undefined) audit.summary.blurbSet = blurb !== null
      const { deal: updated } = await adminLoadDeal(slug)
      return { deal: updated }
    },
  },
})
