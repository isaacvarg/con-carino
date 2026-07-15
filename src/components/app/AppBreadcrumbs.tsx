import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { HiArrowLeft, HiOutlineHome } from 'react-icons/hi'
import { accountDetailSearchDefaults } from '#/components/app/accounts/account-detail-search'
import { flattenNavLinks } from '#/components/app/nav'
import { transactionsSearchDefaults } from '#/components/app/transactions/transactions-search'

type BreadcrumbHref =
  | { to: '/' }
  | { to: '/accounts' }
  | { to: '/transactions'; search: typeof transactionsSearchDefaults }
  | { to: '/schedule' }
  | { to: '/meds' }
  | { to: '/invoices' }
  | { to: '/documents' }
  | { to: '/insights' }
  | { to: '/settings' }
  | {
      to: '/accounts/$accountId'
      params: { accountId: string }
      search: typeof accountDetailSearchDefaults
    }

export type BreadcrumbCrumb = {
  label: string
  href?: BreadcrumbHref
}

export function crumbsForPath(
  pathname: string,
  account: { id: string; name: string } | null,
): BreadcrumbCrumb[] {
  const path = pathname.replace(/\/$/, '') || '/'

  if (path === '/accounts/new') {
    return [
      { label: 'accounts', href: { to: '/accounts' } },
      { label: 'add account' },
    ]
  }

  const accountSettings = path.match(/^\/accounts\/([^/]+)\/settings$/)
  if (accountSettings) {
    const accountId = accountSettings[1]!
    return [
      { label: 'accounts', href: { to: '/accounts' } },
      {
        label: (account?.name ?? 'account').toLowerCase(),
        href: {
          to: '/accounts/$accountId',
          params: { accountId },
          search: accountDetailSearchDefaults,
        },
      },
      { label: 'settings' },
    ]
  }

  const accountTxnNew = path.match(/^\/accounts\/([^/]+)\/transactions\/new$/)
  if (accountTxnNew) {
    const accountId = accountTxnNew[1]!
    return [
      { label: 'accounts', href: { to: '/accounts' } },
      {
        label: (account?.name ?? 'account').toLowerCase(),
        href: {
          to: '/accounts/$accountId',
          params: { accountId },
          search: accountDetailSearchDefaults,
        },
      },
      { label: 'add transaction' },
    ]
  }

  const accountTransferNew = path.match(/^\/accounts\/([^/]+)\/transfers\/new$/)
  if (accountTransferNew) {
    const accountId = accountTransferNew[1]!
    return [
      { label: 'accounts', href: { to: '/accounts' } },
      {
        label: (account?.name ?? 'account').toLowerCase(),
        href: {
          to: '/accounts/$accountId',
          params: { accountId },
          search: accountDetailSearchDefaults,
        },
      },
      { label: 'transfer' },
    ]
  }

  const accountDetail = path.match(/^\/accounts\/([^/]+)$/)
  if (accountDetail) {
    return [
      { label: 'accounts', href: { to: '/accounts' } },
      { label: (account?.name ?? 'account').toLowerCase() },
    ]
  }

  const transactionDetail = path.match(/^\/transactions\/([^/]+)$/)
  if (transactionDetail) {
    return [
      {
        label: 'transactions',
        href: { to: '/transactions', search: transactionsSearchDefaults },
      },
      { label: 'details' },
    ]
  }

  if (path === '/settings/loved-one') {
    return [
      { label: 'settings', href: { to: '/settings' } },
      { label: 'loved one' },
    ]
  }

  if (path === '/settings/people') {
    return [
      { label: 'settings', href: { to: '/settings' } },
      { label: 'people' },
    ]
  }

  if (path === '/settings/schedule') {
    return [
      { label: 'settings', href: { to: '/settings' } },
      { label: 'schedule' },
    ]
  }

  const navItem = flattenNavLinks().find((item) => item.to === path)
  if (navItem && navItem.to !== '/') {
    return [{ label: navItem.label.toLowerCase() }]
  }

  return [{ label: path.split('/').filter(Boolean).join(' / ') || 'app' }]
}

function CrumbLink({ href, children }: { href: BreadcrumbHref; children: ReactNode }) {
  if (href.to === '/accounts/$accountId') {
    return (
      <Link
        to="/accounts/$accountId"
        params={href.params}
        search={href.search}
        className="hover:text-base-content hover:underline"
      >
        {children}
      </Link>
    )
  }

  if (href.to === '/transactions') {
    return (
      <Link
        to="/transactions"
        search={href.search}
        className="hover:text-base-content hover:underline"
      >
        {children}
      </Link>
    )
  }

  return (
    <Link to={href.to} className="hover:text-base-content hover:underline">
      {children}
    </Link>
  )
}

export default function AppBreadcrumbs() {
  const router = useRouter()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const account = useRouterState({
    select: (state) => {
      const match = state.matches.find(
        (item) => item.routeId === '/_app/accounts/$accountId',
      )
      const data = match?.loaderData as
        | { id?: string; name?: string }
        | undefined
      if (!data?.id || !data?.name) return null
      return { id: data.id, name: data.name }
    },
  })

  const path = pathname.replace(/\/$/, '') || '/'
  if (path === '/') return null

  const crumbs = crumbsForPath(pathname, account)

  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex flex-wrap items-center gap-2 text-sm text-base-content/70"
    >
      <button
        type="button"
        className="btn btn-ghost btn-square btn-sm bg-base-200"
        aria-label="Go back"
        onClick={() => router.history.back()}
      >
        <HiArrowLeft className="size-4" aria-hidden />
      </button>
      <Link
        to="/"
        className="btn btn-ghost btn-square btn-sm bg-base-200"
        aria-label="Home"
      >
        <HiOutlineHome className="size-4" aria-hidden />
      </Link>
      <span className="text-base-content/40" aria-hidden>
        /
      </span>
      <ol className="flex flex-wrap items-center gap-2">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-2">
              {index > 0 ? (
                <span className="text-base-content/40" aria-hidden>
                  /
                </span>
              ) : null}
              {crumb.href && !isLast ? (
                <CrumbLink href={crumb.href}>{crumb.label}</CrumbLink>
              ) : (
                <span
                  className={isLast ? 'text-base-content/80' : undefined}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
