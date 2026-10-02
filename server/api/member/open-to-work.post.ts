// POST /api/member/open-to-work
// Opt in, or edit an existing open flag. Only ever touches the caller's own row.
interface OpenToWorkBody {
  lookingFor?: string | null
  availability?: string | null
  note?: string | null
}

function clean(s: string | null | undefined, max: number): string | null {
  if (s === null || s === undefined) return null
  const trimmed = String(s).trim().slice(0, max)
  return trimmed.length ? trimmed : null
}

export default defineEventHandler(async (event) => {
  const session = event.context.session
  const body = (await readBody<OpenToWorkBody>(event)) ?? {}
  const sql = useDatabase()

  const lookingFor = clean(body.lookingFor, 200)
  const availability = clean(body.availability, 200)
  const note = clean(body.note, 2000)

  // One open row per person (idx_open_to_work_one_open_per_person), so a second
  // save edits the flag instead of failing.
  const rows = await sql`
    INSERT INTO open_to_work (person_id, looking_for, availability, note, status)
    VALUES (${session.personId}, ${lookingFor}, ${availability}, ${note}, 'open')
    ON CONFLICT (person_id) WHERE status = 'open'
    DO UPDATE SET looking_for  = EXCLUDED.looking_for,
                  availability = EXCLUDED.availability,
                  note         = EXCLUDED.note,
                  updated_at   = NOW()
    RETURNING id
  `
  return { ok: true, id: rows[0]!.id }
})
