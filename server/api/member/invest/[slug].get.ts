// GET /api/member/invest/:slug
// The offering, the member's own answer, what we already know about them (last time,
// their holdings, names only) and the anonymous totals. 404 for an offering they may
// not see (server/utils/invest.ts: requireVisibleOffering).
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const slug = getRouterParam(event, 'slug') ?? ''
  const { offering, preview } = await requireVisibleOffering(personId, slug)

  const [mine, known, aggregate, documents] = await Promise.all([
    getMyInterest(offering.id, personId),
    getKnownForInterest(offering.id, personId),
    getInterestAggregate(offering.id),
    listOfferingDocuments(offering.id),
  ])

  return {
    offering: {
      slug: offering.slug,
      name: offering.name,
      status: offering.status,
      amountOptions: offering.amountOptions,
      amountMin: offering.amountMin,
      amountStep: offering.amountStep,
      minNok: offering.minNok,
      interestClosesAt: offering.interestClosesAt,
    },
    preview,
    mine,
    lastTime: known.lastTime,
    holdings: known.holdings.map((h) => h.name),
    aggregate,
    documents: documents.map(({ key, title, version, publishedAt }) => ({ key, title, version, publishedAt })),
  }
})
