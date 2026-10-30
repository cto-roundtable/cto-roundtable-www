// GET /api/member/invest/:slug/documents/:key/comments
// The comments and questions on an offering document this viewer may see, on every
// version, plus the current version's outline (the slides a comment can point at).
// The committee gets every thread with names; a member their own, the ones other
// members wrote for "alle", and replies the committee showed to everyone
// (server/utils/investComments.ts). `defaultVisibility` and `publicShowsAuthor` tell
// the form what "alle" means.
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const slug = getRouterParam(event, 'slug') ?? ''
  const key = getRouterParam(event, 'key') ?? ''
  const { offering } = await requireVisibleOffering(personId, slug)
  const isCommittee = await isDocumentCommentReader(personId)
  const { version, outline, threads } = await listDocumentThreads({ personId, isCommittee }, offering.id, key)
  return {
    canReply: isCommittee,
    version,
    outline,
    threads,
    defaultVisibility: DEFAULT_VISIBILITY,
    publicShowsAuthor: PUBLIC_SHOWS_AUTHOR,
  }
})
