// GET /api/member/board/protocols/:id/pdf[?signed=1]
// Board-only download of a protocol PDF, proxied from GCS.
//
// Proxying rather than handing out signed URLs, same as investor-update
// attachments: access is re-checked on every request and no shareable link to
// board papers escapes the styret gate.
export default defineEventHandler(async (event) => {
  await requireBoard(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing protocol' })

  const wantSigned = getQuery(event).signed === '1'
  const keys = await protocolObjectKeys(id)
  if (!keys) throw createError({ statusCode: 404, message: 'Fant ikke protokollen' })

  const objectKey = wantSigned ? keys.signedObjectKey : keys.pdfObjectKey
  if (!objectKey) {
    throw createError({ statusCode: 404, message: 'Signert protokoll er ikke lastet opp ennå' })
  }

  const object = await readBoardProtocolObject(objectKey)

  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', `inline; filename="${objectKey.split('/').pop()}"`)
  setHeader(event, 'Cache-Control', 'private, no-store')
  return object.data
})
