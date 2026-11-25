// The portal visit log: one activity_events row (source 'portal', event_type
// 'page_view', channel_id = the page) per signed-in page view under /member, at most one
// per person and page every VISIT_DEDUPE_MINUTES. No new table: hq migration 014's
// activity_events is the network's append-only signal layer, its source and event_type
// are freeform, and its UNIQUE dedup_key does the dedupe. The rules are pure, in
// portalVisitRules.ts.
//
// Who reads it: the investment committee per offering (getOfferingVisits, on the
// offering's committee page), the board as one column in its member report, and the
// box loop straight from Neon (scripts/portal-visits.mjs). The existing activity
// numbers (Slack, Luma, score, "sist sett") leave source 'portal' out, so they mean
// what they meant before.

import type { InterestAnswerShown } from './investSessions'
import { offeringPagePrefix, VISIT_DEDUPE_MINUTES, VISIT_EVENT, VISIT_SOURCE, visitDedupKey } from './portalVisitRules'

/**
 * Log one page view by a signed-in person. A view of the same page by the same person
 * in the last VISIT_DEDUPE_MINUTES writes nothing (and the bucketed dedup_key catches
 * two requests racing). Returns whether a row was written.
 */
export async function recordPortalVisit(personId: string, path: string, at: Date = new Date()): Promise<boolean> {
  const sql = useDatabase()
  const [, inserted] = (await sql.transaction([
    setActor(sql, `portal:${personId}`),
    sql`
      INSERT INTO activity_events (source, event_type, person_id, channel_id, occurred_at, dedup_key)
      SELECT ${VISIT_SOURCE}, ${VISIT_EVENT}, ${personId}, ${path}, ${at.toISOString()}, ${visitDedupKey(personId, path, at)}
      WHERE NOT EXISTS (
        SELECT 1 FROM activity_events
        WHERE person_id = ${personId} AND source = ${VISIT_SOURCE} AND event_type = ${VISIT_EVENT}
          AND channel_id = ${path}
          AND occurred_at > ${at.toISOString()}::timestamptz - make_interval(mins => ${VISIT_DEDUPE_MINUTES})
      )
      ON CONFLICT (dedup_key) DO NOTHING
      RETURNING id
    `,
  ])) as [unknown, unknown[]]
  return inserted.length > 0
}

export interface OfferingVisitRow {
  personId: string
  name: string
  /** Logged views of the offering's pages (deduped, see VISIT_DEDUPE_MINUTES). */
  visits: number
  /** Of those, views of a document (the deck). */
  documentViews: number
  firstAt: string
  lastAt: string
  /** What they answered on the offering, or null for no answer yet. */
  answer: InterestAnswerShown
}

export interface OfferingVisits {
  /** The first portal page view logged anywhere: nothing before this was recorded. */
  loggingSince: string | null
  visitors: number
  visitedNotAnswered: number
  rows: OfferingVisitRow[]
}

/**
 * Who opened an offering's pages (the page and its documents, not the committee page),
 * how often, first and last time, and what they answered. The committee only: everyone
 * else, the board alone included, gets the same 404 as a missing offering, and nothing
 * is read before the gate (the getCommitteePage rule, investCommittee.ts).
 */
export async function getOfferingVisits(personId: string, slug: string): Promise<OfferingVisits> {
  const { offering } = await requireVisibleOffering(personId, slug)
  if (!(await isCommitteeMember(personId))) throw createError({ statusCode: 404, message: 'Not found' })
  return listOfferingVisits(offering.id, offering.slug)
}

/** The read itself, no gate: for routes that have checked, and for nothing else. */
export async function listOfferingVisits(offeringId: string, slug: string): Promise<OfferingVisits> {
  const sql = useDatabase()
  const base = offeringPagePrefix(slug)
  const [rows, since] = await Promise.all([
    sql`
      SELECT p.id, p.name,
        count(*)::int AS visits,
        count(*) FILTER (WHERE left(a.channel_id, ${base.length + 10}) = ${`${base}/dokument/`})::int AS document_views,
        min(a.occurred_at) AS first_at, max(a.occurred_at) AS last_at,
        s.phase, s.interest_level
      FROM activity_events a
      JOIN persons p ON p.id = a.person_id
      LEFT JOIN invest_subscriptions s ON s.offering_id = ${offeringId} AND s.person_id = p.id
      WHERE a.source = ${VISIT_SOURCE} AND a.event_type = ${VISIT_EVENT}
        AND (a.channel_id = ${base} OR left(a.channel_id, ${base.length + 1}) = ${`${base}/`})
        AND a.channel_id <> ${`${base}/komite`}
        AND left(a.channel_id, ${base.length + 8}) <> ${`${base}/komite/`}
      GROUP BY p.id, p.name, s.phase, s.interest_level
      ORDER BY max(a.occurred_at) DESC
    `,
    sql`
      SELECT min(occurred_at) AS since FROM activity_events
      WHERE source = ${VISIT_SOURCE} AND event_type = ${VISIT_EVENT}
    `,
  ])
  const out: OfferingVisitRow[] = (rows as any[]).map((r) => ({
    personId: r.id,
    name: r.name,
    visits: Number(r.visits),
    documentViews: Number(r.document_views),
    firstAt: iso(r.first_at),
    lastAt: iso(r.last_at),
    answer: answerShown(r.phase ?? null, r.interest_level ?? null),
  }))
  const first = (since as any[])[0]?.since
  return {
    loggingSince: first ? iso(first) : null,
    visitors: out.length,
    visitedNotAnswered: out.filter((r) => r.answer === null).length,
    rows: out,
  }
}

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString()
}
