// GET /api/member/surveys
// The caller's surveys: open ones they can answer (they attended the event), and
// ones they have answered (open or closed, so they can get back to the results).
// The board sees every survey, drafts included, with response and attendee
// counts. See server/utils/surveys.ts.
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const isBoard = await isBoardMember(session.personId)

  const surveys = (await listSurveysForPerson(session.personId))
    .filter((s) => isBoard || (s.status !== 'draft' && s.eligible && (s.isOpen || s.answered)))
    .map(({ event: { groupSlug: _g, ...ev }, createdAt: _c, ...s }) => ({
      ...s,
      event: ev,
      responseCount: isBoard ? s.responseCount : null,
      attendeeCount: isBoard ? s.attendeeCount : null,
    }))

  return { isBoard, surveys }
})
