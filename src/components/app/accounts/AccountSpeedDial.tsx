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
    icon: HiSwitchHorizontal,
    wired: true,
  },
  {
    id: 'expense',
    label: 'Expense',
    icon: HiOutlineCash,
    wired: false,
  },
  {
    id: 'note',
    label: 'Note',
    icon: HiDocumentText,
    wired: false,
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

            if (action.wired) {
              return (
                <li key={action.id}>
                  <Link
                    to="/accounts/$accountId/transactions/new"
                    params={{ accountId }}
                    className="flex items-center gap-2"
                    onClick={(event) => {
                      // #region agent log
                      const target = event.currentTarget
                      fetch(
                        'http://127.0.0.1:7370/ingest/1b862042-6039-4f52-970e-ddff822b37a8',
                        {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'X-Debug-Session-Id': 'd29c5e',
                          },
                          body: JSON.stringify({
                            sessionId: 'd29c5e',
                            runId: 'post-fix',
                            hypothesisId: 'H4',
                            location: 'AccountSpeedDial.tsx:transactionLink',
                            message: 'Speed dial transaction clicked',
                            data: {
                              accountId,
                              href: target.getAttribute('href'),
                              defaultPrevented: event.defaultPrevented,
                              pathname: window.location.pathname,
                              search: window.location.search,
                            },
                            timestamp: Date.now(),
                          }),
                        },
                      ).catch(() => {})
                      // #endregion
                      setOpen(false)
                    }}
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
