import type { ActivityAction } from '#/generated/prisma/enums'

/** Stable entity type keys for activity log rows. Add new keys as features land. */
export const ACTIVITY_ENTITY_TYPES = {
  account: 'account',
  transaction: 'transaction',
  invoice: 'invoice',
  coverage_occurrence: 'coverage_occurrence',
  coverage_series: 'coverage_series',
  calendar_event: 'calendar_event',
  swap: 'swap',
  care_person: 'care_person',
  care_person_type: 'care_person_type',
  care_event_type: 'care_event_type',
  care_settings: 'care_settings',
  /** Future */
  med: 'med',
  document: 'document',
} as const

export type ActivityEntityType =
  (typeof ACTIVITY_ENTITY_TYPES)[keyof typeof ACTIVITY_ENTITY_TYPES]

export type ActivityChangeValue = string | number | boolean | null

export type ActivityFieldChange = {
  before: ActivityChangeValue
  after: ActivityChangeValue
}

export type ActivityChanges = Record<string, ActivityFieldChange>

export type ActivityLinkMeta = {
  day?: string
  tab?: 'calendar' | 'swaps'
  year?: number
  month?: number
  isGlobal?: boolean
  invoiceId?: string
  accountName?: string
}

export type ActivityHref =
  | {
      to: '/transactions/$transactionId'
      params: { transactionId: string }
    }
  | {
      to: '/accounts/$accountId'
      params: { accountId: string }
      search: {
        page: number
        pageSize: number
        sort: string
        q: string
        cols: string
      }
    }
  | {
      to: '/invoices'
      search?: { invoiceId?: string }
    }
  | {
      to: '/schedule'
      search: {
        tab: 'calendar' | 'swaps'
        year: number
        month: number
        day: string
      }
    }
  | null

export const ACTIVITY_ENTITY_LABELS: Record<string, string> = {
  account: 'Account',
  transaction: 'Transaction',
  invoice: 'Invoice',
  coverage_occurrence: 'Coverage',
  coverage_series: 'Coverage series',
  calendar_event: 'Calendar event',
  swap: 'Swap',
  care_person: 'Care person',
  care_person_type: 'Person type',
  care_event_type: 'Event type',
  care_settings: 'Loved one settings',
  med: 'Medication',
  document: 'Document',
}

function serializeValue(value: unknown): ActivityChangeValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    return JSON.stringify(value)
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toString' in value &&
    typeof (value as { toString: () => string }).toString === 'function'
  ) {
    // Prisma Decimal and similar
    return (value as { toString: () => string }).toString()
  }
  return JSON.stringify(value)
}

function valuesEqual(a: ActivityChangeValue, b: ActivityChangeValue): boolean {
  return a === b
}

/**
 * Diff listed fields between before/after snapshots.
 * Unchanged fields are omitted. Missing keys are treated as null.
 */
export function diffChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: readonly string[],
): ActivityChanges {
  const changes: ActivityChanges = {}
  for (const field of fields) {
    const beforeVal = serializeValue(before?.[field] ?? null)
    const afterVal = serializeValue(after?.[field] ?? null)
    if (!valuesEqual(beforeVal, afterVal)) {
      changes[field] = { before: beforeVal, after: afterVal }
    }
  }
  return changes
}

/** Build create-style changes where every listed field has before: null. */
export function createChanges(
  after: Record<string, unknown>,
  fields: readonly string[],
): ActivityChanges {
  return diffChanges(null, after, fields)
}

function dayParts(day: string): { year: number; month: number; day: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) {
    const now = new Date()
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: day,
    }
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day,
  }
}

export type ResolveActivityInput = {
  entityType: string
  entityId: string | null
  linkMeta?: ActivityLinkMeta | null
}

export function resolveActivityHref(entry: ResolveActivityInput): ActivityHref {
  const meta = entry.linkMeta ?? undefined
  const id = entry.entityId

  switch (entry.entityType) {
    case ACTIVITY_ENTITY_TYPES.transaction:
      if (!id) return null
      return {
        to: '/transactions/$transactionId',
        params: { transactionId: id },
      }
    case ACTIVITY_ENTITY_TYPES.account:
      if (!id) return null
      return {
        to: '/accounts/$accountId',
        params: { accountId: id },
        search: {
          page: 1,
          pageSize: 10,
          sort: '-date',
          q: '',
          cols: '',
        },
      }
    case ACTIVITY_ENTITY_TYPES.invoice:
      return {
        to: '/invoices',
        search: id ? { invoiceId: id } : undefined,
      }
    case ACTIVITY_ENTITY_TYPES.swap:
      return {
        to: '/schedule',
        search: {
          tab: 'swaps',
          year: meta?.year ?? new Date().getFullYear(),
          month: meta?.month ?? new Date().getMonth(),
          day: meta?.day ?? new Date().toISOString().slice(0, 10),
        },
      }
    case ACTIVITY_ENTITY_TYPES.calendar_event:
    case ACTIVITY_ENTITY_TYPES.coverage_occurrence:
    case ACTIVITY_ENTITY_TYPES.coverage_series: {
      const day =
        meta?.day ?? new Date().toISOString().slice(0, 10)
      const parts = dayParts(day)
      return {
        to: '/schedule',
        search: {
          tab: 'calendar',
          year: meta?.year ?? parts.year,
          month: meta?.month ?? parts.month,
          day: parts.day,
        },
      }
    }
    case ACTIVITY_ENTITY_TYPES.care_settings:
      return null
    case ACTIVITY_ENTITY_TYPES.care_person:
    case ACTIVITY_ENTITY_TYPES.care_person_type:
    case ACTIVITY_ENTITY_TYPES.care_event_type:
      return null
    default:
      return null
  }
}

/** Human labels for audit snapshot field keys. */
export const ACTIVITY_FIELD_LABELS: Record<string, string> = {
  financialAccountId: 'Account',
  type: 'Type',
  amount: 'Amount',
  description: 'Description',
  date: 'Date',
  payeeId: 'Payee',
  categoryId: 'Category',
  transferGroupId: 'Transfer group',
  tagIds: 'Tags',
  attachmentIds: 'Attachments',
}

export function formatActivityField(field: string): string {
  return ACTIVITY_FIELD_LABELS[field] ?? field
}

export function formatActivityAction(action: ActivityAction | string): string {
  switch (action) {
    case 'CREATE':
      return 'Created'
    case 'UPDATE':
      return 'Updated'
    case 'DELETE':
      return 'Deleted'
    default:
      return String(action)
  }
}

export function entityTypeLabel(entityType: string): string {
  return ACTIVITY_ENTITY_LABELS[entityType] ?? entityType
}
