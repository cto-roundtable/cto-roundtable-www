import type { H3Event } from 'h3'

/**
 * The audit log for /api/admin/** and the device flow /api/auth/device/**
 * (table api_audit_log,
 * ctoroundtable-hq/infrastructure/db/migrations/026_api_tokens_and_audit.sql).
 *
 * One row per request, refusals included, written by defineAdminRoute or
 * defineDeviceRoute once the status is known. The table is append-only (a trigger refuses UPDATE, DELETE
 * and TRUNCATE), so this file only ever INSERTs.
 *
 * What goes in `summary` is small structured context a person reading the log
 * needs: a refusal reason, a count, a dry-run flag. Never a response body, never
 * a member's free-text answer, never the bearer token.
 */

export interface AuditEntry {
  method: string
  path: string
  tokenId: string | null
  ownerPersonId: string | null
  scope: string | null
  targetType: string | null
  targetId: string | null
  status: number
  summary: Record<string, string | number | boolean | null>
}

const MAX_PATH = 500

export function beginAudit(event: H3Event): AuditEntry {
  return {
    method: event.method,
    path: getRequestURL(event).pathname.slice(0, MAX_PATH),
    tokenId: null,
    ownerPersonId: null,
    scope: null,
    targetType: null,
    targetId: null,
    status: 500,
    summary: {},
  }
}

/**
 * Write the row. Never throws: a failed audit write must not turn into a
 * different response than the one the caller already got, so it is logged and
 * captured as a server error instead, where it pages.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const sql = useDatabase()
    await sql`
      INSERT INTO api_audit_log
        (token_id, owner_person_id, method, path, scope, target_type, target_id, status, summary)
      VALUES
        (${entry.tokenId}, ${entry.ownerPersonId}, ${entry.method}, ${entry.path}, ${entry.scope},
         ${entry.targetType}, ${entry.targetId}, ${entry.status}, ${JSON.stringify(entry.summary)}::jsonb)
    `
  } catch (err) {
    console.error('[audit] failed to write api_audit_log row', { method: entry.method, path: entry.path, err })
    captureServerException(err, { route: entry.path, method: entry.method, audit_status: entry.status })
  }
}
