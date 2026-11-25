// GET /api/member/invest/:slug/visits
// Who opened the offering's pages in the portal (signed in, server-side, no cookies),
// how often, first and last time, and what they answered. The investment committee
// (current-komite) only; everyone else, the board alone included, gets the 404 of a
// missing offering (server/utils/portalVisits.ts: getOfferingVisits).
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  return getOfferingVisits(personId, getRouterParam(event, 'slug') ?? '')
})
