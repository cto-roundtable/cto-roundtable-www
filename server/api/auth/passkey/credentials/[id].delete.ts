// Delete one of the member's own passkeys. Someone else's id is a 404, the same
// as an id that does not exist. The magic link always remains, so deleting the
// last passkey cannot lock anyone out. Deleting does NOT end sessions already
// issued with it: sessions are stateless (follow-up: "sign out everywhere").
export default defineEventHandler(async (event) => {
  const session = await requirePortalSession(event)
  const id = credentialIdParam(event)
  if (!(await deletePasskey(session.personId, id))) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }
  auditPasskey('deleted', { personId: session.personId, credentialRowId: id })
  return { ok: true }
})
