import { Resend } from 'resend'

/**
 * Every mail the portal sends goes through here: the magic link, the new-passkey
 * notice, and the deal mails (question answered, question routed to the owner).
 * Resend, from noreply@ctoroundtable.no. Callers build the body with
 * mailLayout() and escape every value they put in it.
 *
 * Without RESEND_API_KEY a local run logs the mail instead of sending it; on
 * Cloud Run (K_SERVICE set) a missing key is an error.
 */

export const MAIL_FROM = 'CTO Roundtable <noreply@ctoroundtable.no>'

export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const P = 'color: #555; font-size: 16px;'

/** The house mail: heading, then paragraphs. `paragraphs` are HTML, already escaped. */
export function mailLayout(paragraphs: string[]): string {
  return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #111; margin-bottom: 8px;">CTO Roundtable</h2>
        ${paragraphs.join('\n        ')}
      </div>
    `
}

/** A paragraph in the house style. `html` is already escaped. */
export function mailParagraph(html: string, style = P): string {
  return `<p style="${style}">${html}</p>`
}

/** The house button. */
export function mailButton(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display: inline-block; background: #111; color: #fff; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; margin: 16px 0;">${escapeHtml(label)}</a>`
}

export interface MailAttachment {
  filename: string
  content: Buffer
}

/** Send one mail. Returns the provider id (null when only logged locally). */
export async function sendMail(mail: {
  to: string
  subject: string
  html: string
  attachments?: MailAttachment[]
}): Promise<{ id: string | null }> {
  const config = useRuntimeConfig()
  if (!config.resendApiKey) {
    if (process.env.K_SERVICE) throw new Error('RESEND_API_KEY is not set')
    console.log('[mail] not sent (no RESEND_API_KEY)', { to: mail.to, subject: mail.subject })
    return { id: null }
  }
  const resend = new Resend(config.resendApiKey)
  const { data, error } = await resend.emails.send({
    from: MAIL_FROM,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    attachments: mail.attachments,
  })
  if (error) throw new Error(`Resend refused the mail: ${error.message}`)
  return { id: data?.id ?? null }
}

/** A person's name and primary email, or null when they have no email. */
export async function personMailTarget(personId: string): Promise<{ name: string; email: string } | null> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT p.name, ci.value AS email
    FROM persons p
    JOIN contact_infos ci ON ci.person_id = p.id AND ci.type = 'email'
    WHERE p.id = ${personId}
    ORDER BY ci.is_primary DESC
    LIMIT 1
  `
  const r: any = rows[0]
  return r?.email ? { name: r.name, email: r.email } : null
}

/** The first name, escaped, for "Hi Kari,". */
export function firstNameHtml(name: string): string {
  return escapeHtml(String(name).split(' ')[0] ?? '')
}
