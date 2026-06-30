/**
 * Protected agent-driven ingest. Lets trusted agents push engagement signals
 * (Luma attendance now, anything else later) into activity_events.
 *
 * Auth: `Authorization: Bearer <INGEST_API_KEY>`. Body is one signal, or an
 * array, or `{ events: [...] }`. Each item is validated independently; a bad
 * item is reported but does not fail the batch. Idempotent via dedupKey.
 *
 * Luma attendance shape (resolveBy defaults to 'email' for source 'luma'):
 *   { source: 'luma', eventType: 'event_attended',
 *     actorExternalId: 'guest@email.com', channelId: '<luma_event_id>',
 *     channelName: 'June Roundtable', occurredAt: '2026-06-25T16:00:00Z',
 *     dedupKey: 'luma:attended:<event_id>:guest@email.com',
 *     payload: { guest_name: '...', status: 'going' } }
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const auth = getHeader(event, 'authorization') || ''
  const token = (auth.startsWith('Bearer ') ? auth.slice(7) : '').trim()
  // trim the configured key: secrets stored with a trailing newline (e.g. via
  // `openssl rand | gcloud secrets create`) would otherwise never match.
  const expected = (config.ingestApiKey || '').trim()

  if (!expected || !token || !timingSafeEqualStr(token, expected)) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const body = await readBody(event)
  const items: unknown[] = Array.isArray(body) ? body : Array.isArray(body?.events) ? body.events : [body]

  const sql = useDatabase()
  let recorded = 0
  const errors: string[] = []

  for (const [i, item] of items.entries()) {
    const v = validateSignal(item)
    if (!v.ok) {
      errors.push(`#${i}: ${v.error}`)
      continue
    }
    try {
      await recordActivity(sql, v.signal)
      recorded++
    } catch (err) {
      console.error('[ingest/event] insert failed', err)
      errors.push(`#${i}: insert failed`)
    }
  }

  return { ok: errors.length === 0, recorded, total: items.length, errors }
})
