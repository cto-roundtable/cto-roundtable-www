// PATCH /api/member/invest/:slug/session-times/:id
// The committee changes a candidate time's link or length: { meetingUrl?, durationMinutes? }.
// current-komite only; everyone else the 404.
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const { offering, preview } = await requireSessionTimeManager(personId, getRouterParam(event, 'slug') ?? '')
  await updateSessionTime(offering, personId, getRouterParam(event, 'id') ?? '', await readBody(event), preview)
  return { ok: true }
})
