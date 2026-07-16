import { HiOutlineDocument, HiOutlineExternalLink } from 'react-icons/hi'
import type { DocumentListItem } from '#/lib/document-types'

type DocumentViewerProps = {
  document: DocumentListItem
}

/**
 * Renders the file inline. The proxy route serves `Content-Disposition: inline`
 * and supports range requests, so the browser's own PDF and image viewers do
 * the work — no client-side pdf.js needed.
 */
export function DocumentViewer({ document }: DocumentViewerProps) {
  const isPdf = document.contentType === 'application/pdf'
  const isImage = document.contentType.startsWith('image/')

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-box border border-base-300 bg-base-200/40">
        {isPdf ? (
          <iframe
            src={document.fileUrl}
            title={document.name}
            className="h-[80vh] w-full"
          />
        ) : isImage ? (
          <img
            src={document.fileUrl}
            alt={document.name}
            className="max-h-[80vh] w-full object-contain"
          />
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-base-content/60">
            <HiOutlineDocument className="size-10" aria-hidden />
            <p className="text-sm">This file type can’t be previewed.</p>
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <a
          href={document.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost btn-sm"
        >
          <HiOutlineExternalLink className="size-4" aria-hidden />
          Open in new tab
        </a>
      </div>
    </div>
  )
}
