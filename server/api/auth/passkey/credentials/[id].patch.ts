// Rename one of the member's own passkeys. Someone else's id is a 404, the same
// as an id that does not exist.
export default defineEventHandler(async (event) => {
  const session = await requirePortalSession(event)
  const id = credentialIdParam(event)
  const body = await readBody<{ name?: unknown }>(event)
  if (!(await renamePasskey(session.personId, id, cleanPasskeyName(body?.name)))) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }
  auditPasskey('renamed', { personId: session.personId, credentialRowId: id })
  return { ok: true }
})
