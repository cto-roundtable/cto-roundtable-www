// POST /api/member/board/protocols/:id/signed
// Board-only: register an externally signed protocol.
//
// Multipart form:
//   file        the signed PDF
//   signatures  JSON [{ personId, role: 'chair'|'member', signedAt: 'YYYY-MM-DD' }]
//   method      'bankid' | 'portal' | 'manual'   (default 'bankid')
//   note        optional free text
//
// The file and the signatures arrive together on purpose. The board signs with
// BankID outside the portal, so what comes back is a document plus knowledge of
// who signed it and when. Accepting the file alone would produce a register that
// looks complete and proves nothing.
const MAX_BYTES = 20 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const personId = await requireBoard(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing protocol' })

  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, message: 'Forventet en multipart-forespørsel' })

  const field = (name: string) => parts.find((p) => p.name === name && !p.filename)?.data.toString('utf8')
  const file = parts.find((p) => p.name === 'file' && p.filename)

  if (!file) throw createError({ statusCode: 400, message: 'Ingen fil lastet opp' })
  if (file.data.length > MAX_BYTES) {
    throw createError({ statusCode: 413, message: 'Filen er større enn 20 MB' })
  }

  let signatures: { personId: string; role: 'chair' | 'member'; signedAt: string }[]
  try {
    signatures = JSON.parse(field('signatures') ?? '[]')
  } catch {
    throw createError({ statusCode: 400, message: 'Ugyldig signaturliste' })
  }
  if (!Array.isArray(signatures)) {
    throw createError({ statusCode: 400, message: 'Ugyldig signaturliste' })
  }
  for (const signature of signatures) {
    if (!signature?.personId || (signature.role !== 'chair' && signature.role !== 'member')) {
      throw createError({ statusCode: 422, message: 'Hver signatur trenger person og rolle' })
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(signature.signedAt ?? '')) {
      throw createError({ statusCode: 422, message: 'Hver signatur trenger en gyldig dato' })
    }
  }

  const method = field('method') ?? 'bankid'
  if (method !== 'bankid' && method !== 'portal' && method !== 'manual') {
    throw createError({ statusCode: 422, message: 'Ukjent signeringsmetode' })
  }

  const protocol = await attachSignedProtocol({
    protocolId: id,
    pdf: file.data,
    filename: file.filename ?? 'protokoll-signert.pdf',
    method,
    signatures,
    registeredBy: personId,
    // Provenance of the RECORD, not of the signing act. For 'bankid' the proof
    // of who signed lives in the PDF's own signature; this says who told the
    // portal about it.
    ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
    userAgent: getRequestHeader(event, 'user-agent') ?? null,
    note: field('note') || null,
  })

  return { protocol }
})
