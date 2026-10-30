// POST /api/member/invest/:slug/comments/:id/public  { public: boolean }
// The committee shows one of its replies to every member, or takes it back. Committee only.
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const slug = getRouterParam(event, 'slug') ?? ''
  const id = getRouterParam(event, 'id') ?? ''
  const { offering } = await requireVisibleOffering(personId, slug)
  if (!(await isDocumentCommentReader(personId))) throw createError({ statusCode: 403, message: 'Forbidden' })
  const body = (await readBody(event)) ?? {}
  await setDocumentReplyPublic(offering.id, id, body.public)
  return { ok: true }
})
