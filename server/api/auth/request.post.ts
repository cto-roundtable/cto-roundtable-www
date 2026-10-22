import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = (body?.email || '').trim().toLowerCase()

  if (!email) {
    throw createError({ statusCode: 400, message: 'Email is required' })
  }

  // The login gate (server/utils/membership.ts): active person in cto-roundtable.
  const member = await findPortalMemberByEmail(email)

  // Always return same response to prevent user enumeration. The member path's
  // database work and mail run AFTER we answer (not awaited), so a member and a
  // non-member get the same response in the same time: no timing oracle. The
  // instance stays warm (min-instances 1), so the work still completes.
  if (member) {
    sendMagicLink(event, member, email).catch((err) => console.error('[auth/request] magic link failed', err))
  }

  return { ok: true }
})

async function sendMagicLink(event: H3Event, member: { id: string; name: string }, email: string) {
  const sql = useDatabase()
  const config = useRuntimeConfig()

  // Rate limit: max 3 tokens per email per hour
  const recentTokens = await sql`
    SELECT COUNT(*) as cnt
    FROM auth_tokens
    WHERE person_id = ${member.id}
      AND created_at > now() - interval '1 hour'
  `
  if (Number(recentTokens[0]?.cnt) >= 3) {
    return
  }

  // Generate secure token
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

  await sql`
    INSERT INTO auth_tokens (person_id, token, expires_at)
    VALUES (${member.id}, ${token}, ${expiresAt.toISOString()})
  `

  // Clean up expired tokens (opportunistic)
  sql`DELETE FROM auth_tokens WHERE expires_at < now()`.catch(() => {})

  // Build the magic link from the server-configured canonical origin, never the
  // request Host header: getRequestURL trusts the incoming Host, so an attacker
  // could POST with a spoofed Host and have the (genuinely delivered) link point
  // at their domain to capture the token. config.siteUrl is set in production
  // (NUXT_SITE_URL); locally it is empty and we fall back to the request origin.
  const baseUrl = config.siteUrl || getRequestURL(event).origin
  const magicLink = `${baseUrl}/api/auth/verify?token=${token}`

  await sendMail({
    to: email,
    subject: 'Sign in to CTO Roundtable',
    html: mailLayout([
      mailParagraph(`Hi ${firstNameHtml(member.name)},`),
      mailParagraph('Click the button below to sign in to the member portal.'),
      mailButton(magicLink, 'Sign in'),
      mailParagraph(
        'This link expires in 15 minutes and can only be used once.',
        'color: #999; font-size: 13px; margin-top: 24px;',
      ),
      mailParagraph("If you didn't request this, you can safely ignore this email.", 'color: #999; font-size: 13px;'),
    ]),
  })
}
