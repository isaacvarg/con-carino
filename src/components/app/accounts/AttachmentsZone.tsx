import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { HiOutlineTrash, HiPaperClip } from 'react-icons/hi'
import {
  ALLOWED_CONTENT_TYPES,
  isAllowedContentType,
  MAX_ATTACHMENTS_PER_TXN,
  MAX_UPLOAD_BYTES,
  type AttachmentUploadMeta,
} from '#/lib/attachment-types'
import { createUploadUrl } from '#/server/storage'

export type AttachmentsZoneHandle = {
  uploadAll: () => Promise<AttachmentUploadMeta[]>
}

type PendingFile = {
  id: string
  file: File
}

type AttachmentsZoneProps = {
  disabled?: boolean
  onUploadingChange?: (uploading: boolean) => void
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
>(function AttachmentsZone({ disabled = false, onUploadingChange }, ref) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  function setUploadingState(next: boolean) {
    setUploading(next)
    onUploadingChange?.(next)
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return

    setError(null)
    const next = [...pending]
    const messages: string[] = []

    for (const file of Array.from(fileList)) {
      if (next.length >= MAX_ATTACHMENTS_PER_TXN) {
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
    }

    setPending(next)
    if (messages.length > 0) {
      setError(messages[0] ?? null)
    }
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  function removeFile(id: string) {
    setPending((prev) => prev.filter((item) => item.id !== id))
    setError(null)
  }

  useImperativeHandle(ref, () => ({
    uploadAll: async () => {
      if (pending.length === 0) {
        return []
      }

      setError(null)
      setUploadingState(true)
      const uploaded: AttachmentUploadMeta[] = []

      try {
        for (const item of pending) {
          if (!isAllowedContentType(item.file.type)) {
            throw new Error(`Unsupported file type: ${item.file.name}`)
          }

          const { key, uploadUrl } = await createUploadUrl({
            data: {
              contentType: item.file.type,
              contentLength: item.file.size,
            },
          })

          const response = await fetch(uploadUrl, {
            method: 'PUT',
            body: item.file,
            headers: {
              'Content-Type': item.file.type,
            },
          })

          if (!response.ok) {
            throw new Error(
              `Failed to upload "${item.file.name}" (${response.status}).`,
            )
          }

          uploaded.push({
            storageKey: key,
            fileName: item.file.name,
            contentType: item.file.type,
            byteSize: item.file.size,
          })
        }

        return uploaded
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to upload attachments.'
        setError(message)
        throw err
      } finally {
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

      <input
        ref={inputRef}
        id="attachments-input"
        type="file"
        className="file-input file-input-bordered w-full"
        accept={ACCEPT}
        multiple
        disabled={disabled || uploading || pending.length >= MAX_ATTACHMENTS_PER_TXN}
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
                  {formatBytes(item.file.size)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-square btn-sm"
                aria-label={`Remove ${item.file.name}`}
                disabled={disabled || uploading}
                onClick={() => removeFile(item.id)}
              >
                <HiOutlineTrash className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="mt-2 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
})
