interface VolunteerBody {
  location?: string | null
  participantLimit?: number | null
  sponsorFood?: boolean
  sponsorDrinks?: boolean
  preferredTimeframe?: string | null
  notes?: string | null
}

function clean(s?: string | null): string | null {
  if (s === null || s === undefined) return null
  const trimmed = String(s).trim()
  return trimmed.length ? trimmed : null
}

export default defineEventHandler(async (event) => {
  const session = event.context.session
  const body = await readBody<VolunteerBody>(event)
  const sql = useDatabase()

  const location = clean(body.location)
  const preferredTimeframe = clean(body.preferredTimeframe)
  const notes = clean(body.notes)
  const participantLimit =
    typeof body.participantLimit === 'number' && body.participantLimit > 0 ? Math.floor(body.participantLimit) : null
  const sponsorFood = Boolean(body.sponsorFood)
  const sponsorDrinks = Boolean(body.sponsorDrinks)

  try {
    const rows = await sql`
      INSERT INTO event_locations (
        registered_by, location, participant_limit,
        sponsor_food, sponsor_drinks,
        preferred_timeframe, notes, status
      ) VALUES (
        ${session.personId},
        ${location},
        ${participantLimit},
        ${sponsorFood},
        ${sponsorDrinks},
        ${preferredTimeframe},
        ${notes},
        'open'
      )
      RETURNING id
    `
    return { ok: true, id: rows[0]!.id }
  } catch (err: any) {
    // Partial unique index idx_event_locations_one_open_per_person
    if (err?.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Du har allerede et åpent tilbud. Trekk det før du melder deg på nytt.',
      })
    }
    throw err
  }
})
