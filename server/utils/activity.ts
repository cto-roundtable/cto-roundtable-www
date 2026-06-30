import type { NeonQueryFunction } from '@neondatabase/serverless'

type Sql = NeonQueryFunction<false, false>

/**
 * One engagement signal headed for the activity_events table.
 *
 * `resolveBy` says which contact_infos.type maps actor/target external ids to a
 * member: 'slack' for Slack user ids (Uxxxx), 'email' for Luma guests. When the
 * external id is not a member, person_id stays NULL (correct: not everyone in a
 * Slack channel is a member). `null` skips resolution entirely.
 */
export interface ActivitySignal {
  source: string
  eventType: string
  actorExternalId?: string | null
  targetExternalId?: string | null
  channelId?: string | null
  channelName?: string | null
  occurredAt: Date | string
  dedupKey: string
  payload?: Record<string, unknown>
  resolveBy?: 'slack' | 'email' | null
}

/** Slack message/event ts ("1700000000.000100") -> Date. */
export function slackTsToDate(ts: string): Date {
  return new Date(Number(ts.split('.')[0]) * 1000)
}

/**
 * Append one signal to activity_events. Idempotent: ON CONFLICT (dedup_key) DO
 * NOTHING, so Slack retries and backfill re-runs never double-count.
 *
 * person resolution happens inline (no extra round trip, no hot-path Slack API):
 *   resolveBy='slack' -> slack_users dimension keyed by Slack user id
 *   resolveBy='email' -> contact_infos email (Luma guests)
 *   resolveBy=null     -> leave NULL
 * A Slack user not yet in slack_users resolves NULL and is backfilled on the
 * next slack_users sync. (contact_infos.type='slack' is NOT used: it mixes user
 * ids, DM channel ids and handles, so it does not reliably match event user ids.)
 */
export async function recordActivity(sql: Sql, sig: ActivitySignal): Promise<void> {
  const resolveType = sig.resolveBy ?? null
  const occurredAt = typeof sig.occurredAt === 'string' ? sig.occurredAt : sig.occurredAt.toISOString()
  const payload = JSON.stringify(sig.payload ?? {})

  await sql`
    INSERT INTO activity_events (
      source, event_type,
      actor_external_id, person_id,
      target_external_id, target_person_id,
      channel_id, channel_name,
      occurred_at, dedup_key, payload
    ) VALUES (
      ${sig.source}, ${sig.eventType},
      ${sig.actorExternalId ?? null},
      COALESCE(
        (SELECT person_id FROM slack_users
           WHERE ${resolveType} = 'slack' AND slack_user_id = ${sig.actorExternalId ?? null} LIMIT 1),
        (SELECT person_id FROM contact_infos
           WHERE ${resolveType} = 'email' AND type = 'email'
             AND lower(value) = lower(${sig.actorExternalId ?? null}) LIMIT 1)
      ),
      ${sig.targetExternalId ?? null},
      COALESCE(
        (SELECT person_id FROM slack_users
           WHERE ${resolveType} = 'slack' AND slack_user_id = ${sig.targetExternalId ?? null} LIMIT 1),
        (SELECT person_id FROM contact_infos
           WHERE ${resolveType} = 'email' AND type = 'email'
             AND lower(value) = lower(${sig.targetExternalId ?? null}) LIMIT 1)
      ),
      ${sig.channelId ?? null}, ${sig.channelName ?? null},
      ${occurredAt}, ${sig.dedupKey}, ${payload}::jsonb
    )
    ON CONFLICT (dedup_key) DO NOTHING
  `
}

/** Validation result for the protected agent ingest path. */
export type SignalValidation = { ok: true; signal: ActivitySignal } | { ok: false; error: string }

/**
 * Validate + normalize a generic signal posted to /api/ingest/event by an agent.
 * Requires source, eventType, occurredAt and dedupKey. resolveBy defaults from
 * source (luma -> email, slack -> slack) unless explicitly given.
 */
export function validateSignal(input: unknown): SignalValidation {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'not an object' }
  }
  const it = input as Record<string, unknown>
  const source = typeof it.source === 'string' ? it.source.trim() : ''
  const eventType = typeof it.eventType === 'string' ? it.eventType.trim() : ''
  const dedupKey = typeof it.dedupKey === 'string' ? it.dedupKey.trim() : ''
  const occurredRaw = it.occurredAt

  if (!source) return { ok: false, error: 'source required' }
  if (!eventType) return { ok: false, error: 'eventType required' }
  if (!dedupKey) return { ok: false, error: 'dedupKey required' }
  if (typeof occurredRaw !== 'string' && !(occurredRaw instanceof Date)) {
    return { ok: false, error: 'occurredAt required (ISO string)' }
  }
  const occurredAt = occurredRaw instanceof Date ? occurredRaw : new Date(occurredRaw)
  if (Number.isNaN(occurredAt.getTime())) {
    return { ok: false, error: 'occurredAt is not a valid date' }
  }

  let resolveBy: ActivitySignal['resolveBy']
  if (it.resolveBy === 'slack' || it.resolveBy === 'email' || it.resolveBy === null) {
    resolveBy = it.resolveBy
  } else {
    resolveBy = source === 'luma' ? 'email' : source === 'slack' ? 'slack' : null
  }

  const payload = typeof it.payload === 'object' && it.payload !== null ? (it.payload as Record<string, unknown>) : {}

  return {
    ok: true,
    signal: {
      source,
      eventType,
      actorExternalId: typeof it.actorExternalId === 'string' ? it.actorExternalId : null,
      targetExternalId: typeof it.targetExternalId === 'string' ? it.targetExternalId : null,
      channelId: typeof it.channelId === 'string' ? it.channelId : null,
      channelName: typeof it.channelName === 'string' ? it.channelName : null,
      occurredAt: occurredAt.toISOString(),
      dedupKey,
      payload,
      resolveBy,
    },
  }
}
