// POST /api/member/surveys
// Board only: create the survey for an event. Without `questions` it gets the
// default template, in English for a roundtable-sweden event. `status` is
// 'open' (default, members can answer right away) or 'draft' (board edits first).
interface CreateSurveyBody {
  eventId?: string
  title?: string | null
  intro?: string | null
  questions?: unknown
  closesAt?: string | null
  status?: 'draft' | 'open'
}

export default defineEventHandler(async (event) => {
  const personId = await requireBoard(event)
  const body = (await readBody<CreateSurveyBody>(event)) ?? {}
  const sql = useDatabase()

  if (!isSurveyUuid(body.eventId)) throw createError({ statusCode: 400, message: 'Velg et arrangement' })
  const events = await sql`
    SELECT e.id, e.theme, ng.slug AS group_slug
    FROM events e
    LEFT JOIN network_groups ng ON ng.id = e.group_id
    WHERE e.id = ${body.eventId}
    LIMIT 1
  `
  const ev: any = events[0]
  if (!ev) throw createError({ statusCode: 404, message: 'Fant ikke arrangementet' })

  const lang = surveyLang(ev.group_slug)
  const title = cleanSurveyText(body.title, 200, 'Tittel') ?? defaultTitle(ev.theme, lang)
  const intro = cleanSurveyText(body.intro, 2000, 'Ingress')
  const questions =
    body.questions === undefined || body.questions === null ? defaultQuestions(lang) : validateQuestions(body.questions)
  const closesAt = cleanSurveyTimestamp(body.closesAt, 'Frist')
  const status = body.status === 'draft' ? 'draft' : 'open'

  try {
    const rows = await sql`
      INSERT INTO event_surveys (event_id, title, intro, questions, status, closes_at, created_by)
      VALUES (${ev.id}, ${title}, ${intro}, ${JSON.stringify(questions)}::jsonb, ${status}, ${closesAt}, ${personId})
      RETURNING id
    `
    return { ok: true, id: rows[0]!.id }
  } catch (err: any) {
    // unique (event_id): one survey per event
    if (err?.code === '23505') {
      throw createError({ statusCode: 409, message: 'Dette arrangementet har allerede en undersøkelse.' })
    }
    throw err
  }
})
