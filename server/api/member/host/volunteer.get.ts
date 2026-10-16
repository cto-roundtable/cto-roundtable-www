export default defineEventHandler(async (event) => {
  const session = event.context.session
  const sql = useDatabase()

  const rows = await sql`
    SELECT el.id, el.location, el.participant_limit, el.sponsor_food, el.sponsor_drinks,
           el.preferred_timeframe, el.notes, el.created_at, ng.slug
    FROM event_locations el
    LEFT JOIN network_groups ng ON ng.id = el.group_id
    WHERE el.registered_by = ${session.personId}
      AND el.status = 'open'
    ORDER BY el.created_at DESC
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
    // NULL group = an offer from before chapters (migration 025): Norwegian.
    chapter: chapterOfSlug(offer.slug) ?? 'no',
  }
})
