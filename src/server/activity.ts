import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import type { ActivityAction } from '#/generated/prisma/enums'
import type { Prisma } from '#/generated/prisma/client'
import {
  ACTIVITY_ENTITY_TYPES,
  type ActivityChanges,
  type ActivityLinkMeta,
  entityTypeLabel,
} from '#/lib/activity'
import { prisma } from '#/lib/prisma'
import {
  resolveActivityChanges,
  type ResolvedActivityChange,
} from '#/server/activity-labels'
import { authConfig } from '#/utils/auth'

async function requireUserId() {
  const request = getRequest()
  const session = await getSession(request, authConfig)
  const userId = session?.user?.id
  if (!userId) {
    throw new Error('You must be signed in.')
  }
  return userId
}

function visibilityFilter(userId: string): Prisma.ActivityLogWhereInput {
  return {
    OR: [
      { visibilityUserId: null },
      { visibilityUserId: userId },
      {
        AND: [
          { visibilityUserId: { not: null } },
          {
            linkMeta: {
              path: ['isGlobal'],
              equals: true,
            },
          },
        ],
      },
    ],
  }
}

function parseLinkMeta(value: unknown): ActivityLinkMeta | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as ActivityLinkMeta
}

function parseChanges(value: unknown): ActivityChanges | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as ActivityChanges
}

export type ActivityListItem = {
  id: string
  action: ActivityAction
  entityType: string
  entityTypeLabel: string
  entityId: string | null
  summary: string
  linkMeta: ActivityLinkMeta | null
  createdAt: string
  actor: {
    id: string
    name: string | null
    email: string | null
  } | null
}

export type ActivityDetail = ActivityListItem & {
  changes: ActivityChanges | null
  /** `changes` with human field labels and ids resolved to names, for display. */
  resolvedChanges: ResolvedActivityChange[] | null
}

function toListItem(row: {
  id: string
  action: ActivityAction
  entityType: string
  entityId: string | null
  summary: string
  linkMeta: unknown
  createdAt: Date
  actor: { id: string; name: string | null; email: string | null } | null
}): ActivityListItem {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityTypeLabel: entityTypeLabel(row.entityType),
    entityId: row.entityId,
    summary: row.summary,
    linkMeta: parseLinkMeta(row.linkMeta),
    createdAt: row.createdAt.toISOString(),
    actor: row.actor,
  }
}

const actorSelect = {
  id: true,
  name: true,
  email: true,
} as const

export const listActivity = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>
    const takeRaw =
      typeof input.take === 'number'
        ? input.take
        : typeof input.take === 'string'
          ? Number(input.take)
          : 50
    const take = Number.isFinite(takeRaw)
      ? Math.min(Math.max(Math.floor(takeRaw), 1), 100)
      : 50
    const cursor =
      typeof input.cursor === 'string' && input.cursor ? input.cursor : null
    return { take, cursor }
  })
  .handler(async ({ data }): Promise<{ items: ActivityListItem[]; nextCursor: string | null }> => {
    const userId = await requireUserId()
    const rows = await prisma.activityLog.findMany({
      where: visibilityFilter(userId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: data.take + 1,
      ...(data.cursor
        ? {
            cursor: { id: data.cursor },
            skip: 1,
          }
        : {}),
      include: {
        actor: { select: actorSelect },
      },
    })

    const hasMore = rows.length > data.take
    const page = hasMore ? rows.slice(0, data.take) : rows
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null

    return {
      items: page.map(toListItem),
      nextCursor,
    }
  })

export const listRecentActivity = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>
    const takeRaw =
      typeof input.take === 'number'
        ? input.take
        : typeof input.take === 'string'
          ? Number(input.take)
          : 8
    const take = Number.isFinite(takeRaw)
      ? Math.min(Math.max(Math.floor(takeRaw), 1), 20)
      : 8
    return { take }
  })
  .handler(async ({ data }): Promise<ActivityListItem[]> => {
    const userId = await requireUserId()
    const rows = await prisma.activityLog.findMany({
      where: visibilityFilter(userId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: data.take,
      include: {
        actor: { select: actorSelect },
      },
    })
    return rows.map(toListItem)
  })

export const getActivity = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const id = (data as { id?: unknown }).id
    if (typeof id !== 'string' || !id) {
      throw new Error('Activity id is required.')
    }
    return { id }
  })
  .handler(async ({ data }): Promise<ActivityDetail> => {
    const userId = await requireUserId()
    const row = await prisma.activityLog.findFirst({
      where: {
        id: data.id,
        AND: [visibilityFilter(userId)],
      },
      include: {
        actor: { select: actorSelect },
      },
    })
    if (!row) {
      throw new Error('Activity not found.')
    }
    const changes = parseChanges(row.changes)
    const [resolvedChanges] = await resolveActivityChanges([changes])
    return {
      ...toListItem(row),
      changes,
      resolvedChanges,
    }
  })

export const listTransactionActivity = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const transactionId =
      typeof (data as { transactionId?: unknown }).transactionId === 'string'
        ? (data as { transactionId: string }).transactionId.trim()
        : ''
    if (!transactionId) {
      throw new Error('Transaction id is required.')
    }
    const takeRaw = (data as { take?: unknown }).take
    const takeParsed =
      typeof takeRaw === 'number'
        ? takeRaw
        : typeof takeRaw === 'string'
          ? Number(takeRaw)
          : 50
    const take = Number.isFinite(takeParsed)
      ? Math.min(Math.max(Math.floor(takeParsed), 1), 100)
      : 50
    return { transactionId, take }
  })
  .handler(async ({ data }): Promise<ActivityDetail[]> => {
    const userId = await requireUserId()
    const rows = await prisma.activityLog.findMany({
      where: {
        entityType: ACTIVITY_ENTITY_TYPES.transaction,
        entityId: data.transactionId,
        AND: [visibilityFilter(userId)],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: data.take,
      include: {
        actor: { select: actorSelect },
      },
    })
    const changeSets = rows.map((row) => parseChanges(row.changes))
    const resolved = await resolveActivityChanges(changeSets)
    return rows.map((row, index) => ({
      ...toListItem(row),
      changes: changeSets[index],
      resolvedChanges: resolved[index],
    }))
  })
