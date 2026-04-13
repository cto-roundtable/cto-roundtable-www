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
