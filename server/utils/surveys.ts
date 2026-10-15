import type { H3Event } from 'h3'

/**
 * Event surveys (/member/surveys): a short survey tied to an `events` row,
 * answered in the portal, results for the board. Tables: event_surveys and
 * event_survey_responses (ctoroundtable-hq/infrastructure/db/migrations/023_event_surveys.sql).
 *
 * Rules, all checked per request:
 * - Answer: a member of the event's group (events.group_id). A survey on a
 *   roundtable-sweden event is for Swedish members, a cto-roundtable event for
 *   the Norwegian network. An event with no group counts as cto-roundtable.
 * - Only while status = 'open' and closes_at has not passed. Drafts are board only.
 * - Results: the board sees everything, text answers with names. A respondent
 *   sees aggregates only (no names, no free text), and only after answering.
 * - Answers are validated against the survey's questions on every write, so a
 *   stored answer always matches the schema it was given under. That is also
 *   why questions are frozen once the first answer is in.
 *
 * All survey SQL lives in this file. The member routes (/api/member/surveys) and
 * the agent routes (/api/admin/surveys, admin-cli) both call the helpers below,
 * so the two surfaces cannot drift apart. sweepPastEventSurveys() creates surveys
 * for events that have passed; it never schedules itself, a daily job runs it
 * through the audited admin API (`ctr surveys sweep`).
 */

export type QuestionType = 'rating' | 'text' | 'choice' | 'multi'
export type SurveyLang = 'nb' | 'en'
export type AnswerValue = number | string | string[]
export type SurveyAnswers = Record<string, AnswerValue>

export interface SurveyQuestion {
  id: string
  type: QuestionType
  label: string
  required: boolean
  options?: string[]
  scale?: number
}

export interface SurveyRow {
  id: string
  eventId: string
  title: string
  intro: string | null
  questions: SurveyQuestion[]
  status: 'draft' | 'open' | 'closed'
  closesAt: string | null
  createdAt: string
  updatedAt: string
  eventDate: string | null
  eventTheme: string | null
  eventLocation: string | null
  groupId: string | null
  groupSlug: string | null
  lang: SurveyLang
}

/** The portal's own group; also the eligibility fallback for an event with no group. */
export const SURVEY_FALLBACK_GROUP = 'cto-roundtable'
/** Surveys on this group's events are in English (Swedish members). */
export const SURVEY_ENGLISH_GROUP = 'roundtable-sweden'

const QUESTION_TYPES: QuestionType[] = ['rating', 'text', 'choice', 'multi']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const QID_RE = /^[a-z0-9_-]{1,32}$/i
const MAX_QUESTIONS = 20
const MAX_LABEL = 300
const MAX_OPTION = 100
const MAX_OPTIONS = 12
const MAX_TEXT_ANSWER = 4000

export function surveyLang(groupSlug: string | null | undefined): SurveyLang {
  return groupSlug === SURVEY_ENGLISH_GROUP ? 'en' : 'nb'
}

/** The template the board starts from. Same ids in both languages, so results line up. */
export function defaultQuestions(lang: SurveyLang): SurveyQuestion[] {
  if (lang === 'en') {
    return [
      { id: 'q1', type: 'rating', label: 'How valuable was the event for you overall?', required: true, scale: 5 },
      { id: 'q2', type: 'text', label: 'What was the best part?', required: false },
      { id: 'q3', type: 'text', label: 'What should we change?', required: false },
      { id: 'q4', type: 'text', label: 'Which topics would you like next time?', required: false },
      {
        id: 'q5',
        type: 'choice',
        label: 'Would you consider hosting an event?',
        required: false,
        options: ['Yes', 'Maybe', 'No'],
      },
    ]
  }
  return [
    { id: 'q1', type: 'rating', label: 'Hvor nyttig var arrangementet for deg, alt i alt?', required: true, scale: 5 },
    { id: 'q2', type: 'text', label: 'Hva var det beste?', required: false },
    { id: 'q3', type: 'text', label: 'Hva bør vi gjøre annerledes?', required: false },
    { id: 'q4', type: 'text', label: 'Hvilke temaer vil du ha neste gang?', required: false },
    {
      id: 'q5',
      type: 'choice',
      label: 'Kan du tenke deg å være vert?',
      required: false,
      options: ['Ja', 'Kanskje', 'Nei'],
    },
  ]
}

export function defaultTitle(theme: string | null, lang: SurveyLang): string {
  if (lang === 'en') return theme ? `Feedback: ${theme}` : 'Feedback on the event'
  return theme ? `Tilbakemelding: ${theme}` : 'Tilbakemelding på arrangementet'
}

function badRequest(message: string, errors?: Record<string, string>): never {
  throw createError({ statusCode: 400, message, data: errors ? { errors } : undefined })
}

/** Route param :id as a survey uuid; anything else is a 404 rather than a database error. */
export function surveyIdParam(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!id || !UUID_RE.test(id)) throw createError({ statusCode: 404, message: 'Survey not found' })
  return id
}

export function isSurveyUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s)
}

/** Trimmed text or null; a string over `max` is a 400, not silently cut. */
export function cleanSurveyText(input: unknown, max: number, field: string): string | null {
  if (input === null || input === undefined) return null
  if (typeof input !== 'string') badRequest(`${field} må være tekst`)
  const s = input.trim()
  if (s.length > max) badRequest(`${field} er lengre enn ${max} tegn`)
  return s.length ? s : null
}

/** ISO timestamp or null. */
export function cleanSurveyTimestamp(input: unknown, field: string): string | null {
  if (input === null || input === undefined || input === '') return null
  if (typeof input !== 'string' || Number.isNaN(Date.parse(input))) badRequest(`${field} er ikke et gyldig tidspunkt`)
  return new Date(input).toISOString()
}

/**
 * Validate a board-written question list. Returns a normalised copy (trimmed,
 * defaults filled, unknown keys dropped). A question without an id gets the next
 * free `qN`.
 */
export function validateQuestions(input: unknown): SurveyQuestion[] {
  if (!Array.isArray(input) || input.length === 0) badRequest('En undersøkelse trenger minst ett spørsmål')
  if (input.length > MAX_QUESTIONS) badRequest(`Maks ${MAX_QUESTIONS} spørsmål`)

  const seen = new Set<string>()
  for (const raw of input) {
    if (raw && typeof raw === 'object' && typeof raw.id === 'string') seen.add(raw.id.trim())
  }
  let next = 1
  const freshId = () => {
    while (seen.has(`q${next}`)) next++
    seen.add(`q${next}`)
    return `q${next}`
  }

  const ids = new Set<string>()
  return input.map((raw: any, i: number): SurveyQuestion => {
    const n = i + 1
    if (!raw || typeof raw !== 'object') badRequest(`Spørsmål ${n} er ugyldig`)
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : freshId()
    if (!QID_RE.test(id)) badRequest(`Spørsmål ${n}: id kan bare ha bokstaver, tall, - og _`)
    if (ids.has(id)) badRequest(`Spørsmål ${n}: id "${id}" er brukt to ganger`)
    ids.add(id)

    if (!QUESTION_TYPES.includes(raw.type)) badRequest(`Spørsmål ${n}: ukjent type`)
    const type = raw.type as QuestionType
    const label = typeof raw.label === 'string' ? raw.label.trim() : ''
    if (!label) badRequest(`Spørsmål ${n}: spørsmålsteksten er tom`)
    if (label.length > MAX_LABEL) badRequest(`Spørsmål ${n}: spørsmålsteksten er over ${MAX_LABEL} tegn`)
    const q: SurveyQuestion = { id, type, label, required: raw.required === true }

    if (type === 'rating') {
      const scale = raw.scale === undefined || raw.scale === null ? 5 : raw.scale
      if (!Number.isInteger(scale) || scale < 2 || scale > 10) badRequest(`Spørsmål ${n}: skalaen må være fra 2 til 10`)
      q.scale = scale
    }
    if (type === 'choice' || type === 'multi') {
      if (!Array.isArray(raw.options)) badRequest(`Spørsmål ${n}: trenger svaralternativer`)
      const options = raw.options
        .map((o: unknown) => (typeof o === 'string' ? o.trim() : ''))
        .filter((o: string) => o.length > 0)
      if (options.length < 2) badRequest(`Spørsmål ${n}: trenger minst to svaralternativer`)
      if (options.length > MAX_OPTIONS) badRequest(`Spørsmål ${n}: maks ${MAX_OPTIONS} svaralternativer`)
      if (new Set(options).size !== options.length) badRequest(`Spørsmål ${n}: et svaralternativ står to ganger`)
      if (options.some((o: string) => o.length > MAX_OPTION)) {
        badRequest(`Spørsmål ${n}: et svaralternativ er over ${MAX_OPTION} tegn`)
      }
      q.options = options
    }
    return q
  })
}

const ANSWER_ERRORS = {
  nb: {
    required: 'Dette spørsmålet må besvares.',
    rating: 'Velg en verdi på skalaen.',
    text: 'Svaret må være tekst.',
    tooLong: `Svaret er lengre enn ${MAX_TEXT_ANSWER} tegn.`,
    choice: 'Velg et av alternativene.',
    summary: 'Noen svar mangler eller er ugyldige.',
  },
  en: {
    required: 'This question needs an answer.',
    rating: 'Pick a value on the scale.',
    text: 'The answer must be text.',
    tooLong: `The answer is longer than ${MAX_TEXT_ANSWER} characters.`,
    choice: 'Pick one of the options.',
    summary: 'Some answers are missing or invalid.',
  },
} as const

/**
 * Validate a member's answers against the survey's questions. Returns the
 * normalised answers: only known question ids, text trimmed, empty answers
 * dropped. Throws 400 with `data.errors = { <qid>: message }` in the survey's
 * language, so the form can mark each field.
 */
export function validateAnswers(questions: SurveyQuestion[], input: unknown, lang: SurveyLang): SurveyAnswers {
  const msg = ANSWER_ERRORS[lang]
  const given: Record<string, unknown> =
    input && typeof input === 'object' && !Array.isArray(input) ? (input as any) : {}
  const out: SurveyAnswers = {}
  const errors: Record<string, string> = {}

  for (const q of questions) {
    const raw = given[q.id]
    const empty =
      raw === undefined ||
      raw === null ||
      (typeof raw === 'string' && raw.trim() === '') ||
      (Array.isArray(raw) && raw.length === 0)
    if (empty) {
      if (q.required) errors[q.id] = msg.required
      continue
    }

    switch (q.type) {
      case 'rating': {
        const scale = q.scale ?? 5
        if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > scale) errors[q.id] = msg.rating
        else out[q.id] = raw
        break
      }
      case 'text': {
        if (typeof raw !== 'string') errors[q.id] = msg.text
        else if (raw.trim().length > MAX_TEXT_ANSWER) errors[q.id] = msg.tooLong
        else out[q.id] = raw.trim()
        break
      }
      case 'choice': {
        if (typeof raw !== 'string' || !q.options?.includes(raw)) errors[q.id] = msg.choice
        else out[q.id] = raw
        break
      }
      case 'multi': {
        const picked = Array.isArray(raw) ? raw : null
        if (!picked || picked.some((v) => typeof v !== 'string' || !q.options?.includes(v))) {
          errors[q.id] = msg.choice
        } else {
          // Keep the board's option order and drop duplicates.
          out[q.id] = q.options!.filter((o) => picked.includes(o))
        }
        break
      }
    }
  }

  if (Object.keys(errors).length) badRequest(msg.summary, errors)
  return out
}

/** Open for answers right now: status open and closes_at (if any) still ahead. */
export function isOpenForAnswers(s: Pick<SurveyRow, 'status' | 'closesAt'>): boolean {
  if (s.status !== 'open') return false
  return !s.closesAt || new Date(s.closesAt).getTime() > Date.now()
}

/** Load one survey with its event and the event's group. Null when it does not exist. */
export async function loadSurvey(id: string): Promise<SurveyRow | null> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT s.id, s.event_id, s.title, s.intro, s.questions, s.status, s.closes_at,
           s.created_at, s.updated_at,
           to_char(e.date, 'YYYY-MM-DD') AS event_date, e.theme, e.location,
           e.group_id, ng.slug AS group_slug
    FROM event_surveys s
    JOIN events e ON e.id = s.event_id
    LEFT JOIN network_groups ng ON ng.id = e.group_id
    WHERE s.id = ${id}
    LIMIT 1
  `
  const r: any = rows[0]
  if (!r) return null
  return {
    id: r.id,
    eventId: r.event_id,
    title: r.title,
    intro: r.intro,
    questions: r.questions,
    status: r.status,
    closesAt: r.closes_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    eventDate: r.event_date,
    eventTheme: r.theme,
    eventLocation: r.location,
    groupId: r.group_id,
    groupSlug: r.group_slug,
    lang: surveyLang(r.group_slug),
  }
}

/** Member of the survey's event group (or of cto-roundtable when the event has none). */
export async function isEligibleForSurvey(personId: string, survey: Pick<SurveyRow, 'groupId'>): Promise<boolean> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT 1
    FROM memberships m
    WHERE m.person_id = ${personId}
      AND m.group_id = COALESCE(
        ${survey.groupId}::uuid,
        (SELECT id FROM network_groups WHERE slug = ${SURVEY_FALLBACK_GROUP})
      )
    LIMIT 1
  `
  return rows.length > 0
}

export interface QuestionResult {
  id: string
  type: QuestionType
  label: string
  answered: number
  /** rating: average and count per score (index 0 = score 1). */
  average?: number | null
  distribution?: number[]
  scale?: number
  /** choice/multi: count per option, in the board's order. */
  options?: { option: string; count: number }[]
  /** text: board only, with names. */
  texts?: { name: string; text: string }[]
}

/**
 * Aggregate responses per question. `withTexts` (board only) adds every text
 * answer with the respondent's name; without it text questions report only how
 * many answered.
 */
export function aggregateResponses(
  questions: SurveyQuestion[],
  responses: { name: string; answers: SurveyAnswers }[],
  withTexts: boolean,
): QuestionResult[] {
  return questions.map((q) => {
    const values = responses
      .map((r) => ({ name: r.name, value: r.answers?.[q.id] }))
      .filter((v) => v.value !== undefined && v.value !== null && v.value !== '')
    const result: QuestionResult = { id: q.id, type: q.type, label: q.label, answered: values.length }

    if (q.type === 'rating') {
      const scale = q.scale ?? 5
      const distribution = Array.from({ length: scale }, () => 0)
      let sum = 0
      let n = 0
      for (const { value } of values) {
        if (typeof value === 'number' && value >= 1 && value <= scale) {
          distribution[value - 1]!++
          sum += value
          n++
        }
      }
      result.scale = scale
      result.distribution = distribution
      result.average = n ? Math.round((sum / n) * 100) / 100 : null
      result.answered = n
    } else if (q.type === 'choice' || q.type === 'multi') {
      const counts = new Map((q.options ?? []).map((o) => [o, 0]))
      for (const { value } of values) {
        for (const v of Array.isArray(value) ? value : [value]) {
          if (typeof v === 'string' && counts.has(v)) counts.set(v, counts.get(v)! + 1)
        }
      }
      result.options = [...counts].map(([option, count]) => ({ option, count }))
    } else if (withTexts) {
      result.texts = values
        .filter((v) => typeof v.value === 'string')
        .map((v) => ({ name: v.name, text: v.value as string }))
    }
    return result
  })
}

// ---------------------------------------------------------------------------
// Writes and reads shared by /api/member/surveys and /api/admin/surveys
// ---------------------------------------------------------------------------

export interface SurveySummary {
  id: string
  title: string
  status: 'draft' | 'open' | 'closed'
  isOpen: boolean
  closesAt: string | null
  createdAt: string
  lang: SurveyLang
  event: { id: string; date: string | null; theme: string | null; location: string | null; groupSlug: string | null }
  responseCount: number
}

/** A survey as one member sees it in the list. */
export interface MemberSurveySummary extends SurveySummary {
  eligible: boolean
  answered: boolean
  answeredAt: string | null
}

export interface SurveyEventOption {
  id: string
  date: string
  theme: string | null
  location: string | null
  group: string | null
  groupSlug: string | null
  lang: SurveyLang
  defaultTitle: string
  surveyId: string | null
}

export interface CreateSurveyInput {
  eventId: string
  title?: string | null
  intro?: string | null
  questions?: unknown
  closesAt?: string | null
  status?: 'draft' | 'open'
}

export interface SurveyPatch {
  status?: 'draft' | 'open' | 'closed'
  closesAt?: string | null
  title?: string
  intro?: string | null
  questions?: unknown
}

/**
 * Every survey with its event, newest event first. With a personId the rows also
 * say whether that person may answer and has answered; without one (board,
 * agents) those columns are simply false.
 */
async function querySurveys(personId: string | null): Promise<MemberSurveySummary[]> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT s.id, s.title, s.status, s.closes_at, s.created_at,
           e.id AS event_id, to_char(e.date, 'YYYY-MM-DD') AS event_date, e.theme, e.location,
           ng.slug AS group_slug,
           r.submitted_at, r.updated_at AS answer_updated_at,
           (SELECT COUNT(*)::int FROM event_survey_responses x WHERE x.survey_id = s.id) AS response_count,
           EXISTS (
             SELECT 1 FROM memberships m
             WHERE m.person_id = ${personId}::uuid
               AND m.group_id = COALESCE(
                 e.group_id,
                 (SELECT id FROM network_groups WHERE slug = ${SURVEY_FALLBACK_GROUP})
               )
           ) AS eligible
    FROM event_surveys s
    JOIN events e ON e.id = s.event_id
    LEFT JOIN network_groups ng ON ng.id = e.group_id
    LEFT JOIN event_survey_responses r ON r.survey_id = s.id AND r.person_id = ${personId}::uuid
    ORDER BY e.date DESC NULLS LAST, s.created_at DESC
  `
  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    isOpen: isOpenForAnswers({ status: r.status, closesAt: r.closes_at }),
    closesAt: r.closes_at,
    createdAt: r.created_at,
    lang: surveyLang(r.group_slug),
    event: { id: r.event_id, date: r.event_date, theme: r.theme, location: r.location, groupSlug: r.group_slug },
    responseCount: r.response_count,
    eligible: r.eligible,
    answered: Boolean(r.submitted_at),
    answeredAt: r.answer_updated_at ?? r.submitted_at ?? null,
  }))
}

/** Every survey, drafts included, with response counts. For the board and for agents. */
export async function listSurveysForBoard(): Promise<SurveySummary[]> {
  return (await querySurveys(null)).map(({ eligible: _e, answered: _a, answeredAt: _at, ...s }) => s)
}

/** Every survey with the person's eligibility and own answer state. Callers filter by role. */
export async function listSurveysForPerson(personId: string): Promise<MemberSurveySummary[]> {
  return querySurveys(personId)
}

/**
 * The board's event picker: the most recent events up to today (a survey is
 * about an event that happened), with the title and language a survey would
 * get and the survey the event already has, if any.
 */
export async function listSurveyEvents(limit = 15): Promise<SurveyEventOption[]> {
  const n = Number.isInteger(limit) && limit > 0 && limit <= 200 ? limit : 15
  const sql = useDatabase()
  const rows = await sql`
    SELECT e.id, to_char(e.date, 'YYYY-MM-DD') AS date, e.theme, e.location,
           ng.slug AS group_slug, ng.name AS group_name, s.id AS survey_id
    FROM events e
    LEFT JOIN network_groups ng ON ng.id = e.group_id
    LEFT JOIN event_surveys s ON s.event_id = e.id
    WHERE e.date IS NOT NULL AND e.date <= CURRENT_DATE
    ORDER BY e.date DESC
    LIMIT ${n}
  `
  return rows.map((r: any) => {
    const lang = surveyLang(r.group_slug)
    return {
      id: r.id,
      date: r.date,
      theme: r.theme,
      location: r.location,
      group: r.group_name,
      groupSlug: r.group_slug,
      lang,
      defaultTitle: defaultTitle(r.theme, lang),
      surveyId: r.survey_id,
    }
  })
}

/** The one INSERT into event_surveys. Null when the event already has a survey. */
async function insertSurvey(row: {
  eventId: string
  title: string
  intro: string | null
  questions: SurveyQuestion[]
  status: 'draft' | 'open'
  closesAt: string | null
  createdBy: string | null
}): Promise<string | null> {
  const sql = useDatabase()
  const rows = await sql`
    INSERT INTO event_surveys (event_id, title, intro, questions, status, closes_at, created_by)
    VALUES (${row.eventId}, ${row.title}, ${row.intro}, ${JSON.stringify(row.questions)}::jsonb,
            ${row.status}, ${row.closesAt}, ${row.createdBy})
    ON CONFLICT (event_id) DO NOTHING
    RETURNING id
  `
  return (rows[0] as any)?.id ?? null
}

/**
 * Create the survey for an event. Without `questions` it gets the default
 * template, in English for a roundtable-sweden event. `status` is 'open'
 * (default) or 'draft'. `createdBy` is the person who answers for it; null means
 * the system. Throws 400 (bad input), 404 (no such event), 409 (already has one).
 */
export async function createSurvey(input: CreateSurveyInput, createdBy: string | null): Promise<{ id: string }> {
  if (!isSurveyUuid(input?.eventId)) badRequest('Velg et arrangement')
  const sql = useDatabase()
  const events = await sql`
    SELECT e.id, e.theme, ng.slug AS group_slug
    FROM events e
    LEFT JOIN network_groups ng ON ng.id = e.group_id
    WHERE e.id = ${input.eventId}
    LIMIT 1
  `
  const ev: any = events[0]
  if (!ev) throw createError({ statusCode: 404, message: 'Fant ikke arrangementet' })

  const lang = surveyLang(ev.group_slug)
  const id = await insertSurvey({
    eventId: ev.id,
    title: cleanSurveyText(input.title, 200, 'Tittel') ?? defaultTitle(ev.theme, lang),
    intro: cleanSurveyText(input.intro, 2000, 'Ingress'),
    questions:
      input.questions === undefined || input.questions === null
        ? defaultQuestions(lang)
        : validateQuestions(input.questions),
    status: input.status === 'draft' ? 'draft' : 'open',
    closesAt: cleanSurveyTimestamp(input.closesAt, 'Frist'),
    createdBy,
  })
  if (!id) throw createError({ statusCode: 409, message: 'Dette arrangementet har allerede en undersøkelse.' })
  return { id }
}

/**
 * Change status, deadline, title, intro or questions. Questions can only change
 * while nobody has answered; the guard is in the UPDATE itself, so a first
 * answer arriving at the same moment cannot slip past it. Throws 404, 400, 409.
 */
export async function updateSurvey(id: string, patch: SurveyPatch): Promise<void> {
  const current = isSurveyUuid(id) ? await loadSurvey(id) : null
  if (!current) throw createError({ statusCode: 404, message: 'Survey not found' })
  const p = patch ?? {}

  let status = current.status
  if (p.status !== undefined) {
    if (!['draft', 'open', 'closed'].includes(p.status)) badRequest('Ugyldig status')
    status = p.status
  }
  let title = current.title
  if (p.title !== undefined) {
    const t = cleanSurveyText(p.title, 200, 'Tittel')
    if (!t) badRequest('Tittelen kan ikke være tom')
    title = t
  }
  const intro = p.intro !== undefined ? cleanSurveyText(p.intro, 2000, 'Ingress') : current.intro
  const closesAt = p.closesAt !== undefined ? cleanSurveyTimestamp(p.closesAt, 'Frist') : current.closesAt
  const questionsChanged = p.questions !== undefined
  const questions = questionsChanged ? validateQuestions(p.questions) : current.questions

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
}

export async function countSurveyResponses(surveyId: string): Promise<number> {
  const sql = useDatabase()
  const rows = await sql`SELECT COUNT(*)::int AS n FROM event_survey_responses WHERE survey_id = ${surveyId}`
  return (rows[0] as any)?.n ?? 0
}

/** The person's own answer to a survey, or null. */
export async function loadOwnResponse(
  surveyId: string,
  personId: string,
): Promise<{ answers: SurveyAnswers; submittedAt: string; updatedAt: string } | null> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT answers, submitted_at, updated_at
    FROM event_survey_responses
    WHERE survey_id = ${surveyId} AND person_id = ${personId}
    LIMIT 1
  `
  const r: any = rows[0]
  return r ? { answers: r.answers, submittedAt: r.submitted_at, updatedAt: r.updated_at } : null
}

/**
 * Validate and store a person's answer, replacing an earlier one. The caller
 * checks eligibility and that the survey is open; this only writes.
 */
export async function saveSurveyResponse(
  survey: Pick<SurveyRow, 'id' | 'questions' | 'lang'>,
  personId: string,
  answersInput: unknown,
): Promise<{ submittedAt: string; updatedAt: string }> {
  const answers = validateAnswers(survey.questions, answersInput, survey.lang)
  const sql = useDatabase()
  const rows = await sql`
    INSERT INTO event_survey_responses (survey_id, person_id, answers)
    VALUES (${survey.id}, ${personId}, ${JSON.stringify(answers)}::jsonb)
    ON CONFLICT (survey_id, person_id)
    DO UPDATE SET answers = EXCLUDED.answers, updated_at = NOW()
    RETURNING submitted_at, updated_at
  `
  const r: any = rows[0]
  return { submittedAt: r.submitted_at, updatedAt: r.updated_at }
}

/**
 * Results per question. `withTexts` (board only) adds every text answer with the
 * respondent's name; without it text questions report only how many answered.
 */
export async function loadSurveyResults(
  survey: Pick<SurveyRow, 'id' | 'questions'>,
  withTexts: boolean,
): Promise<{ responseCount: number; questions: QuestionResult[] }> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT p.name, r.answers
    FROM event_survey_responses r
    JOIN persons p ON p.id = r.person_id
    WHERE r.survey_id = ${survey.id}
    ORDER BY r.submitted_at
  `
  const responses = rows.map((r: any) => ({ name: r.name, answers: r.answers }))
  return { responseCount: responses.length, questions: aggregateResponses(survey.questions, responses, withTexts) }
}

// ---------------------------------------------------------------------------
// Automatic creation (decisions/survey-phase2.md)
// ---------------------------------------------------------------------------

export interface SweepResult {
  /** Surveys created (or, with dryRun, that would be; surveyId is then ''). */
  created: { surveyId: string; eventId: string; date: string; group: string }[]
  /** Events in the window that already had a survey. */
  existing: number
  /** Events the sweep could not create a survey for, with why. */
  skipped: { eventId: string; reason: string }[]
}

/** Days after the event a swept survey stays open. */
export const SWEEP_OPEN_DAYS = 14

/**
 * Give every event that has passed a survey. Window: events dated from
 * today - windowDays through yesterday, Oslo time. Each one without a survey gets
 * the default template in its group's language, status 'open', closing at the end
 * of event date + 14 days (Oslo), created_by NULL (= the system).
 *
 * Idempotent: the insert is ON CONFLICT (event_id) DO NOTHING, so running it
 * twice, or at the same time as the board creating one by hand, never makes a
 * second survey. One failing event does not stop the rest; it lands in
 * `skipped` with the error, so the caller can audit it.
 *
 * It does not schedule itself. The daily tick is `ctr surveys sweep` through
 * /api/admin/surveys/sweep, so every automatic write is attributable.
 */
export async function sweepPastEventSurveys(opts?: { dryRun?: boolean; windowDays?: number }): Promise<SweepResult> {
  const windowDays = opts?.windowDays ?? 14
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) {
    badRequest('windowDays må være et heltall fra 1 til 365')
  }
  const dryRun = opts?.dryRun === true

  const sql = useDatabase()
  const rows = await sql`
    WITH today AS (SELECT (NOW() AT TIME ZONE 'Europe/Oslo')::date AS d)
    SELECT e.id, to_char(e.date, 'YYYY-MM-DD') AS date, e.theme, ng.slug AS group_slug,
           s.id AS survey_id,
           (((e.date + ${SWEEP_OPEN_DAYS}::int) + TIME '23:59:59') AT TIME ZONE 'Europe/Oslo') AS closes_at
    FROM events e
    CROSS JOIN today
    LEFT JOIN network_groups ng ON ng.id = e.group_id
    LEFT JOIN event_surveys s ON s.event_id = e.id
    WHERE e.date BETWEEN today.d - ${windowDays}::int AND today.d - 1
    ORDER BY e.date, e.id
  `

  const result: SweepResult = { created: [], existing: 0, skipped: [] }
  for (const r of rows as any[]) {
    if (r.survey_id) {
      result.existing++
      continue
    }
    const group = r.group_slug ?? SURVEY_FALLBACK_GROUP
    if (dryRun) {
      result.created.push({ surveyId: '', eventId: r.id, date: r.date, group })
      continue
    }
    const lang = surveyLang(r.group_slug)
    try {
      const surveyId = await insertSurvey({
        eventId: r.id,
        title: defaultTitle(r.theme, lang),
        intro: null,
        questions: defaultQuestions(lang),
        status: 'open',
        closesAt: new Date(r.closes_at).toISOString(),
        createdBy: null,
      })
      if (surveyId) result.created.push({ surveyId, eventId: r.id, date: r.date, group })
      else result.existing++ // created by someone else between the read and the insert
    } catch (err: any) {
      result.skipped.push({ eventId: r.id, reason: String(err?.message ?? err).slice(0, 300) })
    }
  }
  return result
}
