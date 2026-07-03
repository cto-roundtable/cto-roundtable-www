/**
 * Captures unhandled server errors to PostHog error tracking. Expected 4xx
 * responses (auth failures, bad Slack signatures, validation) are not errors
 * worth paging on; only 5xx and non-HTTP throws are captured.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    if (statusCode < 500) return
    captureServerException(error, {
      route: event?.path,
      method: event?.method,
      status_code: statusCode,
    })
  })

  nitroApp.hooks.hook('close', async () => {
    await shutdownErrorMonitoring()
  })
})
