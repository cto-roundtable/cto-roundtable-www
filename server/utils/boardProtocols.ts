/**
 * Issuing and reading styreprotokoller.
 *
 * Styremøte 2 (20.8.2026), vedtak 4. The register schema and the reasoning
 * behind it live in ctoroundtable-hq/infrastructure/db/migrations/018_board_protocols.sql;
 * this is the code that writes to it.
 *
 * Issuing is a deliberate act, never automatic. A referat appearing in the
 * database means the meeting happened; it does not mean the text is final, and
 * only a person can say that it is.
 */
import { createHash, randomUUID } from 'node:crypto'
import { renderProtocolPdf } from './protocolPdf.ts'

export interface ProtocolRow {
  id: string
  meetingSlug: string
  version: number
  contentSha256: string
  pdfSha256: string
  pdfBytes: number
  chairPersonId: string
  chairName: string | null
  secondSignerId: string | null
  secondSignerName: string | null
  issuedBy: string | null
  issuedByName: string | null
  issuedAt: string
  supersededAt: string | null
  hasSignedFile: boolean
  signedSha256: string | null
  signedFilename: string | null
  signedUploadedAt: string | null
  completedAt: string | null
  /** False when board_meetings.minutes_md no longer matches content_sha256. */
  matchesCurrentReferat: boolean
  signatures: SignatureRow[]
}

export interface SignatureRow {
  personId: string
  role: 'chair' | 'member'
  method: 'bankid' | 'portal' | 'manual'
  signedAt: string
  signerName: string
  signerEmail: string | null
  attestedSha256: string
  /** False when this signature attests to a different text than the row it hangs on. */
  attestsCurrentVersion: boolean
  note: string | null
}

/**
 * The register lives in migration 018, which is applied to Neon by hand (see
 * ctoroundtable-hq/infrastructure/db/deployment-strategy.md — we are at stage 1,
 * manual). Merging the migration file does not create the tables, so the portal
 * can be deployed while the register is still missing. When that happens the
 * board should be told which step is outstanding, not shown a generic failure.
 */
export function isMissingRegister(error: unknown): boolean {
  const message = (error as { message?: string })?.message ?? ''
  return /relation .*board_protocol.* does not exist/i.test(message)
}

export const MISSING_REGISTER_MESSAGE =
  'Protokollregisteret finnes ikke i databasen ennå. Migrasjon 018 (board_protocols) må kjøres mot Neon før protokoller kan utstedes.'

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex')
}

/** `protocols/<slug>/v<n>/protokoll.pdf` — the key names the version, so an
 *  issued file is never overwritten by a later one. */
export function protocolObjectKey(slug: string, version: number, signed = false): string {
  return `protocols/${slug}/v${version}/${signed ? 'protokoll-signert.pdf' : 'protokoll.pdf'}`
}

function mapSignature(row: any, contentSha256: string): SignatureRow {
  return {
    personId: row.person_id,
    role: row.role,
    method: row.method,
    signedAt: row.signed_at,
    signerName: row.signer_name,
    signerEmail: row.signer_email ?? null,
    attestedSha256: row.attested_sha256,
    attestsCurrentVersion: row.attested_sha256 === contentSha256,
    note: row.note ?? null,
  }
}

function mapProtocol(row: any, signatures: any[], currentMinutesMd: string | null): ProtocolRow {
  return {
    id: row.id,
    meetingSlug: row.meeting_slug,
    version: Number(row.version),
    contentSha256: row.content_sha256,
    pdfSha256: row.pdf_sha256,
    pdfBytes: Number(row.pdf_bytes),
    chairPersonId: row.chair_person_id,
    chairName: row.chair_name ?? null,
    secondSignerId: row.second_signer_id ?? null,
    secondSignerName: row.second_signer_name ?? null,
    issuedBy: row.issued_by ?? null,
    issuedByName: row.issued_by_name ?? null,
    issuedAt: row.issued_at,
    supersededAt: row.superseded_at ?? null,
    hasSignedFile: row.signed_object_key !== null,
    signedSha256: row.signed_sha256 ?? null,
    signedFilename: row.signed_filename ?? null,
    signedUploadedAt: row.signed_uploaded_at ?? null,
    completedAt: row.completed_at ?? null,
    matchesCurrentReferat: currentMinutesMd !== null && sha256(currentMinutesMd) === row.content_sha256,
    signatures: signatures.filter((s) => s.protocol_id === row.id).map((s) => mapSignature(s, row.content_sha256)),
  }
}

const PROTOCOL_COLUMNS = `
  p.id, p.meeting_slug, p.version, p.content_sha256, p.pdf_sha256, p.pdf_bytes,
  p.chair_person_id, p.second_signer_id, p.issued_by, p.issued_at, p.superseded_at,
  p.signed_object_key, p.signed_sha256, p.signed_filename, p.signed_uploaded_at,
  p.completed_at,
  chair.name AS chair_name,
  cosigner.name AS second_signer_name,
  issuer.name AS issued_by_name
`

/** Every protocol version for a meeting, newest first. */
export async function listProtocols(meetingSlug: string): Promise<ProtocolRow[]> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT ${sql.unsafe(PROTOCOL_COLUMNS)}, m.minutes_md
    FROM board_protocols p
    JOIN board_meetings m ON m.slug = p.meeting_slug
    LEFT JOIN persons chair ON chair.id = p.chair_person_id
    LEFT JOIN persons cosigner ON cosigner.id = p.second_signer_id
    LEFT JOIN persons issuer ON issuer.id = p.issued_by
    WHERE p.meeting_slug = ${meetingSlug}
    ORDER BY p.version DESC
  `
  if (rows.length === 0) return []

  const signatures = await sql`
    SELECT s.* FROM board_protocol_signatures s
    JOIN board_protocols p ON p.id = s.protocol_id
    WHERE p.meeting_slug = ${meetingSlug}
    ORDER BY s.signed_at
  `
  return rows.map((r: any) => mapProtocol(r, signatures, r.minutes_md ?? null))
}

/** One protocol version by id, or null. */
export async function getProtocol(id: string): Promise<ProtocolRow | null> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT ${sql.unsafe(PROTOCOL_COLUMNS)}, p.pdf_object_key, m.minutes_md
    FROM board_protocols p
    JOIN board_meetings m ON m.slug = p.meeting_slug
    LEFT JOIN persons chair ON chair.id = p.chair_person_id
    LEFT JOIN persons cosigner ON cosigner.id = p.second_signer_id
    LEFT JOIN persons issuer ON issuer.id = p.issued_by
    WHERE p.id = ${id}
    LIMIT 1
  `
  const row = rows[0]
  if (!row) return null

  const signatures = await sql`
    SELECT * FROM board_protocol_signatures WHERE protocol_id = ${id} ORDER BY signed_at
  `
  return mapProtocol(row, signatures, row.minutes_md ?? null)
}

/** The stored object key, kept out of ProtocolRow so it never reaches a client. */
export async function protocolObjectKeys(
  id: string,
): Promise<{ pdfObjectKey: string; signedObjectKey: string | null } | null> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT pdf_object_key, signed_object_key FROM board_protocols WHERE id = ${id} LIMIT 1
  `
  const row = rows[0]
  if (!row) return null
  return { pdfObjectKey: row.pdf_object_key, signedObjectKey: row.signed_object_key ?? null }
}

export interface IssueOptions {
  meetingSlug: string
  /** Møteleder. Vedtak 4 requires their signature as one of the two. */
  chairPersonId: string
  /** The other of the two, when it is known. Named on the document, not signed by it. */
  secondSignerPersonId?: string | null
  issuedBy: string
  siteUrl: string | null
}

export interface IssueResult {
  protocol: ProtocolRow
  /** True when an identical version already existed and was returned unchanged. */
  reused: boolean
}

/**
 * Issue a protocol for a meeting.
 *
 * Idempotent on content: issuing twice from the same referat returns the
 * existing version rather than making a second identical one. Issuing after the
 * referat changed creates version n+1 and supersedes its predecessor, so a
 * signature always keeps pointing at the text it was given.
 */
export async function issueProtocol(options: IssueOptions): Promise<IssueResult> {
  const sql = useDatabase()

  const meetings = await sql`
    SELECT slug, number, title, meeting_date, starts_at, ends_at, location, status, minutes_md
    FROM board_meetings
    WHERE slug = ${options.meetingSlug}
    LIMIT 1
  `
  const meeting = meetings[0]
  if (!meeting) {
    throw createError({ statusCode: 404, message: 'Fant ikke styremøtet' })
  }
  if (!meeting.minutes_md) {
    throw createError({
      statusCode: 409,
      message: 'Møtet har ikke noe referat ennå. Protokollen bygges på referatet.',
    })
  }

  const chairs = await sql`SELECT id, name FROM persons WHERE id = ${options.chairPersonId} LIMIT 1`
  const chair = chairs[0]
  if (!chair) {
    throw createError({ statusCode: 400, message: 'Ukjent møteleder' })
  }
  if (!(await isBoardMember(options.chairPersonId))) {
    throw createError({ statusCode: 400, message: 'Møteleder må sitte i styret' })
  }

  const secondSignerPersonId = options.secondSignerPersonId || null
  let secondSignerName: string | null = null
  if (secondSignerPersonId) {
    if (secondSignerPersonId === options.chairPersonId) {
      throw createError({ statusCode: 400, message: 'De to signaturene må være to forskjellige personer' })
    }
    if (!(await isBoardMember(secondSignerPersonId))) {
      throw createError({ statusCode: 400, message: 'Den andre signataren må sitte i styret' })
    }
    const rows = await sql`SELECT name FROM persons WHERE id = ${secondSignerPersonId} LIMIT 1`
    if (!rows[0]) throw createError({ statusCode: 400, message: 'Ukjent signatar' })
    secondSignerName = rows[0].name
  }

  const contentSha256 = sha256(meeting.minutes_md)

  const existing = await sql`
    SELECT id, content_sha256, version, chair_person_id, second_signer_id
    FROM board_protocols
    WHERE meeting_slug = ${options.meetingSlug} AND superseded_at IS NULL
    LIMIT 1
  `
  const current = existing[0]
  // Reuse only when the resulting document would be byte-identical. The signers
  // are printed on it, so changing who signs changes the PDF even though the
  // referat has not moved, and returning the old file would name the wrong person.
  if (
    current &&
    current.content_sha256 === contentSha256 &&
    current.chair_person_id === options.chairPersonId &&
    (current.second_signer_id ?? null) === secondSignerPersonId
  ) {
    const protocol = await getProtocol(current.id)
    if (!protocol) throw createError({ statusCode: 500, message: 'Protokollen forsvant under lesing' })
    return { protocol, reused: true }
  }

  const versions = await sql`
    SELECT COALESCE(MAX(version), 0) AS max FROM board_protocols WHERE meeting_slug = ${options.meetingSlug}
  `
  const version = Number(versions[0]?.max ?? 0) + 1

  // The id is minted before rendering because the PDF prints it: the file names
  // its own register entry, which is what makes a copy on someone's laptop
  // traceable back here.
  const id = randomUUID()
  const issuedAt = new Date()
  const objectKey = protocolObjectKey(options.meetingSlug, version)

  const pdf = await renderProtocolPdf({
    meeting: {
      slug: meeting.slug,
      number: Number(meeting.number),
      title: meeting.title ?? null,
      meetingDate:
        typeof meeting.meeting_date === 'string'
          ? meeting.meeting_date.slice(0, 10)
          : new Date(meeting.meeting_date).toISOString().slice(0, 10),
      startsAt: meeting.starts_at ?? null,
      endsAt: meeting.ends_at ?? null,
      location: meeting.location ?? null,
    },
    minutesMd: meeting.minutes_md,
    version,
    protocolId: id,
    contentSha256,
    chairName: chair.name,
    secondSignerName,
    issuedAt,
    referatUrl: options.siteUrl ? `${options.siteUrl.replace(/\/$/, '')}/member/board/${meeting.slug}` : null,
  })

  // Upload before insert. An object with no row is unreferenced and harmless; a
  // row pointing at an object that was never written is a broken record.
  await writeBoardProtocolObject(objectKey, pdf)

  // Supersede first, insert second, both in one transaction. `idx_board_protocols_current`
  // allows exactly one version per meeting with superseded_at IS NULL, so the
  // insert would be rejected while the predecessor is still current — and doing
  // it in two steps would leave a meeting with no protocol in force if the
  // second failed.
  await sql.transaction([
    sql`
      UPDATE board_protocols SET superseded_at = now()
      WHERE meeting_slug = ${options.meetingSlug} AND superseded_at IS NULL
    `,
    sql`
      INSERT INTO board_protocols
        (id, meeting_slug, version, protocol_md, content_sha256,
         pdf_object_key, pdf_sha256, pdf_bytes, chair_person_id, second_signer_id,
         issued_by, issued_at)
      VALUES
        (${id}, ${options.meetingSlug}, ${version}, ${meeting.minutes_md}, ${contentSha256},
         ${objectKey}, ${sha256(pdf)}, ${pdf.length}, ${options.chairPersonId}, ${secondSignerPersonId},
         ${options.issuedBy}, ${issuedAt.toISOString()})
    `,
  ])

  const protocol = await getProtocol(id)
  if (!protocol) throw createError({ statusCode: 500, message: 'Protokollen forsvant under lesing' })
  return { protocol, reused: false }
}

export interface SignatureInput {
  personId: string
  role: 'chair' | 'member'
  /** ISO date the signature was made, which is NOT when it was registered here. */
  signedAt: string
}

export interface AttachSignedInput {
  protocolId: string
  pdf: Buffer
  filename: string
  method: 'bankid' | 'portal' | 'manual'
  signatures: SignatureInput[]
  registeredBy: string
  ip: string | null
  userAgent: string | null
  note: string | null
}

/**
 * Record an externally signed protocol: store the file and the signatures in one
 * step.
 *
 * Deliberately one action, not two. The board signs with BankID outside the
 * portal, so what comes back is a file plus knowledge of who signed it and when.
 * Splitting that into "upload" and "register signatures" would allow a signed
 * file with nobody attached to it, which is a register that looks complete and
 * proves nothing.
 *
 * The signed file has DIFFERENT BYTES from what we generated: a signing service
 * stamps the document and, in a PAdES flow, appends its own signature. Byte
 * equality is therefore never asserted. What ties them together is
 * content_sha256, printed on every page of the generated PDF, which survives the
 * round trip and is stored per signature as attested_sha256.
 */
export async function attachSignedProtocol(input: AttachSignedInput): Promise<ProtocolRow> {
  const sql = useDatabase()

  const rows = await sql`
    SELECT id, meeting_slug, version, content_sha256, chair_person_id, superseded_at
    FROM board_protocols WHERE id = ${input.protocolId} LIMIT 1
  `
  const protocol = rows[0]
  if (!protocol) throw createError({ statusCode: 404, message: 'Fant ikke protokollen' })
  if (protocol.superseded_at) {
    throw createError({
      statusCode: 409,
      message: 'Denne versjonen er erstattet av en nyere. Last ned den gjeldende versjonen og signer den i stedet.',
    })
  }

  // A PDF, not something that merely ends in .pdf. The signed document is the
  // artifact the board will point at years from now.
  if (input.pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw createError({ statusCode: 422, message: 'Filen er ikke en PDF' })
  }

  if (input.signatures.length === 0) {
    throw createError({ statusCode: 422, message: 'Registrer hvem som signerte' })
  }
  const people = new Set(input.signatures.map((s) => s.personId))
  if (people.size !== input.signatures.length) {
    throw createError({ statusCode: 422, message: 'Samme person er ført opp to ganger' })
  }
  for (const signature of input.signatures) {
    if (!(await isBoardMember(signature.personId))) {
      throw createError({ statusCode: 422, message: 'Bare styremedlemmer kan signere protokollen' })
    }
  }
  // Vedtak 4: møteleder pluss én. The chair's signature is what makes the other
  // one count, so a set of signatures without them is refused rather than stored
  // and quietly treated as complete.
  if (input.signatures.length >= 2 && !people.has(protocol.chair_person_id)) {
    throw createError({
      statusCode: 422,
      message: 'Én av signaturene må være møteleders, jf. vedtak 4',
    })
  }

  // Looked up one at a time rather than with `= ANY($1)`: the Neon HTTP driver
  // is awkward about array parameters, and a protocol has two signers, not two
  // thousand.
  const byId = new Map<string, { name: string; email: string | null }>()
  for (const personId of people) {
    const found = await sql`
      SELECT p.name,
             (SELECT ci.value FROM contact_infos ci
               WHERE ci.person_id = p.id AND ci.type = 'email'
               ORDER BY ci.is_primary DESC LIMIT 1) AS email
      FROM persons p WHERE p.id = ${personId} LIMIT 1
    `
    if (found[0]) byId.set(personId, { name: found[0].name, email: found[0].email ?? null })
  }

  const objectKey = protocolObjectKey(protocol.meeting_slug, Number(protocol.version), true)
  await writeBoardProtocolObject(objectKey, input.pdf, { allowOverwrite: true })

  const statements = [
    sql`
      UPDATE board_protocols SET
        signed_object_key = ${objectKey},
        signed_sha256 = ${sha256(input.pdf)},
        signed_filename = ${input.filename},
        signed_uploaded_by = ${input.registeredBy},
        signed_uploaded_at = now(),
        updated_at = now()
      WHERE id = ${input.protocolId}
    `,
  ]

  for (const signature of input.signatures) {
    const person = byId.get(signature.personId)
    statements.push(sql`
      INSERT INTO board_protocol_signatures
        (protocol_id, person_id, role, method, signed_at, attested_sha256,
         signer_name, signer_email, registered_by, registered_ip, user_agent, note)
      VALUES
        (${input.protocolId}, ${signature.personId}, ${signature.role}, ${input.method},
         ${signature.signedAt}, ${protocol.content_sha256},
         ${person?.name ?? 'ukjent'}, ${person?.email ?? null}, ${input.registeredBy},
         ${input.ip}, ${input.userAgent}, ${input.note})
      ON CONFLICT (protocol_id, person_id) DO NOTHING
    `)
  }

  await sql.transaction(statements)

  // Vedtak 4 is satisfied when two signatures exist and one of them is the
  // chair's. Computed from the rows rather than from this request, so a second
  // upload that completes an earlier partial one is handled the same way.
  await sql`
    UPDATE board_protocols p SET completed_at = now()
    WHERE p.id = ${input.protocolId}
      AND p.completed_at IS NULL
      AND (SELECT count(*) FROM board_protocol_signatures s WHERE s.protocol_id = p.id) >= 2
      AND EXISTS (
        SELECT 1 FROM board_protocol_signatures s
        WHERE s.protocol_id = p.id AND s.person_id = p.chair_person_id
      )
  `

  const updated = await getProtocol(input.protocolId)
  if (!updated) throw createError({ statusCode: 500, message: 'Protokollen forsvant under lesing' })
  return updated
}

/**
 * Re-download a stored protocol and check it still hashes to what the register
 * says. This is what makes the archive worth anything in three years: without
 * it, "the PDF is in a bucket" is a claim rather than a fact.
 */
export async function verifyProtocol(
  id: string,
): Promise<{ ok: boolean; checked: { file: string; expected: string; actual: string }[] }> {
  const keys = await protocolObjectKeys(id)
  const protocol = await getProtocol(id)
  if (!keys || !protocol) throw createError({ statusCode: 404, message: 'Fant ikke protokollen' })

  const checked: { file: string; expected: string; actual: string }[] = []

  const generated = await readBoardProtocolObject(keys.pdfObjectKey)
  checked.push({ file: 'protokoll.pdf', expected: protocol.pdfSha256, actual: sha256(generated.data) })

  if (keys.signedObjectKey && protocol.signedSha256) {
    const signed = await readBoardProtocolObject(keys.signedObjectKey)
    checked.push({
      file: 'protokoll-signert.pdf',
      expected: protocol.signedSha256,
      actual: sha256(signed.data),
    })
  }

  return { ok: checked.every((c) => c.expected === c.actual), checked }
}
