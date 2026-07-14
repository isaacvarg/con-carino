import { Link, useRouterState } from '@tanstack/react-router'
import type { AuthSession } from 'start-authjs'
import {
  HiOutlineBell,
  HiOutlineChatAlt,
  HiOutlineMenu,
  HiOutlineSearch,
} from 'react-icons/hi'
import ThemeToggle from '../ThemeToggle'
import { titleForPath } from './nav'

type AppHeaderProps = {
  onMenuClick?: () => void
}

export default function AppHeader({ onMenuClick }: AppHeaderProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const session = useRouterState({
    select: (state) =>
      (state.matches[0]?.context as { session?: AuthSession | null } | undefined)
        ?.session ?? null,
  })
  const account = useRouterState({
    select: (state) => {
      const match = state.matches.find(
        (item) => item.routeId === '/_app/accounts/$accountId',
      )
      const data = match?.loaderData as
        | { name?: string; isGlobal?: boolean }
        | undefined
      if (!data?.name) return null
      return { name: data.name, isGlobal: Boolean(data.isGlobal) }
    },
  })

  const path = pathname.replace(/\/$/, '') || '/'
  const isAccountRoute =
    Boolean(account) &&
    path !== '/accounts/new' &&
    /^\/accounts\/[^/]+(?:\/settings|\/transactions\/new)?$/.test(path)
  const title = isAccountRoute ? account!.name : titleForPath(pathname)
  const displayName =
    session?.user?.name ?? session?.user?.email ?? 'Guest'
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-base-content lg:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-ghost btn-square btn-sm text-base-content lg:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <HiOutlineMenu className="size-5" aria-hidden />
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-base-content lg:text-3xl">
            {title}
          </h1>
          {isAccountRoute && account?.isGlobal ? (
            <span className="badge badge-primary badge-outline">Global</span>
          ) : null}
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <label className="input input-bordered flex w-full max-w-xs items-center gap-2 rounded-full bg-base-100 text-base-content sm:w-64 lg:w-72">
          <HiOutlineSearch
            className="size-4 shrink-0 text-base-content/60"
            aria-hidden
          />
          <input
            type="search"
            className="grow text-base-content placeholder:text-base-content/50"
            placeholder="Search"
            aria-label="Search"
          />
        </label>

        <ThemeToggle />

        <button
          type="button"
          className="btn btn-ghost btn-circle btn-sm text-base-content"
          aria-label="Messages"
        >
          <HiOutlineChatAlt className="size-5" aria-hidden />
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-circle btn-sm text-base-content"
          aria-label="Notifications"
        >
          <div className="indicator">
            <HiOutlineBell className="size-5" aria-hidden />
            <span className="badge indicator-item badge-error badge-xs" />
          </div>
        </button>

        {session?.user ? (
          <div className="flex items-center gap-2 pl-1">
            <span className="hidden text-sm font-semibold text-base-content sm:inline">
              {displayName}
            </span>
            <div className="avatar avatar-placeholder">
              <div className="w-9 rounded-full bg-secondary text-secondary-content">
                <span className="text-xs font-semibold text-secondary-content">
                  {initials}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <Link
            to="/login"
            className="btn btn-ghost btn-sm text-base-content"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
