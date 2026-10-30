// POST /api/member/committee/leads/:slug  { action: 'review' | 'waiting' | 'decline', note?: string }
// The committee moves a new lead out of 'incoming': "Start vurdering" (reviewing),
// "Venter på selskapet" (waiting) or "Si nei" (the declined status the overview lists).
// The note (at most 280 characters) goes to last_activity_note, last_activity_at is now,
// and the audit log names the person (moveLead in server/utils/deals.ts). Committee only:
// anyone else gets 403 before the slug is looked at, so a lead cannot be probed here.
// 404 for no such case, 409 when it is no longer incoming.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing case' })
  const viewer = await caseViewer(event.context.session.personId)
  if (!viewer.isCommittee) throw createError({ statusCode: 403, message: 'Committee only' })
  const body = await readBody<{ action?: unknown; note?: unknown }>(event)
  return moveLead(viewer, slug, body?.action, body?.note)
})
