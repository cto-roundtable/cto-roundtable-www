// GET /api/member/rejoin  { canApply, pending: { id, createdAt } | null }
// Whether this person may apply to become an active member again (a pensjonist:
// portalAccess.ts `retired` or `investor`), and their open application if any.
export default defineEventHandler(async (event) => {
  const level = event.context.portalLevel
  if (level !== 'retired' && level !== 'investor') return { canApply: false, pending: null }
  return { canApply: true, pending: await pendingRejoin(event.context.session.personId) }
})
