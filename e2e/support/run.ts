import { readFileSync } from 'node:fs'
import { e2eEnv } from './guard'
import type { Persona } from './personas'
import { sessionCookies } from './session'

/** Everything a run writes (gitignored): the resolved personas, the access matrix, the per-persona views. */
export const RUN_DIR = `${import.meta.dirname}/../.run`

export function personas(): Persona[] {
  return JSON.parse(readFileSync(`${RUN_DIR}/personas.json`, 'utf8'))
}

export function persona(key: string): Persona {
  const p = personas().find((x) => x.key === key)
  if (!p) throw new Error(`e2e: persona ${key} was not resolved (global setup)`)
  return p
}

export function cookiesFor(p: Persona) {
  const env = e2eEnv()
  return sessionCookies(p.personId, p.name, env.sessionSecret, env.baseUrl)
}

export function cookieHeader(p: Persona) {
  return cookiesFor(p)
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')
}

export const has = (p: Persona, slug: string) => p.groups.includes(slug)
// Since #74 the committee is the only role with extra case access; the board sees cases as a member.
export const isCommittee = (p: Persona) => has(p, 'current-komite')

/**
 * The case slugs a GET /api/member/deals overview offers to OPEN, across its sections. A
 * declined company the viewer may not open is listed with canOpen: false and no link.
 */
export function overviewSlugs(body: Record<string, unknown>): string[] {
  const sections = ['decided', 'active', 'inactive', 'invested', 'declined']
  return sections.flatMap((k) =>
    ((body[k] as { slug: string; canOpen?: boolean }[] | null) ?? [])
      .filter((c) => c.canOpen !== false)
      .map((c) => c.slug),
  )
}

export const isInvestor = (p: Persona) => p.groups.some((g) => g.startsWith('invest-'))
