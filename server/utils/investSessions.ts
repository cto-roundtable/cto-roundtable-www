// "Jeg vil være med på et nettmøte om CTORI4": a member signs up for an online info
// session about an offering. Not an answer to the offering: someone who has not
// answered, or said yes, maybe or no, can sign up all the same, and nothing here
// reads or writes invest_subscriptions except to show the committee whether the
// person also answered. Table: invest_session_signups (ctoroundtable-hq migration 049,
// which says why it is a table of its own and not a column on invest_subscriptions).
// Snorre 2026-11-11, ctori-4 item session-interest.
//
// Rules:
// - Who may sign up: whoever sees the offering (requireVisibleOffering in invest.ts),
//   while it is open to members (interest, committing) or, for the committee, a draft.
// - A member reads and changes only their own row; undo deletes it.
// - The investment committee (current-komite, never styret) reads every row with name
//   and e-mail, to invite. No times are stored or shown: the committee picks the time.

/** The longest note a member can leave ("når passer best"). The database CHECKs the same. */
export const SESSION_NOTE_MAX = 280

const SESSION_OPEN: string[] = ['interest', 'committing']

/** Whether sign-ups can be changed now: open to members, or a draft the committee previews. */
export function sessionSignupOpen(status: string, preview: boolean): boolean {
  return SESSION_OPEN.includes(status) || (preview && status === 'draft')
}

/** The note from a request body: trimmed, null when empty, an error key when too long. */
export function parseSessionNote(body: unknown): { note: string | null } | { error: string } {
  const raw = (body as { note?: unknown } | null)?.note
  if (raw === null || raw === undefined) return { note: null }
  if (typeof raw !== 'string') return { error: 'invest.session.errors.note' }
  const note = raw.trim()
  if (!note) return { note: null }
  if ([...note].length > SESSION_NOTE_MAX) return { error: 'invest.session.errors.tooLong' }
  return { note }
}

export interface MySessionSignup {
  note: string | null
  signedUpAt: string
  updatedAt: string
}

export async function getMySessionSignup(offeringId: string, personId: string): Promise<MySessionSignup | null> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT note, created_at, updated_at FROM invest_session_signups
    WHERE offering_id = ${offeringId} AND person_id = ${personId}
  `) as any[]
  const r = rows[0]
  return r ? { note: r.note, signedUpAt: r.created_at, updatedAt: r.updated_at } : null
}

function requireOpen(status: string, preview: boolean) {
  if (!sessionSignupOpen(status, preview))
    throw createError({ statusCode: 409, message: 'invest.session.errors.closed' })
}

/** Sign up, or change the note on an existing sign-up. */
export async function saveSessionSignup(
  offering: { id: string; status: string },
  personId: string,
  note: string | null,
  preview: boolean,
) {
  requireOpen(offering.status, preview)
  const sql = useDatabase()
  await sql.transaction([
    setActor(sql, `portal:${personId}`),
    sql`
      INSERT INTO invest_session_signups (offering_id, person_id, note, source)
      VALUES (${offering.id}, ${personId}, ${note}, 'portal')
      ON CONFLICT (offering_id, person_id) DO UPDATE SET note = EXCLUDED.note
    `,
  ])
}

/** Undo: the row goes (audit_log keeps it). Not signed up is not an error. */
export async function removeSessionSignup(
  offering: { id: string; status: string },
  personId: string,
  preview: boolean,
) {
  requireOpen(offering.status, preview)
  const sql = useDatabase()
  await sql.transaction([
    setActor(sql, `portal:${personId}`),
    sql`DELETE FROM invest_session_signups WHERE offering_id = ${offering.id} AND person_id = ${personId}`,
  ])
}

export type InterestAnswerShown = 'yes' | 'maybe' | 'no' | 'committed' | null

export interface SessionSignupRow {
  name: string
  email: string | null
  signedUpAt: string
  note: string | null
  /** What they answered on the offering itself: null = not answered. */
  answer: InterestAnswerShown
}

/** Every sign-up with name and e-mail, oldest first. Committee only: the caller checks. */
export async function listSessionSignups(offeringId: string): Promise<SessionSignupRow[]> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT p.name,
           (SELECT ci.value FROM contact_infos ci
             WHERE ci.person_id = p.id AND ci.type = 'email'
             ORDER BY ci.is_primary DESC LIMIT 1) AS email,
           ss.created_at, ss.note, s.phase, s.interest_level
    FROM invest_session_signups ss
    JOIN persons p ON p.id = ss.person_id
    LEFT JOIN invest_subscriptions s ON s.offering_id = ss.offering_id AND s.person_id = ss.person_id
    WHERE ss.offering_id = ${offeringId}
    ORDER BY ss.created_at, p.name
  `) as any[]
  return rows.map((r) => ({
    name: r.name,
    email: r.email ?? null,
    signedUpAt: r.created_at,
    note: r.note,
    answer: answerShown(r.phase, r.interest_level),
  }))
}

/** The interest answer as the committee list shows it. Past interest (committed …) is one label. */
export function answerShown(phase: string | null, level: string | null): InterestAnswerShown {
  if (!phase) return null
  if (phase === 'declined') return 'no'
  if (phase === 'interest') return level === 'maybe' ? 'maybe' : 'yes'
  return 'committed'
}
