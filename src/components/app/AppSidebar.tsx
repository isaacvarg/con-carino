import { Link } from '@tanstack/react-router'
import { LuHeart } from 'react-icons/lu'
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

export default function AppSidebar({ onNavigate }: AppSidebarProps) {
  return (
    <aside className="flex h-full w-64 flex-col bg-transparent px-4 py-6 text-base-content">
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

      <nav className="flex-1 overflow-y-auto" aria-label="Main">
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
    </aside>
  )
}
