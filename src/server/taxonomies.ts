import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import { prisma } from '#/lib/prisma'
import type {
  CategoryRecord,
  PayeeRecord,
  TagRecord,
} from '#/lib/taxonomy-types'
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
  isExpenditure: true,
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

function requireId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id) {
    throw new Error('Id is required.')
  }
  return id
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
  async (): Promise<PayeeRecord[]> => {
    await requireUserId()
    return prisma.payee.findMany({
      select: PAYEE_SELECT,
      orderBy: { name: 'asc' },
    })
  },
)

export const listCategories = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CategoryRecord[]> => {
    await requireUserId()
    return prisma.category.findMany({
      select: CATEGORY_SELECT,
      orderBy: { name: 'asc' },
    })
  },
)

export const listTags = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TagRecord[]> => {
    await requireUserId()
    return prisma.tag.findMany({
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
    await requireUserId()
    return prisma.payee.create({
      data: {
        name: data.name,
        description: data.description,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: PAYEE_SELECT,
    })
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
    return prisma.category.create({
      data: {
        name: data.name,
        isExpenditure: data.isExpenditure,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: CATEGORY_SELECT,
    })
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
    return prisma.tag.create({
      data: {
        name: data.name,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: TAG_SELECT,
    })
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
    await requireUserId()
    return prisma.payee.update({
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
      isExpenditure:
        typeof input.isExpenditure === 'boolean' ? input.isExpenditure : true,
      iconId: optionalString(input.iconId),
      bgColor: optionalString(input.bgColor),
      textColor: optionalString(input.textColor),
    }
  })
  .handler(async ({ data }): Promise<CategoryRecord> => {
    await requireUserId()
    return prisma.category.update({
      where: { id: data.id },
      data: {
        name: data.name,
        isExpenditure: data.isExpenditure,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: CATEGORY_SELECT,
    })
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
    await requireUserId()
    return prisma.tag.update({
      where: { id: data.id },
      data: {
        name: data.name,
        iconId: data.iconId,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: TAG_SELECT,
    })
  })
