// DELETE /api/member/invest/:slug/session
// Undo the caller's own sign-up for the online info session (server/utils/investSessions.ts).
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const slug = getRouterParam(event, 'slug') ?? ''
  const { offering, preview } = await requireVisibleOffering(personId, slug)
  await removeSessionSignup(offering, personId, preview)
  return { ok: true, session: null }
})
