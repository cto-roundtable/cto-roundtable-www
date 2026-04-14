export default defineEventHandler(async (event) => {
  const session = event.context.session
  const sql = useDatabase()

  const rows = await sql`
    SELECT id, location, participant_limit, sponsor_food, sponsor_drinks,
           preferred_timeframe, notes, created_at
    FROM event_locations
    WHERE registered_by = ${session.personId}
      AND status = 'open'
    ORDER BY created_at DESC
    LIMIT 1
  `

  const offer = rows[0]
  if (!offer) return null

  return {
    id: offer.id,
    location: offer.location,
    participantLimit: offer.participant_limit,
    sponsorFood: offer.sponsor_food,
    sponsorDrinks: offer.sponsor_drinks,
    preferredTimeframe: offer.preferred_timeframe,
    notes: offer.notes,
    createdAt: offer.created_at,
  }
})
