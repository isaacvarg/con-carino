import { Link } from '@tanstack/react-router'
import type { AccountListItem } from '#/server/accounts'
import { accountDetailSearchDefaults } from './account-detail-search'
import { accountTypeLabel, formatAccountCurrency } from './account-utils'

type AccountCardProps = {
  account: AccountListItem
}

export function AccountCard({ account }: AccountCardProps) {
  return (
    <Link
      to="/accounts/$accountId"
      params={{ accountId: account.id }}
      search={accountDetailSearchDefaults}
      className="flex flex-col gap-4 rounded-box bg-base-100 p-5 shadow-sm transition hover:bg-base-200/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-base-content">
            {account.name}
          </h3>
          <p className="mt-1 text-sm text-base-content/60">
            {accountTypeLabel(account.type)}
            {account.accountGroup ? ` · ${account.accountGroup.name}` : null}
          </p>
        </div>
        {account.isGlobal ? (
          <span className="badge badge-primary badge-outline shrink-0">
            Global
          </span>
        ) : null}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-base-content/50">
          Opening balance
        </p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-base-content">
          {formatAccountCurrency(account.initialBalance)}
        </p>
      </div>
    </Link>
  )
}
