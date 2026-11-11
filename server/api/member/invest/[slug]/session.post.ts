// POST /api/member/invest/:slug/session
// "Jeg vil være med på et nettmøte": sign up for an online info session, or change the
// note. { note?: string } (at most 280). Independent of the interest answer: anyone who
// sees the offering can sign up (server/utils/investSessions.ts). Only the caller's row.
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const slug = getRouterParam(event, 'slug') ?? ''
  const { offering, preview } = await requireVisibleOffering(personId, slug)
  const parsed = parseSessionNote(await readBody(event))
  if ('error' in parsed) throw createError({ statusCode: 400, message: parsed.error })
  await saveSessionSignup(offering, personId, parsed.note, preview)
  return { ok: true, session: await getMySessionSignup(offering.id, personId) }
})
