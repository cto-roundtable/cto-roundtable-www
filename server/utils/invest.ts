// CTORI signup in the portal: an offering (one CTORI cohort, `invest_offerings`) and
// a member's answer to it (`invest_subscriptions`, one row per offering and person).
// All SQL for /api/member/invest/** lives here. Schema: ctoroundtable-hq migrations
// 031 (tables) and 041 (amount rule, interest_level, documents). Design:
// research/portal-signup-mapping.md in the ctori-4 project; this file is step 3,
// the interest phase ("are you in, how much"), which binds nobody.
//
// Rules that hold for every route:
// - Who sees an offering: every portal member (both chapters, decision D6) while it
//   is in `interest` or `committing`; only the investment committee (`current-komite`)
//   while it is a `draft`, so the committee can look at it before it opens. The board
//   (`styret`) is network only and gets nothing extra here (Snorre, 2026-10-29).
//   Anything else is a 404.
// - Interest is editable only while the offering is in `interest` (and by the
//   committee in `draft`), and only on a row that is still interest or declined. A row that
//   has moved on (committed, signed, paid) is never touched from here.
// - Amounts are validated against the offering's own data (amount_options, and
//   amount_min / amount_step for "annet beløp"). No amount is hard-coded here.
// - No national ID, address or phone is read or written by this file.

export type OfferingStatus = 'draft' | 'interest' | 'committing' | 'closed'
export type InterestAnswer = 'yes' | 'maybe' | 'no'
export type Vehicle = 'holding' | 'personal' | 'unsure'

export interface Offering {
  id: string
  slug: string
  name: string
  status: OfferingStatus
  amountOptions: number[]
  amountMin: number | null
  amountStep: number | null
  minNok: number | null
  interestClosesAt: string | null
}

/** Show the aggregate ("N have said yes") only from this many answers, so nobody is singled out. */
export const AGGREGATE_MIN_ANSWERS = 3

const VISIBLE_TO_MEMBERS: OfferingStatus[] = ['interest', 'committing']

function toNumber(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v)
}

function rowToOffering(r: any): Offering {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    status: r.status,
    amountOptions: (r.amount_options ?? []).map(Number),
    amountMin: toNumber(r.amount_min),
    amountStep: toNumber(r.amount_step),
    minNok: toNumber(r.min_nok),
    interestClosesAt: r.interest_closes_at ?? null,
  }
}

/**
 * The offering by slug if this person may see it, else a 404 (the same answer as one
 * that does not exist). Returns whether they see it only as a committee preview.
 */
export async function requireVisibleOffering(
  personId: string,
  slug: string,
): Promise<{ offering: Offering; preview: boolean }> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT id, slug, name, status, amount_options, amount_min, amount_step, min_nok, interest_closes_at
    FROM invest_offerings WHERE slug = ${slug}
  `
  const row = rows[0]
  if (row) {
    const offering = rowToOffering(row)
    if (VISIBLE_TO_MEMBERS.includes(offering.status)) return { offering, preview: false }
    if (offering.status === 'draft' && (await isCommitteeMember(personId))) return { offering, preview: true }
  }
  throw createError({ statusCode: 404, message: 'Not found' })
}

/**
 * The offering a member should be pointed at (nav item, banner): the newest one open
 * for interest or tegning, or, for the committee only, a draft. Null when there is none.
 */
export async function currentOfferingFor(
  personId: string,
): Promise<{ slug: string; name: string; status: OfferingStatus; answered: boolean } | null> {
  const sql = useDatabase()
  const statuses = (await isCommitteeMember(personId)) ? [...VISIBLE_TO_MEMBERS, 'draft'] : VISIBLE_TO_MEMBERS
  const rows = await sql`
    SELECT o.slug, o.name, o.status,
           EXISTS (SELECT 1 FROM invest_subscriptions s
                    WHERE s.offering_id = o.id AND s.person_id = ${personId}) AS answered
    FROM invest_offerings o
    WHERE o.status = ANY(${statuses})
    ORDER BY (o.status = 'draft'), o.slug DESC
    LIMIT 1
  `
  const r = rows[0]
  return r ? { slug: r.slug, name: r.name, status: r.status, answered: r.answered } : null
}

export interface MyInterest {
  answer: InterestAnswer | null
  phase: string
  amountNok: number | null
  vehicle: Vehicle | null
  wantsInfo: boolean | null
  wantsToHelp: string | null
  notes: string | null
  updatedAt: string
}

export async function getMyInterest(offeringId: string, personId: string): Promise<MyInterest | null> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT phase, interest_level, amount_nok, vehicle, wants_info, wants_to_help, notes, updated_at
    FROM invest_subscriptions WHERE offering_id = ${offeringId} AND person_id = ${personId}
  `
  const r = rows[0]
  if (!r) return null
  const answer: InterestAnswer | null =
    r.phase === 'declined' ? 'no' : r.phase === 'interest' ? (r.interest_level ?? 'yes') : null
  return {
    answer,
    phase: r.phase,
    amountNok: toNumber(r.amount_nok),
    vehicle: r.vehicle,
    wantsInfo: r.wants_info,
    wantsToHelp: r.wants_to_help,
    notes: r.notes,
    updatedAt: r.updated_at,
  }
}

/**
 * What we already know about this member, to prefill and to say "last time": their
 * newest earlier subscription (ctori-1..3 history, imported from Coda and the Drive
 * sheets) and the holding companies they own. Names only, never org numbers.
 */
export async function getKnownForInterest(offeringId: string, personId: string) {
  const sql = useDatabase()
  const last = await sql`
    SELECT o.name AS offering, s.amount_nok, s.vehicle, org.name AS holding
    FROM invest_subscriptions s
    JOIN invest_offerings o ON o.id = s.offering_id
    LEFT JOIN organizations org ON org.id = s.organization_id
    WHERE s.person_id = ${personId} AND s.offering_id <> ${offeringId} AND s.phase IN ('signed', 'paid')
    ORDER BY o.slug DESC
    LIMIT 1
  `
  const holdings = await sql`
    SELECT org.id, org.name
    FROM person_organizations po
    JOIN organizations org ON org.id = po.organization_id
    WHERE po.person_id = ${personId} AND po.relationship_type = 'owner' AND po.ended_at IS NULL
    ORDER BY org.name
  `
  const l = last[0]
  return {
    lastTime: l
      ? {
          offering: l.offering,
          amountNok: toNumber(l.amount_nok),
          vehicle: l.vehicle as Vehicle,
          holding: l.holding ?? null,
        }
      : null,
    holdings: holdings.map((h: any) => ({ id: h.id as string, name: h.name as string })),
  }
}

/** Anonymous totals for the page. Null below AGGREGATE_MIN_ANSWERS yes/maybe answers. */
export async function getInterestAggregate(offeringId: string) {
  const sql = useDatabase()
  const rows = await sql`
    SELECT count(*) FILTER (WHERE interest_level = 'yes')   AS yes,
           count(*) FILTER (WHERE interest_level = 'maybe') AS maybe,
           coalesce(sum(amount_nok) FILTER (WHERE interest_level = 'yes'), 0) AS yes_nok
    FROM invest_subscriptions
    WHERE offering_id = ${offeringId} AND phase = 'interest'
  `
  const r = rows[0]
  const yes = Number(r.yes)
  const maybe = Number(r.maybe)
  if (yes + maybe < AGGREGATE_MIN_ANSWERS) return null
  return { yes, maybe, yesNok: Number(r.yes_nok) }
}

/** Whether `amount` is allowed by this offering: one of its options, or a valid "annet beløp". */
export function isAllowedAmount(offering: Offering, amount: number): boolean {
  if (!Number.isSafeInteger(amount) || amount <= 0) return false
  if (offering.amountOptions.includes(amount)) return true
  const { amountStep, amountMin } = offering
  if (!amountStep) return false
  return amount >= (amountMin ?? amountStep) && amount % amountStep === 0
}

export interface InterestInput {
  answer: InterestAnswer
  amountNok: number | null
  vehicle: Vehicle | null
  wantsInfo: boolean
  wantsToHelp: string | null
  notes: string | null
}

function cleanText(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim().slice(0, max)
  return s.length ? s : null
}

/** Validate a request body into an InterestInput, or throw a 400 with a message key. */
export function parseInterestInput(offering: Offering, body: any): InterestInput {
  const bad = (message: string) => createError({ statusCode: 400, message })
  const answer = body?.answer
  if (!['yes', 'maybe', 'no'].includes(answer)) throw bad('invest.errors.answer')

  if (answer === 'no') {
    return {
      answer,
      amountNok: null,
      vehicle: null,
      wantsInfo: false,
      wantsToHelp: null,
      notes: cleanText(body.notes, 2000),
    }
  }

  const rawAmount = body.amountNok
  const amountNok = rawAmount === null || rawAmount === undefined || rawAmount === '' ? null : Number(rawAmount)
  if (answer === 'yes' && amountNok === null) throw bad('invest.errors.amountRequired')
  if (amountNok !== null && !isAllowedAmount(offering, amountNok)) throw bad('invest.errors.amount')

  const vehicle = body.vehicle ?? null
  if (vehicle !== null && !['holding', 'personal', 'unsure'].includes(vehicle)) throw bad('invest.errors.vehicle')

  return {
    answer,
    amountNok,
    vehicle,
    // "Kanskje" means "tell me more", so it always asks for information.
    wantsInfo: answer === 'maybe' ? true : Boolean(body.wantsInfo),
    wantsToHelp: cleanText(body.wantsToHelp, 500),
    notes: cleanText(body.notes, 2000),
  }
}

/**
 * Save the member's interest. Upserts the one row per (offering, person), but only
 * while it is still interest or declined; a row that has moved on is a 409.
 * The holding is linked only when the member owns exactly one and says holding;
 * with none or several, it is asked at tegning.
 */
export async function saveInterest(offering: Offering, personId: string, input: InterestInput, preview: boolean) {
  if (offering.status !== 'interest' && !(preview && offering.status === 'draft')) {
    throw createError({ statusCode: 409, message: 'invest.errors.closed' })
  }
  const sql = useDatabase()

  let organizationId: string | null = null
  if (input.vehicle === 'holding') {
    const { holdings } = await getKnownForInterest(offering.id, personId)
    if (holdings.length === 1) organizationId = holdings[0]!.id
  }

  const phase = input.answer === 'no' ? 'declined' : 'interest'
  const level = input.answer === 'no' ? null : input.answer
  const rows = await sql`
    INSERT INTO invest_subscriptions
      (offering_id, person_id, phase, interest_level, amount_nok, vehicle, organization_id,
       wants_info, wants_to_help, notes, source)
    VALUES (${offering.id}, ${personId}, ${phase}, ${level}, ${input.amountNok}, ${input.vehicle},
            ${organizationId}, ${input.wantsInfo}, ${input.wantsToHelp}, ${input.notes}, 'portal')
    ON CONFLICT (offering_id, person_id) DO UPDATE SET
      phase           = EXCLUDED.phase,
      interest_level  = EXCLUDED.interest_level,
      amount_nok      = EXCLUDED.amount_nok,
      vehicle         = EXCLUDED.vehicle,
      organization_id = EXCLUDED.organization_id,
      wants_info      = EXCLUDED.wants_info,
      wants_to_help   = EXCLUDED.wants_to_help,
      notes           = EXCLUDED.notes
    WHERE invest_subscriptions.phase IN ('interest', 'declined')
    RETURNING id
  `
  if (!rows[0]) throw createError({ statusCode: 409, message: 'invest.errors.alreadyCommitted' })
  return { id: rows[0].id as string }
}

export interface OfferingDocumentMeta {
  key: string
  title: string
  version: number
  sha256: string
  publishedAt: string
}

/** The current version of each document of the offering, without the bytes. */
export async function listOfferingDocuments(offeringId: string): Promise<OfferingDocumentMeta[]> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT DISTINCT ON (key) key, title, version, sha256, created_at
    FROM invest_offering_documents
    WHERE offering_id = ${offeringId}
    ORDER BY key, version DESC
  `
  return rows.map((r: any) => ({
    key: r.key,
    title: r.title,
    version: r.version,
    sha256: r.sha256,
    publishedAt: r.created_at,
  }))
}

/** The current version of one document, with its bytes, or a 404. */
export async function readOfferingDocument(offeringId: string, key: string) {
  const sql = useDatabase()
  const rows = await sql`
    SELECT key, title, version, sha256, content_type, body
    FROM invest_offering_documents
    WHERE offering_id = ${offeringId} AND key = ${key}
    ORDER BY version DESC
    LIMIT 1
  `
  const r = rows[0]
  if (!r) throw createError({ statusCode: 404, message: 'Not found' })
  return {
    key: r.key,
    title: r.title,
    version: r.version,
    sha256: r.sha256,
    contentType: r.content_type,
    body: toBuffer(r.body),
  }
}

/** The serverless driver returns bytea as a hex string ("\x…") or a Uint8Array, depending on the path. */
function toBuffer(v: unknown): Buffer {
  if (typeof v === 'string') return Buffer.from(v.startsWith('\\x') ? v.slice(2) : v, 'hex')
  return Buffer.from(v as Uint8Array)
}

/** For the session (nav item): the current offering's slug and name only. */
export async function currentInvestOffering(personId: string): Promise<{ slug: string; name: string } | null> {
  const current = await currentOfferingFor(personId)
  return current ? { slug: current.slug, name: current.name } : null
}
