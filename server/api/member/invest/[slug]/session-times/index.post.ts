// POST /api/member/invest/:slug/session-times
// The committee adds a candidate time for the online session:
// { start: 'YYYY-MM-DDTHH:mm' (Oslo), durationMinutes?: 15-240 (60), meetingUrl?: https }.
// current-komite only; everyone else the 404 (server/utils/investSessionTimes.ts).
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const { offering, preview } = await requireSessionTimeManager(personId, getRouterParam(event, 'slug') ?? '')
  const id = await addSessionTime(offering, personId, await readBody(event), preview)
  return { ok: true, id }
})
