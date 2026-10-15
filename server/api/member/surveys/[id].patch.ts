// PATCH /api/member/surveys/:id
// Board only: status (draft/open/closed), closesAt, title, intro, questions.
// Questions can only change while nobody has answered: a stored answer must keep
// matching the question it was given to. The guard is in the UPDATE itself, so a
// first answer arriving at the same moment cannot slip past it.
interface PatchSurveyBody {
  status?: 'draft' | 'open' | 'closed'
  closesAt?: string | null
  title?: string
  intro?: string | null
  questions?: unknown
}

export default defineEventHandler(async (event) => {
  await requireBoard(event)
  const id = surveyIdParam(event)
  const body = (await readBody<PatchSurveyBody>(event)) ?? {}
  const current = await loadSurvey(id)
  if (!current) throw createError({ statusCode: 404, message: 'Survey not found' })

  let status = current.status
  if (body.status !== undefined) {
    if (!['draft', 'open', 'closed'].includes(body.status)) {
      throw createError({ statusCode: 400, message: 'Ugyldig status' })
    }
    status = body.status
  }
  let title = current.title
  if (body.title !== undefined) {
    const t = cleanSurveyText(body.title, 200, 'Tittel')
    if (!t) throw createError({ statusCode: 400, message: 'Tittelen kan ikke være tom' })
    title = t
  }
  const intro = body.intro !== undefined ? cleanSurveyText(body.intro, 2000, 'Ingress') : current.intro
  const closesAt = body.closesAt !== undefined ? cleanSurveyTimestamp(body.closesAt, 'Frist') : current.closesAt
  const questionsChanged = body.questions !== undefined
  const questions = questionsChanged ? validateQuestions(body.questions) : current.questions

  const sql = useDatabase()
  const rows = await sql`
    UPDATE event_surveys
    SET status = ${status}, title = ${title}, intro = ${intro},
        closes_at = ${closesAt}, questions = ${JSON.stringify(questions)}::jsonb
    WHERE id = ${id}
      AND (
        NOT ${questionsChanged}::boolean
        OR NOT EXISTS (SELECT 1 FROM event_survey_responses WHERE survey_id = ${id})
      )
    RETURNING id
  `
  if (rows.length === 0) {
    throw createError({
      statusCode: 409,
      message: 'Noen har allerede svart, så spørsmålene kan ikke endres lenger.',
    })
  }
  return { ok: true }
})
