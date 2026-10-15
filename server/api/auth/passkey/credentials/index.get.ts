// The signed-in member's own passkeys, for /member/security.
export default defineEventHandler(async (event) => {
  const session = await requirePortalSession(event)
  return listPasskeys(session.personId)
})
