// The committee's page for an offering, /member/invest/:slug/komite (Snorre 2026-11-12,
// ctori-4 item committee-page): who signed up for the online session, and every
// interest answer with the totals `scripts/invest-offering.mjs show` prints. Until now
// the answers were CLI only and the sign-ups sat at the bottom of the member page.
//
// Rules:
// - The investment committee (`current-komite`, isDocumentCommentReader) only, never the
//   board alone. Anyone else gets the same 404 as an offering that does not exist, and
//   so does the committee for an offering it may not see (requireVisibleOffering).
// - Read only. Names and e-mails, no national ID, address or phone.

import type { InterestAnswerShown, SessionSignupRow } from './investSessions'

export interface InterestAnswerRow {
  name: string
  answer: InterestAnswerShown
  amountNok: number | null
  vehicle: string | null
  /** The holding company linked to the answer, when the member owns exactly one. */
  holding: string | null
  wantsInfo: boolean | null
  wantsToHelp: string | null
  notes: string | null
  updatedAt: string
}

export interface InterestTotals {
  yes: number
  yesNok: number
  maybe: number
  no: number
}

/** The raw columns the totals are counted from. */
export interface TotalsSource {
  phase: string
  interestLevel: string | null
  amountNok: number | null
}

/**
 * The same numbers as `invest-offering.mjs show`: yes and maybe are rows still in
 * interest with that level, the sum is the yes amounts, and no is phase declined.
 */
export function interestTotals(rows: TotalsSource[]): InterestTotals {
  const t: InterestTotals = { yes: 0, yesNok: 0, maybe: 0, no: 0 }
  for (const r of rows) {
    if (r.phase === 'declined') t.no++
    if (r.phase !== 'interest') continue
    if (r.interestLevel === 'yes') {
      t.yes++
      t.yesNok += r.amountNok ?? 0
    } else if (r.interestLevel === 'maybe') t.maybe++
  }
  return t
}

/** Every answer to the offering, with name, newest change first. Committee only: the caller checks. */
export async function listInterestAnswers(
  offeringId: string,
): Promise<{ rows: InterestAnswerRow[]; totals: InterestTotals }> {
  const sql = useDatabase()
  const raw = (await sql`
    SELECT p.name, s.phase, s.interest_level, s.amount_nok, s.vehicle, org.name AS holding,
           s.wants_info, s.wants_to_help, s.notes, s.updated_at
    FROM invest_subscriptions s
    JOIN persons p ON p.id = s.person_id
    LEFT JOIN organizations org ON org.id = s.organization_id
    WHERE s.offering_id = ${offeringId}
    ORDER BY s.updated_at DESC, p.name
  `) as any[]
  const amount = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    rows: raw.map((r) => ({
      name: r.name,
      answer: answerShown(r.phase, r.interest_level),
      amountNok: amount(r.amount_nok),
      vehicle: r.vehicle ?? null,
      holding: r.holding ?? null,
      wantsInfo: r.wants_info,
      wantsToHelp: r.wants_to_help,
      notes: r.notes,
      updatedAt: r.updated_at,
    })),
    totals: interestTotals(
      raw.map((r) => ({ phase: r.phase, interestLevel: r.interest_level, amountNok: amount(r.amount_nok) })),
    ),
  }
}

export interface CommitteePage {
  offering: { slug: string; name: string; status: string }
  preview: boolean
  sessionSignups: SessionSignupRow[]
  answers: InterestAnswerRow[]
  totals: InterestTotals
}

/** What the page reads; each one is replaceable so the gate can be tested without a database. */
export interface CommitteePageDeps {
  requireVisibleOffering: (
    personId: string,
    slug: string,
  ) => Promise<{ offering: { id: string; slug: string; name: string; status: string }; preview: boolean }>
  isCommittee: (personId: string) => Promise<boolean>
  listSessionSignups: (offeringId: string) => Promise<SessionSignupRow[]>
  listInterestAnswers: (offeringId: string) => Promise<{ rows: InterestAnswerRow[]; totals: InterestTotals }>
}

/**
 * The committee page, or a 404. The offering must be one the person may see, and the
 * person must be on the committee; nothing is read before both hold.
 */
export async function getCommitteePage(
  personId: string,
  slug: string,
  deps: Partial<CommitteePageDeps> = {},
): Promise<CommitteePage> {
  const d: CommitteePageDeps = {
    requireVisibleOffering: (p, s) => requireVisibleOffering(p, s),
    isCommittee: (p) => isDocumentCommentReader(p),
    listSessionSignups: (id) => listSessionSignups(id),
    listInterestAnswers: (id) => listInterestAnswers(id),
    ...deps,
  }
  const { offering, preview } = await d.requireVisibleOffering(personId, slug)
  if (!(await d.isCommittee(personId))) throw createError({ statusCode: 404, message: 'Not found' })
  const [sessionSignups, answers] = await Promise.all([
    d.listSessionSignups(offering.id),
    d.listInterestAnswers(offering.id),
  ])
  return {
    offering: { slug: offering.slug, name: offering.name, status: offering.status },
    preview,
    sessionSignups,
    answers: answers.rows,
    totals: answers.totals,
  }
}
