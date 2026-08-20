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
