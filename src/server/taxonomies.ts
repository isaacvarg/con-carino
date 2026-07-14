import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import { prisma } from '#/lib/prisma'
import type {
  CategoryRecord,
  PayeeRecord,
  TagRecord,
  TaxonomyListItem,
} from '#/lib/taxonomy-types'
import { authConfig } from '#/utils/auth'

export type {
  CategoryRecord,
  PayeeRecord,
  TagRecord,
  TaxonomyListItem,
} from '#/lib/taxonomy-types'

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function requireName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) {
    throw new Error('Name is required.')
  }
  return name
}

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
  async (): Promise<TaxonomyListItem[]> => {
    await requireUserId()
    const payees = await prisma.payee.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    return payees
  },
)

export const listCategories = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TaxonomyListItem[]> => {
    await requireUserId()
    const categories = await prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    return categories
  },
)

export const listTags = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TaxonomyListItem[]> => {
    await requireUserId()
    const tags = await prisma.tag.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    return tags
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
    await requireUserId()
    const created = await prisma.payee.create({
      data: {
        name: data.name,
        description: data.description,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: {
        id: true,
        name: true,
        description: true,
        iconId: true,
        bgColor: true,
        textColor: true,
      },
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
      isExpenditure:
        typeof input.isExpenditure === 'boolean' ? input.isExpenditure : true,
      iconId: optionalString(input.iconId),
      bgColor: optionalString(input.bgColor),
      textColor: optionalString(input.textColor),
    }
  })
  .handler(async ({ data }): Promise<CategoryRecord> => {
    await requireUserId()
    const created = await prisma.category.create({
      data: {
        name: data.name,
        isExpenditure: data.isExpenditure,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: {
        id: true,
        name: true,
        isExpenditure: true,
        iconId: true,
        bgColor: true,
        textColor: true,
      },
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
    await requireUserId()
    const created = await prisma.tag.create({
      data: {
        name: data.name,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: {
        id: true,
        name: true,
        iconId: true,
        bgColor: true,
        textColor: true,
      },
    })
    return created
  })
