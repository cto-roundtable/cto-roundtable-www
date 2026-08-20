// GET /api/member/board/protocols/:id/verify
// Board-only: re-download the stored objects and confirm they still hash to what
// the register says.
//
// The point of an archive is that it can be checked, not that it exists. This is
// the check.
export default defineEventHandler(async (event) => {
  await requireBoard(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing protocol' })

  return await verifyProtocol(id)
})
