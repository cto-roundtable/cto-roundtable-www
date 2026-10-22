// POST /api/member/deals/:slug/comments {kind, body}
// Input on a case that does not count as a vote: a comment, an objection, a
// suggestion, a question for the founder, or "I know them". The committee sees
// it with the author's name; other members never see it.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing case' })
  const viewer = await caseViewer(event.context.session.personId)
  const deal = await requireCase(viewer, slug)
  const body = (await readBody(event)) ?? {}
  return addComment(viewer.personId, deal.id, { kind: body.kind, body: body.body })
})
