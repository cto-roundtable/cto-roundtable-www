/**
 * Slack Events API ingest. Receives `message` and `reaction_added` events and
 * appends them to activity_events. Replaces the dead Riff/Databutton webhook.
 *
 * Hot-path discipline: verify signature, write ONE row, ack. No synchronous
 * Slack API calls (reaction_added carries item_user, so we never look up the
 * message author), so the 3s Slack ack budget is never at risk. Names are
 * resolved later from the slack_users dimension.
 */

// Edits, deletes, joins and other system messages: not engagement signals.
const SKIP_SUBTYPES = new Set([
  'bot_message',
  'message_changed',
  'message_deleted',
  'channel_join',
  'channel_leave',
  'channel_topic',
  'channel_purpose',
  'channel_name',
  'channel_archive',
  'channel_unarchive',
])

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const rawBody = (await readRawBody(event, 'utf8')) || ''

  if (
    !verifySlackSignature({
      signingSecret: (config.slackSigningSecret || '').trim(),
      signature: getHeader(event, 'x-slack-signature'),
      timestamp: getHeader(event, 'x-slack-request-timestamp'),
      rawBody,
    })
  ) {
    throw createError({ statusCode: 401, message: 'Invalid Slack signature' })
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return { ok: true }
  }

  // URL verification handshake during Event Subscription setup.
  if (body.type === 'url_verification') {
    return { challenge: body.challenge }
  }
  if (body.type !== 'event_callback' || !body.event) {
    return { ok: true }
  }

  const ev = body.event
  const eventId: string | undefined = body.event_id
  const sql = useDatabase()

  try {
    if (ev.type === 'message') {
      if (ev.subtype && SKIP_SUBTYPES.has(ev.subtype)) return { ok: true }
      if (!ev.user || ev.bot_id) return { ok: true }

      const text: string = ev.text || ''
      const ts: string = ev.ts
      await recordActivity(sql, {
        source: 'slack',
        eventType: 'message',
        actorExternalId: ev.user,
        channelId: ev.channel,
        occurredAt: slackTsToDate(ts),
        dedupKey: `slack:message:${ev.channel}:${ts}`,
        resolveBy: 'slack',
        payload: {
          message_length: text.length,
          has_link: text.includes('http://') || text.includes('https://'),
          has_attachment: (ev.files?.length || 0) > 0 || (ev.attachments?.length || 0) > 0,
          mention_count: (text.match(/<@/g) || []).length,
          thread_ts: ev.thread_ts ?? null,
          is_reply: !!ev.thread_ts && ev.thread_ts !== ts,
          event_id: eventId,
        },
      })
    } else if (ev.type === 'reaction_added') {
      const messageTs: string | undefined = ev.item?.ts
      await recordActivity(sql, {
        source: 'slack',
        eventType: 'reaction_added',
        actorExternalId: ev.user,
        targetExternalId: ev.item_user ?? null,
        channelId: ev.item?.channel ?? null,
        occurredAt: slackTsToDate(ev.event_ts),
        dedupKey: `slack:reaction:${ev.user}:${ev.reaction}:${messageTs}`,
        resolveBy: 'slack',
        payload: { emoji: ev.reaction, message_ts: messageTs, event_id: eventId },
      })
    }
  } catch (err) {
    // Never trigger a Slack retry storm over a DB hiccup. Log and ack;
    // dedup_key makes a later redelivery safe to re-record.
    console.error('[ingest/slack] failed to record event', err)
  }

  return { ok: true }
})
