// POST /api/member/deals/:slug/questions {body}
// A member asks a question on a case they can see. The deal-qa job answers it
// (or routes it to the deal owner); the member gets a mail when it is answered.
// Who asked is shown to the committee only.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing case' })
  const viewer = await caseViewer(event.context.session.personId)
  const deal = await requireCase(viewer, slug)
  const body = (await readBody(event)) ?? {}
  return askQuestion(viewer.personId, deal.id, body.body)
})
