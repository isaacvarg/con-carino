import { Link, useRouteContext } from '@tanstack/react-router'
import {
  HiChevronRight,
  HiOutlineCalendar,
  HiOutlineCollection,
  HiOutlineDocumentText,
  HiOutlineHeart,
  HiOutlineOfficeBuilding,
  HiOutlineTag,
  HiOutlineUser,
  HiOutlineUserGroup,
} from 'react-icons/hi'

type SettingsCard = {
  to:
    | '/settings/users'
    | '/settings/loved-one'
    | '/settings/people'
    | '/settings/schedule'
    | '/settings/tags'
    | '/settings/categories'
    | '/settings/payees'
    | '/settings/document-types'
  title: string
  description: string
  icon: typeof HiOutlineUserGroup
  adminOnly?: boolean
}

const SETTINGS_CARDS: SettingsCard[] = [
  {
    to: '/settings/users',
    title: 'Users',
    description: 'App accounts, profile photos, sessions, and admin access.',
    icon: HiOutlineUser,
    adminOnly: true,
  },
  {
    to: '/settings/loved-one',
    title: 'Loved one',
    description: 'Name and required coverage schedule for open calendar slots.',
    icon: HiOutlineHeart,
  },
  {
    to: '/settings/people',
    title: 'People',
    description: 'Offline caregivers and person types for the schedule.',
    icon: HiOutlineUserGroup,
  },
  {
    to: '/settings/schedule',
    title: 'Schedule',
    description: 'Event types and how appointments appear on the calendar.',
    icon: HiOutlineCalendar,
  },
  {
    to: '/settings/tags',
    title: 'Tags',
    description: 'Labels for filtering and organizing transactions.',
    icon: HiOutlineTag,
  },
  {
    to: '/settings/categories',
    title: 'Categories',
    description: 'Spending and income categories for transactions.',
    icon: HiOutlineCollection,
  },
  {
    to: '/settings/payees',
    title: 'Payees',
    description: 'People and merchants used on transactions.',
    icon: HiOutlineOfficeBuilding,
  },
  {
    to: '/settings/document-types',
    title: 'Document types',
    description: 'Categories for documents in your library.',
    icon: HiOutlineDocumentText,
  },
]

export function SettingsHub() {
  const { session } = useRouteContext({ from: '/_app/settings' })
  const isAdmin = Boolean(session?.user?.isAdmin)
  const cards = SETTINGS_CARDS.filter((card) => !card.adminOnly || isAdmin)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Link
              key={card.to}
              to={card.to}
              className="flex items-center gap-4 app-card app-card-interactive px-4 py-4"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-base-content">
                  {card.title}
                </span>
                <span className="mt-0.5 block text-sm text-base-content/60">
                  {card.description}
                </span>
              </span>
              <HiChevronRight
                className="size-5 shrink-0 text-base-content/40"
                aria-hidden
              />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
