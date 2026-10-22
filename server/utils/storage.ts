import { Storage } from '@google-cloud/storage'

// Lazily-constructed singleton. On Cloud Run this authenticates via the ambient
// service account (ADC); locally it uses `gcloud auth application-default login`.
let storage: Storage | null = null

function client(): Storage {
  if (!storage) storage = new Storage()
  return storage
}

/**
 * Fetch an object from the investor-updates bucket as a Buffer + content type.
 * Throws 404 if the bucket is not configured or the object does not exist.
 * Callers MUST perform the cohort check before calling this — the bucket is
 * private and there is no per-object ACL; access control lives in the portal.
 */
export async function readInvestorUpdateObject(
  objectKey: string,
): Promise<{ data: Buffer; contentType: string; filename: string }> {
  const config = useRuntimeConfig()
  const bucketName = config.gcsInvestorUpdatesBucket
  if (!bucketName) {
    throw createError({ statusCode: 404, message: 'Attachment storage not configured' })
  }
  return readObject(bucketName, objectKey, 'Attachment')
}

/**
 * Read a styreprotokoll PDF. Same private-bucket, proxy-on-every-request model
 * as investor updates, but a different bucket: protocols are permanent records
 * of the association, and the investor-updates ingest identity has objectAdmin
 * on its own bucket and has no business anywhere near these.
 */
export async function readBoardProtocolObject(
  objectKey: string,
): Promise<{ data: Buffer; contentType: string; filename: string }> {
  return readObject(boardProtocolsBucket(), objectKey, 'Protokoll')
}

/**
 * Write a styreprotokoll PDF. `ifGenerationMatch: 0` makes the write fail rather
 * than overwrite when the key already exists — an issued protocol is immutable,
 * and a new version gets a new key, so a collision means a bug and should be
 * loud.
 */
export async function writeBoardProtocolObject(
  objectKey: string,
  data: Buffer,
  options: { contentType?: string; allowOverwrite?: boolean } = {},
): Promise<void> {
  const file = client().bucket(boardProtocolsBucket()).file(objectKey)
  await file.save(data, {
    contentType: options.contentType ?? 'application/pdf',
    // A generated protocol is written once and never again: a new version gets a
    // new key, so a collision means a bug and should be loud. The signed
    // rendition is the exception. It arrives from outside, and the first upload
    // is sometimes the wrong file, so replacing it has to be possible. The
    // bucket has versioning enabled, so a replaced object is retained rather
    // than lost, and the register records the hash of whatever is current.
    ...(options.allowOverwrite ? {} : { preconditionOpts: { ifGenerationMatch: 0 } }),
    metadata: { cacheControl: 'private, no-store' },
  })
}

function boardProtocolsBucket(): string {
  const bucketName = useRuntimeConfig().gcsBoardProtocolsBucket
  if (!bucketName) {
    throw createError({ statusCode: 503, message: 'Protokoll-lagring er ikke konfigurert' })
  }
  return bucketName
}

async function readObject(
  bucketName: string,
  objectKey: string,
  label: string,
): Promise<{ data: Buffer; contentType: string; filename: string }> {
  const file = client().bucket(bucketName).file(objectKey)
  const [exists] = await file.exists()
  if (!exists) {
    throw createError({ statusCode: 404, message: `${label} not found` })
  }

  const [metadata] = await file.getMetadata()
  const [data] = await file.download()
  return {
    data,
    contentType: metadata.contentType || 'application/octet-stream',
    filename: objectKey.split('/').pop() || 'attachment',
  }
}

/**
 * Deal documents (memo, deck, call notes) and vote protocols, in their own
 * private bucket: they are about companies we have not invested in yet, and
 * neither the investor-updates ingest identity nor the board-protocol register
 * has any business with them. Same proxy-on-every-request model: callers MUST
 * run the case access check (server/utils/deals.ts) before reading.
 *
 * Every version is its own object key (deals/<slug>/<key>/v<n>-<sha8>.<ext>), so a
 * write never overwrites: a ballot attests to the hash of what was on the page.
 *
 * Local development without GCS: set DEAL_DOCUMENTS_DIR to a folder and the same
 * keys are read and written there. Ignored on Cloud Run and whenever a bucket is set.
 */
export async function readDealDocumentObject(
  objectKey: string,
): Promise<{ data: Buffer; contentType: string; filename: string }> {
  const dir = localDealDocumentsDir()
  if (dir) return readLocalObject(dir, objectKey)
  return readObject(dealDocumentsBucket(), objectKey, 'Document')
}

export async function writeDealDocumentObject(objectKey: string, data: Buffer, contentType: string): Promise<void> {
  const dir = localDealDocumentsDir()
  if (dir) return writeLocalObject(dir, objectKey, data)
  const file = client().bucket(dealDocumentsBucket()).file(objectKey)
  await file.save(data, {
    contentType,
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { cacheControl: 'private, no-store' },
  })
}

function dealDocumentsBucket(): string {
  const bucketName = useRuntimeConfig().gcsDealDocumentsBucket
  if (!bucketName) {
    throw createError({ statusCode: 503, message: 'Document storage not configured' })
  }
  return bucketName
}

function localDealDocumentsDir(): string | null {
  const dir = process.env.DEAL_DOCUMENTS_DIR
  // K_SERVICE is set by Cloud Run at runtime (NODE_ENV is inlined at build time,
  // so a local production build could not use the folder otherwise).
  if (!dir || process.env.K_SERVICE || useRuntimeConfig().gcsDealDocumentsBucket) return null
  return dir
}

const LOCAL_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  md: 'text/markdown',
}

async function readLocalObject(dir: string, objectKey: string) {
  const { readFile } = await import('node:fs/promises')
  const { join, normalize } = await import('node:path')
  const path = normalize(join(dir, objectKey))
  if (!path.startsWith(normalize(dir))) throw createError({ statusCode: 400, message: 'Bad key' })
  const data = await readFile(path).catch(() => {
    throw createError({ statusCode: 404, message: 'Document not found' })
  })
  const ext = objectKey.split('.').pop() || ''
  return {
    data,
    contentType: LOCAL_TYPES[ext] || 'application/octet-stream',
    filename: objectKey.split('/').pop() || 'document',
  }
}

async function writeLocalObject(dir: string, objectKey: string, data: Buffer) {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { dirname, join, normalize } = await import('node:path')
  const path = normalize(join(dir, objectKey))
  if (!path.startsWith(normalize(dir))) throw createError({ statusCode: 400, message: 'Bad key' })
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, data, { flag: 'wx' })
}
