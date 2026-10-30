// POST /api/member/invest/:slug/comments/:id/reply  { body, public: boolean }
// The committee answers a comment or question. public = true shows the reply, and the
// question it answers (without the asker's name), to every member. Committee only.
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const slug = getRouterParam(event, 'slug') ?? ''
  const id = getRouterParam(event, 'id') ?? ''
  const { offering } = await requireVisibleOffering(personId, slug)
  if (!(await isDocumentCommentReader(personId))) throw createError({ statusCode: 403, message: 'Forbidden' })
  const body = (await readBody(event)) ?? {}
  return await replyToDocumentComment(personId, offering.id, id, body)
})
