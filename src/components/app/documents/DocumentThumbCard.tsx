import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { HiOutlineDocument } from 'react-icons/hi'
import { TaxonomyBadge } from '#/components/app/transactions/TaxonomyBadge'
import { formatBytes } from '#/lib/format-bytes'
import type { DocumentListItem } from '#/lib/document-types'

type DocumentThumbCardProps = {
  document: DocumentListItem
}

export function DocumentThumbCard({ document }: DocumentThumbCardProps) {
  const [thumbFailed, setThumbFailed] = useState(false)
  const showThumb = document.thumbnailUrl !== null && !thumbFailed

  return (
    <li className="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <Link
        to="/documents/$documentId"
        params={{ documentId: document.id }}
        className="flex h-full flex-col transition-colors hover:bg-base-200/40"
      >
        <div className="flex h-40 items-center justify-center border-b border-base-300 bg-base-200/40">
          {showThumb ? (
            <img
              src={document.thumbnailUrl!}
              alt=""
              className="size-full object-cover"
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <HiOutlineDocument
              className="size-10 text-base-content/40"
              aria-hidden
            />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <p className="truncate font-medium text-base-content" title={document.name}>
            {document.name}
          </p>
          <TaxonomyBadge
            name={document.type.name}
            bgColor={document.type.bgColor}
            textColor={document.type.textColor}
            size="sm"
          />
          <p className="mt-auto text-xs text-base-content/50">
            {formatBytes(document.byteSize)}
          </p>
        </div>
      </Link>
    </li>
  )
}
