import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string comparison. Returns false on length mismatch instead of
 * leaking it through early return timing.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Verify a Slack request signature (v0 scheme).
 * See https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * basestring = `v0:${timestamp}:${rawBody}`, HMAC-SHA256 with the signing
 * secret, hex-encoded, prefixed with `v0=`. Rejects requests older than 5
 * minutes to blunt replay attacks.
 */
export function verifySlackSignature(opts: {
  signingSecret: string
  signature: string | undefined
  timestamp: string | undefined
  rawBody: string
}): boolean {
  const { signingSecret, signature, timestamp, rawBody } = opts
  if (!signingSecret || !signature || !timestamp) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(Date.now() / 1000 - ts) > 60 * 5) return false

  const base = `v0:${timestamp}:${rawBody}`
  const digest = createHmac('sha256', signingSecret).update(base).digest('hex')
  return timingSafeEqualStr(`v0=${digest}`, signature)
}
