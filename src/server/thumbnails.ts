import type { AllowedContentType } from '#/lib/attachment-types'

export const THUMBNAIL_MAX_EDGE = 320
export const THUMBNAIL_QUALITY = 75

const PDF_RENDER_EDGE = 640

async function renderPdfFirstPage(data: Buffer): Promise<Buffer> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = await import('@napi-rs/canvas')

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    disableFontFace: true,
  })

  try {
    const doc = await loadingTask.promise
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = PDF_RENDER_EDGE / Math.max(base.width, base.height)
    const viewport = page.getViewport({ scale })

    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    )
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise

    return await canvas.encode('png')
  } finally {
    await loadingTask.destroy()
  }
}

/**
 * Renders a small webp preview of an uploaded attachment. Returns null when
 * the input cannot be rendered (corrupt file, encrypted PDF, ...): thumbnails
 * are best-effort and the caller stores a null thumbnail key instead.
 */
export async function generateThumbnail(
  data: Buffer,
  contentType: AllowedContentType,
): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import('sharp')
    const source =
      contentType === 'application/pdf' ? await renderPdfFirstPage(data) : data

    return await sharp(source)
      .resize(THUMBNAIL_MAX_EDGE, THUMBNAIL_MAX_EDGE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: THUMBNAIL_QUALITY })
      .toBuffer()
  } catch (error) {
    console.warn(`Thumbnail generation failed (${contentType}):`, error)
    return null
  }
}
