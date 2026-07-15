import type { ActivityAction } from '#/generated/prisma/enums'
import type { Prisma } from '#/generated/prisma/client'
import type { ActivityChanges, ActivityLinkMeta } from '#/lib/activity'
import { prisma } from '#/lib/prisma'

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
