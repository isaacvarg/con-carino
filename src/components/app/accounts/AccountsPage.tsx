import { Link } from '@tanstack/react-router'
import { HiPlus } from 'react-icons/hi'
import type { AccountListItem } from '#/server/accounts'
import { AccountCard } from './AccountCard'

type AccountsPageProps = {
  accounts: AccountListItem[]
}

export function AccountsPage({ accounts }: AccountsPageProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link to="/accounts/new" className="btn btn-primary gap-2">
          <HiPlus className="size-4" aria-hidden />
          Add account
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-box bg-base-100 p-8 text-center shadow-sm">
          <p className="text-base font-medium text-base-content">
            No accounts yet
          </p>
          <p className="mt-2 text-sm text-base-content/60">
            Add a checking, savings, or credit account to get started.
          </p>
          <Link to="/accounts/new" className="btn btn-primary mt-5">
            Add your first account
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  )
}
