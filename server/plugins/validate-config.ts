export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters')
  }
})
