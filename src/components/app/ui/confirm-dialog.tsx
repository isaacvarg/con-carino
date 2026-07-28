import type { ReactNode } from 'react'

const CONFIRM_TONE_CLASS = {
  default: 'btn-primary',
  danger: 'btn-error',
  warning: 'btn-warning',
} as const

type ConfirmDialogProps = {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger' | 'warning'
  busy?: boolean
  /** Blocks confirming while the dialog's own input is incomplete. */
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <dialog className="modal modal-open" role="alertdialog" aria-modal="true">
      <div className="modal-box max-w-sm">
        <h3 className="text-lg font-semibold text-base-content">{title}</h3>
        <div className="mt-2 text-sm text-base-content/70">{message}</div>
        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${CONFIRM_TONE_CLASS[tone]}`}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onCancel} disabled={busy}>
          close
        </button>
      </form>
    </dialog>
  )
}
