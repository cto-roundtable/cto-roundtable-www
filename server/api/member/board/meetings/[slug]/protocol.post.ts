// POST /api/member/board/meetings/:slug/protocol
// Board-only: issue a protocol for this styremøte from its referat.
//
// Body: { chairPersonId?: string }  — møteleder, defaulting to the caller.
//
// Issuing is idempotent on the referat text: called twice without an edit in
// between it returns the existing version rather than minting a second one.
// After an edit it issues version n+1 and supersedes its predecessor, because a
// signature belongs to the text that was signed.
export default defineEventHandler(async (event) => {
  const personId = await requireBoard(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing slug' })

  const body = await readBody<{ chairPersonId?: string }>(event).catch(() => ({}))
  const chairPersonId = body?.chairPersonId || personId

  const config = useRuntimeConfig()
  const siteUrl = config.siteUrl || getRequestURL(event).origin

  try {
    const { protocol, reused } = await issueProtocol({
      meetingSlug: slug,
      chairPersonId,
      issuedBy: personId,
      siteUrl,
    })
    setResponseStatus(event, reused ? 200 : 201)
    return { protocol, reused }
  } catch (error: any) {
    // The renderer refuses to produce a protocol it cannot represent faithfully,
    // or one missing the sections that make it a protocol. Those are the
    // author's to fix in referat.md, so the reason has to reach them intact
    // rather than becoming a generic 500.
    if (error?.name === 'UnrepresentableCharacterError' || error?.name === 'MissingProtocolSectionError') {
      throw createError({ statusCode: 422, message: error.message })
    }
    throw error
  }
})
