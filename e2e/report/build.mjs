#!/usr/bin/env node
// Builds the persona report from a run: one self-contained HTML page per
// persona (every screenshot and the video of the walk, inlined) and an index
// with the access matrix. Pages are single files so they can be published to
// the artifact shelf as they are.
//
//   node e2e/report/build.mjs [--link "https://host/prefix-{key}"]
//
// --link is how the index links a persona page; {key} is the persona key.
// Default: "{key}.html" next to the index (open the folder locally).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const run = join(here, '..', '.run')
const out = join(run, 'gallery')
const linkArg = process.argv.indexOf('--link')
const link = (key) => (linkArg > 0 ? process.argv[linkArg + 1] : '{key}.html').replace('{key}', key)

const shell = readFileSync(join(here, 'shell.html'), 'utf8')
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const page = (title, body) => shell.replace('<title>Page title</title>', `<title>${esc(title)}</title>`).replace('<!--BODY-->', body)
const when = new Date().toISOString().slice(0, 16).replace('T', ' ')

const personas = JSON.parse(readFileSync(join(run, 'personas.json'), 'utf8'))
const access = Object.fromEntries(
  personas.filter((p) => existsSync(join(run, 'access', `${p.key}.json`))).map((p) => [p.key, JSON.parse(readFileSync(join(run, 'access', `${p.key}.json`), 'utf8'))]),
)
mkdirSync(out, { recursive: true })

const plate = (icon, family) => `<span class="plate plate-${family} plate-32" aria-hidden="true"><svg><use href="#${icon}"/></svg></span>`
const chip = (status) => {
  if (status === 200) return '<span class="st st-ok"><svg aria-hidden="true"><use href="#g-ok"/></svg>200</span>'
  if (status === 401 || status === 403 || status === 404) return `<span class="st st-idle"><svg aria-hidden="true"><use href="#g-idle"/></svg>${status}</span>`
  return `<span class="st st-fault"><svg aria-hidden="true"><use href="#g-fault"/></svg>${status}</span>`
}
const groups = (p) => (p.groups.length ? p.groups.join(', ') : 'no group') + (p.status === 'retired' ? ' (retired)' : '')

// ---- one page per persona
for (const p of personas) {
  const dir = join(run, 'views', p.key)
  if (!existsSync(join(dir, 'manifest.json'))) continue
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  const videoDir = readdirSync(join(run, 'test-results')).find((d) => d.endsWith(`views-${p.key}`))
  const videoPath = videoDir && join(run, 'test-results', videoDir, 'video.webm')
  const video = videoPath && existsSync(videoPath)
    ? `<h2>The walk, as video</h2><video controls preload="metadata" style="width:100%;border:1px solid var(--line);border-radius:var(--radius)" src="data:video/webm;base64,${readFileSync(videoPath).toString('base64')}"></video>`
    : ''
  const stops = m.stops
    .map((s) => {
      const img = readFileSync(join(dir, s.shot)).toString('base64')
      const moved = s.url !== s.path ? ` <span class="meta">ended on <code>${esc(s.url)}</code></span>` : ''
      return `<section id="${esc(s.shot)}"><h2><code>${esc(s.path)}</code>${moved}</h2><p class="cap">${esc(s.heading)}</p>
<img loading="lazy" alt="${esc(`${p.label} on ${s.path}`)}" style="width:100%;height:auto;border:1px solid var(--line);border-radius:var(--radius)" src="data:image/jpeg;base64,${img}"></section>`
    })
    .join('\n')
  const toc = m.stops.map((s) => `<a href="#${esc(s.shot)}"><code>${esc(s.path)}</code></a>`).join(' · ')
  const errors = m.errors.length ? `<aside class="callout"><p><strong>Page errors.</strong> ${m.errors.map(esc).join('<br>')}</p></aside>` : ''
  writeFileSync(
    join(out, `${p.key}.html`),
    page(
      `Portal as ${p.label}`,
      `<div class="kick">${plate('i-user', 'lyng')}<span>Member portal, seen as a persona</span></div>
<h1>${esc(p.label)}</h1>
<p class="lede">Signed in as <strong>${esc(p.name)}</strong>: ${esc(groups(p))}.</p>
<p class="meta">Run <time>${when}</time> UTC against a Neon branch of production. <a href="${esc(link('index'))}">All personas</a></p>
${errors}<p class="meta">${toc}</p>
${video}
${stops}`,
    ),
  )
}

// ---- the index: who can read what
const keys = personas.map((p) => p.key).filter((k) => access[k])
const first = access[keys[0]]
const probeRows = first
  ? Object.keys(first.probes)
      .map((path) => `<tr><td><code>${esc(path.replace('/api/member', ''))}</code></td>${keys.map((k) => {
        const r = access[k].probes[path]
        return `<td style="white-space:nowrap">${chip(r.status)}${r.status === 200 && r.count != null ? ` <span class="num">${r.count}</span>` : ''}</td>`
      }).join('')}</tr>`)
      .join('\n')
  : ''
const count = (k, what) => Object.values(access[k][what]).filter((s) => s === 200).length
const totals = first
  ? `<tr><td><strong>cases readable</strong> of ${Object.keys(first.cases).length}</td>${keys.map((k) => `<td class="num">${count(k, 'cases')}</td>`).join('')}</tr>
<tr><td><strong>investor updates readable</strong> of ${Object.keys(first.updates).length}</td>${keys.map((k) => `<td class="num">${count(k, 'updates')}</td>`).join('')}</tr>`
  : ''
const personaRows = personas
  .map((p) => `<tr><td>${existsSync(join(out, `${p.key}.html`)) ? `<a href="${esc(link(p.key))}">${esc(p.label)}</a>` : esc(p.label)}</td><td>${esc(p.name)}</td><td>${esc(groups(p))}</td></tr>`)
  .join('\n')

writeFileSync(
  join(out, 'index.html'),
  page(
    'Member portal by persona',
    `<div class="kick">${plate('i-users-three', 'lyng')}<span>Member portal, seen as each persona</span></div>
<h1>Who sees what in the member portal</h1>
<p class="lede">Each persona is a real member on a Neon branch of production, signed in with a session minted for that preview server only.</p>
<p class="meta">Run <time>${when}</time> UTC. Built by <code>e2e/report/build.mjs</code> in cto-roundtable-www.</p>
<h2>Personas</h2>
<p class="cap">Open one to see every page as they see it, with a video of the walk.</p>
<div class="tablewrap"><table class="tbl"><thead><tr><th>Persona</th><th>Signed in as</th><th>Groups</th></tr></thead><tbody>
${personaRows}
</tbody></table></div>
<h2>The API, per persona</h2>
<p class="cap">Status per route, and how many rows came back (scroll sideways on a phone). 401 = not a member, 403 = member without the role. The pages fetch these, so this is the real gate.</p>
<div class="tablewrap"><table class="tbl"><thead><tr><th>Route</th>${keys.map((k) => `<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>
${probeRows}
${totals}
</tbody></table></div>`,
  ),
)
console.log(`ok    ${out}/index.html and ${readdirSync(out).length - 1} persona pages`)
