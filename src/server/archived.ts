/**
 * Read side of Settings → Archived.
 *
 * One query per archivable kind, returned as a flat list the panel groups by
 * tab. Reference counts come along so the screen can say whether "Delete
 * permanently" will actually be allowed before the admin clicks it.
 */

import { createServerFn } from '@tanstack/react-start'
import { prisma } from '#/lib/prisma'
import { requireAdminId } from '#/server/auth-guards'

export type ArchivedKind =
  | 'tag'
  | 'category'
  | 'payee'
  | 'account'
  | 'account_group'
  | 'care_person'
  | 'user'
  | 'transaction_type'

export type ArchivedItem = {
  kind: ArchivedKind
  id: string
  name: string
  archivedAt: string
  /** Extra context, e.g. an email or an account type. */
  detail: string | null
}

export const listArchived = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ArchivedItem[]> => {
    await requireAdminId()

    const notNull = { archivedAt: { not: null } } as const
    const [
      tags,
      categories,
      payees,
      accounts,
      groups,
      people,
      users,
      types,
    ] = await Promise.all([
      prisma.tag.findMany({
        where: notNull,
        select: { id: true, name: true, archivedAt: true },
      }),
      prisma.category.findMany({
        where: notNull,
        select: { id: true, name: true, archivedAt: true },
      }),
      prisma.payee.findMany({
        where: notNull,
        select: { id: true, name: true, archivedAt: true },
      }),
      prisma.financialAccount.findMany({
        where: notNull,
        select: { id: true, name: true, archivedAt: true, type: true },
      }),
      prisma.accountGroup.findMany({
        where: notNull,
        select: { id: true, name: true, archivedAt: true },
      }),
      prisma.carePerson.findMany({
        where: notNull,
        select: { id: true, name: true, archivedAt: true },
      }),
      prisma.user.findMany({
        where: notNull,
        select: { id: true, name: true, email: true, archivedAt: true },
      }),
      prisma.transactionTypeDef.findMany({
        where: notNull,
        select: { id: true, label: true, archivedAt: true },
      }),
    ])

    const items: ArchivedItem[] = [
      ...tags.map((r) => ({
        kind: 'tag' as const,
        id: r.id,
        name: r.name,
        archivedAt: r.archivedAt!.toISOString(),
        detail: null,
      })),
      ...categories.map((r) => ({
        kind: 'category' as const,
        id: r.id,
        name: r.name,
        archivedAt: r.archivedAt!.toISOString(),
        detail: null,
      })),
      ...payees.map((r) => ({
        kind: 'payee' as const,
        id: r.id,
        name: r.name,
        archivedAt: r.archivedAt!.toISOString(),
        detail: null,
      })),
      ...accounts.map((r) => ({
        kind: 'account' as const,
        id: r.id,
        name: r.name,
        archivedAt: r.archivedAt!.toISOString(),
        detail: r.type,
      })),
      ...groups.map((r) => ({
        kind: 'account_group' as const,
        id: r.id,
        name: r.name,
        archivedAt: r.archivedAt!.toISOString(),
        detail: null,
      })),
      ...people.map((r) => ({
        kind: 'care_person' as const,
        id: r.id,
        name: r.name,
        archivedAt: r.archivedAt!.toISOString(),
        detail: null,
      })),
      ...users.map((r) => ({
        kind: 'user' as const,
        id: r.id,
        name: r.name ?? r.email ?? r.id,
        archivedAt: r.archivedAt!.toISOString(),
        detail: r.email,
      })),
      ...types.map((r) => ({
        kind: 'transaction_type' as const,
        id: r.id,
        name: r.label,
        archivedAt: r.archivedAt!.toISOString(),
        detail: null,
      })),
    ]

    return items.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt))
  },
)
