import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  HiDocumentText,
  HiOutlineCash,
  HiPlus,
  HiSwitchHorizontal,
  HiX,
} from 'react-icons/hi'

type AccountSpeedDialProps = {
  accountId: string
}

const ACTIONS = [
  {
    id: 'transaction',
    label: 'Transaction',
    icon: HiPlus,
    to: '/accounts/$accountId/transactions/new' as const,
  },
  {
    id: 'transfer',
    label: 'Transfer',
    icon: HiSwitchHorizontal,
    to: '/accounts/$accountId/transfers/new' as const,
  },
  {
    id: 'expense',
    label: 'Expense',
    icon: HiOutlineCash,
    to: null,
  },
  {
    id: 'note',
    label: 'Note',
    icon: HiDocumentText,
    to: null,
  },
] as const

export function AccountSpeedDial({ accountId }: AccountSpeedDialProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3">
      {open ? (
        <ul className="flex flex-col items-end gap-2">
          {ACTIONS.map((action) => {
            const Icon = action.icon
            const content = (
              <>
                <span className="rounded-box bg-base-100 px-3 py-1.5 text-sm font-medium shadow-sm">
                  {action.label}
                </span>
                <span className="btn btn-circle btn-primary shadow-md">
                  <Icon className="size-5" aria-hidden />
                </span>
              </>
            )

            if (action.to) {
              return (
                <li key={action.id}>
                  <Link
                    to={action.to}
                    params={{ accountId }}
                    className="flex items-center gap-2"
                    onClick={() => setOpen(false)}
                  >
                    {content}
                  </Link>
                </li>
              )
            }

            return (
              <li key={action.id}>
                <button
                  type="button"
                  className="flex items-center gap-2 opacity-60"
                  disabled
                  title="Coming soon"
                  aria-label={`${action.label} (coming soon)`}
                >
                  {content}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <button
        type="button"
        className="btn btn-circle btn-primary btn-lg shadow-lg"
        aria-expanded={open}
        aria-label={open ? 'Close actions' : 'Open quick actions'}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <HiX className="size-6" aria-hidden />
        ) : (
          <HiPlus className="size-6" aria-hidden />
        )}
      </button>
    </div>
  )
}
