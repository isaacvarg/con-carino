import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import {
  ACTIVITY_ENTITY_TYPES,
  createChanges,
  diffChanges,
} from '#/lib/activity'
import { prisma } from '#/lib/prisma'
import { logActivity } from '#/server/activity-log'
import {
  archiveOrDelete,
  restoreArchived,
  type ArchiveResult,
} from '#/server/archive'
import { isCallerAdmin, requireAdminId } from '#/server/auth-guards'
import type {
  CategoryRecord,
  PayeeRecord,
  TagRecord,
} from '#/lib/taxonomy-types'
import { optionalString, requireId, requireName } from '#/lib/validators'
import { authConfig } from '#/utils/auth'

export type {
  CategoryRecord,
  ColoredTaxonomyRef,
  PayeeRecord,
  TagRecord,
  TaxonomyListItem,
} from '#/lib/taxonomy-types'

const PAYEE_SELECT = {
  id: true,
  name: true,
  description: true,
  iconId: true,
  bgColor: true,
  textColor: true,
} as const

const CATEGORY_SELECT = {
  id: true,
  name: true,
  iconId: true,
  bgColor: true,
  textColor: true,
} as const

const TAG_SELECT = {
  id: true,
  name: true,
  iconId: true,
  bgColor: true,
  textColor: true,
} as const

async function requireUserId() {
  const request = getRequest()
  const session = await getSession(request, authConfig)
  const userId = session?.user?.id
  if (!userId) {
    throw new Error('You must be signed in to manage taxonomies.')
  }
  return userId
}

export const listPayees = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PayeeRecord[]> => {
    await requireUserId()
    return prisma.payee.findMany({
      where: { archivedAt: null },
      select: PAYEE_SELECT,
      orderBy: { name: 'asc' },
    })
  },
)

export const listCategories = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CategoryRecord[]> => {
    await requireUserId()
    return prisma.category.findMany({
      where: { archivedAt: null },
      select: CATEGORY_SELECT,
      orderBy: { name: 'asc' },
    })
  },
)

export const listTags = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TagRecord[]> => {
    await requireUserId()
    return prisma.tag.findMany({
      where: { archivedAt: null },
      select: TAG_SELECT,
      orderBy: { name: 'asc' },
    })
  },
)

export const createPayee = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const input = data as Record<string, unknown>
    return {
      name: requireName(input.name),
      description: optionalString(input.description),
      iconId: optionalString(input.iconId),
      bgColor: optionalString(input.bgColor),
      textColor: optionalString(input.textColor),
    }
  })
  .handler(async ({ data }): Promise<PayeeRecord> => {
    const userId = await requireUserId()
    const created = await prisma.payee.create({
      data: {
        name: data.name,
        description: data.description,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: PAYEE_SELECT,
    })

    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.payee,
      entityId: created.id,
      summary: `Created payee “${created.name}”`,
      changes: createChanges(created, ['name', 'description', 'iconId', 'bgColor', 'textColor']),
    })

    return created
  })

export const createCategory = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const input = data as Record<string, unknown>
    return {
      name: requireName(input.name),
      iconId: optionalString(input.iconId),
      bgColor: optionalString(input.bgColor),
      textColor: optionalString(input.textColor),
    }
  })
  .handler(async ({ data }): Promise<CategoryRecord> => {
    const userId = await requireUserId()
    const created = await prisma.category.create({
      data: {
        name: data.name,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: CATEGORY_SELECT,
    })

    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.category,
      entityId: created.id,
      summary: `Created category “${created.name}”`,
      changes: createChanges(created, ['name', 'iconId', 'bgColor', 'textColor']),
    })

    return created
  })

export const createTag = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const input = data as Record<string, unknown>
    return {
      name: requireName(input.name),
      iconId: optionalString(input.iconId),
      bgColor: optionalString(input.bgColor),
      textColor: optionalString(input.textColor),
    }
  })
  .handler(async ({ data }): Promise<TagRecord> => {
    const userId = await requireUserId()
    const created = await prisma.tag.create({
      data: {
        name: data.name,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: TAG_SELECT,
    })

    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.tag,
      entityId: created.id,
      summary: `Created tag “${created.name}”`,
      changes: createChanges(created, ['name', 'iconId', 'bgColor', 'textColor']),
    })

    return created
  })

export const updatePayee = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const input = data as Record<string, unknown>
    return {
      id: requireId(input.id),
      name: requireName(input.name),
      description: optionalString(input.description),
      iconId: optionalString(input.iconId),
      bgColor: optionalString(input.bgColor),
      textColor: optionalString(input.textColor),
    }
  })
  .handler(async ({ data }): Promise<PayeeRecord> => {
    const userId = await requireUserId()
    const before = await prisma.payee.findUniqueOrThrow({
      where: { id: data.id },
      select: PAYEE_SELECT,
    })
    const updated = await prisma.payee.update({
      where: { id: data.id },
      data: {
        name: data.name,
        description: data.description,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: PAYEE_SELECT,
    })

    const changes = diffChanges(before, updated, ['name', 'description', 'iconId', 'bgColor', 'textColor'])
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.payee,
        entityId: updated.id,
        summary: `Updated payee “${updated.name}”`,
        changes,
      })
    }

    return updated
  })

export const updateCategory = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const input = data as Record<string, unknown>
    return {
      id: requireId(input.id),
      name: requireName(input.name),
      iconId: optionalString(input.iconId),
      bgColor: optionalString(input.bgColor),
      textColor: optionalString(input.textColor),
    }
  })
  .handler(async ({ data }): Promise<CategoryRecord> => {
    const userId = await requireUserId()
    const before = await prisma.category.findUniqueOrThrow({
      where: { id: data.id },
      select: CATEGORY_SELECT,
    })
    const updated = await prisma.category.update({
      where: { id: data.id },
      data: {
        name: data.name,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: CATEGORY_SELECT,
    })

    const changes = diffChanges(before, updated, ['name', 'iconId', 'bgColor', 'textColor'])
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.category,
        entityId: updated.id,
        summary: `Updated category “${updated.name}”`,
        changes,
      })
    }

    return updated
  })

export const updateTag = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const input = data as Record<string, unknown>
    return {
      id: requireId(input.id),
      name: requireName(input.name),
      iconId: optionalString(input.iconId),
      bgColor: optionalString(input.bgColor),
      textColor: optionalString(input.textColor),
    }
  })
  .handler(async ({ data }): Promise<TagRecord> => {
    const userId = await requireUserId()
    const before = await prisma.tag.findUniqueOrThrow({
      where: { id: data.id },
      select: TAG_SELECT,
    })
    const updated = await prisma.tag.update({
      where: { id: data.id },
      data: {
        name: data.name,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: TAG_SELECT,
    })

    const changes = diffChanges(before, updated, ['name', 'iconId', 'bgColor', 'textColor'])
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.tag,
        entityId: updated.id,
        summary: `Updated tag “${updated.name}”`,
        changes,
      })
    }

    return updated
  })

// ---------------------------------------------------------------------------
// Removal
//
// Tags, categories and payees behave identically here, so the three of them
// share one implementation rather than three near-copies. Which one is being
// acted on is a parameter, not a separate server function.

export type TaxonomyKind = 'tag' | 'category' | 'payee'

const TAXONOMY_KINDS: readonly TaxonomyKind[] = ['tag', 'category', 'payee']

function parseTaxonomyKind(value: unknown): TaxonomyKind {
  if (
    typeof value !== 'string' ||
    !TAXONOMY_KINDS.includes(value as TaxonomyKind)
  ) {
    throw new Error('Unknown taxonomy kind.')
  }
  return value as TaxonomyKind
}

async function loadTaxonomy(kind: TaxonomyKind, id: string) {
  const select = { id: true, name: true, archivedAt: true } as const
  const row =
    kind === 'tag'
      ? await prisma.tag.findUnique({ where: { id }, select })
      : kind === 'category'
        ? await prisma.category.findUnique({ where: { id }, select })
        : await prisma.payee.findUnique({ where: { id }, select })
  if (!row) throw new Error('Not found.')
  return row
}

/**
 * Everything that would be orphaned or silently rewritten by a hard delete.
 *
 * Automations count for tags and categories because both FKs cascade — a rule
 * would disappear rather than merely lose a filter, which is not something a
 * cleanup of an unused label should ever do.
 */
async function countTaxonomyRefs(
  kind: TaxonomyKind,
  id: string,
): Promise<number> {
  if (kind === 'tag') {
    const [transactions, automations] = await Promise.all([
      prisma.transaction.count({ where: { tags: { some: { id } } } }),
      prisma.automation.count({ where: { triggerTags: { some: { id } } } }),
    ])
    return transactions + automations
  }
  if (kind === 'category') {
    const [transactions, automations] = await Promise.all([
      prisma.transaction.count({ where: { categoryId: id } }),
      prisma.automation.count({ where: { triggerCategoryId: id } }),
    ])
    return transactions + automations
  }
  return prisma.transaction.count({ where: { payeeId: id } })
}

async function hardDeleteTaxonomy(kind: TaxonomyKind, id: string) {
  if (kind === 'tag') await prisma.tag.delete({ where: { id } })
  else if (kind === 'category') await prisma.category.delete({ where: { id } })
  else await prisma.payee.delete({ where: { id } })
}

async function setTaxonomyArchivedAt(
  kind: TaxonomyKind,
  id: string,
  archivedAt: Date | null,
) {
  if (kind === 'tag') {
    await prisma.tag.update({ where: { id }, data: { archivedAt } })
  } else if (kind === 'category') {
    await prisma.category.update({ where: { id }, data: { archivedAt } })
  } else {
    await prisma.payee.update({ where: { id }, data: { archivedAt } })
  }
}

/**
 * Remove a tag, category or payee.
 *
 * Unused ones are deleted outright — that is the "I just mistyped this" case
 * any signed-in user should be able to fix themselves. Ones with history are
 * archived instead, which only an admin may do: hiding a shared label from
 * everyone else is not a self-service action.
 */
export const removeTaxonomy = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    return { kind: parseTaxonomyKind(input.kind), id: requireId(input.id) }
  })
  .handler(async ({ data }): Promise<ArchiveResult> => {
    const userId = await requireUserId()
    const isAdmin = await isCallerAdmin()
    const row = await loadTaxonomy(data.kind, data.id)

    return archiveOrDelete({
      entityType: ACTIVITY_ENTITY_TYPES[data.kind],
      id: row.id,
      label: row.name,
      actorUserId: userId,
      allowArchive: isAdmin,
      countRefs: () => countTaxonomyRefs(data.kind, row.id),
      hardDelete: () => hardDeleteTaxonomy(data.kind, row.id),
      archive: () => setTaxonomyArchivedAt(data.kind, row.id, new Date()),
    })
  })

export const restoreTaxonomy = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    return { kind: parseTaxonomyKind(input.kind), id: requireId(input.id) }
  })
  .handler(async ({ data }): Promise<void> => {
    const userId = await requireAdminId()
    const row = await loadTaxonomy(data.kind, data.id)

    await restoreArchived({
      entityType: ACTIVITY_ENTITY_TYPES[data.kind],
      id: row.id,
      label: row.name,
      actorUserId: userId,
      archivedAt: row.archivedAt,
      restore: () => setTaxonomyArchivedAt(data.kind, row.id, null),
    })
  })

/** Permanent delete from the Archived screen. Refuses while anything uses it. */
export const deleteArchivedTaxonomy = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    return { kind: parseTaxonomyKind(input.kind), id: requireId(input.id) }
  })
  .handler(async ({ data }): Promise<void> => {
    const userId = await requireAdminId()
    const row = await loadTaxonomy(data.kind, data.id)

    const refs = await countTaxonomyRefs(data.kind, row.id)
    if (refs > 0) {
      throw new Error(
        `“${row.name}” is still used by ${refs} ${
          refs === 1 ? 'record' : 'records'
        }, so it cannot be permanently deleted.`,
      )
    }

    await hardDeleteTaxonomy(data.kind, row.id)
    await logActivity({
      actorUserId: userId,
      action: 'DELETE',
      entityType: ACTIVITY_ENTITY_TYPES[data.kind],
      entityId: row.id,
      summary: `Deleted ${data.kind} “${row.name}”`,
    })
  })
