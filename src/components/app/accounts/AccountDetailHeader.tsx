import { Link } from '@tanstack/react-router'
import { HiOutlineCog } from 'react-icons/hi'
import type { AccountListItem } from '#/server/accounts'

type AccountDetailHeaderProps = {
  account: AccountListItem
}

export function AccountDetailHeader({ account }: AccountDetailHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link to="/accounts" className="btn btn-ghost">
        All accounts
      </Link>
      {account.isOwned ? (
        <Link
          to="/accounts/$accountId/settings"
          params={{ accountId: account.id }}
          className="btn btn-outline gap-2"
        >
          <HiOutlineCog className="size-4" aria-hidden />
          Settings
        </Link>
      ) : null}
    </div>
  )
}
