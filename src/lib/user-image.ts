import { buildSignedFileUrl } from '#/lib/file-tokens'
import { getBucketName } from '#/lib/storage'

/** OAuth URLs stay as-is; app uploads store an S3 object key. */
export function isRemoteImageUrl(image: string): boolean {
  return image.startsWith('http://') || image.startsWith('https://')
}

export function resolveUserImageUrl(image: string | null | undefined): string | null {
  if (!image) return null
  if (isRemoteImageUrl(image)) return image
  return buildSignedFileUrl(getBucketName(), image)
}
