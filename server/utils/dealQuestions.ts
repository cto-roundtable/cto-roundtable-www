/**
 * Q&A on a case (/member/caser/:slug). Tables deal_questions and deal_answers
 * (ctoroundtable-hq migration 032). All Q&A SQL lives here.
 *
 * The flow: a member asks; the deal-qa job on the box claims the question through
 * the admin API, answers it from the deal's investor pack or routes it to the
 * deal owner (pipeline_deals.driver_person_id); the owner answers in the portal.
 *
 * Who sees what (decision 2026-10-22 on the vote model, project ctori-4):
 *   - the ANSWER is shown to everyone who can see the case;
 *   - WHO ASKED is shown to the committee only, never to other
 *     members and never through the admin API;
 *   - a member sees their own questions, answered or not, and only the answered
 *     ones of everyone else.
 * An agent answer is labelled as one until the owner (or any committee member)
 * confirms it. A correction is a new answer; the old one gets superseded_by.
 */

export const MAX_QUESTION = 4000
export const MAX_ANSWER = 8000
export const MAX_ROUTE_NOTE = 500
/** Unanswered questions one member may have open on one case. */
const MAX_OPEN_PER_MEMBER = 10

const ANSWERED = ['answered', 'owner_answered']

export interface AnswerSource {
  file: string
  anchor?: string
  quote?: string
}

export interface CaseAnswer {
  id: string
  bodyMd: string
  sources: AnswerSource[]
  byKind: 'agent' | 'owner' | 'founder_via_owner'
  confirmed: boolean
  createdAt: string
  /** staff only */
  byName?: string | null
  confirmedByName?: string | null
}

export interface CaseQuestion {
  id: string
  body: string
  status: string
  createdAt: string
  mine: boolean
  answer: CaseAnswer | null
  /** staff only */
  askedBy?: { id: string; name: string }
  routedTo?: { id: string; name: string } | null
  routeNote?: string | null
}

/**
 * The Q&A on a case as this viewer may see it, oldest first. Members get the
 * answered questions and their own; staff get every question with names.
 * `waiting` counts other members' unanswered questions (a number, nothing more).
 *
 * `materialShared` is the case's materialSharedSql (always true for the committee).
 * While it is false a member does not get the blurb or the documents, so an answer
 * comes without its `sources`: those quote the investor pack (up to 500 characters
 * each) and would hand out the material a quote at a time. The answer text stays.
 */
export async function listCaseQuestions(
  viewer: CaseViewer,
  dealId: string,
  materialShared: boolean,
): Promise<{ questions: CaseQuestion[]; waiting: number }> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT q.id, q.body, q.status, q.created_at, q.asked_by, asker.name AS asker_name,
           q.routed_to, routed.name AS routed_name, q.route_note,
           a.id AS a_id, a.body_md, a.sources, a.by_kind, a.confirmed_at, a.created_at AS a_created_at,
           byp.name AS by_name, conf.name AS confirmed_name
    FROM deal_questions q
    JOIN persons asker ON asker.id = q.asked_by
    LEFT JOIN persons routed ON routed.id = q.routed_to
    LEFT JOIN LATERAL (
      SELECT * FROM deal_answers a
      WHERE a.question_id = q.id AND a.superseded_by IS NULL
      ORDER BY a.created_at DESC
      LIMIT 1
    ) a ON TRUE
    LEFT JOIN persons byp ON byp.id = a.by_person_id
    LEFT JOIN persons conf ON conf.id = a.confirmed_by
    WHERE q.deal_id = ${dealId}
    ORDER BY q.created_at
  `
  const questions: CaseQuestion[] = []
  let waiting = 0
  for (const r of rows as any[]) {
    const mine = r.asked_by === viewer.personId
    const answered = ANSWERED.includes(r.status) && r.a_id
    if (!viewer.isCommittee && !mine && !answered) {
      if (r.status !== 'closed') waiting++
      continue
    }
    const answer: CaseAnswer | null = r.a_id
      ? {
          id: r.a_id,
          bodyMd: r.body_md,
          sources: materialShared && Array.isArray(r.sources) ? r.sources : [],
          byKind: r.by_kind,
          confirmed: r.confirmed_at !== null,
          createdAt: r.a_created_at,
          ...(viewer.isCommittee ? { byName: r.by_name, confirmedByName: r.confirmed_name } : {}),
        }
      : null
    questions.push({
      id: r.id,
      body: r.body,
      status: r.status,
      createdAt: r.created_at,
      mine,
      answer,
      ...(viewer.isCommittee
        ? {
            askedBy: { id: r.asked_by, name: r.asker_name },
            routedTo: r.routed_to ? { id: r.routed_to, name: r.routed_name } : null,
            routeNote: r.route_note,
          }
        : {}),
    })
  }
  return { questions, waiting }
}

function cleanText(value: unknown, max: number, what: string): string {
  if (typeof value !== 'string') throw createError({ statusCode: 400, message: `${what} is required` })
  const text = value.replace(/\r\n/g, '\n').trim()
  if (!text) throw createError({ statusCode: 400, message: `${what} is required` })
  if (text.length > max) throw createError({ statusCode: 400, message: `${what} is at most ${max} characters` })
  return text
}

/** A member asks. The case check has already passed. Ties the question to the open round, if any. */
export async function askQuestion(personId: string, dealId: string, body: unknown): Promise<{ id: string }> {
  const text = cleanText(body, MAX_QUESTION, 'The question')
  const sql = useDatabase()
  const open = await sql`
    SELECT COUNT(*)::int AS n FROM deal_questions
    WHERE deal_id = ${dealId} AND asked_by = ${personId}
      AND status IN ('new', 'agent_working', 'routed', 'founder_asked')
  `
  if ((open[0] as any).n >= MAX_OPEN_PER_MEMBER) {
    throw createError({
      statusCode: 429,
      message: `You have ${MAX_OPEN_PER_MEMBER} unanswered questions on this case. Wait for an answer first.`,
    })
  }
  const rows = await sql`
    INSERT INTO deal_questions (deal_id, round_id, asked_by, body)
    VALUES (
      ${dealId},
      (SELECT id FROM deal_rounds WHERE deal_id = ${dealId} AND status = 'open' ORDER BY opened_at DESC LIMIT 1),
      ${personId},
      ${text}
    )
    RETURNING id
  `
  return { id: (rows[0] as any).id }
}

interface QuestionRow {
  id: string
  dealId: string
  slug: string
  dealName: string
  ownerId: string | null
  askedBy: string
  status: string
}

async function loadQuestionRow(questionId: string): Promise<QuestionRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(questionId)) return null
  const sql = useDatabase()
  const rows = await sql`
    SELECT q.id, q.deal_id, pd.slug, o.name AS deal_name, pd.driver_person_id, q.asked_by, q.status
    FROM deal_questions q
    JOIN pipeline_deals pd ON pd.id = q.deal_id
    JOIN organizations o ON o.id = pd.organization_id
    WHERE q.id = ${questionId}
  `
  const r: any = rows[0]
  return r
    ? {
        id: r.id,
        dealId: r.deal_id,
        slug: r.slug,
        dealName: r.deal_name,
        ownerId: r.driver_person_id,
        askedBy: r.asked_by,
        status: r.status,
      }
    : null
}

/** Write an answer, supersede the earlier ones, move the question, log the event. */
async function insertAnswer(
  q: QuestionRow,
  answer: {
    bodyMd: string
    sources: AnswerSource[]
    byKind: CaseAnswer['byKind']
    byPersonId: string | null
    agentRef: string | null
  },
): Promise<string> {
  const sql = useDatabase()
  const status = answer.byKind === 'agent' ? 'answered' : 'owner_answered'
  // One transaction. The UPDATE in the CTE sees the table as it was before the
  // INSERT, so it supersedes exactly the earlier answers.
  const [inserted] = await sql.transaction([
    sql`
      WITH ins AS (
        INSERT INTO deal_answers (question_id, body_md, sources, by_kind, by_person_id, agent_ref)
        VALUES (${q.id}, ${answer.bodyMd}, ${JSON.stringify(answer.sources)}::jsonb, ${answer.byKind},
                ${answer.byPersonId}, ${answer.agentRef})
        RETURNING id
      ), sup AS (
        UPDATE deal_answers SET superseded_by = (SELECT id FROM ins)
        WHERE question_id = ${q.id} AND superseded_by IS NULL
        RETURNING id
      )
      SELECT id FROM ins
    `,
    sql`UPDATE deal_questions SET status = ${status} WHERE id = ${q.id}`,
    sql`
      INSERT INTO deal_events (deal_id, occurred_at, kind, body, source_kind, created_by)
      VALUES (${q.dealId}, NOW(), 'question_answered',
              ${`An investor question was answered in the portal (${answer.byKind})`}, 'manual', 'portal')
    `,
  ])
  return (inserted as any[])[0].id
}

/** Staff or the deal owner may answer, confirm and close in the portal. */
async function requireAnswerer(viewer: CaseViewer, q: QuestionRow): Promise<void> {
  if (viewer.isCommittee || q.ownerId === viewer.personId) return
  throw createError({ statusCode: 403, message: 'Only the committee or the deal owner can do this' })
}

/** The owner (or a committee member) answers in the portal. Mails the asker. */
export async function answerAsOwner(
  event: Parameters<typeof getRequestURL>[0],
  viewer: CaseViewer,
  dealId: string,
  questionId: string,
  input: { bodyMd: unknown; fromFounder: unknown },
): Promise<void> {
  const q = await loadQuestionRow(questionId)
  if (!q || q.dealId !== dealId) throw createError({ statusCode: 404, message: 'Question not found' })
  await requireAnswerer(viewer, q)
  if (q.status === 'closed') throw createError({ statusCode: 409, message: 'The question is closed' })
  const bodyMd = cleanText(input.bodyMd, MAX_ANSWER, 'The answer')
  await insertAnswer(q, {
    bodyMd,
    sources: [],
    byKind: input.fromFounder === true ? 'founder_via_owner' : 'owner',
    byPersonId: viewer.personId,
    agentRef: null,
  })
  notifyAskerAnswered(event, q).catch((err) => console.error('[deal-qa] answered mail failed', err))
}

/** The owner (or a committee member) marks the current agent answer as right. */
export async function confirmAnswer(viewer: CaseViewer, dealId: string, questionId: string): Promise<void> {
  const q = await loadQuestionRow(questionId)
  if (!q || q.dealId !== dealId) throw createError({ statusCode: 404, message: 'Question not found' })
  await requireAnswerer(viewer, q)
  const sql = useDatabase()
  const rows = await sql`
    UPDATE deal_answers SET confirmed_by = ${viewer.personId}, confirmed_at = NOW()
    WHERE question_id = ${q.id} AND superseded_by IS NULL AND confirmed_at IS NULL
    RETURNING id
  `
  if (rows.length === 0) throw createError({ statusCode: 409, message: 'Nothing to confirm' })
}

/** Close a question without (another) answer. */
export async function closeQuestion(viewer: CaseViewer, dealId: string, questionId: string): Promise<void> {
  const q = await loadQuestionRow(questionId)
  if (!q || q.dealId !== dealId) throw createError({ statusCode: 404, message: 'Question not found' })
  await requireAnswerer(viewer, q)
  const sql = useDatabase()
  await sql`UPDATE deal_questions SET status = 'closed' WHERE id = ${q.id}`
}

// --- Mail ---------------------------------------------------------------------------

function siteUrl(event: Parameters<typeof getRequestURL>[0] | null): string {
  const config = useRuntimeConfig()
  return config.siteUrl || (event ? getRequestURL(event).origin : 'https://www.ctoroundtable.no')
}

/** Norwegian for members of the Norwegian chapter, English for everyone else. */
async function mailLanguage(personId: string): Promise<'nb' | 'en'> {
  return (await getChapters(personId)).includes('no') ? 'nb' : 'en'
}

async function notifyAskerAnswered(event: Parameters<typeof getRequestURL>[0] | null, q: QuestionRow): Promise<void> {
  const to = await personMailTarget(q.askedBy)
  if (!to) return
  const lang = await mailLanguage(q.askedBy)
  const link = `${siteUrl(event)}/member/caser/${q.slug}#q-${q.id}`
  const company = escapeHtml(q.dealName)
  const nb = lang === 'nb'
  await sendMail({
    to: to.email,
    subject: nb ? `Spørsmålet ditt om ${q.dealName} er besvart` : `Your question about ${q.dealName} was answered`,
    html: mailLayout([
      mailParagraph(nb ? `Hei ${firstNameHtml(to.name)},` : `Hi ${firstNameHtml(to.name)},`),
      mailParagraph(
        nb
          ? `Spørsmålet ditt om ${company} har fått svar. Svaret ligger på casen, synlig for alle i SPV-en. Hvem som spurte vises bare for komiteen.`
          : `Your question about ${company} has an answer. It is on the case page, visible to everyone in the SPV. Who asked is shown to the committee only.`,
      ),
      mailButton(link, nb ? 'Les svaret' : 'Read the answer'),
    ]),
  })
}

async function notifyOwnerRouted(event: Parameters<typeof getRequestURL>[0] | null, q: QuestionRow): Promise<void> {
  if (!q.ownerId) return
  const to = await personMailTarget(q.ownerId)
  if (!to) return
  const link = `${siteUrl(event)}/member/caser/${q.slug}#q-${q.id}`
  await sendMail({
    to: to.email,
    subject: `Et investorspørsmål om ${q.dealName} trenger svar fra deg`,
    html: mailLayout([
      mailParagraph(`Hei ${firstNameHtml(to.name)},`),
      mailParagraph(
        `Agenten fant ikke svaret i materialet for ${escapeHtml(q.dealName)}, så spørsmålet er sendt til deg som eier casen. Svar på casen, så får den som spurte e-post.`,
      ),
      mailButton(link, 'Svar på casen'),
    ]),
  })
}

// --- Admin API (/api/admin/questions/**, /api/admin/answers) ------------------------
// Contract: memory votes/admin-api.md in ctori-4. Who asked is never returned.

const QUESTION_STATUSES = ['new', 'agent_working', 'answered', 'routed', 'owner_answered', 'founder_asked', 'closed']

function adminAnswer(a: any) {
  return {
    id: a.id,
    bodyMd: a.body_md,
    sources: a.sources ?? [],
    byKind: a.by_kind,
    agentRef: a.agent_ref,
    confirmedAt: a.confirmed_at,
    createdAt: a.created_at,
  }
}

async function adminQuestions(where: { ids?: string[]; statuses?: string[]; slug?: string | null; limit: number }) {
  const sql = useDatabase()
  const statuses = where.statuses?.length ? where.statuses : null
  const ids = where.ids ?? null
  const rows = await sql`
    SELECT q.id, pd.slug, o.name AS deal_name, q.round_id, q.body, q.status,
           q.routed_to, routed.name AS routed_name, q.route_note, q.agent_ref, q.created_at, q.updated_at,
           COALESCE((
             SELECT json_agg(a ORDER BY a.created_at)
             FROM deal_answers a WHERE a.question_id = q.id AND a.superseded_by IS NULL
           ), '[]'::json) AS answers
    FROM deal_questions q
    JOIN pipeline_deals pd ON pd.id = q.deal_id
    JOIN organizations o ON o.id = pd.organization_id
    LEFT JOIN persons routed ON routed.id = q.routed_to
    WHERE (${ids}::uuid[] IS NULL OR q.id = ANY(${ids}::uuid[]))
      AND (${statuses}::text[] IS NULL OR q.status = ANY(${statuses}::text[]))
      AND (${where.slug ?? null}::text IS NULL OR pd.slug = ${where.slug ?? null})
    ORDER BY q.created_at
    LIMIT ${where.limit}
  `
  return (rows as any[]).map((r) => ({
    id: r.id,
    deal: { slug: r.slug, name: r.deal_name },
    roundId: r.round_id,
    body: r.body,
    status: r.status,
    routedTo: r.routed_to ? { id: r.routed_to, name: r.routed_name } : null,
    routeNote: r.route_note,
    agentRef: r.agent_ref,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    answers: r.answers.map(adminAnswer),
  }))
}

export async function adminListQuestions(opts: { statuses: string[]; slug: string | null; limit: number }) {
  const bad = opts.statuses.filter((s) => !QUESTION_STATUSES.includes(s))
  if (bad.length) throw createError({ statusCode: 400, message: `Unknown status ${bad.join(', ')}` })
  return adminQuestions(opts)
}

export async function adminGetQuestion(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 404, message: 'Question not found' })
  const [q] = await adminQuestions({ ids: [id], limit: 1 })
  if (!q) throw createError({ statusCode: 404, message: 'Question not found' })
  return q
}

const AGENT_REF_RE = /^\S{1,300}$/

/** PATCH /api/admin/questions/:id: claim, release, route or close. */
export async function adminPatchQuestion(id: string, body: Record<string, unknown>) {
  const q = await loadQuestionRow(id)
  if (!q) throw createError({ statusCode: 404, message: 'Question not found' })
  const sql = useDatabase()
  const allowed: Record<string, string[]> = {
    agent_working: ['status', 'agentRef'],
    routed: ['status', 'note'],
    new: ['status'],
    closed: ['status'],
  }
  const status = String(body.status ?? '')
  if (!allowed[status])
    throw createError({ statusCode: 400, message: 'status must be agent_working, routed, new or closed' })
  const extra = Object.keys(body).filter((k) => !allowed[status]!.includes(k))
  if (extra.length)
    throw createError({ statusCode: 400, message: `Not allowed with status ${status}: ${extra.join(', ')}` })

  if (status === 'agent_working') {
    if (typeof body.agentRef !== 'string' || !AGENT_REF_RE.test(body.agentRef)) {
      throw createError({ statusCode: 400, message: 'agentRef is required (the acp link)' })
    }
    // The claim is a compare-and-set, so two job ticks cannot both take it.
    const rows = await sql`
      UPDATE deal_questions SET status = 'agent_working', agent_ref = ${body.agentRef}
      WHERE id = ${id} AND status = 'new'
      RETURNING id
    `
    if (rows.length === 0) throw createError({ statusCode: 409, message: `Question is ${q.status}, not new` })
  } else if (status === 'new') {
    const rows = await sql`
      UPDATE deal_questions SET status = 'new', agent_ref = NULL
      WHERE id = ${id} AND status = 'agent_working'
      RETURNING id
    `
    if (rows.length === 0) throw createError({ statusCode: 409, message: `Question is ${q.status}, not agent_working` })
  } else if (status === 'routed') {
    const note = cleanText(body.note, MAX_ROUTE_NOTE, 'note')
    if (!q.ownerId)
      throw createError({ statusCode: 400, message: 'The deal has no owner (driver_person_id) to route to' })
    if (!['new', 'agent_working'].includes(q.status)) {
      throw createError({
        statusCode: 409,
        message: `Question is ${q.status}; only new or agent_working can be routed`,
      })
    }
    await sql`
      UPDATE deal_questions SET status = 'routed', routed_to = ${q.ownerId}, route_note = ${note}
      WHERE id = ${id}
    `
    notifyOwnerRouted(null, q).catch((err) => console.error('[deal-qa] routed mail failed', err))
  } else {
    await sql`UPDATE deal_questions SET status = 'closed' WHERE id = ${id}`
  }
  return adminGetQuestion(id)
}

function cleanSources(value: unknown): AnswerSource[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 20) {
    throw createError({ statusCode: 400, message: 'sources must be a list of at most 20' })
  }
  return value.map((s: any) => {
    if (!s || typeof s.file !== 'string' || !s.file.trim() || s.file.length > 300) {
      throw createError({ statusCode: 400, message: 'every source needs a file' })
    }
    const out: AnswerSource = { file: s.file.trim() }
    if (s.anchor !== undefined) out.anchor = String(s.anchor).slice(0, 200)
    if (s.quote !== undefined) {
      if (typeof s.quote !== 'string' || s.quote.length > 500) {
        throw createError({ statusCode: 400, message: 'a quote is at most 500 characters' })
      }
      out.quote = s.quote
    }
    return out
  })
}

const ANSWER_KEYS = ['bodyMd', 'sources', 'byKind', 'agentRef']

/** POST /api/admin/questions/:id/answers: the agent's answer. Mails the asker. */
export async function adminPostAnswer(id: string, body: Record<string, unknown>, dryRun: boolean) {
  const extra = Object.keys(body).filter((k) => !ANSWER_KEYS.includes(k))
  if (extra.length) throw createError({ statusCode: 400, message: `Unknown keys: ${extra.join(', ')}` })
  if (body.byKind !== 'agent') {
    throw createError({ statusCode: 400, message: 'byKind must be agent (owners answer in the portal)' })
  }
  if (typeof body.agentRef !== 'string' || !AGENT_REF_RE.test(body.agentRef)) {
    throw createError({ statusCode: 400, message: 'agentRef is required (the acp link)' })
  }
  const bodyMd = cleanText(body.bodyMd, MAX_ANSWER, 'bodyMd')
  const sources = cleanSources(body.sources)
  const q = await loadQuestionRow(id)
  if (!q) throw createError({ statusCode: 404, message: 'Question not found' })
  if (q.status !== 'agent_working') {
    throw createError({ statusCode: 409, message: `Question is ${q.status}; claim it (agent_working) first` })
  }
  if (dryRun) return { question: await adminGetQuestion(id), dryRun: true }
  await insertAnswer(q, { bodyMd, sources, byKind: 'agent', byPersonId: null, agentRef: body.agentRef })
  notifyAskerAnswered(null, q).catch((err) => console.error('[deal-qa] answered mail failed', err))
  return { question: await adminGetQuestion(id) }
}

/** GET /api/admin/answers?since=: current answers since a time, for the nightly qa-investors.md sync. */
export async function adminListAnswers(opts: { since: string | null; slug: string | null }) {
  const sql = useDatabase()
  const rows = await sql`
    SELECT a.*, q.id AS q_id, q.body AS q_body, q.created_at AS q_created_at, pd.slug, o.name AS deal_name
    FROM deal_answers a
    JOIN deal_questions q ON q.id = a.question_id
    JOIN pipeline_deals pd ON pd.id = q.deal_id
    JOIN organizations o ON o.id = pd.organization_id
    WHERE a.superseded_by IS NULL
      AND (${opts.since}::timestamptz IS NULL OR a.created_at > ${opts.since}::timestamptz)
      AND (${opts.slug}::text IS NULL OR pd.slug = ${opts.slug})
    ORDER BY a.created_at
    LIMIT 500
  `
  return (rows as any[]).map((r) => ({
    question: { id: r.q_id, deal: { slug: r.slug, name: r.deal_name }, body: r.q_body, createdAt: r.q_created_at },
    answer: adminAnswer(r),
  }))
}

/** The case and question behind a /api/member/deals/:slug/questions/:id/* route. */
export async function questionContext(event: Parameters<typeof getRouterParam>[0]) {
  const slug = getRouterParam(event, 'slug')
  const questionId = getRouterParam(event, 'id')
  if (!slug || !questionId) throw createError({ statusCode: 400, message: 'Missing question' })
  const viewer = await caseViewer(event.context.session.personId)
  const deal = await requireCase(viewer, slug)
  return { viewer, dealId: deal.id, questionId }
}
