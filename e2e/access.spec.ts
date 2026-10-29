import { mkdirSync, writeFileSync } from 'node:fs'
import { request as rawRequest } from 'node:http'
import { neon } from '@neondatabase/serverless'
import { type APIRequestContext, expect, request, test } from '@playwright/test'
import { e2eEnv } from './support/guard'
import { PERSONAS, type Persona } from './support/personas'
import { cookieHeader, has, isInvestor, isStaff, personas, RUN_DIR } from './support/run'

// Who can read what, asked of the API (the real gate: pages fetch client-side,
// so a hidden nav item protects nothing). Each persona gets every probe; the
// hard rules are asserted, and each persona's row is written to .run/access/<key>.json
// for the report, so a change in who sees what is visible even where no rule
// says it is wrong.

const PROBES = [
  '/api/member/info',
  '/api/member/chapter',
  '/api/member/deals',
  '/api/member/deals/open-votes',
  '/api/member/pipeline',
  '/api/member/pipeline?declined=1',
  '/api/member/updates',
  '/api/member/discounts',
  '/api/member/surveys',
  '/api/member/onboarding',
  '/api/member/open-to-work/list',
  '/api/member/committee/overview',
  '/api/member/board/members',
  '/api/member/board/meetings',
  '/api/member/board/activity',
  '/api/member/surveys/events',
]

interface Probe {
  status: number
  count: number | null
}

/** A rough "how much came back": the first array in the body, or a total. */
function countOf(body: unknown): number | null {
  if (Array.isArray(body)) return body.length
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>
    if (typeof o.total === 'number') return o.total
    for (const v of Object.values(o)) if (Array.isArray(v)) return v.length
  }
  return null
}

async function probe(api: APIRequestContext, path: string): Promise<Probe> {
  const res = await api.get(path, { failOnStatusCode: false, maxRedirects: 0 })
  let count: number | null = null
  if (res.ok()) count = countOf(await res.json().catch(() => null))
  return { status: res.status(), count }
}

async function apiFor(p: Persona | null) {
  return request.newContext({
    baseURL: e2eEnv().baseUrl,
    extraHTTPHeaders: p ? { cookie: cookieHeader(p) } : {},
  })
}

// Ground truth from the branch, independent of the portal's own SQL.
async function dataTruth() {
  const sql = neon(e2eEnv().databaseUrl)
  const allCases = (await sql`SELECT slug FROM pipeline_deals WHERE slug IS NOT NULL ORDER BY slug`) as {
    slug: string
  }[]
  const funded = (await sql`
    SELECT DISTINCT pd.slug, g.slug AS grp
    FROM investments i JOIN pipeline_deals pd ON pd.id = i.deal_id JOIN network_groups g ON g.id = i.group_id
    WHERE pd.slug IS NOT NULL
  `) as { slug: string; grp: string }[]
  return { allCases: allCases.map((r) => r.slug), funded }
}

let truth: Awaited<ReturnType<typeof dataTruth>>
let staffCases: string[] = []

test.beforeAll(async () => {
  truth = await dataTruth()
  // The staff list is the widest legitimate view; every other persona's is a subset of it.
  const staff = personas().find((p) => p.key === 'committee-board')!
  const api = await apiFor(staff)
  staffCases = ((await (await api.get('/api/member/deals')).json()).cases as { slug: string }[]).map((c) => c.slug)
  await api.dispose()
})

// The path exactly as written, no URL normalisation (fetch would read `//api` as a host).
function rawStatus(path: string): Promise<number> {
  const { hostname, port } = new URL(e2eEnv().baseUrl)
  return new Promise((resolve, reject) => {
    const req = rawRequest({ hostname, port, path, method: 'GET' }, (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('error', reject)
    req.end()
  })
}

test('no cookie and path tricks never reach member data', async () => {
  for (const path of [
    '/api/member/info',
    '//api/member/info',
    '/api/%6Dember/info',
    '/api/member/../member/info',
    '/API/member/info',
    '/api/member//info',
  ]) {
    expect.soft(await rawStatus(path), `${path} without a session`).not.toBe(200)
  }
})

for (const spec of PERSONAS) {
  test(`access: ${spec.key}`, async () => {
    const p = personas().find((x) => x.key === spec.key)!
    const api = await apiFor(p)
    const row = {
      probes: {} as Record<string, Probe>,
      cases: {} as Record<string, number>,
      updates: {} as Record<string, number>,
    }
    for (const path of PROBES) row.probes[path] = await probe(api, path)

    // Every case the branch has, by slug: what the detail route says to this persona.
    for (const slug of truth.allCases) row.cases[slug] = (await probe(api, `/api/member/deals/${slug}`)).status
    // Investor updates, per funded company.
    for (const slug of new Set(truth.funded.map((f) => f.slug)))
      row.updates[slug] = (await probe(api, `/api/member/updates/${slug}`)).status
    await api.dispose()
    mkdirSync(`${RUN_DIR}/access`, { recursive: true })
    writeFileSync(`${RUN_DIR}/access/${p.key}.json`, JSON.stringify({ persona: p, staffCases, ...row }, null, 2))

    const s = (path: string) => row.probes[path].status

    if (!p.member) {
      // Not a portal member: every member route is 401, whatever the cookie says.
      for (const path of PROBES) expect.soft(s(path), `${p.key} ${path}`).toBe(401)
      for (const [slug, status] of Object.entries(row.cases)) expect.soft(status, `${p.key} case ${slug}`).toBe(401)
      return
    }

    expect.soft(s('/api/member/info'), 'a member reads their own info').toBe(200)

    // Board-only routes.
    for (const path of [
      '/api/member/board/members',
      '/api/member/board/meetings',
      '/api/member/board/activity',
      '/api/member/surveys/events',
    ]) {
      expect.soft(s(path), `${p.key} ${path}`).toBe(has(p, 'styret') ? 200 : 403)
    }
    // Committee or board.
    expect.soft(s('/api/member/committee/overview'), `${p.key} committee overview`).toBe(isStaff(p) ? 200 : 403)
    // Investors or board.
    expect
      .soft(s('/api/member/open-to-work/list'), `${p.key} open-to-work list`)
      .toBe(isInvestor(p) || has(p, 'styret') ? 200 : 403)
    // Norway-only.
    expect.soft(s('/api/member/onboarding'), `${p.key} onboarding`).toBe(has(p, 'cto-roundtable') ? 200 : 403)

    // Cases: the list and the detail route agree, and nobody sees more than staff.
    const listed = new Set<string>()
    if (s('/api/member/deals') === 200) {
      const api2 = await apiFor(p)
      for (const c of (await (await api2.get('/api/member/deals')).json()).cases as { slug: string }[])
        listed.add(c.slug)
      await api2.dispose()
    }
    for (const [slug, status] of Object.entries(row.cases)) {
      expect
        .soft(status === 200, `${p.key} case ${slug}: list says ${listed.has(slug)}, detail says ${status}`)
        .toBe(listed.has(slug))
      if (status === 200) expect.soft(staffCases, `${p.key} sees ${slug}, staff does not`).toContain(slug)
    }
    if (!isInvestor(p) && !isStaff(p)) {
      expect.soft([...listed], `${p.key} is in no SPV and not staff, yet sees cases`).toEqual([])
      expect.soft(row.probes['/api/member/updates'].count ?? 0, `${p.key} sees investor updates`).toBe(0)
    }

    // Investor updates: readable exactly when one of the persona's groups funded the company.
    for (const [slug, status] of Object.entries(row.updates)) {
      const funded = truth.funded.some((f) => f.slug === slug && p.groups.includes(f.grp))
      expect.soft(status === 200, `${p.key} update ${slug}: funded by own group=${funded}, got ${status}`).toBe(funded)
    }
  })
}
