import {
  formatActivityField,
  type ActivityChanges,
  type ActivityChangeValue,
} from '#/lib/activity'
import { prisma } from '#/lib/prisma'
import {
  TAXONOMY_COLOR_SELECT,
  type ColoredTaxonomyRef,
} from '#/lib/taxonomy-types'

/** One rendered chunk of a before/after value. */
export type ActivityDisplayValue =
  | { kind: 'taxonomy'; name: string; bgColor: string | null; textColor: string | null }
  | { kind: 'text'; text: string }

export type ResolvedActivityChange = {
  field: string
  label: string
  before: ActivityDisplayValue[]
  after: ActivityDisplayValue[]
}

/**
 * Which model resolves a given snapshot field. Field names are unique across
 * entity types, so resolution is driven by field name rather than entityType.
 */
const FIELD_SOURCE = {
  payeeId: 'payee',
  categoryId: 'category',
  tagIds: 'tag',
  financialAccountId: 'account',
  attachmentIds: 'attachment',
} as const

type SourceKey = (typeof FIELD_SOURCE)[keyof typeof FIELD_SOURCE]

function isArrayField(field: string): boolean {
  return field === 'tagIds' || field === 'attachmentIds'
}

/** Snapshot arrays are stored via JSON.stringify — see serializeValue in lib/activity. */
function parseIdList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function idsInValue(field: string, value: ActivityChangeValue): string[] {
  if (typeof value !== 'string' || !value) return []
  return isArrayField(field) ? parseIdList(value) : [value]
}

type NameMap = Map<string, ColoredTaxonomyRef>

async function loadNames(
  needed: Record<SourceKey, Set<string>>,
): Promise<Record<SourceKey, NameMap>> {
  const ids = (key: SourceKey) => [...needed[key]]
  const toMap = (
    rows: Array<{
      id: string
      name: string
      bgColor?: string | null
      textColor?: string | null
    }>,
  ): NameMap =>
    new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name,
          bgColor: row.bgColor ?? null,
          textColor: row.textColor ?? null,
        },
      ]),
    )

  // One query per model for the whole page.
  const [payees, categories, tags, accounts, attachments] = await Promise.all([
    needed.payee.size
      ? prisma.payee.findMany({
          where: { id: { in: ids('payee') } },
          select: TAXONOMY_COLOR_SELECT,
        })
      : [],
    needed.category.size
      ? prisma.category.findMany({
          where: { id: { in: ids('category') } },
          select: TAXONOMY_COLOR_SELECT,
        })
      : [],
    needed.tag.size
      ? prisma.tag.findMany({
          where: { id: { in: ids('tag') } },
          select: TAXONOMY_COLOR_SELECT,
        })
      : [],
    needed.account.size
      ? prisma.financialAccount.findMany({
          where: { id: { in: ids('account') } },
          select: { id: true, name: true },
        })
      : [],
    needed.attachment.size
      ? prisma.attachment.findMany({
          where: { id: { in: ids('attachment') } },
          select: { id: true, fileName: true },
        })
      : [],
  ])

  return {
    payee: toMap(payees),
    category: toMap(categories),
    tag: toMap(tags),
    account: toMap(accounts),
    attachment: toMap(
      attachments.map((row) => ({ id: row.id, name: row.fileName })),
    ),
  }
}

function displayFor(
  field: string,
  value: ActivityChangeValue,
  names: Record<SourceKey, NameMap>,
): ActivityDisplayValue[] {
  const source = FIELD_SOURCE[field as keyof typeof FIELD_SOURCE]
  if (!source) {
    if (value === null) return [{ kind: 'text', text: '—' }]
    if (typeof value === 'boolean') {
      return [{ kind: 'text', text: value ? 'true' : 'false' }]
    }
    return [{ kind: 'text', text: String(value) }]
  }

  const ids = idsInValue(field, value)
  if (ids.length === 0) return [{ kind: 'text', text: '—' }]

  return ids.map((id) => {
    const found = names[source].get(id)
    if (!found) {
      // Referenced row is gone — keep the id visible rather than lose the record.
      return { kind: 'text', text: `${id.slice(0, 8)}… (deleted)` }
    }
    return {
      kind: 'taxonomy',
      name: found.name,
      bgColor: found.bgColor,
      textColor: found.textColor,
    }
  })
}

/**
 * Turn raw audit `changes` into display rows with human field labels and
 * UUIDs resolved to names. Batches lookups across every row passed in.
 */
export async function resolveActivityChanges(
  changeSets: Array<ActivityChanges | null>,
): Promise<Array<ResolvedActivityChange[] | null>> {
  const needed: Record<SourceKey, Set<string>> = {
    payee: new Set(),
    category: new Set(),
    tag: new Set(),
    account: new Set(),
    attachment: new Set(),
  }

  for (const changes of changeSets) {
    if (!changes) continue
    for (const [field, change] of Object.entries(changes)) {
      const source = FIELD_SOURCE[field as keyof typeof FIELD_SOURCE]
      if (!source) continue
      for (const value of [change.before, change.after]) {
        for (const id of idsInValue(field, value)) needed[source].add(id)
      }
    }
  }

  const names = await loadNames(needed)

  return changeSets.map((changes) => {
    if (!changes) return null
    return Object.entries(changes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([field, change]) => ({
        field,
        label: formatActivityField(field),
        before: displayFor(field, change.before, names),
        after: displayFor(field, change.after, names),
      }))
  })
}
