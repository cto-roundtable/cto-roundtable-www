// GET /api/member/meetings/:id/protocol: the protocol PDF, rendered from the frozen counts.
export default defineEventHandler(async (event) => {
  const data = await meetingProtocolData(await meetingViewer(event), getRouterParam(event, 'id') ?? '')
  const pdf = await renderMeetingProtocolPdf(data)
  setHeader(event, 'content-type', 'application/pdf')
  setHeader(
    event,
    'content-disposition',
    `inline; filename="protokoll-arsmote-${data.view.meeting.id.slice(0, 8)}.pdf"`,
  )
  setHeader(event, 'cache-control', 'private, no-store')
  return pdf
})
