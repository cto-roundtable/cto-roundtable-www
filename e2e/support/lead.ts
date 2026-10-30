import { neon } from '@neondatabase/serverless'

// A new lead (status 'incoming') that the access spec can probe whatever production
// holds that day: leads come and go (30 Oct 2026 there were none). It is marked
// investor-visible on purpose, so the probe also shows that the flag does not open a
// lead to members. Created on the e2e branch only (global setup runs after the guard).
export const SYNTHETIC_LEAD_SLUG = 'e2e-synthetic-lead'

export async function ensureSyntheticLead(databaseUrl: string): Promise<void> {
  const sql = neon(databaseUrl)
  const found = (await sql`SELECT status FROM pipeline_deals WHERE slug = ${SYNTHETIC_LEAD_SLUG}`) as {
    status: string
  }[]
  if (found.length) {
    if (found[0]!.status !== 'incoming') {
      await sql`UPDATE pipeline_deals SET status = 'incoming' WHERE slug = ${SYNTHETIC_LEAD_SLUG}`
    }
    return
  }
  await sql`
    WITH org AS (INSERT INTO organizations (name) VALUES ('E2E lead (synthetic)') RETURNING id)
    INSERT INTO pipeline_deals (organization_id, status, slug, contacted_how, investor_visible, last_activity_note)
    SELECT id, 'incoming', ${SYNTHETIC_LEAD_SLUG}, 'they_contacted_us', true, 'e2e: a synthetic lead'
    FROM org
  `
}
