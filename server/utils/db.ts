import { neon } from '@neondatabase/serverless'

export function useDatabase() {
  const config = useRuntimeConfig()
  return neon(config.databaseUrl)
}

/**
 * The first statement of a write transaction: names the writer for Neon's audit
 * triggers (audit_log.changed_by, and deal_people.changed_by when driver_person_id
 * moves; ctoroundtable-hq migration 046 and security.md "Audit trail"). `true` keeps
 * it to this transaction, so it only works inside `sql.transaction([...])`.
 */
export function setActor(sql: ReturnType<typeof neon>, who: string) {
  return sql`SELECT set_config('app.changed_by', ${who}, true)`
}
