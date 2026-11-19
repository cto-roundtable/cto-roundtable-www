// The admissions feature flag (server/utils/admissionsFlag.ts): ships dark, and while
// off only styret sees anything, and styret cannot start anything real.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { admissionAccess, HIDDEN_MESSAGE, isFlagOn } from '../../server/utils/admissionsFlag.ts'

describe('the flag value', () => {
  test('off unless set to a yes', () => {
    for (const v of [undefined, null, '', 'false', '0', 'off', 'no', false, 1, 'maybe'])
      assert.equal(isFlagOn(v), false, String(v))
    for (const v of [true, 'true', 'TRUE', ' 1 ', 'on', 'yes']) assert.equal(isFlagOn(v), true, String(v))
  })
  test('nuxt.config reads it from NUXT_ADMISSIONS_ENABLED with no default', () => {
    const cfg = readFileSync('nuxt.config.ts', 'utf8')
    assert.match(cfg, /admissionsEnabled: process\.env\.NUXT_ADMISSIONS_ENABLED \|\| ''/)
  })
})

describe('flag off', () => {
  test('a member (or anyone not on the board) gets 404 for everything', () => {
    for (const a of ['read', 'act', 'manage'] as const) assert.equal(admissionAccess(false, false, a), 404)
  })
  test('styret may read and manage, but starting or opening is 409', () => {
    assert.equal(admissionAccess(false, true, 'read'), 200)
    assert.equal(admissionAccess(false, true, 'manage'), 200)
    assert.equal(admissionAccess(false, true, 'act'), 409)
    assert.equal(HIDDEN_MESSAGE, 'Ikke synlig for medlemmer ennå')
  })
})

describe('flag on', () => {
  test('as built: the gate lets everything through to the route checks', () => {
    for (const board of [true, false])
      for (const a of ['read', 'act', 'manage'] as const) assert.equal(admissionAccess(true, board, a), 200)
  })
})

describe('every admission route asks the gate first', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]))
  const routes = [...files('server/api/member/admission'), ...files('server/api/apply')]
  test('there are routes to check', () => assert.ok(routes.length >= 10))
  for (const r of routes) {
    test(r, () => {
      const src = readFileSync(r, 'utf8')
      assert.match(src, /requireAdmissions\(/)
      // The starting actions are 'act', so they are refused while off.
      if (/votes\.post|ballot\.post/.test(r)) assert.match(src, /requireAdmissions\(v\.isBoard, 'act'\)/)
      if (/apply\/index\.post/.test(r)) assert.match(src, /requireAdmissions\(false, 'act'\)/)
    })
  }
})
