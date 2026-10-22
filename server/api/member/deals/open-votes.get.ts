// GET /api/member/deals/open-votes
// Open votes this member may cast and has not yet: the banner on /member.
export default defineEventHandler(async (event) => {
  return { votes: await openVotesFor(event.context.session.personId) }
})
