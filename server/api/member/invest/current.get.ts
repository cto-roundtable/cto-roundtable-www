// GET /api/member/invest/current
// The offering this member should be pointed at (the banner on /member and
// /member/sweden): the one open for interest or tegning, or a draft for the board.
// { offering: { slug, name, status, answered } | null }
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  return { offering: await currentOfferingFor(personId) }
})
