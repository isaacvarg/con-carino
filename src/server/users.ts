import { createServerFn } from '@tanstack/react-start'
import type { ActivityAction } from '#/generated/prisma/enums'
import {
  ACTIVITY_ENTITY_TYPES,
  entityTypeLabel,
  type ActivityLinkMeta,
} from '#/lib/activity'
import { prisma } from '#/lib/prisma'
import { resolveUserImageUrl } from '#/lib/user-image'
import { logActivity } from '#/server/activity-log'
import type { ActivityListItem } from '#/server/activity'
import {
  archiveOrDelete,
  restoreArchived,
  type ArchiveResult,
} from '#/server/archive'
import { requireAdminId } from '#/server/auth-guards'
import {
  countCarePersonRefs,
  toPersonDto,
  type CarePersonDto,
  updateCarePerson,
} from '#/server/care'
import { ensureCarePersonForUser } from '#/server/ensure-care-person'

function parseLinkMeta(value: unknown): ActivityLinkMeta | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as ActivityLinkMeta
}

export type UserListItem = {
  id: string
  name: string | null
  email: string | null
  imageUrl: string | null
  isAdmin: boolean
  carePersonName: string | null
  sessionCount: number
  createdAt: string
}

export type UserSessionItem = {
  id: string
  expires: string
}

export type UserDetail = {
  id: string
  name: string | null
  email: string | null
  image: string | null
  imageUrl: string | null
  isAdmin: boolean
  createdAt: string
  carePerson: CarePersonDto | null
  sessions: UserSessionItem[]
}

export const listUsers = createServerFn({ method: 'GET' }).handler(
  async (): Promise<UserListItem[]> => {
    await requireAdminId()
    const users = await prisma.user.findMany({
      where: { archivedAt: null },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isAdmin: true,
        createdAt: true,
        carePerson: { select: { name: true } },
        _count: { select: { sessions: true } },
      },
    })
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      imageUrl: resolveUserImageUrl(u.image),
      isAdmin: u.isAdmin,
      carePersonName: u.carePerson?.name ?? null,
      sessionCount: u._count.sessions,
      createdAt: u.createdAt.toISOString(),
    }))
  },
)

export const getUser = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>
    const userId = typeof input.userId === 'string' ? input.userId.trim() : ''
    if (!userId) throw new Error('User id is required.')
    return { userId }
  })
  .handler(async ({ data }): Promise<UserDetail> => {
    await requireAdminId()
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isAdmin: true,
        createdAt: true,
        sessions: {
          orderBy: { expires: 'desc' },
          select: { id: true, expires: true },
        },
      },
    })
    if (!user) throw new Error('User not found.')

    await ensureCarePersonForUser({
      id: user.id,
      name: user.name,
      email: user.email,
    })

    const person = await prisma.carePerson.findUnique({
      where: { userId: user.id },
      include: {
        type: true,
        user: { select: { name: true, email: true } },
      },
    })

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      imageUrl: resolveUserImageUrl(user.image),
      isAdmin: user.isAdmin,
      createdAt: user.createdAt.toISOString(),
      carePerson: person ? toPersonDto(person) : null,
      sessions: user.sessions.map((s) => ({
        id: s.id,
        expires: s.expires.toISOString(),
      })),
    }
  })

export const updateUserProfile = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const userId = typeof input.userId === 'string' ? input.userId.trim() : ''
    if (!userId) throw new Error('User id is required.')
    const name =
      typeof input.name === 'string' ? input.name.trim() || null : null
    const isAdmin = Boolean(input.isAdmin)
    const image =
      input.image === null
        ? null
        : typeof input.image === 'string'
          ? input.image.trim() || null
          : undefined
    return { userId, name, isAdmin, image }
  })
  .handler(async ({ data }): Promise<UserDetail> => {
    const adminId = await requireAdminId()
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: data.userId },
      select: { id: true, name: true, image: true, isAdmin: true },
    })

    if (before.isAdmin && !data.isAdmin) {
      const otherAdmins = await prisma.user.count({
        where: { isAdmin: true, id: { not: before.id } },
      })
      if (otherAdmins === 0) {
        throw new Error('Cannot remove admin from the last remaining admin.')
      }
    }

    const updated = await prisma.user.update({
      where: { id: data.userId },
      data: {
        name: data.name,
        isAdmin: data.isAdmin,
        ...(data.image !== undefined ? { image: data.image } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isAdmin: true,
        createdAt: true,
      },
    })

    await logActivity({
      actorUserId: adminId,
      action: 'UPDATE',
      entityType: ACTIVITY_ENTITY_TYPES.user,
      entityId: updated.id,
      summary: `Updated user profile for ${updated.name ?? updated.email ?? updated.id}`,
      changes: {
        name: { before: before.name, after: updated.name },
        isAdmin: { before: before.isAdmin, after: updated.isAdmin },
        ...(data.image !== undefined
          ? {
              image: {
                before: before.image,
                after: updated.image,
              },
            }
          : {}),
      },
      visibilityUserId: null,
    })

    return getUser({ data: { userId: updated.id } })
  })

export const updateUserCarePerson = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const userId = typeof input.userId === 'string' ? input.userId.trim() : ''
    if (!userId) throw new Error('User id is required.')
    return { ...input, userId }
  })
  .handler(async ({ data }): Promise<CarePersonDto> => {
    await requireAdminId()
    const person = await prisma.carePerson.findUnique({
      where: { userId: data.userId as string },
      select: { id: true },
    })
    if (!person) {
      throw new Error('Care person not found for this user.')
    }
    return updateCarePerson({
      data: {
        ...data,
        id: person.id,
        userId: data.userId,
      },
    })
  })

export const revokeUserSessions = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>
    const userId = typeof input.userId === 'string' ? input.userId.trim() : ''
    if (!userId) throw new Error('User id is required.')
    return { userId }
  })
  .handler(async ({ data }): Promise<{ revoked: number }> => {
    const adminId = await requireAdminId()
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, name: true, email: true },
    })
    if (!user) throw new Error('User not found.')

    const result = await prisma.session.deleteMany({
      where: { userId: data.userId },
    })

    await logActivity({
      actorUserId: adminId,
      action: 'DELETE',
      entityType: ACTIVITY_ENTITY_TYPES.session,
      entityId: data.userId,
      summary: `Revoked all sessions for ${user.name ?? user.email ?? user.id}`,
      visibilityUserId: null,
    })

    return { revoked: result.count }
  })

export const listUserActivity = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>
    const userId = typeof input.userId === 'string' ? input.userId.trim() : ''
    if (!userId) throw new Error('User id is required.')
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
    return { userId, take, cursor }
  })
  .handler(
    async ({
      data,
    }): Promise<{ items: ActivityListItem[]; nextCursor: string | null }> => {
      await requireAdminId()
      const rows = await prisma.activityLog.findMany({
        where: { actorUserId: data.userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: data.take + 1,
        ...(data.cursor
          ? {
              cursor: { id: data.cursor },
              skip: 1,
            }
          : {}),
        include: {
          actor: {
            select: { id: true, name: true, email: true },
          },
        },
      })

      const hasMore = rows.length > data.take
      const page = hasMore ? rows.slice(0, data.take) : rows
      const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null

      return {
        items: page.map((row) => ({
          id: row.id,
          action: row.action as ActivityAction,
          entityType: row.entityType,
          entityTypeLabel: entityTypeLabel(row.entityType),
          entityId: row.entityId,
          summary: row.summary,
          linkMeta: parseLinkMeta(row.linkMeta),
          createdAt: row.createdAt.toISOString(),
          actor: row.actor,
        })),
        nextCursor,
      }
    },
  )

// ---------------------------------------------------------------------------
// Removal

/**
 * Everything a user owns that would be destroyed by deleting the row.
 *
 * Most of these cascade, so the delete would succeed and take an entire
 * personal ledger with it. Counting them is what turns that into an archive.
 */
async function countUserRefs(userId: string): Promise<number> {
  const [
    transactions,
    accounts,
    groups,
    documents,
    attachments,
    reconciled,
    automations,
  ] = await Promise.all([
    prisma.transaction.count({ where: { userId } }),
    prisma.financialAccount.count({ where: { userId } }),
    prisma.accountGroup.count({ where: { userId } }),
    prisma.document.count({ where: { userId } }),
    prisma.attachment.count({ where: { userId } }),
    prisma.transaction.count({ where: { reconciliationUpdatedById: userId } }),
    prisma.automation.count({ where: { createdByUserId: userId } }),
  ])

  // A caregiver record with its own history keeps the user alive too: deleting
  // the user nulls CarePerson.userId, quietly turning them into an "offline"
  // person that anyone may act on behalf of (see canReviewSwap).
  const person = await prisma.carePerson.findUnique({
    where: { userId },
    select: { id: true },
  })
  const personRefs = person ? await countCarePersonRefs(person.id) : 0

  return (
    transactions +
    accounts +
    groups +
    documents +
    attachments +
    reconciled +
    automations +
    personRefs
  )
}

/**
 * Remove an app user.
 *
 * Archiving also revokes their sessions and archives their linked caregiver
 * record — an archived user who is still signed in, or still on the schedule,
 * has not really been removed.
 */
export const removeUser = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>
    const userId = typeof input.userId === 'string' ? input.userId.trim() : ''
    if (!userId) throw new Error('User id is required.')
    return { userId }
  })
  .handler(async ({ data }): Promise<ArchiveResult> => {
    const adminId = await requireAdminId()

    if (adminId === data.userId) {
      throw new Error('You cannot remove your own account.')
    }

    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, name: true, email: true, isAdmin: true },
    })
    if (!user) throw new Error('User not found.')

    if (user.isAdmin) {
      const otherAdmins = await prisma.user.count({
        where: { isAdmin: true, id: { not: user.id }, archivedAt: null },
      })
      if (otherAdmins === 0) {
        throw new Error('Cannot remove the last remaining admin.')
      }
    }

    const label = user.name ?? user.email ?? user.id

    return archiveOrDelete({
      entityType: ACTIVITY_ENTITY_TYPES.user,
      id: user.id,
      label,
      actorUserId: adminId,
      allowArchive: true,
      countRefs: () => countUserRefs(user.id),
      hardDelete: async () => {
        await prisma.user.delete({ where: { id: user.id } })
      },
      archive: async () => {
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: user.id },
            data: { archivedAt: new Date() },
          })
          await tx.session.deleteMany({ where: { userId: user.id } })
          await tx.carePerson.updateMany({
            where: { userId: user.id },
            data: { archivedAt: new Date(), isActive: false },
          })
        })
      },
      visibilityUserId: null,
    })
  })

export const restoreUser = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>
    const userId = typeof input.userId === 'string' ? input.userId.trim() : ''
    if (!userId) throw new Error('User id is required.')
    return { userId }
  })
  .handler(async ({ data }): Promise<void> => {
    const adminId = await requireAdminId()
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, name: true, email: true, archivedAt: true },
    })
    if (!user) throw new Error('User not found.')

    await restoreArchived({
      entityType: ACTIVITY_ENTITY_TYPES.user,
      id: user.id,
      label: user.name ?? user.email ?? user.id,
      actorUserId: adminId,
      archivedAt: user.archivedAt,
      restore: async () => {
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: user.id },
            data: { archivedAt: null },
          })
          // The caregiver record comes back too, but stays inactive: putting
          // them back on the schedule is a separate decision.
          await tx.carePerson.updateMany({
            where: { userId: user.id },
            data: { archivedAt: null },
          })
        })
      },
      visibilityUserId: null,
    })
  })
