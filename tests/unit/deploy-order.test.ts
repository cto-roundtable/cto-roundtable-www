// The deploy order guard (cloudbuild.yaml -> scripts/cloudbuild-deploy.sh ->
// scripts/deploy-order.sh). On 2026-11-25 #115 (merged 15:20:40) and #116 (15:21:01) started
// two builds; #116's deployed at 15:24:48 and #115's, of the OLDER commit, at 15:25:18, so
// production ran without #116 until someone noticed the visit log was empty. These replay
// that against a fake gcloud that keeps the service's build-started label in a file.
// Run: npm run test:unit.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'

const root = new URL('../../', import.meta.url).pathname
const ORDER = join(root, 'scripts/deploy-order.sh')
const DEPLOY = join(root, 'scripts/cloudbuild-deploy.sh')
// Build start times on 2026-11-25, UTC.
const B115 = String(Date.UTC(2026, 10, 25, 15, 20, 44) / 1000)
const B116 = String(Date.UTC(2026, 10, 25, 15, 21, 4) / 1000)

function order(mine: string, live: string) {
  return spawnSync('bash', [ORDER, mine, live], { encoding: 'utf8' }).status
}

describe('deploy-order.sh', () => {
  test('25 Nov: #115 finishing after #116 does not deploy over it', () => {
    assert.equal(order(B115, B116), 10)
  })
  test('a build that started later deploys, and so does the same one again', () => {
    assert.equal(order(B116, B115), 0)
    assert.equal(order(B116, B116), 0)
  })
  test('no label yet (before this guard) or a junk label: deploy', () => {
    assert.equal(order(B115, ''), 0)
    assert.equal(order(B115, 'abc'), 0)
  })
  test('no start time for this build is a usage error, never a silent deploy', () => {
    assert.equal(order('', B116), 2)
    assert.equal(order('soon', ''), 2)
  })
})

/** A fake gcloud: `run services describe` prints the label, `run deploy` sets it. */
function fakeCloud(initial: string, clobberWith = '') {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-order-'))
  const state = join(dir, 'label')
  writeFileSync(state, initial)
  writeFileSync(
    join(dir, 'gcloud'),
    `#!/usr/bin/env bash
if [[ "$*" == *"services describe"* ]]; then cat "${state}"; exit 0; fi
if [[ "$*" == *" deploy "* ]]; then
  echo "$*" >> "${dir}/deploys"
  for a in "$@"; do [[ "$a" == build-started=* ]] && l="\${a#build-started=}" && echo -n "\${l%%,*}" > "${state}"; done
  # An older build landing right after this deploy, once.
  if [[ -n "${clobberWith}" && ! -f "${dir}/clobbered" ]]; then touch "${dir}/clobbered"; echo -n "${clobberWith}" > "${state}"; fi
  exit 0
fi
exit 1
`,
  )
  chmodSync(join(dir, 'gcloud'), 0o755)
  const run = (started: string, commit: string) =>
    spawnSync('bash', [DEPLOY, `img:${commit}`, commit, started], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, DEPLOY_VERIFY_WAIT: '0' },
    })
  const deploys = () =>
    existsSync(join(dir, 'deploys')) ? readFileSync(join(dir, 'deploys'), 'utf8').trim().split('\n') : []
  return { run, label: () => readFileSync(state, 'utf8'), deploys }
}

describe('cloudbuild-deploy.sh against a fake gcloud', () => {
  test('25 Nov replayed: #116 deploys, then #115 finishes and is skipped, #116 stays live', () => {
    const cloud = fakeCloud('')
    assert.equal(cloud.run(B116, '99c83d1').status, 0)
    const late = cloud.run(B115, '1848175')
    assert.equal(late.status, 0)
    assert.match(late.stdout, /skip: /)
    assert.equal(cloud.label(), B116)
    assert.equal(cloud.deploys().length, 1)
    assert.match(cloud.deploys()[0], /--image img:99c83d1 /)
    assert.match(cloud.deploys()[0], /commit-sha=99c83d1/)
  })

  test('in order, each build deploys', () => {
    const cloud = fakeCloud('')
    assert.equal(cloud.run(B115, '1848175').status, 0)
    assert.equal(cloud.run(B116, '99c83d1').status, 0)
    assert.equal(cloud.label(), B116)
    assert.equal(cloud.deploys().length, 2)
  })

  test('an older build slipping in between the check and the deploy is undone', () => {
    const cloud = fakeCloud(B115, B115)
    const r = cloud.run(B116, '99c83d1')
    assert.equal(r.status, 0)
    assert.match(r.stdout, /overwrote this deploy; deploying again/)
    assert.equal(cloud.label(), B116)
    assert.equal(cloud.deploys().length, 2)
  })

  test('the flags the old cloudbuild.yaml deployed with are kept', () => {
    const cloud = fakeCloud('')
    cloud.run(B116, '99c83d1')
    const d = cloud.deploys()[0]
    for (const flag of [
      'cto-roundtable-www',
      '--region europe-north1',
      '--min-instances 1',
      'NUXT_SITE_URL=https://www.ctoroundtable.no',
      'NUXT_SLACK_SIGNING_SECRET=www-slack-signing-secret:latest,NUXT_INGEST_API_KEY=www-ingest-api-key:latest',
    ]) {
      assert.ok(d.includes(flag), flag)
    }
  })
})

describe('cloudbuild.yaml', () => {
  const yaml = readFileSync(join(root, 'cloudbuild.yaml'), 'utf8')
  test('records the start first and deploys only through the guarded script', () => {
    const started = yaml.indexOf('/workspace/build_started')
    const build = yaml.indexOf("- 'build'")
    assert.ok(started > 0 && started < build)
    assert.match(
      yaml,
      /bash scripts\/cloudbuild-deploy\.sh "\$\{_IMAGE\}" "\$\{COMMIT_SHA\}" "\$\$\(cat \/workspace\/build_started\)"/,
    )
    assert.doesNotMatch(yaml, /- 'deploy'\n/)
  })
})
