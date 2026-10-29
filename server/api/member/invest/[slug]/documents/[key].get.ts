// GET /api/member/invest/:slug/documents/:key
// The current version of an offering document (the deck), for a member who may see the
// offering. Served inline, but sandboxed: the CSP gives the document an opaque origin
// with no scripts, so an HTML deck cannot read the portal's cookies or call its API,
// and only the portal itself may frame it.
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const slug = getRouterParam(event, 'slug') ?? ''
  const key = getRouterParam(event, 'key') ?? ''
  const { offering } = await requireVisibleOffering(personId, slug)
  const doc = await readOfferingDocument(offering.id, key)

  setResponseHeaders(event, {
    'Content-Type': doc.contentType,
    'Content-Disposition': 'inline',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; " +
      "style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; " +
      "img-src data: https:; frame-ancestors 'self'",
    ETag: `"${doc.sha256}"`,
  })
  return doc.body
})
