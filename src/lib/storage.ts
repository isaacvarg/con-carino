import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  assertAllowedContentType,
  assertUploadSize,
  CONTENT_TYPE_EXTENSIONS,
  type AllowedContentType,
} from '#/lib/attachment-types'

export {
  ALLOWED_CONTENT_TYPES,
  assertAllowedContentType,
  assertUploadSize,
  isAllowedContentType,
  MAX_UPLOAD_BYTES,
  type AllowedContentType,
} from '#/lib/attachment-types'

const globalForStorage = globalThis as unknown as {
  s3Client?: S3Client
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is not configured.`)
  }
  return value
}

function getBucket(): string {
  return requireEnv('S3_BUCKET')
}

export function getS3Client(): S3Client {
  if (globalForStorage.s3Client) {
    return globalForStorage.s3Client
  }

  const endpoint = requireEnv('S3_ENDPOINT')
  const region = process.env.S3_REGION?.trim() || 'us-east-1'
  const accessKeyId = requireEnv('S3_ACCESS_KEY_ID')
  const secretAccessKey = requireEnv('S3_SECRET_ACCESS_KEY')
  const forcePathStyle =
    (process.env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false'

  const client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })

  if (process.env.NODE_ENV !== 'production') {
    globalForStorage.s3Client = client
  }

  return client
}

export function buildObjectKey(
  userId: string,
  contentType: AllowedContentType,
): string {
  const year = new Date().getUTCFullYear()
  const ext = CONTENT_TYPE_EXTENSIONS[contentType]
  return `${userId}/${year}/${crypto.randomUUID()}.${ext}`
}

function httpStatus(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    typeof (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata
      ?.httpStatusCode === 'number'
  ) {
    return (error as { $metadata: { httpStatusCode: number } }).$metadata
      .httpStatusCode
  }
  return undefined
}

function errorName(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof (error as { name?: unknown }).name === 'string'
  ) {
    return (error as { name: string }).name
  }
  return ''
}

export async function ensureBucket(): Promise<void> {
  const client = getS3Client()
  const bucket = getBucket()

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    return
  } catch (error) {
    const status = httpStatus(error)
    // Missing bucket is typically 404; some S3-compatible stores return 403.
    if (status !== undefined && status !== 404 && status !== 403) {
      throw error
    }
  }

  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }))
  } catch (error) {
    const name = errorName(error)
    if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') {
      return
    }
    throw error
  }
}

export async function putObject(options: {
  key: string
  body: Buffer | Uint8Array | string
  contentType: AllowedContentType
}): Promise<{ key: string; bucket: string }> {
  assertAllowedContentType(options.contentType)
  const body =
    typeof options.body === 'string'
      ? Buffer.from(options.body)
      : options.body
  assertUploadSize(body.byteLength)

  await ensureBucket()
  const client = getS3Client()
  const bucket = getBucket()

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: options.key,
      Body: body,
      ContentType: options.contentType,
    }),
  )

  return { key: options.key, bucket }
}

export async function getObject(key: string) {
  const client = getS3Client()
  const bucket = getBucket()
  return client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  )
}

export async function deleteObject(key: string): Promise<void> {
  const client = getS3Client()
  const bucket = getBucket()
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  )
}

const DEFAULT_PRESIGN_EXPIRES_IN = 60 * 15

export async function presignGetObject(
  key: string,
  expiresIn = DEFAULT_PRESIGN_EXPIRES_IN,
): Promise<string> {
  const client = getS3Client()
  const bucket = getBucket()
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  )
}

export async function presignPutObject(options: {
  key: string
  contentType: AllowedContentType
  contentLength: number
  expiresIn?: number
}): Promise<string> {
  assertAllowedContentType(options.contentType)
  assertUploadSize(options.contentLength)
  await ensureBucket()

  const client = getS3Client()
  const bucket = getBucket()

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: options.key,
      ContentType: options.contentType,
      ContentLength: options.contentLength,
    }),
    { expiresIn: options.expiresIn ?? DEFAULT_PRESIGN_EXPIRES_IN },
  )
}

/** Ensures the object key belongs to the given user (prefix convention). */
export function assertObjectKeyOwnedByUser(key: string, userId: string): void {
  if (!key.startsWith(`${userId}/`)) {
    throw new Error('Object not found.')
  }
}
