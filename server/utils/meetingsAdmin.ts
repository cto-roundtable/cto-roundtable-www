import type { H3Event } from 'h3'
import type { ApiCaller } from './apiTokens'
import type { AuditEntry } from './audit'

/**
 * The general meeting (årsmøte) through the admin API: /api/admin/meetings/**,
 * used by `ctr meetings`. Every route is a thin caller of generalMeetings.ts, like
 * the member routes under /api/member/meetings/**: the same functions, so the same
 * guards and the same meeting_events rows, with the token's owner as the viewer
 * (meetingViewerForOwner: an active `styret` member, checked on every request).
 * No scope: any valid token whose owner is in styret (`scope: null`), so the one
 * `ctr login` a board member already has works here; the board role decides
 * (Snorre, 2026-11-03). Committee, member and outsider owners get the 401.
 *
 * What the API does NOT do, on purpose: vote. No route casts a ballot, registers
 * one on someone's behalf, or checks the owner in; a secret ballot's choices are
 * no more readable here than in the portal. Attendance on a member's behalf is
 * the chair's existing action, with its required reason and its log row.
 *
 * Audit: target `general_meeting` + the meeting id, `summary.action`, and only
 * ids, enums and booleans besides (never a title, a reason or a note).
 */
export async function meetingCall(
  event: H3Event,
  caller: ApiCaller,
  audit: AuditEntry,
  action: string,
  bodyKeys: string[] | null = null,
) {
  const id = getRouterParam(event, 'id') ?? ''
  const itemId = getRouterParam(event, 'itemId')
  audit.targetType = 'general_meeting'
  audit.targetId = id || null
  audit.summary.action = action
  if (itemId) audit.summary.itemId = itemId
  const body = bodyKeys ? await adminBody(event, bodyKeys) : {}
  const v = await meetingViewerForOwner(caller.ownerPersonId)
  return { v, id, itemId, body }
}

/** A JSON object body with only `keys`: an unknown key is a 400, so a typo in `ctr` fails loudly. */
export async function adminBody(event: H3Event, keys: string[]): Promise<Record<string, unknown>> {
  const body = (await readBody(event).catch(() => null)) ?? {}
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, message: 'The body must be a JSON object' })
  }
  const extra = Object.keys(body).filter((k) => !keys.includes(k))
  if (extra.length) throw createError({ statusCode: 400, message: `Unknown keys: ${extra.join(', ')}` })
  return body as Record<string, unknown>
}
