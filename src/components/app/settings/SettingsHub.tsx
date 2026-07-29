import { Link, useRouteContext } from '@tanstack/react-router'
import {
  HiChevronRight,
  HiOutlineCalendar,
  HiOutlineCash,
  HiOutlineCollection,
  HiOutlineDocumentText,
  HiOutlineHeart,
  HiOutlineLightningBolt,
  HiOutlineOfficeBuilding,
  HiOutlineArchive,
  HiOutlineSwitchHorizontal,
  HiOutlineTag,
  HiOutlineUser,
  HiOutlineUserGroup,
  HiOutlineViewGrid,
} from 'react-icons/hi'
import { isModuleEnabled, type AppModule } from '#/components/app/nav'

type SettingsCard = {
  to:
    | '/settings/users'
    | '/settings/modules'
    | '/settings/loved-one'
    | '/settings/people'
    | '/settings/contributions'
    | '/settings/schedule'
    | '/settings/tags'
    | '/settings/categories'
    | '/settings/payees'
    | '/settings/automations'
    | '/settings/transaction-types'
    | '/settings/archived'
    | '/settings/document-types'
  title: string
  description: string
  icon: typeof HiOutlineUserGroup
  adminOnly?: boolean
  /** When set, this card only appears while that module is enabled. */
  module?: AppModule
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
    to: '/settings/modules',
    title: 'Modules',
    description: 'Turn invoicing and contributions on or off for your family.',
    icon: HiOutlineViewGrid,
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
    to: '/settings/contributions',
    title: 'Contributions',
    description:
      'The coverage pot, who funds it, and how shortfalls are split.',
    icon: HiOutlineCash,
    module: 'contributions',
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
    description: 'Labels for grouping transactions.',
    icon: HiOutlineCollection,
  },
  {
    to: '/settings/payees',
    title: 'Payees',
    description: 'People and merchants used on transactions.',
    icon: HiOutlineOfficeBuilding,
  },
  {
    to: '/settings/transaction-types',
    title: 'Transaction types',
    description:
      'What a transaction can be, and how each one moves a balance.',
    icon: HiOutlineSwitchHorizontal,
    adminOnly: true,
  },
  {
    to: '/settings/automations',
    title: 'Automations',
    description: 'Rules that copy transactions, set money aside, or watch a balance.',
    icon: HiOutlineLightningBolt,
  },
  {
    to: '/settings/archived',
    title: 'Archived',
    description:
      'Things removed while still in use, and a way to bring them back.',
    icon: HiOutlineArchive,
    adminOnly: true,
  },
  {
    to: '/settings/document-types',
    title: 'Document types',
    description: 'Categories for documents in your library.',
    icon: HiOutlineDocumentText,
  },
]

export function SettingsHub() {
  const { session, modules } = useRouteContext({ from: '/_app/settings' })
  const isAdmin = Boolean(session?.user?.isAdmin)
  const cards = SETTINGS_CARDS.filter(
    (card) =>
      (!card.adminOnly || isAdmin) &&
      (!card.module || isModuleEnabled(card.module, modules)),
  )

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
