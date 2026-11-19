// POST /api/member/admission/votes/:id/lot {outcome, note}: the board records the lot on a tie (§ 5.5), once.
export default defineEventHandler(async (event) => {
  const v = await admissionViewer(event)
  const body = (await readBody(event)) ?? {}
  return recordAdmissionLot(v, getRouterParam(event, 'id'), body)
})
