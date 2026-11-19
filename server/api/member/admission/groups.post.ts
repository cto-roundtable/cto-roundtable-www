// POST /api/member/admission/groups {slug, status}: the board opens or closes admission to a group.
export default defineEventHandler(async (event) => {
  const v = await admissionViewer(event)
  const body = (await readBody(event)) ?? {}
  return { groups: await setAdmissionStatus(v, body.slug, body.status) }
})
