export default defineEventHandler(async (event) => {
  // Only protect member-specific API routes. The /member page itself handles
  // auth client-side; this middleware attaches session data for server routes.
  // The path as a router could read it: percent-escapes decoded (decodeURI keeps an
  // escaped `/`), any case, repeated slashes as one. A spelling that skipped this check
  // must not reach a member route with no gate in front.
  // A malformed escape is checked as written (this runs for every request, public pages too).
  const raw = getRequestURL(event).pathname
  let decoded = raw
  try {
    decoded = decodeURI(raw)
  } catch {}
  const path = decoded.toLowerCase().replace(/\/{2,}/g, '/')
  if (!path.startsWith('/api/member/')) return

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
  // getPortalAccess is the gate itself (isPortalMember = "has any access"), read once
  // here so handlers get the member's chapters without asking again.
  const access = await getPortalAccess(session.personId)
  if (!access) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // Attach session and chapters to event context for downstream handlers. An
  // investor-only session (a pensjonist in an SPV, portalAccess.ts) is in no chapter here:
  // its chapters pick a language, never a chapter's pages.
  event.context.session = session
  event.context.portalLevel = access.level
  event.context.chapters = access.level === 'member' ? access.chapters : []

  // The investor level gets the invest part of the API and nothing else: deny by default.
  if (access.level === 'investor' && !investorMayCall(path)) {
    throw createError({ statusCode: 403, message: 'Not available for your membership' })
  }

  // A few member pages stay Norwegian for now (chapter.ts). Refused, not just
  // hidden from the Swedish nav.
  if (!event.context.chapters.includes('no') && isNorwayOnlyApi(path)) {
    throw createError({ statusCode: 403, message: 'Not available for your chapter' })
  }
})
