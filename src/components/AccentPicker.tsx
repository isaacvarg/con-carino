import { useState } from 'react'
import { HiOutlineColorSwatch } from 'react-icons/hi'
import { ACCENTS, type AccentName } from '#/lib/accents'
import { useAppearance } from '#/lib/appearance'

function label(accent: AccentName) {
  return accent.charAt(0).toUpperCase() + accent.slice(1)
}

export default function AccentPicker() {
  const [open, setOpen] = useState(false)
  const { accent, setAccent } = useAppearance()

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-circle btn-sm text-base-content"
        onClick={() => setOpen(true)}
        aria-label="Change accent color"
      >
        <HiOutlineColorSwatch className="size-5" aria-hidden />
      </button>

      {open ? (
        <dialog className="modal modal-open" aria-modal="true">
          <div className="modal-box max-w-sm">
            <h3 className="text-lg font-semibold text-base-content">
              Accent color
            </h3>
            <p className="mt-1 text-sm text-base-content/70">
              Pick a Catppuccin color. It applies right away.
            </p>

            <div className="mt-4 grid grid-cols-7 gap-2">
              {ACCENTS.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`aspect-square w-full rounded-field border border-base-content/10 transition hover:scale-105 ${
                    name === accent
                      ? 'ring-2 ring-base-content ring-offset-2 ring-offset-base-100'
                      : ''
                  }`}
                  style={{ backgroundColor: `var(--ctp-${name})` }}
                  aria-pressed={name === accent}
                  onClick={() => setAccent(name)}
                >
                  <span className="sr-only">{label(name)}</span>
                </button>
              ))}
            </div>

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setOpen(false)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </>
  )
}
