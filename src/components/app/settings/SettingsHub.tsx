import { Link } from '@tanstack/react-router'
import {
  HiChevronRight,
  HiOutlineCalendar,
  HiOutlineHeart,
  HiOutlineUserGroup,
} from 'react-icons/hi'

type SettingsCard = {
  to: '/settings/loved-one' | '/settings/people' | '/settings/schedule'
  title: string
  description: string
  icon: typeof HiOutlineUserGroup
}

const SETTINGS_CARDS: SettingsCard[] = [
  {
    to: '/settings/loved-one',
    title: 'Loved one',
    description: 'Name and required coverage schedule for open calendar slots.',
    icon: HiOutlineHeart,
  },
  {
    to: '/settings/people',
    title: 'People',
    description: 'Manage users, family members, and employees.',
    icon: HiOutlineUserGroup,
  },
  {
    to: '/settings/schedule',
    title: 'Schedule',
    description: 'Event types and how appointments appear on the calendar.',
    icon: HiOutlineCalendar,
  },
]

export function SettingsHub() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SETTINGS_CARDS.map((card) => {
          const Icon = card.icon
          return (
            <Link
              key={card.to}
              to={card.to}
              className="flex items-center gap-4 rounded-box bg-base-100 px-4 py-4 shadow-sm transition hover:bg-base-200/60"
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
