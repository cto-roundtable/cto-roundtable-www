// GET /api/member/surveys
// The caller's surveys: open ones they can answer, and ones they have answered
// (open or closed, so they can get back to the results). The board sees every
// survey, drafts included, with the response count. See server/utils/surveys.ts.
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const sql = useDatabase()
  const isBoard = await isBoardMember(session.personId)

  const rows = await sql`
    SELECT s.id, s.title, s.status, s.closes_at, s.created_at,
           e.id AS event_id, to_char(e.date, 'YYYY-MM-DD') AS event_date, e.theme, e.location,
           ng.slug AS group_slug,
           r.submitted_at, r.updated_at AS answer_updated_at,
           (SELECT COUNT(*)::int FROM event_survey_responses x WHERE x.survey_id = s.id) AS response_count,
           EXISTS (
             SELECT 1 FROM memberships m
             WHERE m.person_id = ${session.personId}
               AND m.group_id = COALESCE(
                 e.group_id,
                 (SELECT id FROM network_groups WHERE slug = ${SURVEY_FALLBACK_GROUP})
               )
           ) AS eligible
    FROM event_surveys s
    JOIN events e ON e.id = s.event_id
    LEFT JOIN network_groups ng ON ng.id = e.group_id
    LEFT JOIN event_survey_responses r ON r.survey_id = s.id AND r.person_id = ${session.personId}
    ORDER BY e.date DESC NULLS LAST, s.created_at DESC
  `

  const surveys = rows
    .map((r: any) => {
      const isOpen = isOpenForAnswers({ status: r.status, closesAt: r.closes_at })
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        isOpen,
        closesAt: r.closes_at,
        lang: surveyLang(r.group_slug),
        event: { id: r.event_id, date: r.event_date, theme: r.theme, location: r.location },
        eligible: r.eligible,
        answered: Boolean(r.submitted_at),
        answeredAt: r.answer_updated_at ?? r.submitted_at ?? null,
        responseCount: isBoard ? r.response_count : null,
      }
    })
    .filter((s) => isBoard || (s.status !== 'draft' && s.eligible && (s.isOpen || s.answered)))

  return { isBoard, surveys }
})
