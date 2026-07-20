import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { HiPlus, HiSwitchHorizontal, HiX } from 'react-icons/hi'

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
] as const

export function AccountSpeedDial({ accountId }: AccountSpeedDialProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-base-content/40 backdrop-blur-sm"
          aria-label="Dismiss quick actions"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3">
        {open ? (
          <ul className="flex flex-col items-end gap-2">
            {ACTIONS.map((action) => {
              const Icon = action.icon
              return (
                <li key={action.id}>
                  <Link
                    to={action.to}
                    params={{ accountId }}
                    className="flex items-center gap-2"
                    onClick={() => setOpen(false)}
                  >
                    <span className="rounded-box border border-base-300 bg-base-100 px-3 py-1.5 text-sm font-medium shadow-md">
                      {action.label}
                    </span>
                    <span className="btn btn-circle btn-primary shadow-md">
                      <Icon className="size-5" aria-hidden />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : null}

        <button
          type="button"
          className={`btn btn-circle btn-primary btn-lg shadow-lg${open ? ' btn-active' : ''}`}
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
    </>
  )
}
