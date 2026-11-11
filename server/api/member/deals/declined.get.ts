// GET /api/member/deals/declined
// Every no (/member/caser/nei, Snorre 2026-11-11): the deals we said no to ('rejected') and
// the ones that said no to us or whose round closed ('missed'), with or without a case page,
// newest first, each with its category and member-safe reason (hq 048). For the same people
// as the overview's "Sagt nei til" (a member of the SPV deploying now, dc-33 H1); anyone else
// gets `rows: null`. A row carries a slug only when this viewer can open the case.
// Always the member view, as on the overview (server/utils/deals.ts, listDeclined).
export default defineEventHandler(async (event) => {
  const viewer = await caseViewer(event.context.session.personId)
  return listDeclined({ ...viewer, isCommittee: false })
})
