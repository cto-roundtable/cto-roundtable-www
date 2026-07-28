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

  const file = client().bucket(bucketName).file(objectKey)
  const [exists] = await file.exists()
  if (!exists) {
    throw createError({ statusCode: 404, message: 'Attachment not found' })
  }

  const [metadata] = await file.getMetadata()
  const [data] = await file.download()
  return {
    data,
    contentType: metadata.contentType || 'application/octet-stream',
    filename: objectKey.split('/').pop() || 'attachment',
  }
}
