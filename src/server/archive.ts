/**
 * One definition of "remove this thing".
 *
 * The rule is the same everywhere: something nothing points at is genuinely
 * deleted, something with history is archived instead, because a hard delete
 * would either fail on a foreign key or silently null out a column on rows the
 * user never asked to touch. Which of the two happened is returned so the UI
 * can say so rather than guess.
 *
 * Archiving is an admin power. A regular user cleaning up their own mistake
 * passes `allowArchive: false` and gets a refusal instead, because hiding a
 * shared taxonomy from everyone else is not a self-service action.
 */

import { createServerOnlyFn } from '@tanstack/react-start'
import type { ActivityEntityType } from '#/lib/activity'
import { logActivity } from '#/server/activity-log'

export type ArchiveOutcome = 'deleted' | 'archived'

export type ArchiveResult = {
  outcome: ArchiveOutcome
  refCount: number
}

export type ArchiveOrDeleteOptions = {
  entityType: ActivityEntityType
  id: string
  /** Human name, used verbatim in the activity summary. */
  label: string
  actorUserId: string
  /** Admin paths archive when references exist; user paths refuse. */
  allowArchive: boolean
  /** Total rows that would be orphaned or broken by a hard delete. */
  countRefs: () => Promise<number>
  hardDelete: () => Promise<void>
  archive: () => Promise<void>
  /** Overrides the default refusal message on the non-admin path. */
  refuseMessage?: (refCount: number) => string
  visibilityUserId?: string | null
}

function defaultRefuseMessage(label: string, refCount: number): string {
  const noun = refCount === 1 ? 'record' : 'records'
  return `“${label}” is used by ${refCount} ${noun}, so it cannot be removed. Ask an admin to archive it instead.`
}

// createServerOnlyFn, not a bare export: this reaches `logActivity` and so
// `prisma`, and the server modules that call it are pulled into the client
// graph by route files. See the note at the top of src/server/auth-guards.ts.
export const archiveOrDelete = createServerOnlyFn(async (
  options: ArchiveOrDeleteOptions,
): Promise<ArchiveResult> => {
  const refCount = await options.countRefs()

  if (refCount === 0) {
    await options.hardDelete()
    await logActivity({
      actorUserId: options.actorUserId,
      action: 'DELETE',
      entityType: options.entityType,
      entityId: options.id,
      summary: `Deleted ${options.entityType.replace(/_/g, ' ')} “${options.label}”`,
      visibilityUserId: options.visibilityUserId ?? null,
    })
    return { outcome: 'deleted', refCount }
  }

  if (!options.allowArchive) {
    throw new Error(
      options.refuseMessage?.(refCount) ??
        defaultRefuseMessage(options.label, refCount),
    )
  }

  const archivedAt = new Date()
  await options.archive()
  // UPDATE rather than a new ActivityAction member: archiving is a field
  // change, and the enum is shared with every other entity in the log.
  await logActivity({
    actorUserId: options.actorUserId,
    action: 'UPDATE',
    entityType: options.entityType,
    entityId: options.id,
    summary: `Archived ${options.entityType.replace(/_/g, ' ')} “${options.label}” (${refCount} linked ${
      refCount === 1 ? 'record' : 'records'
    })`,
    changes: {
      archivedAt: { before: null, after: archivedAt.toISOString() },
    },
    visibilityUserId: options.visibilityUserId ?? null,
  })
  return { outcome: 'archived', refCount }
})

export type RestoreOptions = {
  entityType: ActivityEntityType
  id: string
  label: string
  actorUserId: string
  archivedAt: Date | null
  restore: () => Promise<void>
  visibilityUserId?: string | null
}

export const restoreArchived = createServerOnlyFn(async (
  options: RestoreOptions,
): Promise<void> => {
  await options.restore()
  await logActivity({
    actorUserId: options.actorUserId,
    action: 'UPDATE',
    entityType: options.entityType,
    entityId: options.id,
    summary: `Restored ${options.entityType.replace(/_/g, ' ')} “${options.label}”`,
    changes: {
      archivedAt: {
        before: options.archivedAt?.toISOString() ?? null,
        after: null,
      },
    },
    visibilityUserId: options.visibilityUserId ?? null,
  })
})
