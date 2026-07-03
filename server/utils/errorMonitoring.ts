/**
 * Server-side error capture into PostHog error tracking. Shares the public
 * PostHog token (already on Cloud Run as NUXT_PUBLIC_POSTHOG_TOKEN), so no
 * extra secrets. Errors show up as $exception events, same project as the
 * client-side ones, and feed the Slack alert destination.
 *
 * flushAt 1 / flushInterval 0: errors are rare and Cloud Run can scale to
 * zero between requests, so send each one immediately instead of batching.
 */
import { PostHog } from 'posthog-node'

let client: PostHog | null | undefined

function getClient(): PostHog | null {
  if (client !== undefined) return client
  const config = useRuntimeConfig()
  const token = config.public.posthogToken as string
  if (!token) {
    client = null
    return client
  }
  client = new PostHog(token, {
    host: (config.public.posthogHost as string) || 'https://eu.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  })
  return client
}

export function captureServerException(error: unknown, context: Record<string, unknown> = {}) {
  const ph = getClient()
  if (!ph) return
  try {
    ph.captureException(error instanceof Error ? error : new Error(String(error)), 'www-server', context)
  } catch (captureErr) {
    console.error('[error-monitoring] failed to capture exception', captureErr)
  }
}

export async function shutdownErrorMonitoring() {
  if (client) await client.shutdown().catch(() => {})
}
