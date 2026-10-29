import { createHmac } from 'node:crypto'

// The portal's session is two cookies: the JSON payload and its HMAC under
// SESSION_SECRET (server/utils/session.ts). With the preview server's secret we
// mint the same pair issueSession() would, so a persona is signed in without
// magic links or passkeys. The server still applies the live gate (getChapters)
// on every request, so a forged cookie for a non-member is refused like a real one.
export function sessionCookies(personId: string, name: string, secret: string, baseUrl: string) {
  const now = Date.now()
  const payload = JSON.stringify({ personId, name, iat: now, exp: now + 24 * 60 * 60 * 1000 })
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  const { hostname } = new URL(baseUrl)
  const base = { domain: hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' as const }
  return [
    // h3's setCookie URI-encodes the value and getCookie decodes it; the HMAC is over the raw JSON.
    { ...base, name: 'ctr_session', value: encodeURIComponent(payload) },
    { ...base, name: 'ctr_session_sig', value: sig },
  ]
}
