// POST /api/member/admission/groups {slug, status}: the board opens or closes admission to a group.
export default defineEventHandler(async (event) => {
  const v = await admissionViewer(event)
  const body = (await readBody(event)) ?? {}
  // Opening admission invites applications: an action. Closing it is housekeeping.
  requireAdmissions(v.isBoard, body.status === 'closed' ? 'manage' : 'act')
  return { groups: await setAdmissionStatus(v, body.slug, body.status) }
})
