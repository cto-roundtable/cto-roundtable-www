// GET /api/admin/meetings/:id/protocol: the protocol PDF, rendered from the frozen
// counts (404 until a sak is closed). `ctr meetings protocol`.
export default defineAdminRoute({
  GET: {
    scope: 'meetings:read',
    handler: async (event, caller, audit) => {
      const { v, id } = await meetingCall(event, caller, audit, 'protocol')
      const pdf = await renderMeetingProtocolPdf(await meetingProtocolData(v, id))
      setHeader(event, 'Content-Type', 'application/pdf')
      setHeader(event, 'Cache-Control', 'private, no-store')
      return pdf
    },
  },
})
