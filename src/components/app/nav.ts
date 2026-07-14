import type { IconType } from 'react-icons'
import {
  HiOutlineCog,
  HiOutlineCreditCard,
  HiOutlineDocumentText,
  HiOutlineHeart,
  HiOutlineLightBulb,
  HiOutlineReceiptTax,
  HiOutlineSwitchHorizontal,
  HiOutlineViewGrid,
} from 'react-icons/hi'

export type AppNavItem = {
  label: string
  to:
    | '/'
    | '/accounts'
    | '/transactions'
    | '/care'
    | '/invoices'
    | '/documents'
    | '/insights'
    | '/settings'
  icon: IconType
  title: string
}

export const APP_NAV: AppNavItem[] = [
  {
    label: 'Dashboard',
    to: '/',
    icon: HiOutlineViewGrid,
    title: 'Dashboard',
  },
  {
    label: 'Accounts',
    to: '/accounts',
    icon: HiOutlineCreditCard,
    title: 'Accounts',
  },
  {
    label: 'Transactions',
    to: '/transactions',
    icon: HiOutlineSwitchHorizontal,
    title: 'Transactions',
  },
  {
    label: 'Care',
    to: '/care',
    icon: HiOutlineHeart,
    title: 'Care',
  },
  {
    label: 'Invoices',
    to: '/invoices',
    icon: HiOutlineReceiptTax,
    title: 'Invoices',
  },
  {
    label: 'Documents',
    to: '/documents',
    icon: HiOutlineDocumentText,
    title: 'Documents',
  },
  {
    label: 'Insights',
    to: '/insights',
    icon: HiOutlineLightBulb,
    title: 'Insights',
  },
  {
    label: 'Settings',
    to: '/settings',
    icon: HiOutlineCog,
    title: 'Settings',
  },
]

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
  if (path === '/settings/loved-one') return 'Loved one'
  if (path === '/settings/people') return 'People'
  const exact = APP_NAV.find((item) => item.to === path)
  if (exact) return exact.title
  return 'Dashboard'
}
