import { randomBytes } from 'node:crypto'
import { Resend } from 'resend'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = (body?.email || '').trim().toLowerCase()

  if (!email) {
    throw createError({ statusCode: 400, message: 'Email is required' })
  }

  const sql = useDatabase()
  const config = useRuntimeConfig()

  // Check if email belongs to an active member of cto-roundtable
  const members = await sql`
    SELECT p.id, p.name
    FROM contact_infos ci
    JOIN persons p ON ci.person_id = p.id
    JOIN memberships m ON p.id = m.person_id
    JOIN network_groups ng ON m.group_id = ng.id
    WHERE ci.type = 'email'
      AND LOWER(ci.value) = ${email}
      AND p.status = 'active'
      AND ng.slug = 'cto-roundtable'
    LIMIT 1
  `

  // Always return same response to prevent user enumeration
  if (members.length === 0) {
    return { ok: true }
  }

  const member = members[0]!

  // Rate limit: max 3 tokens per email per hour
  const recentTokens = await sql`
    SELECT COUNT(*) as cnt
    FROM auth_tokens
    WHERE person_id = ${member.id}
      AND created_at > now() - interval '1 hour'
  `
  if (Number(recentTokens[0]?.cnt) >= 3) {
    return { ok: true }
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

  // Send magic link email
  const baseUrl = getRequestURL(event).origin
  const magicLink = `${baseUrl}/api/auth/verify?token=${token}`

  const resend = new Resend(config.resendApiKey)
  await resend.emails.send({
    from: 'CTO Roundtable <noreply@ctoroundtable.no>',
    to: email,
    subject: 'Sign in to CTO Roundtable',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #111; margin-bottom: 8px;">CTO Roundtable</h2>
        <p style="color: #555; font-size: 16px;">Hi ${member.name.split(' ')[0]},</p>
        <p style="color: #555; font-size: 16px;">Click the button below to sign in to the member portal.</p>
        <a href="${magicLink}" style="display: inline-block; background: #111; color: #fff; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; margin: 16px 0;">
          Sign in
        </a>
        <p style="color: #999; font-size: 13px; margin-top: 24px;">This link expires in 15 minutes and can only be used once.</p>
        <p style="color: #999; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  })

  return { ok: true }
})
