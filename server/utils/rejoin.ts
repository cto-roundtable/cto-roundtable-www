// A pensjonist asks to become an active member again (Snorre, 2026-11-06). The FAQ
// promises it ("You can ask the board at any time to become an active member
// again"); this is the way to ask from inside the portal.
//
// The application is a join_request (pending, the chapter group they were in, their
// text in why_join), the same register the Sweden form writes and the styremøte prep
// reads, so it is on the board's agenda even if the mail is missed. Every active
// styret member gets a mail at once. The board decides; accepting is setting the
// person `active` again and the request `accepted`, by hand.
//
// The sender is signed in, so unlike the public form the address is theirs.

export const REJOIN_MIN = 20
export const REJOIN_MAX = 2000

const NOTE = 'Rejoin: a pensjonist applied in the member portal (signed in, so the address is theirs).'

export interface RejoinRequest {
  id: string
  createdAt: string
}

/** The person's open application, or null. Any pending join_request counts: one open case at a time. */
export async function pendingRejoin(personId: string): Promise<RejoinRequest | null> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT id, created_at FROM join_requests
    WHERE person_id = ${personId} AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `) as any[]
  return rows[0] ? { id: rows[0].id, createdAt: rows[0].created_at } : null
}

/**
 * Store the application, or null when one is already open (the NOT EXISTS makes a
 * double click one row). `group` is the chapter group they come back to.
 */
export async function createRejoin(personId: string, group: string, why: string): Promise<RejoinRequest | null> {
  const sql = useDatabase()
  const [, rows] = (await sql.transaction([
    setActor(sql, `portal:${personId}`),
    sql`
      INSERT INTO join_requests (person_id, group_id, why_join, source, internal_notes)
      SELECT ${personId}, g.id, ${why}, 'form', ${NOTE}
      FROM network_groups g
      WHERE g.slug = ${group}
        AND NOT EXISTS (SELECT 1 FROM join_requests WHERE person_id = ${personId} AND status = 'pending')
      RETURNING id, created_at
    `,
  ])) as [unknown, any[]]
  return rows[0] ? { id: rows[0].id, createdAt: rows[0].created_at } : null
}

/** Mail every active styret member about a new application. Returns how many got it. */
export async function notifyBoardOfRejoin(
  applicant: { id: string; name: string; email: string | null },
  why: string,
): Promise<number> {
  const sql = useDatabase()
  const board = (await sql`
    SELECT p.id FROM persons p
    JOIN memberships m ON m.person_id = p.id
    JOIN network_groups ng ON ng.id = m.group_id
    WHERE ng.slug = ${BOARD_GROUP} AND p.status = 'active'
    ORDER BY p.name
  `) as { id: string }[]
  const contact = applicant.email
    ? `<a href="mailto:${escapeHtml(applicant.email)}" style="color: #111;">${escapeHtml(applicant.email)}</a>`
    : 'ingen e-post registrert'
  let sent = 0
  for (const b of board) {
    const target = await personMailTarget(b.id)
    if (!target) continue
    try {
      await sendMail({
        to: target.email,
        subject: `${applicant.name} vil bli aktivt medlem igjen`,
        html: mailLayout([
          mailParagraph(`Hei ${firstNameHtml(target.name)},`),
          mailParagraph(
            `<strong>${escapeHtml(applicant.name)}</strong> er pensjonert og har søkt om å bli aktivt medlem igjen, fra medlemsportalen. Det er styret som avgjør.`,
          ),
          mailParagraph(`Hvorfor de vil tilbake:`),
          mailParagraph(
            escapeHtml(why).replace(/\n/g, '<br>'),
            'color: #111; font-size: 16px; border-left: 3px solid #ccc; padding-left: 12px;',
          ),
          mailParagraph(`Svar dem direkte: ${contact}`),
          mailParagraph(
            'Sier styret ja: sett personen til <code>active</code> og søknaden (join_requests) til <code>accepted</code>. Søknaden står også på listen til neste styremøte.',
            'color: #999; font-size: 13px; margin-top: 24px;',
          ),
        ]),
      })
      sent++
    } catch (err) {
      console.error('[rejoin] board mail failed', { boardMember: b.id, err })
    }
  }
  return sent
}
