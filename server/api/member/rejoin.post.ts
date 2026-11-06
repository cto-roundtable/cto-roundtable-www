// POST /api/member/rejoin  { why: string }
// A pensjonist applies to become an active member again (server/utils/rejoin.ts): a
// pending join_request to the chapter they were in, and a mail to every active styret
// member. One open application at a time (409 { code: 'pending' }).
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const access = event.context.portalAccess
  if (access.level !== 'retired' && access.level !== 'investor') {
    throw createError({ statusCode: 403, message: 'Only a retired member applies to rejoin' })
  }
  const body = await readBody<{ why?: unknown }>(event)
  const why = typeof body?.why === 'string' ? body.why.trim() : ''
  if (why.length < REJOIN_MIN || why.length > REJOIN_MAX) {
    throw createError({
      statusCode: 400,
      message: `Tell the board why, in ${REJOIN_MIN} to ${REJOIN_MAX} characters`,
      data: { code: 'length' },
    })
  }

  // The chapter they were in (Norway first), Norway when they were only in an SPV.
  const group = CHAPTER_GROUPS[(access.chapters[0] ?? 'no') as keyof typeof CHAPTER_GROUPS]
  const created = await createRejoin(session.personId, group, why)
  if (!created)
    throw createError({ statusCode: 409, message: 'An application is already open', data: { code: 'pending' } })

  const me = await personMailTarget(session.personId)
  const notified = await notifyBoardOfRejoin(
    { id: session.personId, name: me?.name ?? session.name, email: me?.email ?? null },
    why,
  )
  console.log(
    JSON.stringify({ audit: 'rejoin', action: 'applied', personId: session.personId, requestId: created.id, notified }),
  )
  return { pending: created, notified }
})
