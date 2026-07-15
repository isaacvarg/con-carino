import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import type { ActivityAction } from '#/generated/prisma/enums'
import type { Prisma } from '#/generated/prisma/client'
import {
  type ActivityChanges,
  type ActivityLinkMeta,
  entityTypeLabel,
} from '#/lib/activity'
import { prisma } from '#/lib/prisma'
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

type ActivityDb = {
  activityLog: typeof prisma.activityLog
}

export type LogActivityInput = {
  actorUserId: string | null
  action: ActivityAction
  entityType: string
  entityId?: string | null
  summary: string
  changes?: ActivityChanges | null
  linkMeta?: ActivityLinkMeta | null
  visibilityUserId?: string | null
}

export async function logActivity(
  input: LogActivityInput,
  db: ActivityDb = prisma,
) {
  return db.activityLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      changes:
        input.changes === undefined || input.changes === null
          ? undefined
          : (input.changes as Prisma.InputJsonValue),
      linkMeta:
        input.linkMeta === undefined || input.linkMeta === null
          ? undefined
          : (input.linkMeta as Prisma.InputJsonValue),
      visibilityUserId: input.visibilityUserId ?? null,
    },
  })
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
    return {
      ...toListItem(row),
      changes: parseChanges(row.changes),
    }
  })
