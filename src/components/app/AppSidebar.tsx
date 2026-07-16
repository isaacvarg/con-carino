import { Link } from '@tanstack/react-router'
import { useRef } from 'react'
import { LuCoffee, LuGithub, LuHeart, LuMessageSquare } from 'react-icons/lu'
import { FEEDBACK_URL } from '#/lib/feedback'
import { APP_NAV, type AppNavLink } from './nav'

type AppSidebarProps = {
  onNavigate?: () => void
}

const linkBase =
  'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm no-underline transition-colors'

const groupLabelClass =
  'px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-base-content/50'

function NavLinkItem({
  item,
  onNavigate,
  className,
}: {
  item: AppNavLink
  onNavigate?: () => void
  className?: string
}) {
  const Icon = item.icon
  return (
    <li className={`list-none ${className ?? ''}`.trim()}>
      <Link
        to={item.to}
        onClick={(event) => {
          onNavigate?.()
          // Drop DaisyUI/browser :focus flash after navigation
          ;(event.currentTarget as HTMLAnchorElement).blur()
        }}
        activeOptions={{
          exact: item.to === '/',
          includeSearch: false,
        }}
        className={linkBase}
        inactiveProps={{
          className:
            'bg-transparent font-medium !text-base-content hover:bg-base-200 hover:!text-base-content focus-visible:bg-base-200 focus-visible:!text-base-content',
        }}
        activeProps={{
          className:
            'bg-primary font-semibold !text-primary-content hover:bg-primary hover:!text-primary-content focus:bg-primary focus:!text-primary-content focus-visible:bg-primary focus-visible:!text-primary-content',
        }}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {item.label}
      </Link>
    </li>
  )
}

function SidebarCredit() {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex w-full flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-center text-[11px] leading-tight font-semibold text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
      >
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          Forged with
          <LuHeart className="size-3.5 shrink-0 text-primary" aria-hidden />
          &amp;
          <LuCoffee className="size-3.5 shrink-0 text-primary" aria-hidden />
        </span>
        <span className="whitespace-nowrap">
          by <span className="text-primary">Isaac Vargas</span>
        </span>
      </button>

      <dialog ref={dialogRef} className="modal" aria-label="About Con cariño">
        <div className="modal-box max-w-md">
          <form method="dialog">
            <button
              className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3"
              aria-label="Close"
            >
              ✕
            </button>
          </form>

          <h3 className="flex items-center gap-2 text-lg font-bold text-base-content">
            <span
              className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <LuHeart className="size-4" />
            </span>
            About Con cariño
          </h3>

          <div className="mt-4 flex flex-col gap-3 text-sm text-base-content/80">
            <p className="m-0">
              This app was created to help all the family members organize care
              for my lovely abuelo Enos.
            </p>
            <p className="m-0">
              Inspired by my dad Bill Vargas&apos;s sweet spreadsheet skills.
            </p>
          </div>

          <div className="modal-action flex-wrap justify-end gap-2">
            <a
              href={FEEDBACK_URL}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary btn-sm gap-2"
            >
              <LuMessageSquare className="size-4" aria-hidden />
              Send feedback
            </a>
            <a
              href="https://github.com/isaacvarg/con-carino"
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary btn-sm gap-2"
            >
              <LuGithub className="size-4" aria-hidden />
              View on GitHub
            </a>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button aria-label="Close">close</button>
        </form>
      </dialog>
    </>
  )
}

export default function AppSidebar({ onNavigate }: AppSidebarProps) {
  return (
    <aside className="flex h-full min-h-full w-64 flex-col bg-transparent px-4 pt-6 pb-3 text-base-content">
      <Link
        to="/"
        onClick={onNavigate}
        className="mb-8 flex items-center gap-2.5 px-2 text-base-content no-underline"
      >
        <span
          className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <LuHeart className="size-4" />
        </span>
        <span className="text-lg font-bold tracking-tight text-base-content">
          Con cariño
        </span>
      </Link>

      <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Main">
        <ul className="flex flex-col gap-1 p-0">
          {APP_NAV.map((entry, index) => {
            const prev = APP_NAV[index - 1]
            // Space after a group so trailing links don't read as part of it
            const afterGroup = prev?.kind === 'group'

            if (entry.kind === 'group') {
              return (
                <li key={entry.label} className="list-none">
                  <div className={groupLabelClass}>{entry.label}</div>
                  <ul className="flex flex-col gap-1 p-0">
                    {entry.items.map((item) => (
                      <NavLinkItem
                        key={item.to}
                        item={item}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </ul>
                </li>
              )
            }

            return (
              <NavLinkItem
                key={entry.to}
                item={entry}
                onNavigate={onNavigate}
                className={afterGroup ? 'mt-4' : undefined}
              />
            )
          })}
        </ul>
      </nav>

      <div className="mt-auto shrink-0 pt-4">
        <SidebarCredit />
      </div>
    </aside>
  )
}
