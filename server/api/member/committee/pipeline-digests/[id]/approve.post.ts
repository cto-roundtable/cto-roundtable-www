// POST /api/member/committee/pipeline-digests/:id/approve {bodyMd?}
// A committee member approves a draft digest (optionally edited) so the job sends it.
export default defineEventHandler(async (event) => {
  const viewer = await caseViewer(event.context.session.personId)
  if (!viewer.isCommittee) throw createError({ statusCode: 403, message: 'Committee only' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing digest' })
  return approvePipelineDigest(viewer.personId, id, (await readBody(event)) ?? {})
})
