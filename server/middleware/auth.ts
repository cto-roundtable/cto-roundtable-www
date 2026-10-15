export default defineEventHandler(async (event) => {
  // Only protect member-specific API routes. The /member page itself handles
  // auth client-side; this middleware attaches session data for server routes.
  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/member/')) return

  const session = verifySession(event)
  if (!session) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // The session cookie is a stateless 30-day bearer token, so re-validate it
  // against the live database on every request. Without this a member who is
  // deactivated or removed from the network would keep member-portal access
  // until the cookie expires. This is the same gate as every sign-in
  // path (server/utils/membership.ts), so a session is valid exactly
  // as long as the holder could obtain a fresh one.
  // getChapters is the gate itself (isPortalMember = "has a chapter"), read once
  // here so handlers get the member's chapters without asking again.
  const chapters = await getChapters(session.personId)
  if (chapters.length === 0) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // Attach session and chapters to event context for downstream handlers
  event.context.session = session
  event.context.chapters = chapters

  // A few member pages stay Norwegian for now (chapter.ts). Refused, not just
  // hidden from the Swedish nav.
  if (!chapters.includes('no') && isNorwayOnlyApi(url.pathname)) {
    throw createError({ statusCode: 403, message: 'Not available for your chapter' })
  }
})
