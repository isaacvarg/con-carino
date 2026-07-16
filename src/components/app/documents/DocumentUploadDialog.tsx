import { useRouter } from '@tanstack/react-router'
import { useRef, useState, type FormEvent, type RefObject } from 'react'
import {
  FORM_INPUT_CLASS,
  FORM_SELECT_CLASS,
  FormActions,
  FormField,
  FormShell,
} from '#/components/app/ui/form'
import {
  ALLOWED_CONTENT_TYPES,
  isAllowedContentType,
  MAX_UPLOAD_BYTES,
} from '#/lib/attachment-types'
import type { DocumentTypeRecord } from '#/lib/document-types'
import { uploadFile } from '#/lib/upload-client'
import { createDocument } from '#/server/documents'

const ACCEPT = ALLOWED_CONTENT_TYPES.join(',')

type DocumentUploadDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>
  documentTypes: DocumentTypeRecord[]
}

/** Strips the extension so the name field starts from something readable. */
function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^./]+$/, '')
}

export function DocumentUploadForm({
  dialogRef,
  documentTypes,
}: DocumentUploadDialogProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [documentTypeId, setDocumentTypeId] = useState(
    documentTypes[0]?.id ?? '',
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setFile(null)
    setName('')
    setDocumentTypeId(documentTypes[0]?.id ?? '')
    setError(null)
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  function pickFile(next: File | null) {
    setError(null)
    if (!next) {
      setFile(null)
      return
    }
    if (!isAllowedContentType(next.type)) {
      setError(`"${next.name}" is not a supported type (PDF or image).`)
      setFile(null)
      return
    }
    if (next.size <= 0 || next.size > MAX_UPLOAD_BYTES) {
      setError(
        `"${next.name}" must be between 1 byte and ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB.`,
      )
      setFile(null)
      return
    }
    setFile(next)
    // Only prefill an untouched name, so a typed one is never clobbered.
    setName((prev) => (prev.trim() ? prev : nameFromFile(next.name)))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Choose a file to upload.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const uploaded = await uploadFile(file)
      await createDocument({
        data: {
          name,
          documentTypeId,
          storageKey: uploaded.storageKey,
          thumbnailKey: uploaded.thumbnailKey,
          fileName: uploaded.fileName,
          contentType: uploaded.contentType,
          byteSize: uploaded.byteSize,
        },
      })
      reset()
      dialogRef.current?.close()
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload document.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormShell card={false} onSubmit={save}>
      <FormField
        label="File"
        htmlFor="document-file"
        hint={`PDF or images (JPEG, PNG, WebP, GIF). Up to ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB.`}
      >
        <input
          ref={inputRef}
          id="document-file"
          type="file"
          className="file-input file-input-bordered w-full"
          accept={ACCEPT}
          disabled={saving}
          onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
        />
      </FormField>

      <FormField label="Name" htmlFor="document-name">
        <input
          id="document-name"
          className={FORM_INPUT_CLASS}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </FormField>

      <FormField label="Type" htmlFor="document-type">
        <select
          id="document-type"
          className={FORM_SELECT_CLASS}
          value={documentTypeId}
          onChange={(event) => setDocumentTypeId(event.target.value)}
          required
        >
          {documentTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </FormField>

      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      <FormActions>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            reset()
            dialogRef.current?.close()
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || !file}
        >
          {saving ? 'Uploading…' : 'Upload document'}
        </button>
      </FormActions>
    </FormShell>
  )
}
