// POST /api/member/committee/pipeline-digests/:id/reject {reason}
// A committee or board member rejects a draft digest; the job may post a new one for the period.
export default defineEventHandler(async (event) => {
  const viewer = await caseViewer(event.context.session.personId)
  if (!viewer.isStaff) throw createError({ statusCode: 403, message: 'Committee only' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing digest' })
  return rejectPipelineDigest(viewer.personId, id, (await readBody(event)) ?? {})
})
