// The one rule of this harness: it never touches production. It forges session
// cookies and creates synthetic people, so it may only ever run against a Neon
// branch and a portal that was started with the branch's own SESSION_SECRET.

// The production branch's endpoint (Neon project "CTO Roundtable",
// branch `production`). A DATABASE_URL naming it is refused, pooled or not.
const PROD_ENDPOINT = 'ep-flat-boat-al5nwhe2'
// A forged cookie only opens a server holding the same SESSION_SECRET, which
// production never shares; refusing the origin is belt and braces.
const PROD_ORIGINS = ['ctoroundtable.no']

export interface E2EEnv {
  databaseUrl: string
  sessionSecret: string
  baseUrl: string
}

export function e2eEnv(): E2EEnv {
  const databaseUrl = process.env.DATABASE_URL ?? ''
  const sessionSecret = process.env.SESSION_SECRET ?? ''
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3311'

  if (!databaseUrl) throw new Error('e2e: DATABASE_URL is not set (point it at a Neon branch, never production)')
  if (databaseUrl.includes(PROD_ENDPOINT)) {
    throw new Error('e2e: DATABASE_URL is the production branch. Make a branch: see e2e/README.md')
  }
  if (sessionSecret.length < 32) throw new Error("e2e: SESSION_SECRET must be the preview server's own (>= 32 chars)")
  const host = new URL(baseUrl).hostname
  if (PROD_ORIGINS.some((o) => host === o || host.endsWith(`.${o}`))) {
    throw new Error(`e2e: E2E_BASE_URL ${baseUrl} is production. Run against a preview server`)
  }
  return { databaseUrl, sessionSecret, baseUrl }
}
