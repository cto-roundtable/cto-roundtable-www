export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters')
  }
  // In production the magic-link origin must come from config, not the request
  // Host header. Warn (don't hard-fail) so a missing var never takes the site
  // down; the request-origin fallback still works, just less safely.
  if (process.env.NODE_ENV === 'production' && !config.siteUrl) {
    console.warn(
      '[config] NUXT_SITE_URL is not set. Magic-link URLs will fall back to the request Host header; set NUXT_SITE_URL to the canonical origin.',
    )
  }
})
