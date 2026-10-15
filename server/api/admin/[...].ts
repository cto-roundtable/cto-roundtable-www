// Anything under /api/admin/ that is not a route: authenticated, logged, 404.
// Without it a probe for a route that does not exist would never reach the
// audit log, which is the one place a misbehaving token shows up.
export default defineAdminRoute({})
