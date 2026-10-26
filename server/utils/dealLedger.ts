/**
 * The hovedbok: who earns the incentive on a CTORI4 investment (dc-39, decision
 * 2026-10-26-incentive-10pct.md in ctori-4; memory votes/shape.md, "Incentive
 * ledger"). 10% of the gain: 4 to the follow-up owner, 3 to the committee that
 * recommended it, 3 to the case driver(s). Schema: ctoroundtable-hq migration 039.
 *
 * - The model comes from the round's group (`network_groups.incentive_model`,
 *   `incentive_models`), never from a hard-coded slug. CTORI1-3 have none and keep
 *   no ledger.
 * - Drivers are the deal's current `lead` + `co_lead` rows in `deal_people`; the
 *   follow-up owner is its current `follow_up_owner` row. A hand-over closes the
 *   row and opens a new one, so months held come from the dates
 *   (`deal_follow_up_months`).
 * - The committee is `current-komite` at the moment the round closes.
 * - The snapshot (`deal_rounds.ledger`) is written in the UPDATE that closes the
 *   round (closeRound in dealRounds.ts); the 039 trigger refuses a CTORI4 close
 *   without it and checks it against deal_people. A passed round needs a lead and a
 *   follow-up owner; a failed one records what there is.
 * - Members never see any of it: every route here is committee only.
 */
export interface IncentiveModel {
  model: string
  totalPct: number
  followUpPct: number
  committeePct: number
  driversPct: number
  decision: string
}

export type LedgerGap = 'lead' | 'follow_up_owner'

export interface DealPeopleNow {
  drivers: { person_id: string; role: 'lead' | 'co_lead'; name: string }[]
  followUpOwner: { person_id: string; name: string; since: string } | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function modelOut(r: any): IncentiveModel {
  return {
    model: r.model,
    totalPct: Number(r.total_pct),
    followUpPct: Number(r.follow_up_pct),
    committeePct: Number(r.committee_pct),
    driversPct: Number(r.drivers_pct),
    decision: r.decision,
  }
}

/** The incentive model of a round's group, or null (CTORI1-3 and every non-invest group). */
export async function modelForGroup(groupId: string): Promise<IncentiveModel | null> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT im.* FROM network_groups g JOIN incentive_models im ON im.model = g.incentive_model
    WHERE g.id = ${groupId}
  `) as any[]
  return rows[0] ? modelOut(rows[0]) : null
}

/** The deal's current drivers (lead, co_lead) and follow-up owner. */
export async function dealPeopleNow(dealId: string): Promise<DealPeopleNow> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT dp.person_id, dp.role, dp.valid_from, p.name
    FROM deal_people dp JOIN persons p ON p.id = dp.person_id
    WHERE dp.deal_id = ${dealId} AND dp.valid_to IS NULL AND dp.role IN ('lead', 'co_lead', 'follow_up_owner')
    ORDER BY dp.role, p.name
  `) as any[]
  const owner = rows.find((r) => r.role === 'follow_up_owner')
  return {
    drivers: rows
      .filter((r) => r.role === 'lead' || r.role === 'co_lead')
      .map((r) => ({ person_id: r.person_id, role: r.role, name: r.name })),
    followUpOwner: owner ? { person_id: owner.person_id, name: owner.name, since: owner.valid_from } : null,
  }
}

/** The committee as it stands now: every active member of `current-komite`. */
export async function committeeNow(): Promise<{ id: string; name: string }[]> {
  const sql = useDatabase()
  return (await sql`
    SELECT DISTINCT p.id, p.name
    FROM memberships m
    JOIN network_groups ng ON ng.id = m.group_id
    JOIN persons p ON p.id = m.person_id
    WHERE ng.slug = ${COMMITTEE_GROUP} AND p.status = 'active'
    ORDER BY p.name
  `) as any[]
}

/** What a close is missing: only a passed round must have a lead and a follow-up owner. */
export function ledgerGaps(people: DealPeopleNow, result: string): LedgerGap[] {
  if (result !== 'passed') return []
  const gaps: LedgerGap[] = []
  if (!people.drivers.some((d) => d.role === 'lead')) gaps.push('lead')
  if (!people.followUpOwner) gaps.push('follow_up_owner')
  return gaps
}

/** The deal_ledger snapshot, in the exact shape the 039 CHECK accepts. */
export function buildLedger(
  model: IncentiveModel,
  people: DealPeopleNow,
  committee: string[],
  recordedBy: string | null,
) {
  return {
    model: model.model,
    pct: {
      total: model.totalPct,
      follow_up: model.followUpPct,
      committee: model.committeePct,
      drivers: model.driversPct,
    },
    decision: model.decision,
    committee,
    drivers: people.drivers.map((d) => ({ person_id: d.person_id, role: d.role })),
    follow_up_owner: people.followUpOwner?.person_id ?? null,
    recorded_at: new Date().toISOString(),
    recorded_by: recordedBy,
  }
}

/** An active person, or 400 (for the people the committee names on the close screen). */
export async function requirePerson(id: unknown, what: string): Promise<{ id: string; name: string }> {
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    throw createError({ statusCode: 400, message: `${what} must be a person id` })
  }
  const sql = useDatabase()
  const rows = (await sql`SELECT id, name FROM persons WHERE id = ${id} AND status = 'active'`) as any[]
  if (!rows[0]) throw createError({ statusCode: 400, message: `${what} is not an active person` })
  return rows[0]
}

/** One deal_people row as the portal writes it (039: changed_by and source are free text). */
export function dealPeopleInsert(
  dealId: string,
  personId: string,
  role: string,
  byPersonId: string | null,
  source: string,
) {
  const sql = useDatabase()
  return sql`
    INSERT INTO deal_people (deal_id, person_id, role, changed_by, source)
    VALUES (${dealId}, ${personId}, ${role}, ${byPersonId ? `portal:${byPersonId}` : 'portal'}, ${source})
  `
}

/**
 * Hand the follow-up over: close the current owner's row and open the new one, in
 * one transaction. The months each held follow from the dates.
 */
export async function setFollowUpOwner(dealId: string, personId: unknown, byPersonId: string) {
  const person = await requirePerson(personId, 'personId')
  const now = await dealPeopleNow(dealId)
  if (now.followUpOwner?.person_id === person.id) {
    throw createError({ statusCode: 409, message: `${person.name} already owns the follow-up` })
  }
  const sql = useDatabase()
  await sql.transaction([
    sql`
      UPDATE deal_people SET valid_to = NOW()
      WHERE deal_id = ${dealId} AND role = 'follow_up_owner' AND valid_to IS NULL
    `,
    dealPeopleInsert(dealId, person.id, 'follow_up_owner', byPersonId, 'Hovedbok on the case page'),
  ])
  return { followUpOwner: { id: person.id, name: person.name } }
}

function namesById(rows: { id: string; name: string }[]) {
  return new Map(rows.map((r) => [r.id, r.name]))
}

function equalShares(ids: string[], pct: number) {
  const each = ids.length ? Math.round((pct / ids.length) * 10000) / 10000 : 0
  return ids.map((id) => ({ personId: id, pct: each }))
}

/**
 * The Hovedbok panel on the case page (committee only): one entry per closed
 * round with a ledger, the deal's drivers and follow-up owner now, the owner
 * history with months held, and the people the committee can pick from.
 * `applies` is false for a deal no incentive model touches (CTORI1-3 only).
 */
export async function hovedbok(dealId: string) {
  const sql = useDatabase()
  const [rounds, history, people, modelRows, splits] = await Promise.all([
    sql`
      SELECT r.id, r.closed_at, r.result, r.ledger, ng.name AS group_name
      FROM deal_rounds r JOIN network_groups ng ON ng.id = r.group_id
      WHERE r.deal_id = ${dealId} AND r.ledger IS NOT NULL
      ORDER BY r.closed_at DESC
    ` as Promise<any[]>,
    sql`
      SELECT person_id, person_name, valid_from, valid_to, current, months_held, share_of_follow_up
      FROM deal_follow_up_months WHERE deal_id = ${dealId}
      ORDER BY valid_from
    ` as Promise<any[]>,
    dealPeopleNow(dealId),
    sql`
      SELECT DISTINCT im.* FROM deal_rounds r
      JOIN network_groups g ON g.id = r.group_id
      JOIN incentive_models im ON im.model = g.incentive_model
      WHERE r.deal_id = ${dealId}
    ` as Promise<any[]>,
    sql`
      SELECT DISTINCT ON (s.round_id, s.part) s.round_id, s.part, s.shares, s.reason, s.changed_by, s.created_at
      FROM deal_ledger_splits s JOIN deal_rounds r ON r.id = s.round_id
      WHERE r.deal_id = ${dealId}
      ORDER BY s.round_id, s.part, s.created_at DESC
    ` as Promise<any[]>,
  ])
  const applies = modelRows.length > 0 || history.length > 0
  if (!applies) return { applies: false as const }

  const ids = new Set<string>()
  for (const r of rounds) {
    for (const c of r.ledger.committee) ids.add(c)
    if (r.ledger.recorded_by) ids.add(r.ledger.recorded_by)
    for (const d of r.ledger.drivers) ids.add(d.person_id)
    if (r.ledger.follow_up_owner) ids.add(r.ledger.follow_up_owner)
  }
  for (const s of splits) for (const x of s.shares) ids.add(x.person_id)
  const named = ids.size
    ? namesById((await sql`SELECT id, name FROM persons WHERE id = ANY(${[...ids]})`) as any[])
    : new Map<string, string>()
  const name = (id: string) => named.get(id) ?? '?'
  const withNames = (xs: { personId: string; pct: number }[]) => xs.map((x) => ({ ...x, name: name(x.personId) }))

  const followUpDefault = history.map((h) => ({ personId: h.person_id, share: Number(h.share_of_follow_up ?? 0) }))

  return {
    applies: true as const,
    model: modelRows[0] ? modelOut(modelRows[0]) : null,
    rounds: rounds.map((r) => {
      const l = r.ledger
      const split = (part: string) => splits.find((s) => s.round_id === r.id && s.part === part)
      const shares = (part: 'committee' | 'drivers' | 'follow_up', fallback: { personId: string; pct: number }[]) => {
        const s = split(part)
        return s
          ? {
              shares: withNames(s.shares.map((x: any) => ({ personId: x.person_id, pct: Number(x.pct) }))),
              adjusted: { reason: s.reason, changedBy: s.changed_by, at: s.created_at },
            }
          : { shares: withNames(fallback), adjusted: null }
      }
      return {
        id: r.id,
        group: r.group_name,
        closedAt: r.closed_at,
        result: r.result,
        model: l.model,
        decision: l.decision,
        pct: { total: l.pct.total, followUp: l.pct.follow_up, committee: l.pct.committee, drivers: l.pct.drivers },
        recordedAt: l.recorded_at,
        recordedBy: l.recorded_by ? name(l.recorded_by) : null,
        drivers: l.drivers.map((d: any) => ({ personId: d.person_id, role: d.role, name: name(d.person_id) })),
        followUpOwnerAtClose: l.follow_up_owner ? { personId: l.follow_up_owner, name: name(l.follow_up_owner) } : null,
        committee: shares('committee', equalShares(l.committee, l.pct.committee)),
        driverShares: shares(
          'drivers',
          equalShares(
            l.drivers.map((d: any) => d.person_id),
            l.pct.drivers,
          ),
        ),
        // Default: by months held, from the owner history (the share moves while someone holds it).
        followUp: shares(
          'follow_up',
          followUpDefault.map((f) => ({
            personId: f.personId,
            pct: Math.round(f.share * l.pct.follow_up * 10000) / 10000,
          })),
        ),
      }
    }),
    drivers: people.drivers.map((d) => ({ personId: d.person_id, role: d.role, name: d.name })),
    followUp: {
      current: people.followUpOwner
        ? {
            personId: people.followUpOwner.person_id,
            name: people.followUpOwner.name,
            since: people.followUpOwner.since,
          }
        : null,
      history: history.map((h) => ({
        personId: h.person_id,
        name: h.person_name,
        validFrom: h.valid_from,
        validTo: h.valid_to,
        current: h.current,
        monthsHeld: Number(h.months_held),
        share: Number(h.share_of_follow_up ?? 0),
      })),
    },
    candidates: await ledgerCandidates(),
  }
}

/** Who the committee can name as lead or follow-up owner: the committee and the board. */
export async function ledgerCandidates(): Promise<{ id: string; name: string }[]> {
  const sql = useDatabase()
  return (await sql`
    SELECT DISTINCT p.id, p.name
    FROM memberships m
    JOIN network_groups ng ON ng.id = m.group_id
    JOIN persons p ON p.id = m.person_id
    WHERE ng.slug IN (${COMMITTEE_GROUP}, 'styret') AND p.status = 'active'
    ORDER BY p.name
  `) as any[]
}
