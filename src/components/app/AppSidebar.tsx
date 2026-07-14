import { Link } from '@tanstack/react-router'
import { HiOutlineLockClosed } from 'react-icons/hi'
import { APP_NAV } from './nav'

type AppSidebarProps = {
  onNavigate?: () => void
}

const linkBase =
  'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm no-underline transition-colors'

export default function AppSidebar({ onNavigate }: AppSidebarProps) {
  return (
    <aside className="flex h-full w-64 flex-col bg-transparent px-4 py-6 text-base-content">
      <Link
        to="/"
        onClick={onNavigate}
        className="mb-8 flex items-center gap-2.5 px-2 text-base-content no-underline"
      >
        <span
          className="grid size-8 place-items-center rounded-lg bg-secondary text-secondary-content"
          aria-hidden="true"
        >
          <span className="grid grid-cols-2 gap-0.5">
            <span className="size-1.5 rounded-sm bg-primary" />
            <span className="size-1.5 rounded-sm bg-primary" />
            <span className="size-1.5 rounded-sm bg-primary" />
            <span className="size-1.5 rounded-sm bg-primary" />
          </span>
        </span>
        <span className="text-lg font-bold tracking-tight text-base-content">
          Con cariño
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto" aria-label="Main">
        <ul className="flex flex-col gap-1 p-0">
          {APP_NAV.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.to} className="list-none">
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
          })}
        </ul>
      </nav>

      <div className="mt-6 rounded-box bg-secondary p-5 text-secondary-content">
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-secondary-content/15 text-secondary-content">
          <HiOutlineLockClosed className="size-5" aria-hidden />
        </div>
        <p className="mb-4 text-sm leading-snug text-secondary-content">
          Gain full access to your finances with detailed analytics and graphs.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block btn-sm text-primary-content"
        >
          Get Pro
        </button>
      </div>
    </aside>
  )
}
