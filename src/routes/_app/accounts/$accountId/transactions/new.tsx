import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AddTransactionForm } from '#/components/app/accounts/AddTransactionForm'

const accountRoute = getRouteApi('/_app/accounts/$accountId')

export const Route = createFileRoute(
  '/_app/accounts/$accountId/transactions/new',
)({
  component: NewTransactionPage,
})

function NewTransactionPage() {
  const account = accountRoute.useLoaderData()
  const { accountId } = accountRoute.useParams()

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7370/ingest/1b862042-6039-4f52-970e-ddff822b37a8', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'd29c5e',
      },
      body: JSON.stringify({
        sessionId: 'd29c5e',
        runId: 'post-fix',
        hypothesisId: 'H3',
        location: 'transactions/new.tsx:NewTransactionPage',
        message: 'NewTransactionPage mounted',
        data: {
          accountId,
          accountName: account.name,
          pathname: window.location.pathname,
          search: window.location.search,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
  }, [accountId, account.name])
  // #endregion

  return <AddTransactionForm account={account} />
}
