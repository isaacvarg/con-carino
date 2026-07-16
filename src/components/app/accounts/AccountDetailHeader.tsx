import { Link, useRouterState } from '@tanstack/react-router'
import { HiOutlineCheckCircle, HiOutlineCog } from 'react-icons/hi'
import { accountDetailSearchDefaults } from '#/components/app/accounts/account-detail-search'
import type { AccountListItem } from '#/server/accounts'

type AccountDetailHeaderProps = {
  account: AccountListItem
}

export function AccountDetailHeader({ account }: AccountDetailHeaderProps) {
  const search = useRouterState({
    select: (state) => state.location.search as { mode?: string },
  })
  const inReconcileMode = search.mode === 'reconcile'

  if (!account.isOwned) return null

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!inReconcileMode ? (
        <Link
          to="/accounts/$accountId"
          params={{ accountId: account.id }}
          search={{
            ...accountDetailSearchDefaults,
            mode: 'reconcile',
            reconView: 'list',
          }}
          className="btn btn-outline gap-2"
        >
          <HiOutlineCheckCircle className="size-4" aria-hidden />
          Reconcile
        </Link>
      ) : null}
      <Link
        to="/accounts/$accountId/settings"
        params={{ accountId: account.id }}
        className="btn btn-outline gap-2"
      >
        <HiOutlineCog className="size-4" aria-hidden />
        Settings
      </Link>
    </div>
  )
}
