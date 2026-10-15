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
