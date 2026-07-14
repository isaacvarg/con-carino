import { forwardRef, type ReactNode } from 'react'

type TaxonomyCreateDialogProps = {
  title: string
  children: ReactNode
}

/**
 * daisyUI Modal via HTML `<dialog class="modal">`.
 * Open with `ref.current?.showModal()`, close with `ref.current?.close()`.
 * @see https://daisyui.com/components/modal/
 */
export const TaxonomyCreateDialog = forwardRef<
  HTMLDialogElement,
  TaxonomyCreateDialogProps
>(function TaxonomyCreateDialog({ title, children }, ref) {
  return (
    <dialog ref={ref} className="modal">
      <div className="modal-box max-w-md">
        <form method="dialog">
          <button
            type="submit"
            className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
            aria-label="Close"
          >
            ✕
          </button>
        </form>
        <h3 className="text-lg font-bold text-base-content">{title}</h3>
        <div className="mt-4">{children}</div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit">close</button>
      </form>
    </dialog>
  )
})
