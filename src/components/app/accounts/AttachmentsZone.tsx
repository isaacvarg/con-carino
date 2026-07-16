import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { HiOutlineDocument, HiOutlineTrash, HiPaperClip } from 'react-icons/hi'
import {
  ALLOWED_CONTENT_TYPES,
  isAllowedContentType,
  MAX_ATTACHMENTS_PER_TXN,
  MAX_UPLOAD_BYTES,
  type AttachmentListItem,
  type AttachmentUploadMeta,
} from '#/lib/attachment-types'

export type AttachmentsZoneHandle = {
  uploadAll: () => Promise<AttachmentUploadMeta[]>
  getKeepAttachmentIds: () => string[]
}

type PendingFile = {
  id: string
  file: File
}

type AttachmentsZoneProps = {
  disabled?: boolean
  onUploadingChange?: (uploading: boolean) => void
  existingAttachments?: AttachmentListItem[]
}

const ACCEPT = ALLOWED_CONTENT_TYPES.join(',')

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const AttachmentsZone = forwardRef<
  AttachmentsZoneHandle,
  AttachmentsZoneProps
>(function AttachmentsZone(
  {
    disabled = false,
    onUploadingChange,
    existingAttachments = [],
  },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingFile[]>([])
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)

  const retained = existingAttachments.filter(
    (item) => !removedIds.includes(item.id),
  )
  const totalCount = retained.length + pending.length
  const atLimit = totalCount >= MAX_ATTACHMENTS_PER_TXN

  function setUploadingState(next: boolean) {
    setUploading(next)
    onUploadingChange?.(next)
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return

    setError(null)
    const next = [...pending]
    const messages: string[] = []
    let currentTotal = retained.length + next.length

    for (const file of Array.from(fileList)) {
      if (currentTotal >= MAX_ATTACHMENTS_PER_TXN) {
        messages.push(
          `You can attach at most ${MAX_ATTACHMENTS_PER_TXN} files.`,
        )
        break
      }
      if (!isAllowedContentType(file.type)) {
        messages.push(
          `"${file.name}" is not a supported type (PDF or image).`,
        )
        continue
      }
      if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
        messages.push(
          `"${file.name}" must be between 1 byte and ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB.`,
        )
        continue
      }
      next.push({ id: crypto.randomUUID(), file })
      currentTotal += 1
    }

    setPending(next)
    if (messages.length > 0) {
      setError(messages[0] ?? null)
    }
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  function removePending(id: string) {
    setPending((prev) => prev.filter((item) => item.id !== id))
    setError(null)
  }

  function removeExisting(id: string) {
    setRemovedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setError(null)
  }

  useImperativeHandle(ref, () => ({
    getKeepAttachmentIds: () => retained.map((item) => item.id),
    uploadAll: async () => {
      if (pending.length === 0) {
        return []
      }

      setError(null)
      setUploadingState(true)
      const uploaded: AttachmentUploadMeta[] = []

      try {
        for (const [index, item] of pending.entries()) {
          if (!isAllowedContentType(item.file.type)) {
            throw new Error(`Unsupported file type: ${item.file.name}`)
          }

          setProgress({ done: index, total: pending.length })

          const form = new FormData()
          form.append('file', item.file)
          const response = await fetch('/api/uploads', {
            method: 'POST',
            body: form,
          })

          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as {
              error?: string
            } | null
            throw new Error(
              body?.error ??
                `Failed to upload "${item.file.name}" (${response.status}).`,
            )
          }

          const { attachment } = (await response.json()) as {
            attachment: AttachmentUploadMeta
          }
          uploaded.push(attachment)
        }

        return uploaded
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to upload attachments.'
        setError(message)
        throw err
      } finally {
        setProgress(null)
        setUploadingState(false)
      }
    },
  }))

  return (
    <div>
      <label className="label" htmlFor="attachments-input">
        <span className="label-text font-medium">Attachments</span>
      </label>
      <p className="mb-2 text-xs text-base-content/50">
        PDF or images (JPEG, PNG, WebP, GIF). Up to {MAX_ATTACHMENTS_PER_TXN}{' '}
        files, {MAX_UPLOAD_BYTES / (1024 * 1024)} MiB each.
      </p>

      {retained.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-2">
          {retained.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-box border border-base-200 bg-base-200/40 px-3 py-2"
            >
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  className="size-10 rounded object-cover"
                />
              ) : (
                <HiOutlineDocument
                  className="size-5 shrink-0 text-base-content/50"
                  aria-hidden
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.fileName}</p>
                <p className="text-xs text-base-content/50">
                  {formatBytes(item.byteSize)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-square btn-sm"
                aria-label={`Remove ${item.fileName}`}
                disabled={disabled || uploading}
                onClick={() => removeExisting(item.id)}
              >
                <HiOutlineTrash className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={inputRef}
        id="attachments-input"
        type="file"
        className="file-input file-input-bordered w-full"
        accept={ACCEPT}
        multiple
        disabled={disabled || uploading || atLimit}
        onChange={(event) => addFiles(event.target.files)}
      />

      {pending.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {pending.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-box border border-base-200 bg-base-200/40 px-3 py-2"
            >
              <HiPaperClip
                className="size-4 shrink-0 text-base-content/50"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.file.name}</p>
                <p className="text-xs text-base-content/50">
                  {formatBytes(item.file.size)} · new
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-square btn-sm"
                aria-label={`Remove ${item.file.name}`}
                disabled={disabled || uploading}
                onClick={() => removePending(item.id)}
              >
                <HiOutlineTrash className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {progress ? (
        <p className="mt-2 text-sm text-base-content/70" role="status">
          Uploading {Math.min(progress.done + 1, progress.total)} of{' '}
          {progress.total}…
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
})
