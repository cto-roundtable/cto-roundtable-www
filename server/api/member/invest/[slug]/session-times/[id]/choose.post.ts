// POST /api/member/invest/:slug/session-times/:id/choose
// The committee marks this as THE time ({ chosen: true }, any other chosen one is unmarked)
// or takes the mark off ({ chosen: false }). current-komite only; everyone else the 404.
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const { offering, preview } = await requireSessionTimeManager(personId, getRouterParam(event, 'slug') ?? '')
  const body = (await readBody(event)) as { chosen?: unknown } | null
  if (typeof body?.chosen !== 'boolean')
    throw createError({ statusCode: 400, message: 'invest.sessionTimes.errors.choose' })
  await chooseSessionTime(offering, personId, getRouterParam(event, 'id') ?? '', body.chosen, preview)
  return { ok: true }
})
