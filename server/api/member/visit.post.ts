// POST /api/member/visit  { path: '/member/...' }
// One signed-in page view for the visit log (server/utils/portalVisits.ts). Sent by
// app/plugins/portal-visits.client.ts on every route change under /member, so client-side
// navigation counts too. The person is the session's, never the body's; a path that is
// not a portal page is ignored (204 either way, so the client never has anything to
// handle). Every level may call it (portalAccess.ts): a pensjonist's visits count too.
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const body = await readBody<{ path?: unknown }>(event).catch(() => null)
  const path = normalizeVisitPath(body?.path)
  if (path) await recordPortalVisit(personId, path)
  setResponseStatus(event, 204)
  return null
})
