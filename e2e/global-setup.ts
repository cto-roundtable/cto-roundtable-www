import { mkdirSync, writeFileSync } from 'node:fs'
import { e2eEnv } from './support/guard'
import { resolvePersonas } from './support/personas'
import { RUN_DIR } from './support/run'

// Refuse production, resolve every persona to a person on the branch (creating
// the synthetic ones), and leave the result where the specs read it.
export default async function globalSetup() {
  const env = e2eEnv()
  const personas = await resolvePersonas(env.databaseUrl, process.env.E2E_AS)
  mkdirSync(RUN_DIR, { recursive: true })
  writeFileSync(`${RUN_DIR}/personas.json`, JSON.stringify(personas, null, 2))
  for (const p of personas) console.log(`  persona ${p.key.padEnd(16)} ${p.name}`)
}
