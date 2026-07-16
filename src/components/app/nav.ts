import type { IconType } from 'react-icons'
import {
  HiOutlineCalendar,
  HiOutlineClipboardList,
  HiOutlineClock,
  HiOutlineCog,
  HiOutlineCreditCard,
  HiOutlineDocumentText,
  HiOutlineLightBulb,
  HiOutlineReceiptTax,
  HiOutlineSwitchHorizontal,
  HiOutlineViewGrid,
} from 'react-icons/hi'

export type AppNavPath =
  | '/'
  | '/accounts'
  | '/transactions'
  | '/activity'
  | '/schedule'
  | '/meds'
  | '/invoices'
  | '/documents'
  | '/insights'
  | '/settings'

export type AppNavLink = {
  kind: 'link'
  label: string
  to: AppNavPath
  icon: IconType
  title: string
}

export type AppNavGroup = {
  kind: 'group'
  label: string
  items: AppNavLink[]
}

export type AppNavEntry = AppNavLink | AppNavGroup

export const APP_NAV: AppNavEntry[] = [
  {
    kind: 'link',
    label: 'Dashboard',
    to: '/',
    icon: HiOutlineViewGrid,
    title: 'Dashboard',
  },
  {
    kind: 'link',
    label: 'Activity',
    to: '/activity',
    icon: HiOutlineClock,
    title: 'Activity',
  },
  {
    kind: 'link',
    label: 'Insights',
    to: '/insights',
    icon: HiOutlineLightBulb,
    title: 'Insights',
  },
  {
    kind: 'group',
    label: 'Family ledger',
    items: [
      {
        kind: 'link',
        label: 'Accounts',
        to: '/accounts',
        icon: HiOutlineCreditCard,
        title: 'Accounts',
      },
      {
        kind: 'link',
        label: 'Transactions',
        to: '/transactions',
        icon: HiOutlineSwitchHorizontal,
        title: 'Transactions',
      },
      {
        kind: 'link',
        label: 'Invoices',
        to: '/invoices',
        icon: HiOutlineReceiptTax,
        title: 'Invoices',
      },
    ],
  },
  {
    kind: 'group',
    label: 'Care',
    items: [
      {
        kind: 'link',
        label: 'Schedule',
        to: '/schedule',
        icon: HiOutlineCalendar,
        title: 'Schedule',
      },
      {
        kind: 'link',
        label: 'Meds',
        to: '/meds',
        icon: HiOutlineClipboardList,
        title: 'Meds',
      },
    ],
  },
  {
    kind: 'link',
    label: 'Documents',
    to: '/documents',
    icon: HiOutlineDocumentText,
    title: 'Documents',
  },
  {
    kind: 'link',
    label: 'Settings',
    to: '/settings',
    icon: HiOutlineCog,
    title: 'Settings',
  },
]

export function flattenNavLinks(entries: AppNavEntry[] = APP_NAV): AppNavLink[] {
  return entries.flatMap((entry) =>
    entry.kind === 'group' ? entry.items : [entry],
  )
}

export function titleForPath(pathname: string): string {
  const path = pathname.replace(/\/$/, '') || '/'
  if (path === '/accounts/new') return 'Add account'
  if (/^\/accounts\/[^/]+\/settings$/.test(path)) return 'Account settings'
  if (/^\/accounts\/[^/]+\/transactions\/new$/.test(path)) {
    return 'Add transaction'
  }
  if (/^\/accounts\/[^/]+\/transfers\/new$/.test(path)) {
    return 'Transfer'
  }
  if (/^\/accounts\/[^/]+$/.test(path) && path !== '/accounts/new') {
    return 'Account'
  }
  if (path === '/transactions/new') return 'Add transaction'
  if (path === '/transactions/transfers/new') return 'Transfer'
  if (/^\/transactions\/[^/]+$/.test(path)) {
    return 'Transaction'
  }
  if (/^\/activity\/[^/]+$/.test(path)) {
    return 'Activity details'
  }
  if (/^\/documents\/[^/]+$/.test(path)) {
    return 'Document'
  }
  if (path === '/settings/loved-one') return 'Loved one'
  if (path === '/settings/people') return 'People'
  if (path === '/settings/schedule') return 'Schedule'
  if (path === '/settings/tags') return 'Tags'
  if (path === '/settings/categories') return 'Categories'
  if (path === '/settings/payees') return 'Payees'
  if (path === '/settings/document-types') return 'Document types'
  const exact = flattenNavLinks().find((item) => item.to === path)
  if (exact) return exact.title
  return 'Dashboard'
}
