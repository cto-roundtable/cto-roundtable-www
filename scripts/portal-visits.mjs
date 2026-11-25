#!/usr/bin/env node
/**
 * Who opened an offering's pages in the member portal while signed in (the visit log,
 * server/utils/portalVisits.ts): name, visits, of which documents, first and last, and
 * what they answered. For the box loop, which has DATABASE_URL and no browser session.
 * Read only. The same rows the committee sees on /member/invest/<slug>/komite.
 *
 *   DATABASE_URL=... node scripts/portal-visits.mjs ctori-4
 *   DATABASE_URL=... node scripts/portal-visits.mjs ctori-4 --json
 *   DATABASE_URL=... node scripts/portal-visits.mjs ctori-4 --not-answered
 *
 * A visit is a page view under /member/invest/<slug> (the page and its documents, not
 * /komite), at most one per person and page in 10 minutes. Nothing before the first
 * logged view (`logging since`) was recorded; PostHog has the cookie-consented rest.
 */
import { parseArgs } from 'node:util'
import { neon } from '@neondatabase/serverless'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { json: { type: 'boolean' }, 'not-answered': { type: 'boolean' } },
})
const slug = (positionals[0] ?? '').toLowerCase()
if (!slug) {
  console.error('usage: node scripts/portal-visits.mjs <offering slug> [--json] [--not-answered]')
  process.exit(2)
}
if (!process.env.DATABASE_URL) {
  console.error('FAIL  DATABASE_URL is not set')
  process.exit(1)
}
const sql = neon(process.env.DATABASE_URL)

const [offering] = await sql`SELECT id, slug, name, status FROM invest_offerings WHERE slug = ${slug}`
if (!offering) {
  console.error(`FAIL  no offering ${slug}`)
  process.exit(1)
}
const base = `/member/invest/${offering.slug}`
const rows = await sql`
  SELECT p.name, p.id AS person_id,
    count(*)::int AS visits,
    count(*) FILTER (WHERE left(a.channel_id, ${base.length + 10}) = ${`${base}/dokument/`})::int AS document_views,
    min(a.occurred_at) AS first_at, max(a.occurred_at) AS last_at,
    CASE WHEN s.phase IS NULL THEN 'none'
         WHEN s.phase = 'declined' THEN 'no'
         WHEN s.phase = 'interest' THEN COALESCE(s.interest_level, 'yes')
         ELSE 'committed' END AS answer
  FROM activity_events a
  JOIN persons p ON p.id = a.person_id
  LEFT JOIN invest_subscriptions s ON s.offering_id = ${offering.id} AND s.person_id = p.id
  WHERE a.source = 'portal' AND a.event_type = 'page_view'
    AND (a.channel_id = ${base} OR left(a.channel_id, ${base.length + 1}) = ${`${base}/`})
    AND a.channel_id <> ${`${base}/komite`}
    AND left(a.channel_id, ${base.length + 8}) <> ${`${base}/komite/`}
  GROUP BY p.id, p.name, s.phase, s.interest_level
  ORDER BY max(a.occurred_at) DESC
`
const [{ since }] = await sql`SELECT min(occurred_at) AS since FROM activity_events WHERE source = 'portal'`
const shown = values['not-answered'] ? rows.filter((r) => r.answer === 'none') : rows

if (values.json) {
  console.log(JSON.stringify({ offering: offering.slug, loggingSince: since, rows: shown }, null, 2))
} else {
  const d = (v) => new Date(v).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'short', timeStyle: 'short' })
  console.log(`${offering.name} (${offering.slug}, ${offering.status}): logging since ${since ? d(since) : 'nothing yet'}`)
  console.log(`${rows.length} visitors, ${rows.filter((r) => r.answer === 'none').length} of them not answered`)
  for (const r of shown) {
    console.log(`  ${r.name.padEnd(28)} ${String(r.visits).padStart(3)} visits ${String(r.document_views).padStart(3)} doc  ${d(r.first_at)} .. ${d(r.last_at)}  ${r.answer}`)
  }
}
