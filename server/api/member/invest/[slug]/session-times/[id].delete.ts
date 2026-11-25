// DELETE /api/member/invest/:slug/session-times/:id
// The committee removes a candidate time; the members' ticks on it go too.
// current-komite only; everyone else the 404.
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const { offering, preview } = await requireSessionTimeManager(personId, getRouterParam(event, 'slug') ?? '')
  await removeSessionTime(offering, personId, getRouterParam(event, 'id') ?? '', preview)
  return { ok: true }
})
