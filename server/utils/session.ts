import { createHmac, timingSafeEqual } from 'node:crypto'

export function createSessionHmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export interface SessionData {
  personId: string
  name: string
  exp: number
}

export function verifySession(event: any): SessionData | null {
  const config = useRuntimeConfig()
  const session = getCookie(event, 'ctr_session')
  const sig = getCookie(event, 'ctr_session_sig')

  if (!session || !sig) return null

  // Verify HMAC (constant-time comparison to prevent timing attacks)
  const expected = createSessionHmac(session, config.sessionSecret)
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null

  try {
    const data: SessionData = JSON.parse(session)

    // Check expiry
    if (data.exp < Date.now()) return null

    return data
  } catch {
    return null
  }
}

const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 days, in seconds

/**
 * Sign the member in: set the session cookie and its HMAC cookie. Every way in
 * (magic link, passkey) ends here, so a session looks the same however it was
 * obtained. The caller must already have applied the login gate
 * (isPortalMember / findPortalMemberByEmail).
 */
export function issueSession(event: any, personId: string, name: string): void {
  const config = useRuntimeConfig()
  const session = JSON.stringify({
    personId,
    name,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  })
  const cookie = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE } as const
  setCookie(event, 'ctr_session', session, cookie)
  setCookie(event, 'ctr_session_sig', createSessionHmac(session, config.sessionSecret), cookie)
}
