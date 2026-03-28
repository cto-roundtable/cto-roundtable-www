import { neon } from '@neondatabase/serverless'

export function useDatabase() {
  const config = useRuntimeConfig()
  return neon(config.databaseUrl)
}
