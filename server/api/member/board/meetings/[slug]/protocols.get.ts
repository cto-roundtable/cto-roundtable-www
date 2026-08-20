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

  return { protocols: await listProtocols(slug) }
})
