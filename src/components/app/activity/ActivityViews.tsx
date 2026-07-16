import { Link, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { HiOutlineExternalLink, HiOutlineSearch } from 'react-icons/hi'
import { TaxonomyBadge } from '#/components/app/transactions/TaxonomyBadge'
import {
  formatActivityAction,
  resolveActivityHref,
  type ActivityHref,
} from '#/lib/activity'
import type { ActivityListItem } from '#/server/activity'
import type { ActivityDisplayValue } from '#/server/activity-labels'

function actorLabel(actor: ActivityListItem['actor']): string {
  if (!actor) return 'System'
  return actor.name?.trim() || actor.email?.trim() || 'User'
}

function actorInitials(actor: ActivityListItem['actor']): string {
  const label = actorLabel(actor)
  return label
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function relativeTime(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diffMs = now - d.getTime()
  if (!Number.isFinite(diffMs)) return ''
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatWhen(iso)
}

export function ActivityEntityLink({
  href,
  children,
  className,
}: {
  href: ActivityHref
  children: ReactNode
  className?: string
}) {
  if (!href) return null
  if (href.to === '/transactions/$transactionId') {
    return (
      <Link
        to="/transactions/$transactionId"
        params={href.params}
        className={className}
      >
        {children}
      </Link>
    )
  }
  if (href.to === '/accounts/$accountId') {
    return (
      <Link
        to="/accounts/$accountId"
        params={href.params}
        search={href.search}
        className={className}
      >
        {children}
      </Link>
    )
  }
  if (href.to === '/invoices') {
    return (
      <Link to="/invoices" search={href.search} className={className}>
        {children}
      </Link>
    )
  }
  if (href.to === '/schedule') {
    return (
      <Link to="/schedule" search={href.search} className={className}>
        {children}
      </Link>
    )
  }
  return null
}

export function useNavigateToActivityEntity() {
  const navigate = useNavigate()
  return (item: Pick<ActivityListItem, 'entityType' | 'entityId' | 'linkMeta'>) => {
    const href = resolveActivityHref(item)
    if (!href) return
    if (href.to === '/transactions/$transactionId') {
      void navigate({ to: href.to, params: href.params })
      return
    }
    if (href.to === '/accounts/$accountId') {
      void navigate({ to: href.to, params: href.params, search: href.search })
      return
    }
    if (href.to === '/invoices') {
      void navigate({ to: href.to, search: href.search })
      return
    }
    if (href.to === '/schedule') {
      void navigate({ to: href.to, search: href.search })
    }
  }
}

export function ActivityTable({
  items,
  nextCursor,
  onLoadMore,
}: {
  items: ActivityListItem[]
  nextCursor?: string | null
  onLoadMore?: () => void
}) {
  const navigateToEntity = useNavigateToActivityEntity()

  if (items.length === 0) {
    return (
      <p className="rounded-box border border-dashed border-base-300 bg-base-100 p-8 text-center text-sm text-base-content/60">
        No activity recorded yet.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100 shadow-sm">
      <table className="table">
        <thead>
          <tr>
            <th>When</th>
            <th>Actor</th>
            <th>Summary</th>
            <th>Type</th>
            <th className="w-28 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const href = resolveActivityHref(item)
            return (
              <tr key={item.id} className="hover">
                <td className="whitespace-nowrap text-sm text-base-content/70">
                  <span title={formatWhen(item.createdAt)}>
                    {relativeTime(item.createdAt)}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="avatar avatar-placeholder">
                      <div className="w-8 rounded-full bg-primary text-primary-content">
                        <span className="text-[10px] font-semibold">
                          {actorInitials(item.actor)}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm">{actorLabel(item.actor)}</span>
                  </div>
                </td>
                <td>
                  {href ? (
                    <button
                      type="button"
                      className="text-left text-sm hover:underline"
                      onClick={() => navigateToEntity(item)}
                    >
                      {item.summary}
                    </button>
                  ) : (
                    <span className="text-sm">{item.summary}</span>
                  )}
                  <p className="text-xs text-base-content/50">
                    {formatActivityAction(item.action)}
                  </p>
                </td>
                <td>
                  <span className="badge badge-ghost badge-sm">
                    {item.entityTypeLabel}
                  </span>
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    {href ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-square btn-sm"
                        title="Open related item"
                        aria-label="Open related item"
                        onClick={() => navigateToEntity(item)}
                      >
                        <HiOutlineExternalLink className="size-4" aria-hidden />
                      </button>
                    ) : null}
                    <Link
                      to="/activity/$activityId"
                      params={{ activityId: item.id }}
                      className="btn btn-ghost btn-square btn-sm"
                      title="View audit details"
                      aria-label="View audit details"
                    >
                      <HiOutlineSearch className="size-4" aria-hidden />
                    </Link>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {nextCursor && onLoadMore ? (
        <div className="border-t border-base-300 p-3 text-center">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLoadMore}>
            Load more
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function ActivityDetailView({
  activity,
}: {
  activity: import('#/server/activity').ActivityDetail
}) {
  const href = resolveActivityHref(activity)
  const changes = activity.resolvedChanges ?? []

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
              {activity.entityTypeLabel} · {formatActivityAction(activity.action)}
            </p>
            <h1 className="mt-1 text-xl font-semibold text-base-content">
              {activity.summary}
            </h1>
            <p className="mt-2 text-sm text-base-content/70">
              {actorLabel(activity.actor)} · {formatWhen(activity.createdAt)}
            </p>
          </div>
          {href ? (
            <ActivityEntityLink href={href} className="btn btn-primary btn-sm gap-2">
              <HiOutlineExternalLink className="size-4" aria-hidden />
              Open related
            </ActivityEntityLink>
          ) : null}
        </div>
      </section>

      <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-base-content">Audit trail</h2>
        {changes.length === 0 ? (
          <p className="text-sm text-base-content/60">No field changes recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => (
                  <tr key={change.field}>
                    <td className="text-sm font-medium">{change.label}</td>
                    <td className="max-w-xs text-sm text-base-content/70">
                      <ActivityValue values={change.before} />
                    </td>
                    <td className="max-w-xs text-sm">
                      <ActivityValue values={change.after} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

/** Renders one side of an audit change: colored badges for taxonomies, text otherwise. */
function ActivityValue({ values }: { values: ActivityDisplayValue[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {values.map((value, index) =>
        value.kind === 'taxonomy' ? (
          <TaxonomyBadge
            key={index}
            name={value.name}
            bgColor={value.bgColor}
            textColor={value.textColor}
          />
        ) : (
          <span key={index} className="break-all">
            {value.text}
          </span>
        ),
      )}
    </span>
  )
}

export function DashboardRecentActivity({ items }: { items: ActivityListItem[] }) {
  const navigateToEntity = useNavigateToActivityEntity()

  const groups = groupByDay(items)

  return (
    <div className="rounded-box bg-base-100 p-5 text-base-content shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-base-content">Recent Activity</h2>
        <Link to="/activity" className="link link-hover text-xs text-base-content/60">
          View all
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-base-content/60">No recent activity.</p>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.day}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-base-content/70">
                {group.day}
              </p>
              <ul className="space-y-3">
                {group.items.map((item) => {
                  const href = resolveActivityHref(item)
                  return (
                    <li key={item.id} className="flex gap-3">
                      <div className="avatar avatar-placeholder">
                        <div className="w-9 rounded-full bg-primary text-primary-content">
                          <span className="text-xs font-semibold text-primary-content">
                            {actorInitials(item.actor)}
                          </span>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        {href ? (
                          <button
                            type="button"
                            className="text-left text-sm text-base-content hover:underline"
                            onClick={() => navigateToEntity(item)}
                          >
                            <span className="font-semibold text-base-content">
                              {actorLabel(item.actor)}
                            </span>{' '}
                            <span className="text-base-content/70">{item.summary}</span>
                          </button>
                        ) : (
                          <p className="text-sm text-base-content">
                            <span className="font-semibold text-base-content">
                              {actorLabel(item.actor)}
                            </span>{' '}
                            <span className="text-base-content/70">{item.summary}</span>
                          </p>
                        )}
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className="text-xs text-base-content/60">
                            {relativeTime(item.createdAt)}
                          </p>
                          <Link
                            to="/activity/$activityId"
                            params={{ activityId: item.id }}
                            className="btn btn-ghost btn-square btn-xs"
                            title="View audit details"
                            aria-label="View audit details"
                          >
                            <HiOutlineSearch className="size-3.5" aria-hidden />
                          </Link>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function groupByDay(items: ActivityListItem[]) {
  const now = new Date()
  const todayKey = localDayKey(now)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = localDayKey(yesterday)

  const map = new Map<string, ActivityListItem[]>()
  for (const item of items) {
    const key = localDayKey(new Date(item.createdAt))
    const label =
      key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : key
    const list = map.get(label) ?? []
    list.push(item)
    map.set(label, list)
  }
  return [...map.entries()].map(([day, groupItems]) => ({
    day,
    items: groupItems,
  }))
}

function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
