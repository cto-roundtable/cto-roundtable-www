// GET /api/member/board/meetings/:slug/protocols
// Board-only list of issued protocol versions for one styremøte, newest first.
//
// Object keys are deliberately absent from the response: the PDF is fetched
// through the download endpoint, which re-checks board membership, so no key
// that could be used elsewhere leaves the server.
export default defineEventHandler(async (event) => {
  await requireBoard(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing slug' })

  try {
    return { protocols: await listProtocols(slug), registerReady: true }
  } catch (error) {
    // Deployed ahead of its migration is a legitimate state, not an error worth
    // a 500 and a red box that says nothing. Report it as a fact about the
    // system so the panel can name the missing step.
    if (isMissingRegister(error)) {
      return { protocols: [], registerReady: false, reason: MISSING_REGISTER_MESSAGE }
    }
    throw error
  }
})
