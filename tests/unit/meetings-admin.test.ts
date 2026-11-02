// The admin API for the general meeting (/api/admin/meetings/**, `ctr meetings`),
// read as source: every route is a thin defineAdminRoute caller of
// generalMeetings.ts with a meetings scope, and nothing in it can vote. The
// behaviour (the styret gate, 403s, the happy path) is e2e/meeting-admin.spec.ts.
// Run: npm run test:unit.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { API_SCOPES, COMMITTEE_SCOPES } from '../../server/utils/apiTokens.ts'

const DIR = 'server/api/admin/meetings'
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
const routes = files(DIR).map((path) => ({ path, src: readFileSync(path, 'utf8') }))
const helper = readFileSync('server/utils/meetingsAdmin.ts', 'utf8')

/** Each `METHOD: { scope: '...'` pair in a route file. */
const methods = (src: string) =>
  [...src.matchAll(/\b(GET|POST|PATCH|PUT|DELETE): \{\s*scope: '([^']+)'/g)].map((m) => ({
    method: m[1],
    scope: m[2],
  }))

describe('admin meeting routes', () => {
  test('there are routes, and every one is a defineAdminRoute', () => {
    assert.ok(routes.length >= 14, `${routes.length} route files`)
    for (const r of routes) assert.match(r.src, /export default defineAdminRoute\(\{/, r.path)
  })
  test('GET needs meetings:read, every write needs meetings:write, nothing else', () => {
    for (const r of routes) {
      const ms = methods(r.src)
      assert.ok(ms.length > 0, `${r.path} declares no method with a scope`)
      for (const m of ms) assert.equal(m.scope, m.method === 'GET' ? 'meetings:read' : 'meetings:write', r.path)
    }
  })
  test('every route goes through meetingCall (the styret viewer) and has no SQL of its own', () => {
    for (const r of routes) {
      assert.match(r.src, /meetingCall\(event, caller, audit,/, r.path)
      assert.doesNotMatch(r.src, /useDatabase|sql`|\.query\(/, r.path)
    }
  })
  test('nothing votes through a token: no ballot, no self check-in', () => {
    for (const { path, src } of [
      ...routes,
      { path: 'meetingsAdmin.ts', src: helper.replace(/\/\*\*[\s\S]*?\*\//g, '') },
    ]) {
      assert.doesNotMatch(src, /castMeetingBallot|registerMeetingBallot|selfAttendance/, path)
    }
    for (const r of routes) assert.doesNotMatch(r.path, /ballot/i, r.path)
  })
  test('the viewer is built from the token owner, never from the request', () => {
    assert.match(helper, /meetingViewerForOwner\(caller\.ownerPersonId\)/)
  })
})

describe('meeting scopes', () => {
  test('exist, and the committee gives nothing extra here', () => {
    for (const s of ['meetings:read', 'meetings:write']) {
      assert.ok((API_SCOPES as readonly string[]).includes(s), s)
      assert.ok(!(COMMITTEE_SCOPES as readonly string[]).includes(s), `${s} must not be a committee scope`)
    }
  })
  test('the mint script lists the same scopes as API_SCOPES', () => {
    const mint = readFileSync('scripts/mint-api-token.mjs', 'utf8')
    const list = mint.match(/const SCOPES = \[([\s\S]*?)\]/)?.[1] ?? ''
    assert.deepEqual(
      [...list.matchAll(/'([a-z]+:[a-z]+)'/g)].map((m) => m[1]),
      [...API_SCOPES],
    )
  })
})
