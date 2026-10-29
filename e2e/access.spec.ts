import { mkdirSync, writeFileSync } from 'node:fs'
import { request as rawRequest } from 'node:http'
import { neon } from '@neondatabase/serverless'
import { type APIRequestContext, expect, request, test } from '@playwright/test'
import { e2eEnv } from './support/guard'
import { PERSONAS, type Persona } from './support/personas'
import { cookieHeader, has, isCommittee, isInvestor, overviewSlugs, personas, RUN_DIR } from './support/run'

// Who can read what, asked of the API (the real gate: pages fetch client-side,
// so a hidden nav item protects nothing). Each persona gets every probe; the
// hard rules are asserted, and each persona's row is written to .run/access/<key>.json
// for the report, so a change in who sees what is visible even where no rule
// says it is wrong.

// Each persona walks every case and every company's updates one request at a time.
test.describe.configure({ timeout: 180_000 })

const PROBES = [
  '/api/member/info',
  '/api/member/chapter',
  '/api/member/deals',
  '/api/member/deals/open-votes',
  '/api/member/deals?declined=1',
  '/api/member/deals?som=invest-3',
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
  // The newest update of each company that has one, to ask for it by id.
  const updateIds = (await sql`
    SELECT DISTINCT ON (pd.slug) pd.slug, u.id
    FROM investor_updates u JOIN pipeline_deals pd ON pd.id = u.deal_id
    WHERE pd.slug IS NOT NULL
    ORDER BY pd.slug, u.update_date DESC
  `) as { slug: string; id: string }[]
  // Cases that have an SPV digest ("what we heard"), to know whether the withholding rule is exercised.
  const spvDigests = (await sql`
    SELECT DISTINCT pd.slug FROM deal_digests d JOIN pipeline_deals pd ON pd.id = d.deal_id
    WHERE d.audience = 'spv' AND pd.slug IS NOT NULL
  `) as { slug: string }[]
  return { allCases: allCases.map((r) => r.slug), funded, updateIds, spvDigests: spvDigests.map((r) => r.slug) }
}

let truth: Awaited<ReturnType<typeof dataTruth>>
const staffCases: string[] = []

test.beforeAll(async () => {
  truth = await dataTruth()
  // The committee opens every case it works on, which is the widest legitimate view; every
  // other persona's is a subset of it. Its LIST is the member view (#74), so ask the case page.
  const committee = personas().find((p) => p.key === 'committee-board')!
  const api = await apiFor(committee)
  for (const slug of truth.allCases)
    if ((await probe(api, `/api/member/deals/${slug}`)).status === 200) staffCases.push(slug)
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
      updateById: {} as Record<string, number>,
      answersWithheldSources: 0,
      spvDigestsWithheld: 0,
    }
    for (const path of PROBES) row.probes[path] = await probe(api, path)

    // Every case the branch has, by slug: what the detail route says to this persona.
    for (const slug of truth.allCases) row.cases[slug] = (await probe(api, `/api/member/deals/${slug}`)).status
    // Investor updates, for every case slug (funded or not, leads included) and one that does not exist.
    for (const slug of [...truth.allCases, 'no-such-company-e2e'])
      row.updates[slug] = (await probe(api, `/api/member/updates/${slug}`)).status
    for (const u of truth.updateIds)
      row.updateById[u.slug] = (await probe(api, `/api/member/updates/${u.slug}/${u.id}`)).status
    // A case whose material is not shared with this viewer: the answers come without
    // their sources (quotes from the investor pack), and the SPV digest is withheld.
    for (const [slug, status] of Object.entries(row.cases)) {
      if (status !== 200) continue
      const c = await (await api.get(`/api/member/deals/${slug}`)).json()
      if (c.deal.materialShared) continue
      if (truth.spvDigests.includes(slug)) row.spvDigestsWithheld++
      expect
        .soft(c.digests?.spv ?? null, `${p.key} case ${slug}: SPV digest while the material is not shared`)
        .toBeNull()
      for (const q of c.questions ?? []) {
        if (!q.answer) continue
        row.answersWithheldSources++
        expect
          .soft(q.answer.sources, `${p.key} case ${slug}: answer sources while the material is not shared`)
          .toEqual([])
      }
    }
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
    // Committee only (#74: the board sees cases as a member does).
    expect.soft(s('/api/member/committee/overview'), `${p.key} committee overview`).toBe(isCommittee(p) ? 200 : 403)
    // "Se som" (?som=): only the committee may look as another role.
    expect.soft(s('/api/member/deals?som=invest-3'), `${p.key} ?som=invest-3`).toBe(isCommittee(p) ? 200 : 403)
    // Investors or board.
    expect
      .soft(s('/api/member/open-to-work/list'), `${p.key} open-to-work list`)
      .toBe(isInvestor(p) || has(p, 'styret') ? 200 : 403)
    // Norway-only.
    expect.soft(s('/api/member/onboarding'), `${p.key} onboarding`).toBe(has(p, 'cto-roundtable') ? 200 : 403)

    // Cases: for a member the overview (declined included) and the case page agree, and
    // nobody opens a case the committee cannot. The committee's own list is the member
    // view by design, while its case page opens everything, so it is left out of the first rule.
    const listed = new Set<string>()
    if (s('/api/member/deals?declined=1') === 200) {
      const api2 = await apiFor(p)
      const overview = await (await api2.get('/api/member/deals?declined=1')).json()
      for (const slug of overviewSlugs(overview)) listed.add(slug)
      await api2.dispose()
      // A declined company the viewer may not open: name, stage and date, nothing more.
      for (const c of (overview.declined ?? []) as Record<string, unknown>[]) {
        if (c.canOpen !== false) continue
        expect
          .soft({ blurb: c.blurb, owner: c.owner, round: c.round }, `${p.key} declined ${c.slug} it may not open`)
          .toEqual({ blurb: null, owner: null, round: null })
      }
    }
    for (const [slug, status] of Object.entries(row.cases)) {
      if (!isCommittee(p))
        expect
          .soft(
            status === 200,
            `${p.key} case ${slug}: the list offers it to open: ${listed.has(slug)}, the case page says ${status}`,
          )
          .toBe(listed.has(slug))
      if (status === 200) expect.soft(staffCases, `${p.key} opens ${slug}, the committee cannot`).toContain(slug)
    }
    if (!isInvestor(p) && !isCommittee(p)) {
      expect.soft([...listed], `${p.key} is in no SPV and not on the committee, yet sees cases`).toEqual([])
      expect.soft(row.probes['/api/member/updates'].count ?? 0, `${p.key} sees investor updates`).toBe(0)
    }

    // Investor updates: readable exactly when one of the persona's groups funded the company,
    // and otherwise the same 404 as a company that does not exist (a lead cannot be probed).
    const fundedByOwn = (slug: string) => truth.funded.some((f) => f.slug === slug && p.groups.includes(f.grp))
    for (const [slug, status] of Object.entries(row.updates))
      expect
        .soft(status, `${p.key} updates for ${slug}: funded by own group=${fundedByOwn(slug)}`)
        .toBe(fundedByOwn(slug) ? 200 : 404)
    for (const [slug, status] of Object.entries(row.updateById))
      expect
        .soft(status, `${p.key} an update of ${slug}: funded by own group=${fundedByOwn(slug)}`)
        .toBe(fundedByOwn(slug) ? 200 : 404)
  })
}
