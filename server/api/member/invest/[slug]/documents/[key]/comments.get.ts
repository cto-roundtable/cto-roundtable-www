// GET /api/member/invest/:slug/documents/:key/comments
// The comments and questions on an offering document this viewer may see, on every
// version, plus the current version's outline (the slides a comment can point at).
// The committee gets every thread with names; a member their own, plus replies the
// committee showed to everyone (server/utils/investComments.ts).
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const slug = getRouterParam(event, 'slug') ?? ''
  const key = getRouterParam(event, 'key') ?? ''
  const { offering } = await requireVisibleOffering(personId, slug)
  const isCommittee = await isDocumentCommentReader(personId)
  const { version, outline, threads } = await listDocumentThreads({ personId, isCommittee }, offering.id, key)
  return { canReply: isCommittee, version, outline, threads }
})
