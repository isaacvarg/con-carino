import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useTransition } from 'react'
import { ActivityTable } from '#/components/app/activity/ActivityViews'
import { listActivity, type ActivityListItem } from '#/server/activity'

export const Route = createFileRoute('/_app/activity/')({
  loader: async () => {
    return listActivity({ data: { take: 50 } })
  },
  component: ActivityIndexPage,
})

function ActivityIndexPage() {
  const initial = Route.useLoaderData()
  const [extra, setExtra] = useState<ActivityListItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setExtra([])
    setNextCursor(initial.nextCursor)
  }, [initial])

  const items = [...initial.items, ...extra]

  function loadMore() {
    if (!nextCursor || pending) return
    startTransition(async () => {
      const page = await listActivity({
        data: { take: 50, cursor: nextCursor },
      })
      setExtra((prev) => [...prev, ...page.items])
      setNextCursor(page.nextCursor)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-base-content">Activity</h1>
        <p className="text-sm text-base-content/60">
          A log of changes across accounts, transactions, invoices, and care
          schedule. Use the magnifying glass to see the full audit trail.
        </p>
      </div>
      <ActivityTable
        items={items}
        nextCursor={nextCursor}
        onLoadMore={nextCursor ? loadMore : undefined}
      />
    </div>
  )
}
