import { Link } from '@tanstack/react-router'
import { HiOutlineCog } from 'react-icons/hi'
import type { AccountListItem } from '#/server/accounts'

type AccountDetailHeaderProps = {
  account: AccountListItem
}

export function AccountDetailHeader({ account }: AccountDetailHeaderProps) {
  if (!account.isOwned) return null

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
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
