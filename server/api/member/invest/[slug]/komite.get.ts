// GET /api/member/invest/:slug/komite
// The committee's page for an offering: everyone signed up for the online session (name,
// e-mail, note, when, their answer) and every interest answer with the totals. The
// investment committee (current-komite) only; everyone else, the board included, gets
// the 404 of a missing offering (server/utils/investCommittee.ts: getCommitteePage).
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  return getCommitteePage(personId, getRouterParam(event, 'slug') ?? '')
})
