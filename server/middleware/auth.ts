export default defineEventHandler((event) => {
  // Only protect /api/auth/session and member-specific API routes
  // The /member page itself handles auth client-side via the session endpoint
  // This middleware adds session data to the event context for server routes
  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/member')) return

  const session = verifySession(event)
  if (!session) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // Attach session to event context for downstream handlers
  event.context.session = session
})
