import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import type {
  CareBillingStatus,
  CareCoverageFrequency,
  CareCoverageNeed,
  CareCoverageWindowKind,
  CareInvoiceStatus,
  CareOccurrenceStatus,
  CarePayInterval,
  CareSwapStatus,
} from '#/generated/prisma/enums'
import {
  CareCoverageFrequency as CareCoverageFrequencyEnum,
  CareCoverageNeed as CareCoverageNeedEnum,
  CareCoverageWindowKind as CareCoverageWindowKindEnum,
  CareOccurrenceStatus as CareOccurrenceStatusEnum,
  CarePayInterval as CarePayIntervalEnum,
} from '#/generated/prisma/enums'
import {
  computeInvoiceAmount,
  effectiveHourlyRate,
  lastClosedPayPeriodEnd,
  payPeriodStart,
} from '#/lib/care-invoice'
import {
  buildRequiredCoverageWindows,
  type RequiredShiftInput,
} from '#/lib/care-required'
import {
  expandSeriesOccurrences,
  hoursBetween,
  parseHhMm,
} from '#/lib/care-recurrence'
import {
  ACTIVITY_ENTITY_TYPES,
  createChanges,
  diffChanges,
} from '#/lib/activity'
import { prisma } from '#/lib/prisma'
import type { PrismaClient } from '#/generated/prisma/client'
import { toSignedTransactionAmount } from '#/lib/transaction-amount'
import { requireHexColor } from '#/lib/validators'
import { logActivity } from '#/server/activity-log'
import { authConfig } from '#/utils/auth'

const FREQUENCIES = Object.values(CareCoverageFrequencyEnum)
const COVERAGE_NEEDS = Object.values(CareCoverageNeedEnum)
const COVERAGE_WINDOW_KINDS = Object.values(CareCoverageWindowKindEnum)

async function requireUserId() {
  const request = getRequest()
  const session = await getSession(request, authConfig)
  const userId = session?.user?.id
  if (!userId) {
    throw new Error('You must be signed in to manage care.')
  }
  return userId
}

function decimalToString(value: { toString(): string } | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.toString()
}

function parseOptionalRate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  const n = Number(raw.trim())
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Hourly rate must be a non-negative number.')
  }
  return n.toFixed(4)
}

function parsePaySchedule(
  input: Record<string, unknown>,
  typeIsPaid: boolean,
): {
  payInterval: CarePayInterval
  payWeekday: number | null
  payAnchorDate: Date | null
  payMonthDay: number | null
} {
  if (!typeIsPaid) {
    return {
      payInterval: 'PER_SHIFT',
      payWeekday: null,
      payAnchorDate: null,
      payMonthDay: null,
    }
  }

  const rawInterval =
    typeof input.payInterval === 'string' ? input.payInterval : 'PER_SHIFT'
  if (
    !Object.values(CarePayIntervalEnum).includes(
      rawInterval as CarePayInterval,
    )
  ) {
    throw new Error('Pay interval is invalid.')
  }
  const payInterval = rawInterval as CarePayInterval

  let payWeekday: number | null = null
  if (
    input.payWeekday !== null &&
    input.payWeekday !== undefined &&
    input.payWeekday !== ''
  ) {
    const n =
      typeof input.payWeekday === 'number'
        ? input.payWeekday
        : Number(input.payWeekday)
    if (!Number.isInteger(n) || n < 0 || n > 6) {
      throw new Error('Pay weekday must be an integer 0–6.')
    }
    payWeekday = n
  }

  let payAnchorDate: Date | null = null
  if (
    typeof input.payAnchorDate === 'string' &&
    input.payAnchorDate.trim()
  ) {
    payAnchorDate = parseDateOnly(input.payAnchorDate, 'Pay anchor date')
  }

  let payMonthDay: number | null = null
  if (
    input.payMonthDay !== null &&
    input.payMonthDay !== undefined &&
    input.payMonthDay !== ''
  ) {
    const n =
      typeof input.payMonthDay === 'number'
        ? input.payMonthDay
        : Number(input.payMonthDay)
    if (!Number.isInteger(n) || n < 1 || n > 28) {
      throw new Error('Pay month day must be an integer 1–28.')
    }
    payMonthDay = n
  }

  if (payInterval === 'WEEKLY' && payWeekday === null) {
    throw new Error('Pay weekday is required for weekly pay.')
  }
  if (payInterval === 'BIWEEKLY') {
    if (payWeekday === null) {
      throw new Error('Pay weekday is required for biweekly pay.')
    }
    if (!payAnchorDate) {
      throw new Error('Pay anchor date is required for biweekly pay.')
    }
  }
  if (payInterval === 'MONTHLY' && payMonthDay === null) {
    throw new Error('Pay month day is required for monthly pay.')
  }

  return {
    payInterval,
    payWeekday:
      payInterval === 'WEEKLY' || payInterval === 'BIWEEKLY' ? payWeekday : null,
    payAnchorDate: payInterval === 'BIWEEKLY' ? payAnchorDate : null,
    payMonthDay: payInterval === 'MONTHLY' ? payMonthDay : null,
  }
}

function parseRequiredDate(value: unknown, label: string): Date {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`)
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${label} is invalid.`)
  }
  return d
}

function parseDateOnly(value: unknown, label: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new Error(`${label} must be YYYY-MM-DD.`)
  }
  const [y, m, d] = value.trim().split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

function parseTime(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required.`)
  }
  parseHhMm(value)
  return value.trim()
}

function parseDaysOfWeek(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('At least one day of week is required.')
  }
  const days = value.map((d) => {
    const n = typeof d === 'number' ? d : Number(d)
    if (!Number.isInteger(n) || n < 0 || n > 6) {
      throw new Error('Days of week must be integers 0–6.')
    }
    return n
  })
  return [...new Set(days)].sort((a, b) => a - b)
}

function ownOrGlobal(userId: string) {
  return { OR: [{ userId }, { isGlobal: true }] }
}

function toDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export type CareRequiredShiftDto = {
  id: string
  label: string | null
  startTime: string
  endTime: string
  sortOrder: number
}

export type CareSettingsDto = {
  id: string
  lovedOneName: string
  coverageNeed: CareCoverageNeed
  coverageWindowKind: CareCoverageWindowKind
  partialDaysOfWeek: number[]
  shifts: CareRequiredShiftDto[]
}

export type CareCoverageSeriesDto = {
  id: string
  assigneeId: string | null
  assigneeName: string | null
  startsOn: string
  endsOn: string | null
  startTime: string
  endTime: string
  frequency: CareCoverageFrequency
  daysOfWeek: number[]
  notes: string | null
  isRequired: boolean
  occurrenceCount: number
}

export type CarePersonTypeDto = {
  id: string
  name: string
  isPaid: boolean
  defaultHourlyRate: string | null
}

export type CarePersonDto = {
  id: string
  name: string
  userId: string | null
  typeId: string
  typeName: string
  isPaid: boolean
  hourlyRate: string | null
  effectiveHourlyRate: string | null
  payInterval: CarePayInterval
  payWeekday: number | null
  payAnchorDate: string | null
  payMonthDay: number | null
  isActive: boolean
  bgColor: string | null
  textColor: string | null
  userEmail: string | null
  userName: string | null
}

export type CareCoverageOccurrenceDto = {
  id: string
  seriesId: string | null
  assigneeId: string | null
  assigneeName: string | null
  assigneeBgColor: string | null
  assigneeTextColor: string | null
  startsAt: string
  endsAt: string
  status: CareOccurrenceStatus
  billingStatus: CareBillingStatus
  notes: string | null
  hasInvoice: boolean
}

export type CareEventTypeDto = {
  id: string
  name: string
  bgColor: string
  textColor: string
  sortOrder: number
}

export type CareCalendarEventDto = {
  id: string
  typeId: string
  typeName: string
  bgColor: string
  textColor: string
  title: string
  startsAt: string
  endsAt: string
  notes: string | null
}

export type CareSwapRequestDto = {
  id: string
  status: CareSwapStatus
  notes: string | null
  createdAt: string
  reviewedAt: string | null
  relinquishOccurrenceId: string
  claimOccurrenceId: string
  claimForPersonId: string
  claimForPersonName: string
  relinquishStartsAt: string
  relinquishEndsAt: string
  claimStartsAt: string
  claimEndsAt: string
  requestedByUserId: string
  requestedByName: string | null
  reviewedByUserId: string | null
  reviewedByName: string | null
}

export type CareInvoiceLineDto = {
  id: string
  occurrenceId: string
  amount: string
  hourlyRateSnapshot: string
  hoursSnapshot: string
  startsAt: string
  endsAt: string
}

export type CareInvoiceDto = {
  id: string
  carePersonId: string
  carePersonName: string
  amount: string
  status: CareInvoiceStatus
  periodStart: string | null
  periodEnd: string | null
  financialAccountId: string | null
  settledTransactionId: string | null
  createdAt: string
  lines: CareInvoiceLineDto[]
}

export type AppUserOption = {
  id: string
  name: string | null
  email: string | null
}

function toPersonDto(person: {
  id: string
  name: string
  userId: string | null
  typeId: string
  hourlyRate: { toString(): string } | null
  payInterval: CarePayInterval
  payWeekday: number | null
  payAnchorDate: Date | null
  payMonthDay: number | null
  isActive: boolean
  bgColor: string | null
  textColor: string | null
  type: {
    name: string
    isPaid: boolean
    defaultHourlyRate: { toString(): string } | null
  }
  user: { name: string | null; email: string | null } | null
}): CarePersonDto {
  const rate = effectiveHourlyRate({
    personHourlyRate: decimalToString(person.hourlyRate),
    typeDefaultHourlyRate: decimalToString(person.type.defaultHourlyRate),
    typeIsPaid: person.type.isPaid,
  })
  return {
    id: person.id,
    name: person.name,
    userId: person.userId,
    typeId: person.typeId,
    typeName: person.type.name,
    isPaid: person.type.isPaid,
    hourlyRate: decimalToString(person.hourlyRate),
    effectiveHourlyRate: rate !== null ? rate.toFixed(4) : null,
    payInterval: person.payInterval,
    payWeekday: person.payWeekday,
    payAnchorDate: person.payAnchorDate
      ? person.payAnchorDate.toISOString().slice(0, 10)
      : null,
    payMonthDay: person.payMonthDay,
    isActive: person.isActive,
    bgColor: person.bgColor,
    textColor: person.textColor,
    userEmail: person.user?.email ?? null,
    userName: person.user?.name ?? null,
  }
}

function toOccurrenceDto(row: {
  id: string
  seriesId: string | null
  assigneeId: string | null
  startsAt: Date
  endsAt: Date
  status: CareOccurrenceStatus
  billingStatus: CareBillingStatus
  notes: string | null
  assignee: {
    name: string
    bgColor: string | null
    textColor: string | null
  } | null
  invoiceLine: { id: string } | null
}): CareCoverageOccurrenceDto {
  return {
    id: row.id,
    seriesId: row.seriesId,
    assigneeId: row.assigneeId,
    assigneeName: row.assignee?.name ?? null,
    assigneeBgColor: row.assignee?.bgColor ?? null,
    assigneeTextColor: row.assignee?.textColor ?? null,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    billingStatus: row.billingStatus,
    notes: row.notes,
    hasInvoice: Boolean(row.invoiceLine) || row.billingStatus === 'INVOICED',
  }
}

function toInvoiceDto(row: {
  id: string
  carePersonId: string
  amount: { toString(): string }
  status: CareInvoiceStatus
  periodStart: Date | null
  periodEnd: Date | null
  financialAccountId: string | null
  settledTransactionId: string | null
  createdAt: Date
  carePerson: { name: string }
  lines: Array<{
    id: string
    occurrenceId: string
    amount: { toString(): string }
    hourlyRateSnapshot: { toString(): string }
    hoursSnapshot: { toString(): string }
    occurrence: { startsAt: Date; endsAt: Date }
  }>
}): CareInvoiceDto {
  return {
    id: row.id,
    carePersonId: row.carePersonId,
    carePersonName: row.carePerson.name,
    amount: row.amount.toString(),
    status: row.status,
    periodStart: row.periodStart?.toISOString() ?? null,
    periodEnd: row.periodEnd?.toISOString() ?? null,
    financialAccountId: row.financialAccountId,
    settledTransactionId: row.settledTransactionId,
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      occurrenceId: line.occurrenceId,
      amount: line.amount.toString(),
      hourlyRateSnapshot: line.hourlyRateSnapshot.toString(),
      hoursSnapshot: line.hoursSnapshot.toString(),
      startsAt: line.occurrence.startsAt.toISOString(),
      endsAt: line.occurrence.endsAt.toISOString(),
    })),
  }
}

const invoiceInclude = {
  carePerson: { select: { name: true } },
  lines: {
    include: {
      occurrence: { select: { startsAt: true, endsAt: true } },
    },
    orderBy: { occurrence: { startsAt: 'asc' as const } },
  },
} as const

const occurrenceInclude = {
  assignee: {
    select: { name: true, bgColor: true, textColor: true },
  },
  invoiceLine: { select: { id: true } },
} as const

function optionalColor(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const DEFAULT_EVENT_TYPES = [
  { name: 'Appointment', bgColor: '#f59e0b', textColor: '#ffffff', sortOrder: 0 },
  { name: 'Family', bgColor: '#8b5cf6', textColor: '#ffffff', sortOrder: 1 },
  { name: 'Other', bgColor: '#64748b', textColor: '#ffffff', sortOrder: 2 },
] as const

async function ensureDefaultTypes() {
  await prisma.carePersonType.upsert({
    where: { name: 'Family' },
    create: { name: 'Family', isPaid: false },
    update: {},
  })
  await prisma.carePersonType.upsert({
    where: { name: 'Employee' },
    create: {
      name: 'Employee',
      isPaid: true,
      defaultHourlyRate: 25,
    },
    update: {},
  })
  for (const type of DEFAULT_EVENT_TYPES) {
    await prisma.careEventType.upsert({
      where: { name: type.name },
      create: type,
      update: {},
    })
  }
  await prisma.careSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', lovedOneName: '' },
    update: {},
  })
}

function toEventTypeDto(row: {
  id: string
  name: string
  bgColor: string
  textColor: string
  sortOrder: number
}): CareEventTypeDto {
  return {
    id: row.id,
    name: row.name,
    bgColor: row.bgColor,
    textColor: row.textColor,
    sortOrder: row.sortOrder,
  }
}

function toEventDto(row: {
  id: string
  typeId: string
  title: string
  startsAt: Date
  endsAt: Date
  notes: string | null
  type: { name: string; bgColor: string; textColor: string }
}): CareCalendarEventDto {
  return {
    id: row.id,
    typeId: row.typeId,
    typeName: row.type.name,
    bgColor: row.type.bgColor,
    textColor: row.type.textColor,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    notes: row.notes,
  }
}

function optionalColorRequired(value: unknown, label: string): string {
  return requireHexColor(value, label)
}

async function billingStatusForAssigneeId(
  assigneeId: string | null,
): Promise<CareBillingStatus> {
  if (!assigneeId) return 'NOT_BILLABLE'
  const person = await prisma.carePerson.findUnique({
    where: { id: assigneeId },
    include: { type: true },
  })
  if (!person) return 'NOT_BILLABLE'
  const rate = effectiveHourlyRate({
    personHourlyRate: decimalToString(person.hourlyRate),
    typeDefaultHourlyRate: decimalToString(person.type.defaultHourlyRate),
    typeIsPaid: person.type.isPaid,
  })
  return rate !== null ? 'ACCRUED' : 'NOT_BILLABLE'
}

type DbClient = PrismaClient

async function removeOccurrenceFromOpenInvoice(
  occurrenceId: string,
  db: DbClient = prisma,
) {
  const line = await db.careInvoiceLine.findUnique({
    where: { occurrenceId },
    include: { invoice: true },
  })
  if (!line) return
  if (line.invoice.status === 'PAID') {
    throw new Error(
      'This coverage is on a paid invoice and cannot be reassigned. Void the invoice first.',
    )
  }
  if (line.invoice.status === 'VOID') {
    await db.careInvoiceLine.delete({ where: { id: line.id } })
    return
  }

  await db.careInvoiceLine.delete({ where: { id: line.id } })
  const remaining = await db.careInvoiceLine.findMany({
    where: { invoiceId: line.invoiceId },
  })
  if (remaining.length === 0) {
    await db.careInvoice.update({
      where: { id: line.invoiceId },
      data: { status: 'VOID', amount: 0 },
    })
  } else {
    const amount = remaining.reduce(
      (sum, row) => sum + Number(row.amount.toString()),
      0,
    )
    await db.careInvoice.update({
      where: { id: line.invoiceId },
      data: { amount },
    })
  }
}

/**
 * Sync billing status after assigneeId was already written.
 * Removes the occurrence from an OPEN invoice when reassigned/cleared.
 * Blocks changes when the occurrence is on a PAID invoice.
 */
async function syncBillingForAssignee(
  occurrenceId: string,
  nextAssigneeId: string | null,
) {
  const existing = await prisma.careCoverageOccurrence.findUniqueOrThrow({
    where: { id: occurrenceId },
    include: { invoiceLine: { include: { invoice: true } } },
  })

  if (existing.invoiceLine) {
    const status = existing.invoiceLine.invoice.status
    if (status === 'PAID') {
      throw new Error(
        'This coverage is on a paid invoice and cannot be reassigned. Void the invoice first.',
      )
    }
    if (status === 'OPEN') {
      await removeOccurrenceFromOpenInvoice(occurrenceId)
    } else {
      await prisma.careInvoiceLine.delete({
        where: { id: existing.invoiceLine.id },
      })
    }
  }

  const billingStatus = await billingStatusForAssigneeId(nextAssigneeId)
  await prisma.careCoverageOccurrence.update({
    where: { id: occurrenceId },
    data: { billingStatus },
  })
}

async function materializeSeriesInRange(rangeStart: Date, rangeEnd: Date) {
  const seriesList = await prisma.careCoverageSeries.findMany()
  for (const series of seriesList) {
    const slots = expandSeriesOccurrences(
      {
        startsOn: series.startsOn,
        endsOn: series.endsOn,
        startTime: series.startTime,
        endTime: series.endTime,
        frequency: series.frequency,
        daysOfWeek: series.daysOfWeek,
      },
      rangeStart,
      rangeEnd,
    )
    if (slots.length === 0) continue
    const billingStatus = await billingStatusForAssigneeId(series.assigneeId)
    await prisma.careCoverageOccurrence.createMany({
      data: slots.map((slot) => ({
        seriesId: series.id,
        assigneeId: series.assigneeId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: 'SCHEDULED' as const,
        billingStatus,
        notes: series.notes,
      })),
      skipDuplicates: true,
    })
  }
}

async function completeDueShifts(now = new Date()) {
  const due = await prisma.careCoverageOccurrence.findMany({
    where: {
      status: 'SCHEDULED',
      endsAt: { lte: now },
      assigneeId: { not: null },
    },
  })

  for (const occ of due) {
    await prisma.careCoverageOccurrence.update({
      where: { id: occ.id },
      data: { status: 'COMPLETED' },
    })
    await logActivity({
      actorUserId: null,
      action: 'UPDATE',
      entityType: ACTIVITY_ENTITY_TYPES.coverage_occurrence,
      entityId: occ.id,
      summary: `System completed shift ${toDayKey(occ.startsAt)}`,
      changes: diffChanges(occ, { ...occ, status: 'COMPLETED' }, ['status']),
      linkMeta: { day: toDayKey(occ.startsAt), tab: 'calendar' },
      visibilityUserId: null,
    })
  }
}

async function createInvoiceForOccurrences(input: {
  carePersonId: string
  carePersonName: string
  occurrences: Array<{
    id: string
    startsAt: Date
    endsAt: Date
    hourlyRate: number
  }>
  periodStart: Date | null
  periodEnd: Date | null
}) {
  if (input.occurrences.length === 0) return

  const lines = input.occurrences.map((occ) => {
    const hours = hoursBetween(occ.startsAt, occ.endsAt)
    const computed = computeInvoiceAmount(occ.hourlyRate, hours)
    return {
      occurrenceId: occ.id,
      amount: computed.amount,
      hourlyRateSnapshot: computed.hourlyRate,
      hoursSnapshot: computed.hours,
    }
  })
  const amount = lines.reduce((sum, line) => sum + line.amount, 0)

  const invoice = await prisma.careInvoice.create({
    data: {
      carePersonId: input.carePersonId,
      amount,
      status: 'OPEN',
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      lines: {
        create: lines,
      },
    },
  })

  await prisma.careCoverageOccurrence.updateMany({
    where: { id: { in: input.occurrences.map((o) => o.id) } },
    data: { billingStatus: 'INVOICED' },
  })

  await logActivity({
    actorUserId: null,
    action: 'CREATE',
    entityType: ACTIVITY_ENTITY_TYPES.invoice,
    entityId: invoice.id,
    summary: `System created invoice for ${input.carePersonName}`,
    changes: createChanges(invoice, [
      'carePersonId',
      'amount',
      'status',
      'periodStart',
      'periodEnd',
    ]),
    linkMeta: {
      day: toDayKey(input.periodEnd ?? input.occurrences[0]!.startsAt),
      tab: 'calendar',
    },
    visibilityUserId: null,
  })
}

async function createPayPeriodInvoices(now = new Date()) {
  // Repair: assigned paid shifts left as NOT_BILLABLE (e.g. pre-migration rows)
  const stranded = await prisma.careCoverageOccurrence.findMany({
    where: {
      assigneeId: { not: null },
      billingStatus: 'NOT_BILLABLE',
      invoiceLine: null,
    },
    include: {
      assignee: { include: { type: true } },
    },
  })
  for (const occ of stranded) {
    if (!occ.assignee) continue
    const rate = effectiveHourlyRate({
      personHourlyRate: decimalToString(occ.assignee.hourlyRate),
      typeDefaultHourlyRate: decimalToString(
        occ.assignee.type.defaultHourlyRate,
      ),
      typeIsPaid: occ.assignee.type.isPaid,
    })
    if (rate === null) continue
    await prisma.careCoverageOccurrence.update({
      where: { id: occ.id },
      data: { billingStatus: 'ACCRUED' },
    })
  }

  const people = await prisma.carePerson.findMany({
    include: { type: true },
  })

  for (const person of people) {
    const rate = effectiveHourlyRate({
      personHourlyRate: decimalToString(person.hourlyRate),
      typeDefaultHourlyRate: decimalToString(person.type.defaultHourlyRate),
      typeIsPaid: person.type.isPaid,
    })
    if (rate === null) continue

    const cutoff = lastClosedPayPeriodEnd(
      {
        payInterval: person.payInterval,
        payWeekday: person.payWeekday,
        payAnchorDate: person.payAnchorDate,
        payMonthDay: person.payMonthDay,
      },
      now,
    )
    if (!cutoff) continue

    const accrued = await prisma.careCoverageOccurrence.findMany({
      where: {
        assigneeId: person.id,
        billingStatus: 'ACCRUED',
        endsAt: { lte: cutoff },
      },
      orderBy: { startsAt: 'asc' },
    })
    if (accrued.length === 0) continue

    if (person.payInterval === 'PER_SHIFT') {
      for (const occ of accrued) {
        await createInvoiceForOccurrences({
          carePersonId: person.id,
          carePersonName: person.name,
          occurrences: [
            {
              id: occ.id,
              startsAt: occ.startsAt,
              endsAt: occ.endsAt,
              hourlyRate: rate,
            },
          ],
          periodStart: occ.startsAt,
          periodEnd: occ.endsAt,
        })
      }
      continue
    }

    const periodStart = payPeriodStart(
      {
        payInterval: person.payInterval,
        payWeekday: person.payWeekday,
        payAnchorDate: person.payAnchorDate,
        payMonthDay: person.payMonthDay,
      },
      cutoff,
    )

    await createInvoiceForOccurrences({
      carePersonId: person.id,
      carePersonName: person.name,
      occurrences: accrued.map((occ) => ({
        id: occ.id,
        startsAt: occ.startsAt,
        endsAt: occ.endsAt,
        hourlyRate: rate,
      })),
      periodStart,
      periodEnd: cutoff,
    })
  }
}

const DUE_SHIFTS_TTL_MS = 30_000

let dueShiftsInFlight: Promise<void> | null = null
let dueShiftsCompletedAt = 0

/**
 * Share one completeDueShifts + pay-period run across concurrent loaders.
 * Skips when a run finished within the TTL window.
 */
async function ensureDueShiftsCompleted() {
  const now = Date.now()
  if (now - dueShiftsCompletedAt < DUE_SHIFTS_TTL_MS) {
    return
  }

  if (dueShiftsInFlight) {
    await dueShiftsInFlight
    if (Date.now() - dueShiftsCompletedAt < DUE_SHIFTS_TTL_MS) {
      return
    }
  }

  const run = (async () => {
    await completeDueShifts()
    await createPayPeriodInvoices()
    dueShiftsCompletedAt = Date.now()
  })()

  dueShiftsInFlight = run
  try {
    await run
  } finally {
    if (dueShiftsInFlight === run) {
      dueShiftsInFlight = null
    }
  }
}

async function occurrencesOverlap(
  personId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
) {
  const conflict = await prisma.careCoverageOccurrence.findFirst({
    where: {
      assigneeId: personId,
      status: { not: 'CANCELLED' },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  })
  return Boolean(conflict)
}

function startOfLocalToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function toSettingsDto(settings: {
  id: string
  lovedOneName: string
  coverageNeed: CareCoverageNeed
  coverageWindowKind: CareCoverageWindowKind
  partialDaysOfWeek: number[]
  shifts: Array<{
    id: string
    label: string | null
    startTime: string
    endTime: string
    sortOrder: number
  }>
}): CareSettingsDto {
  return {
    id: settings.id,
    lovedOneName: settings.lovedOneName,
    coverageNeed: settings.coverageNeed,
    coverageWindowKind: settings.coverageWindowKind,
    partialDaysOfWeek: settings.partialDaysOfWeek,
    shifts: settings.shifts.map((s) => ({
      id: s.id,
      label: s.label,
      startTime: s.startTime,
      endTime: s.endTime,
      sortOrder: s.sortOrder,
    })),
  }
}

async function loadCareSettingsDto(): Promise<CareSettingsDto> {
  const settings = await prisma.careSettings.findUniqueOrThrow({
    where: { id: 'default' },
    include: { shifts: { orderBy: { sortOrder: 'asc' } } },
  })
  return toSettingsDto(settings)
}

async function detachProtectedOccurrences(seriesId: string) {
  const protectedRows = await prisma.careCoverageOccurrence.findMany({
    where: {
      seriesId,
      OR: [
        { assigneeId: { not: null } },
        { status: { not: 'SCHEDULED' } },
        { invoiceLine: { isNot: null } },
        { swapRelinquish: { some: { status: 'PENDING' } } },
        { swapClaim: { some: { status: 'PENDING' } } },
        { startsAt: { lt: startOfLocalToday() } },
      ],
    },
    select: { id: true },
  })
  if (protectedRows.length > 0) {
    await prisma.careCoverageOccurrence.updateMany({
      where: { id: { in: protectedRows.map((r) => r.id) } },
      data: { seriesId: null },
    })
  }
}

async function deleteRequiredSeries(seriesId: string) {
  await detachProtectedOccurrences(seriesId)
  await prisma.careCoverageOccurrence.deleteMany({
    where: {
      seriesId,
      assigneeId: null,
      status: 'SCHEDULED',
    },
  })
  await prisma.careCoverageOccurrence.updateMany({
    where: { seriesId },
    data: { seriesId: null },
  })
  await prisma.careCoverageSeries.delete({ where: { id: seriesId } })
}

async function deleteOpenFutureForSeries(seriesId: string) {
  await prisma.careCoverageOccurrence.deleteMany({
    where: {
      seriesId,
      assigneeId: null,
      status: 'SCHEDULED',
      startsAt: { gte: startOfLocalToday() },
      invoiceLine: null,
      swapRelinquish: { none: { status: 'PENDING' } },
      swapClaim: { none: { status: 'PENDING' } },
    },
  })
}

/**
 * Delete a user-created recurring series, removing only its future,
 * not-yet-completed occurrences (open or assigned). Past occurrences and any
 * completed/cancelled/invoiced/pending-swap ones are preserved as standalone
 * occurrences (seriesId detached) since we cannot rewrite history.
 */
async function deleteManualCoverageSeries(seriesId: string) {
  await prisma.careCoverageOccurrence.deleteMany({
    where: {
      seriesId,
      status: 'SCHEDULED',
      startsAt: { gte: startOfLocalToday() },
      invoiceLine: null,
      swapRelinquish: { none: { status: 'PENDING' } },
      swapClaim: { none: { status: 'PENDING' } },
    },
  })
  await prisma.careCoverageOccurrence.updateMany({
    where: { seriesId },
    data: { seriesId: null },
  })
  await prisma.careCoverageSeries.delete({ where: { id: seriesId } })
}

async function syncRequiredCoverageSeries() {
  const settings = await prisma.careSettings.findUniqueOrThrow({
    where: { id: 'default' },
    include: { shifts: { orderBy: { sortOrder: 'asc' } } },
  })

  const { daysOfWeek, windows } = buildRequiredCoverageWindows({
    coverageNeed: settings.coverageNeed,
    coverageWindowKind: settings.coverageWindowKind,
    partialDaysOfWeek: settings.partialDaysOfWeek,
    shifts: settings.shifts.map((s) => ({
      label: s.label,
      startTime: s.startTime,
      endTime: s.endTime,
      sortOrder: s.sortOrder,
    })),
  })

  const desiredKeys = new Set(windows.map((w) => w.requiredKey))
  const existing = await prisma.careCoverageSeries.findMany({
    where: { isRequired: true },
  })

  for (const series of existing) {
    if (!series.requiredKey || !desiredKeys.has(series.requiredKey)) {
      await deleteRequiredSeries(series.id)
    }
  }

  const startsOn = startOfLocalToday()
  const remaining = await prisma.careCoverageSeries.findMany({
    where: { isRequired: true },
  })

  for (const window of windows) {
    const current = remaining.find((s) => s.requiredKey === window.requiredKey)
    if (current) {
      const currentDays = [...current.daysOfWeek].sort((a, b) => a - b)
      const daysChanged =
        currentDays.length !== daysOfWeek.length ||
        currentDays.some((d, i) => d !== daysOfWeek[i])
      const timesChanged =
        current.startTime !== window.startTime ||
        current.endTime !== window.endTime
      await prisma.careCoverageSeries.update({
        where: { id: current.id },
        data: {
          assigneeId: null,
          endsOn: null,
          startTime: window.startTime,
          endTime: window.endTime,
          frequency: 'WEEKLY',
          daysOfWeek,
          notes: window.notes,
          isRequired: true,
          requiredKey: window.requiredKey,
        },
      })
      if (daysChanged || timesChanged) {
        await deleteOpenFutureForSeries(current.id)
      }
    } else {
      await prisma.careCoverageSeries.create({
        data: {
          assigneeId: null,
          startsOn,
          endsOn: null,
          startTime: window.startTime,
          endTime: window.endTime,
          frequency: 'WEEKLY',
          daysOfWeek,
          notes: window.notes,
          isRequired: true,
          requiredKey: window.requiredKey,
        },
      })
    }
  }

  const now = new Date()
  const rangeStart = new Date(now)
  rangeStart.setDate(rangeStart.getDate() - 7)
  const rangeEnd = new Date(now)
  rangeEnd.setDate(rangeEnd.getDate() + 90)
  await materializeSeriesInRange(rangeStart, rangeEnd)
}

// --- Settings ---

export const getCareSettings = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CareSettingsDto> => {
    await requireUserId()
    await ensureDefaultTypes()
    return loadCareSettingsDto()
  },
)

export const upsertCareSettings = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const lovedOneName =
      typeof input.lovedOneName === 'string' ? input.lovedOneName.trim() : ''

    const coverageNeed = input.coverageNeed
    if (
      typeof coverageNeed !== 'string' ||
      !COVERAGE_NEEDS.includes(coverageNeed as CareCoverageNeed)
    ) {
      throw new Error('Coverage need is invalid.')
    }

    const coverageWindowKind = input.coverageWindowKind
    if (
      typeof coverageWindowKind !== 'string' ||
      !COVERAGE_WINDOW_KINDS.includes(
        coverageWindowKind as CareCoverageWindowKind,
      )
    ) {
      throw new Error('Coverage window kind is invalid.')
    }

    let partialDaysOfWeek: number[] = []
    if (coverageNeed === 'PARTIAL') {
      partialDaysOfWeek = parseDaysOfWeek(input.partialDaysOfWeek)
    }

    const shifts: RequiredShiftInput[] = []
    if (coverageWindowKind === 'SHIFTS') {
      if (!Array.isArray(input.shifts) || input.shifts.length === 0) {
        throw new Error('Add at least one shift for shift-based coverage.')
      }
      input.shifts.forEach((raw, index) => {
        if (!raw || typeof raw !== 'object') {
          throw new Error('Shift is invalid.')
        }
        const shift = raw as Record<string, unknown>
        const label =
          typeof shift.label === 'string' && shift.label.trim()
            ? shift.label.trim()
            : null
        shifts.push({
          label,
          startTime: parseTime(shift.startTime, `Shift ${index + 1} start`),
          endTime: parseTime(shift.endTime, `Shift ${index + 1} end`),
          sortOrder: index,
        })
      })
    }

    return {
      lovedOneName,
      coverageNeed: coverageNeed as CareCoverageNeed,
      coverageWindowKind: coverageWindowKind as CareCoverageWindowKind,
      partialDaysOfWeek,
      shifts,
    }
  })
  .handler(async ({ data }): Promise<CareSettingsDto> => {
    const userId = await requireUserId()
    await ensureDefaultTypes()
    const before = await prisma.careSettings.findUnique({
      where: { id: 'default' },
      include: { shifts: { orderBy: { sortOrder: 'asc' } } },
    })

    await prisma.$transaction(async (tx) => {
      await tx.careSettings.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          lovedOneName: data.lovedOneName,
          coverageNeed: data.coverageNeed,
          coverageWindowKind: data.coverageWindowKind,
          partialDaysOfWeek: data.partialDaysOfWeek,
        },
        update: {
          lovedOneName: data.lovedOneName,
          coverageNeed: data.coverageNeed,
          coverageWindowKind: data.coverageWindowKind,
          partialDaysOfWeek: data.partialDaysOfWeek,
        },
      })
      await tx.careRequiredShift.deleteMany({ where: { settingsId: 'default' } })
      if (data.shifts.length > 0) {
        await tx.careRequiredShift.createMany({
          data: data.shifts.map((shift) => ({
            settingsId: 'default',
            label: shift.label,
            startTime: shift.startTime,
            endTime: shift.endTime,
            sortOrder: shift.sortOrder,
          })),
        })
      }
      const after = await tx.careSettings.findUniqueOrThrow({
        where: { id: 'default' },
        include: { shifts: { orderBy: { sortOrder: 'asc' } } },
      })
      const changes = diffChanges(
        before ? toSettingsDto(before) : null,
        toSettingsDto(after),
        [
          'lovedOneName',
          'coverageNeed',
          'coverageWindowKind',
          'partialDaysOfWeek',
          'shifts',
        ],
      )
      if (Object.keys(changes).length > 0) {
        await logActivity(
          {
            actorUserId: userId,
            action: 'UPDATE',
            entityType: ACTIVITY_ENTITY_TYPES.care_settings,
            entityId: 'default',
            summary: 'Updated loved one settings',
            changes,
            visibilityUserId: null,
          },
          tx,
        )
      }
    })

    await syncRequiredCoverageSeries()
    return loadCareSettingsDto()
  })

// --- People / types ---

export const listCarePersonTypes = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CarePersonTypeDto[]> => {
    await requireUserId()
    await ensureDefaultTypes()
    const rows = await prisma.carePersonType.findMany({
      orderBy: { name: 'asc' },
    })
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      isPaid: row.isPaid,
      defaultHourlyRate: decimalToString(row.defaultHourlyRate),
    }))
  },
)

export const createCarePersonType = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) throw new Error('Name is required.')
    return {
      name,
      isPaid: Boolean(input.isPaid),
      defaultHourlyRate: parseOptionalRate(input.defaultHourlyRate),
    }
  })
  .handler(async ({ data }): Promise<CarePersonTypeDto> => {
    const userId = await requireUserId()
    const created = await prisma.carePersonType.create({
      data: {
        name: data.name,
        isPaid: data.isPaid,
        defaultHourlyRate: data.defaultHourlyRate,
      },
    })
    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.care_person_type,
      entityId: created.id,
      summary: `Created care person type ${created.name}`,
      changes: createChanges(created, ['name', 'isPaid', 'defaultHourlyRate']),
      visibilityUserId: null,
    })
    return {
      id: created.id,
      name: created.name,
      isPaid: created.isPaid,
      defaultHourlyRate: decimalToString(created.defaultHourlyRate),
    }
  })

export const updateCarePersonType = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id : ''
    if (!id) throw new Error('Type id is required.')
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) throw new Error('Name is required.')
    return {
      id,
      name,
      isPaid: Boolean(input.isPaid),
      defaultHourlyRate: parseOptionalRate(input.defaultHourlyRate),
    }
  })
  .handler(async ({ data }): Promise<CarePersonTypeDto> => {
    const userId = await requireUserId()
    const before = await prisma.carePersonType.findUniqueOrThrow({
      where: { id: data.id },
    })
    const updated = await prisma.carePersonType.update({
      where: { id: data.id },
      data: {
        name: data.name,
        isPaid: data.isPaid,
        defaultHourlyRate: data.defaultHourlyRate,
      },
    })
    const changes = diffChanges(before, updated, [
      'name',
      'isPaid',
      'defaultHourlyRate',
    ])
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.care_person_type,
        entityId: updated.id,
        summary: `Updated care person type ${updated.name}`,
        changes,
        visibilityUserId: null,
      })
    }
    return {
      id: updated.id,
      name: updated.name,
      isPaid: updated.isPaid,
      defaultHourlyRate: decimalToString(updated.defaultHourlyRate),
    }
  })

// --- Event types ---

export const listCareEventTypes = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CareEventTypeDto[]> => {
    await requireUserId()
    await ensureDefaultTypes()
    const rows = await prisma.careEventType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return rows.map(toEventTypeDto)
  },
)

export const createCareEventType = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) throw new Error('Name is required.')
    return {
      name,
      bgColor: optionalColorRequired(input.bgColor, 'Background color'),
      textColor: optionalColorRequired(input.textColor, 'Text color'),
    }
  })
  .handler(async ({ data }): Promise<CareEventTypeDto> => {
    const userId = await requireUserId()
    await ensureDefaultTypes()
    const existing = await prisma.careEventType.findUnique({
      where: { name: data.name },
    })
    if (existing) throw new Error('An event type with that name already exists.')
    const max = await prisma.careEventType.aggregate({
      _max: { sortOrder: true },
    })
    const created = await prisma.careEventType.create({
      data: {
        name: data.name,
        bgColor: data.bgColor,
        textColor: data.textColor,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    })
    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.care_event_type,
      entityId: created.id,
      summary: `Created care event type ${created.name}`,
      changes: createChanges(created, [
        'name',
        'bgColor',
        'textColor',
        'sortOrder',
      ]),
      visibilityUserId: null,
    })
    return toEventTypeDto(created)
  })

export const updateCareEventType = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id : ''
    if (!id) throw new Error('Event type id is required.')
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) throw new Error('Name is required.')
    return {
      id,
      name,
      bgColor: optionalColorRequired(input.bgColor, 'Background color'),
      textColor: optionalColorRequired(input.textColor, 'Text color'),
    }
  })
  .handler(async ({ data }): Promise<CareEventTypeDto> => {
    const userId = await requireUserId()
    const clash = await prisma.careEventType.findFirst({
      where: { name: data.name, id: { not: data.id } },
      select: { id: true },
    })
    if (clash) throw new Error('An event type with that name already exists.')
    const before = await prisma.careEventType.findUniqueOrThrow({
      where: { id: data.id },
    })
    const updated = await prisma.careEventType.update({
      where: { id: data.id },
      data: {
        name: data.name,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
    })
    const changes = diffChanges(before, updated, ['name', 'bgColor', 'textColor'])
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.care_event_type,
        entityId: updated.id,
        summary: `Updated care event type ${updated.name}`,
        changes,
        visibilityUserId: null,
      })
    }
    return toEventTypeDto(updated)
  })

// --- People ---

export const listCarePeople = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CarePersonDto[]> => {
    await requireUserId()
    await ensureDefaultTypes()
    const people = await prisma.carePerson.findMany({
      include: {
        type: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { name: 'asc' },
    })
    return people.map(toPersonDto)
  },
)

export const listAppUsers = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AppUserOption[]> => {
    await requireUserId()
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    })
    return users
  },
)

export const createCarePerson = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) throw new Error('Name is required.')
    const typeId = typeof input.typeId === 'string' ? input.typeId : ''
    if (!typeId) throw new Error('Person type is required.')
    const userId =
      typeof input.userId === 'string' && input.userId.trim()
        ? input.userId.trim()
        : null
    return {
      name,
      typeId,
      userId,
      hourlyRate: parseOptionalRate(input.hourlyRate),
      bgColor: optionalColor(input.bgColor),
      textColor: optionalColor(input.textColor),
      isActive: input.isActive === undefined ? true : Boolean(input.isActive),
      payRaw: input,
    }
  })
  .handler(async ({ data }): Promise<CarePersonDto> => {
    const userId = await requireUserId()
    const type = await prisma.carePersonType.findUnique({
      where: { id: data.typeId },
    })
    if (!type) throw new Error('Person type not found.')
    if (data.userId) {
      const user = await prisma.user.findUnique({ where: { id: data.userId } })
      if (!user) throw new Error('Linked user not found.')
    }
    const pay = parsePaySchedule(data.payRaw, type.isPaid)
    const created = await prisma.carePerson.create({
      data: {
        name: data.name,
        typeId: data.typeId,
        userId: data.userId,
        hourlyRate: type.isPaid ? data.hourlyRate : null,
        payInterval: pay.payInterval,
        payWeekday: pay.payWeekday,
        payAnchorDate: pay.payAnchorDate,
        payMonthDay: pay.payMonthDay,
        bgColor: data.bgColor,
        textColor: data.textColor,
        isActive: data.isActive,
      },
      include: {
        type: true,
        user: { select: { name: true, email: true } },
      },
    })
    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.care_person,
      entityId: created.id,
      summary: `Created care person ${created.name}`,
      changes: createChanges(created, [
        'name',
        'typeId',
        'userId',
        'hourlyRate',
        'payInterval',
        'payWeekday',
        'payAnchorDate',
        'payMonthDay',
        'isActive',
        'bgColor',
        'textColor',
      ]),
      visibilityUserId: null,
    })
    return toPersonDto(created)
  })

export const updateCarePerson = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id : ''
    if (!id) throw new Error('Person id is required.')
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) throw new Error('Name is required.')
    const typeId = typeof input.typeId === 'string' ? input.typeId : ''
    if (!typeId) throw new Error('Person type is required.')
    const userId =
      typeof input.userId === 'string' && input.userId.trim()
        ? input.userId.trim()
        : null
    return {
      id,
      name,
      typeId,
      userId,
      hourlyRate: parseOptionalRate(input.hourlyRate),
      bgColor: optionalColor(input.bgColor),
      textColor: optionalColor(input.textColor),
      isActive: Boolean(input.isActive),
      payRaw: input,
    }
  })
  .handler(async ({ data }): Promise<CarePersonDto> => {
    const userId = await requireUserId()
    const type = await prisma.carePersonType.findUnique({
      where: { id: data.typeId },
    })
    if (!type) throw new Error('Person type not found.')
    const pay = parsePaySchedule(data.payRaw, type.isPaid)
    const before = await prisma.carePerson.findUniqueOrThrow({
      where: { id: data.id },
    })
    const updated = await prisma.carePerson.update({
      where: { id: data.id },
      data: {
        name: data.name,
        typeId: data.typeId,
        userId: data.userId,
        hourlyRate: type.isPaid ? data.hourlyRate : null,
        payInterval: pay.payInterval,
        payWeekday: pay.payWeekday,
        payAnchorDate: pay.payAnchorDate,
        payMonthDay: pay.payMonthDay,
        bgColor: data.bgColor,
        textColor: data.textColor,
        isActive: data.isActive,
      },
      include: {
        type: true,
        user: { select: { name: true, email: true } },
      },
    })
    const changes = diffChanges(before, updated, [
      'name',
      'typeId',
      'userId',
      'hourlyRate',
      'payInterval',
      'payWeekday',
      'payAnchorDate',
      'payMonthDay',
      'isActive',
      'bgColor',
      'textColor',
    ])
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.care_person,
        entityId: updated.id,
        summary: `Updated care person ${updated.name}`,
        changes,
        visibilityUserId: null,
      })
    }
    return toPersonDto(updated)
  })

// --- Calendar ---

export type CareCalendarPayload = {
  settings: CareSettingsDto
  occurrences: CareCoverageOccurrenceDto[]
  events: CareCalendarEventDto[]
  eventTypes: CareEventTypeDto[]
  pendingSwapCount: number
  openInvoiceCount: number
}

const CALENDAR_MAINTENANCE_TTL_MS = 30_000

type CalendarMaintenanceCache = {
  padStartMs: number
  padEndMs: number
  completedAt: number
}

let calendarMaintenanceInFlight: Promise<void> | null = null
let calendarMaintenanceCache: CalendarMaintenanceCache | null = null

/**
 * Serialize write-heavy calendar prep so concurrent GET/preload calls share one run.
 * Skips when the same (or wider) range finished within the TTL window.
 */
async function ensureCalendarMaintenance(padStart: Date, padEnd: Date) {
  const padStartMs = padStart.getTime()
  const padEndMs = padEnd.getTime()
  const now = Date.now()
  const cached = calendarMaintenanceCache
  if (
    cached &&
    now - cached.completedAt < CALENDAR_MAINTENANCE_TTL_MS &&
    cached.padStartMs <= padStartMs &&
    cached.padEndMs >= padEndMs
  ) {
    return
  }

  if (calendarMaintenanceInFlight) {
    await calendarMaintenanceInFlight
    const after = calendarMaintenanceCache
    if (
      after &&
      Date.now() - after.completedAt < CALENDAR_MAINTENANCE_TTL_MS &&
      after.padStartMs <= padStartMs &&
      after.padEndMs >= padEndMs
    ) {
      return
    }
  }

  const run = (async () => {
    await ensureDefaultTypes()
    await syncRequiredCoverageSeries()
    await materializeSeriesInRange(padStart, padEnd)
    await ensureDueShiftsCompleted()
    calendarMaintenanceCache = {
      padStartMs,
      padEndMs,
      completedAt: Date.now(),
    }
  })()

  calendarMaintenanceInFlight = run
  try {
    await run
  } finally {
    if (calendarMaintenanceInFlight === run) {
      calendarMaintenanceInFlight = null
    }
  }
}

export const listCareCalendar = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    return {
      rangeStart: parseRequiredDate(input.rangeStart, 'rangeStart'),
      rangeEnd: parseRequiredDate(input.rangeEnd, 'rangeEnd'),
    }
  })
  .handler(async ({ data }): Promise<CareCalendarPayload> => {
    await requireUserId()

    const padStart = new Date(data.rangeStart)
    padStart.setDate(padStart.getDate() - 7)
    const padEnd = new Date(data.rangeEnd)
    padEnd.setDate(padEnd.getDate() + 90)

    await ensureCalendarMaintenance(padStart, padEnd)

    const settings = await loadCareSettingsDto()

    const [occurrences, events, eventTypes, pendingSwapCount, openInvoiceCount] =
      await Promise.all([
        prisma.careCoverageOccurrence.findMany({
          where: {
            startsAt: { lte: data.rangeEnd },
            endsAt: { gte: data.rangeStart },
            status: { not: 'CANCELLED' },
          },
          include: {
            assignee: {
              select: { name: true, bgColor: true, textColor: true },
            },
            invoiceLine: { select: { id: true } },
          },
          orderBy: { startsAt: 'asc' },
        }),
        prisma.careCalendarEvent.findMany({
          where: {
            startsAt: { lte: data.rangeEnd },
            endsAt: { gte: data.rangeStart },
          },
          include: {
            type: { select: { name: true, bgColor: true, textColor: true } },
          },
          orderBy: { startsAt: 'asc' },
        }),
        prisma.careEventType.findMany({
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        }),
        prisma.careSwapRequest.count({ where: { status: 'PENDING' } }),
        prisma.careInvoice.count({ where: { status: 'OPEN' } }),
      ])

    return {
      settings,
      occurrences: occurrences.map(toOccurrenceDto),
      events: events.map(toEventDto),
      eventTypes: eventTypes.map(toEventTypeDto),
      pendingSwapCount,
      openInvoiceCount,
    }
  })

export const createCoverageSeries = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const frequency = input.frequency
    if (
      typeof frequency !== 'string' ||
      !FREQUENCIES.includes(frequency as CareCoverageFrequency)
    ) {
      throw new Error('Frequency is invalid.')
    }
    const assigneeId =
      typeof input.assigneeId === 'string' && input.assigneeId.trim()
        ? input.assigneeId.trim()
        : null
    const notes =
      typeof input.notes === 'string' && input.notes.trim()
        ? input.notes.trim()
        : null
    const endsOnRaw =
      typeof input.endsOn === 'string' && input.endsOn.trim()
        ? input.endsOn.trim()
        : null
    return {
      assigneeId,
      startsOn: parseDateOnly(input.startsOn, 'startsOn'),
      endsOn: endsOnRaw ? parseDateOnly(endsOnRaw, 'endsOn') : null,
      startTime: parseTime(input.startTime, 'startTime'),
      endTime: parseTime(input.endTime, 'endTime'),
      frequency: frequency as CareCoverageFrequency,
      daysOfWeek: parseDaysOfWeek(input.daysOfWeek),
      notes,
    }
  })
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    if (data.assigneeId) {
      const person = await prisma.carePerson.findUnique({
        where: { id: data.assigneeId },
      })
      if (!person || !person.isActive) {
        throw new Error('Assignee not found or inactive.')
      }
    }
    const created = await prisma.careCoverageSeries.create({
      data: {
        assigneeId: data.assigneeId,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        startTime: data.startTime,
        endTime: data.endTime,
        frequency: data.frequency,
        daysOfWeek: data.daysOfWeek,
        notes: data.notes,
      },
    })
    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.coverage_series,
      entityId: created.id,
      summary: 'Created coverage series',
      changes: createChanges(created, [
        'assigneeId',
        'startsOn',
        'endsOn',
        'startTime',
        'endTime',
        'frequency',
        'daysOfWeek',
        'notes',
      ]),
      linkMeta: { day: toDayKey(created.startsOn), tab: 'calendar' },
      visibilityUserId: null,
    })

    const now = new Date()
    const rangeStart = new Date(now)
    rangeStart.setDate(rangeStart.getDate() - 7)
    const rangeEnd = new Date(now)
    rangeEnd.setDate(rangeEnd.getDate() + 90)
    await materializeSeriesInRange(rangeStart, rangeEnd)

    return { id: created.id }
  })

export const createCoverageOccurrence = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const assigneeId =
      typeof input.assigneeId === 'string' && input.assigneeId.trim()
        ? input.assigneeId.trim()
        : null
    const notes =
      typeof input.notes === 'string' && input.notes.trim()
        ? input.notes.trim()
        : null
    const startsAt = parseRequiredDate(input.startsAt, 'startsAt')
    let endsAt = parseRequiredDate(input.endsAt, 'endsAt')
    if (endsAt.getTime() <= startsAt.getTime()) {
      endsAt = new Date(endsAt.getTime() + 86_400_000)
    }
    return { assigneeId, startsAt, endsAt, notes }
  })
  .handler(async ({ data }): Promise<CareCoverageOccurrenceDto> => {
    const userId = await requireUserId()
    if (data.assigneeId) {
      const person = await prisma.carePerson.findUnique({
        where: { id: data.assigneeId },
      })
      if (!person || !person.isActive) {
        throw new Error('Assignee not found or inactive.')
      }
      if (
        await occurrencesOverlap(data.assigneeId, data.startsAt, data.endsAt)
      ) {
        throw new Error('Assignee already has overlapping coverage.')
      }
    }
    const billingStatus = await billingStatusForAssigneeId(data.assigneeId)
    const created = await prisma.careCoverageOccurrence.create({
      data: {
        assigneeId: data.assigneeId,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        notes: data.notes,
        status: 'SCHEDULED',
        billingStatus,
      },
      include: occurrenceInclude,
    })
    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.coverage_occurrence,
      entityId: created.id,
      summary: `Created coverage on ${toDayKey(created.startsAt)}`,
      changes: createChanges(created, [
        'assigneeId',
        'startsAt',
        'endsAt',
        'status',
        'notes',
        'billingStatus',
      ]),
      linkMeta: { day: toDayKey(created.startsAt), tab: 'calendar' },
      visibilityUserId: null,
    })
    return toOccurrenceDto(created)
  })

export const updateOccurrence = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id : ''
    if (!id) throw new Error('Occurrence id is required.')
    const assigneeId =
      input.assigneeId === null
        ? null
        : typeof input.assigneeId === 'string' && input.assigneeId.trim()
          ? input.assigneeId.trim()
          : undefined
    const status =
      typeof input.status === 'string' &&
      Object.values(CareOccurrenceStatusEnum).includes(
        input.status as CareOccurrenceStatus,
      )
        ? (input.status as CareOccurrenceStatus)
        : undefined
    const notes =
      typeof input.notes === 'string' ? input.notes.trim() || null : undefined
    return { id, assigneeId, status, notes }
  })
  .handler(async ({ data }): Promise<CareCoverageOccurrenceDto> => {
    const userId = await requireUserId()
    const existing = await prisma.careCoverageOccurrence.findUnique({
      where: { id: data.id },
      include: { invoiceLine: { include: { invoice: true } } },
    })
    if (!existing) throw new Error('Occurrence not found.')

    const nextAssignee =
      data.assigneeId === undefined ? existing.assigneeId : data.assigneeId
    if (
      data.assigneeId !== undefined &&
      data.assigneeId !== existing.assigneeId
    ) {
      if (existing.invoiceLine?.invoice.status === 'PAID') {
        throw new Error(
          'This coverage is on a paid invoice and cannot be reassigned. Void the invoice first.',
        )
      }
    }
    if (nextAssignee) {
      if (
        await occurrencesOverlap(
          nextAssignee,
          existing.startsAt,
          existing.endsAt,
          existing.id,
        )
      ) {
        throw new Error('Assignee already has overlapping coverage.')
      }
    }

    await prisma.careCoverageOccurrence.update({
      where: { id: data.id },
      data: {
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    })
    if (
      data.assigneeId !== undefined &&
      data.assigneeId !== existing.assigneeId
    ) {
      await syncBillingForAssignee(data.id, data.assigneeId)
    }
    const refreshed = await prisma.careCoverageOccurrence.findUniqueOrThrow({
      where: { id: data.id },
      include: occurrenceInclude,
    })
    const changes = diffChanges(existing, refreshed, [
      'assigneeId',
      'status',
      'notes',
      'billingStatus',
    ])
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.coverage_occurrence,
        entityId: refreshed.id,
        summary: `Updated coverage on ${toDayKey(refreshed.startsAt)}`,
        changes,
        linkMeta: { day: toDayKey(refreshed.startsAt), tab: 'calendar' },
        visibilityUserId: null,
      })
    }
    return toOccurrenceDto(refreshed)
  })

export const claimOccurrences = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const assigneeId =
      typeof input.assigneeId === 'string' ? input.assigneeId.trim() : ''
    if (!assigneeId) throw new Error('Assignee is required.')
    if (!Array.isArray(input.occurrenceIds) || input.occurrenceIds.length === 0) {
      throw new Error('Select at least one open slot.')
    }
    const occurrenceIds = [
      ...new Set(
        input.occurrenceIds.map((id) => {
          if (typeof id !== 'string' || !id.trim()) {
            throw new Error('Occurrence id is invalid.')
          }
          return id.trim()
        }),
      ),
    ]
    return { assigneeId, occurrenceIds }
  })
  .handler(async ({ data }): Promise<CareCoverageOccurrenceDto[]> => {
    const userId = await requireUserId()
    const person = await prisma.carePerson.findUnique({
      where: { id: data.assigneeId },
    })
    if (!person || !person.isActive) {
      throw new Error('Assignee not found or inactive.')
    }

    const rows = await prisma.careCoverageOccurrence.findMany({
      where: { id: { in: data.occurrenceIds } },
    })
    if (rows.length !== data.occurrenceIds.length) {
      throw new Error('One or more slots were not found.')
    }
    for (const row of rows) {
      if (row.assigneeId || row.status !== 'SCHEDULED') {
        throw new Error('Only open scheduled slots can be claimed.')
      }
    }

    const sorted = [...rows].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    )
    for (const row of sorted) {
      if (
        await occurrencesOverlap(data.assigneeId, row.startsAt, row.endsAt)
      ) {
        throw new Error(
          'Assignee already has overlapping coverage for one of the selected slots.',
        )
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const row of sorted) {
        const updated = await tx.careCoverageOccurrence.update({
          where: { id: row.id },
          data: { assigneeId: data.assigneeId },
        })
        await logActivity(
          {
            actorUserId: userId,
            action: 'UPDATE',
            entityType: ACTIVITY_ENTITY_TYPES.coverage_occurrence,
            entityId: updated.id,
            summary: `Assigned coverage on ${toDayKey(updated.startsAt)}`,
            changes: diffChanges(row, updated, ['assigneeId']),
            linkMeta: { day: toDayKey(updated.startsAt), tab: 'calendar' },
            visibilityUserId: null,
          },
          tx,
        )
      }
    })

    for (const row of sorted) {
      await syncBillingForAssignee(row.id, data.assigneeId)
    }

    const updated = await prisma.careCoverageOccurrence.findMany({
      where: { id: { in: data.occurrenceIds } },
      include: occurrenceInclude,
      orderBy: { startsAt: 'asc' },
    })
    return updated.map(toOccurrenceDto)
  })

export const listCoverageSeries = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CareCoverageSeriesDto[]> => {
    await requireUserId()
    const rows = await prisma.careCoverageSeries.findMany({
      include: {
        assignee: { select: { name: true } },
        _count: { select: { occurrences: true } },
      },
      orderBy: [{ isRequired: 'desc' }, { startsOn: 'desc' }, { startTime: 'asc' }],
    })
    return rows.map((row) => ({
      id: row.id,
      assigneeId: row.assigneeId,
      assigneeName: row.assignee?.name ?? null,
      startsOn: row.startsOn.toISOString().slice(0, 10),
      endsOn: row.endsOn ? row.endsOn.toISOString().slice(0, 10) : null,
      startTime: row.startTime,
      endTime: row.endTime,
      frequency: row.frequency,
      daysOfWeek: row.daysOfWeek,
      notes: row.notes,
      isRequired: row.isRequired,
      occurrenceCount: row._count.occurrences,
    }))
  },
)

export const deleteCoverageSeries = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id.trim() : ''
    if (!id) throw new Error('Series id is required.')
    return { id }
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const userId = await requireUserId()
    const series = await prisma.careCoverageSeries.findUnique({
      where: { id: data.id },
    })
    if (!series) throw new Error('Series not found.')
    if (series.isRequired) {
      throw new Error(
        'Required coverage is managed in Loved one settings. Change the schedule there instead.',
      )
    }
    await deleteManualCoverageSeries(series.id)
    await logActivity({
      actorUserId: userId,
      action: 'DELETE',
      entityType: ACTIVITY_ENTITY_TYPES.coverage_series,
      entityId: series.id,
      summary: 'Deleted coverage series',
      changes: diffChanges(series, null, [
        'assigneeId',
        'startsOn',
        'endsOn',
        'startTime',
        'endTime',
        'frequency',
        'daysOfWeek',
        'notes',
      ]),
      linkMeta: { day: toDayKey(series.startsOn), tab: 'calendar' },
      visibilityUserId: null,
    })
    return { id: data.id }
  })

export const createCalendarEvent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const title = typeof input.title === 'string' ? input.title.trim() : ''
    if (!title) throw new Error('Title is required.')
    const typeId = typeof input.typeId === 'string' ? input.typeId.trim() : ''
    if (!typeId) throw new Error('Event type is required.')
    const startsAt = parseRequiredDate(input.startsAt, 'startsAt')
    const endsAt = parseRequiredDate(input.endsAt, 'endsAt')
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new Error('End must be after start.')
    }
    const notes =
      typeof input.notes === 'string' && input.notes.trim()
        ? input.notes.trim()
        : null
    return {
      title,
      typeId,
      startsAt,
      endsAt,
      notes,
    }
  })
  .handler(async ({ data }): Promise<CareCalendarEventDto> => {
    const userId = await requireUserId()
    const type = await prisma.careEventType.findUnique({
      where: { id: data.typeId },
    })
    if (!type) throw new Error('Event type not found.')
    const created = await prisma.careCalendarEvent.create({
      data: {
        title: data.title,
        typeId: data.typeId,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        notes: data.notes,
      },
      include: {
        type: { select: { name: true, bgColor: true, textColor: true } },
      },
    })
    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.calendar_event,
      entityId: created.id,
      summary: `Created calendar event ${created.title}`,
      changes: createChanges(created, [
        'title',
        'typeId',
        'startsAt',
        'endsAt',
        'notes',
      ]),
      linkMeta: { day: toDayKey(created.startsAt), tab: 'calendar' },
      visibilityUserId: null,
    })
    return toEventDto(created)
  })

export const updateCalendarEvent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id : ''
    if (!id) throw new Error('Event id is required.')
    const title = typeof input.title === 'string' ? input.title.trim() : ''
    if (!title) throw new Error('Title is required.')
    const typeId = typeof input.typeId === 'string' ? input.typeId.trim() : ''
    if (!typeId) throw new Error('Event type is required.')
    const startsAt = parseRequiredDate(input.startsAt, 'startsAt')
    const endsAt = parseRequiredDate(input.endsAt, 'endsAt')
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new Error('End must be after start.')
    }
    const notes =
      typeof input.notes === 'string' && input.notes.trim()
        ? input.notes.trim()
        : null
    return {
      id,
      title,
      typeId,
      startsAt,
      endsAt,
      notes,
    }
  })
  .handler(async ({ data }): Promise<CareCalendarEventDto> => {
    const userId = await requireUserId()
    const type = await prisma.careEventType.findUnique({
      where: { id: data.typeId },
    })
    if (!type) throw new Error('Event type not found.')
    const before = await prisma.careCalendarEvent.findUniqueOrThrow({
      where: { id: data.id },
    })
    const updated = await prisma.careCalendarEvent.update({
      where: { id: data.id },
      data: {
        title: data.title,
        typeId: data.typeId,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        notes: data.notes,
      },
      include: {
        type: { select: { name: true, bgColor: true, textColor: true } },
      },
    })
    const changes = diffChanges(before, updated, [
      'title',
      'typeId',
      'startsAt',
      'endsAt',
      'notes',
    ])
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.calendar_event,
        entityId: updated.id,
        summary: `Updated calendar event ${updated.title}`,
        changes,
        linkMeta: { day: toDayKey(updated.startsAt), tab: 'calendar' },
        visibilityUserId: null,
      })
    }
    return toEventDto(updated)
  })

// --- Swaps ---

export const listSwapRequests = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CareSwapRequestDto[]> => {
    await requireUserId()
    const rows = await prisma.careSwapRequest.findMany({
      include: {
        claimForPerson: { select: { name: true } },
        relinquishOccurrence: {
          select: { startsAt: true, endsAt: true },
        },
        claimOccurrence: {
          select: { startsAt: true, endsAt: true },
        },
        requestedByUser: { select: { name: true } },
        reviewedByUser: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      relinquishOccurrenceId: row.relinquishOccurrenceId,
      claimOccurrenceId: row.claimOccurrenceId,
      claimForPersonId: row.claimForPersonId,
      claimForPersonName: row.claimForPerson.name,
      relinquishStartsAt: row.relinquishOccurrence.startsAt.toISOString(),
      relinquishEndsAt: row.relinquishOccurrence.endsAt.toISOString(),
      claimStartsAt: row.claimOccurrence.startsAt.toISOString(),
      claimEndsAt: row.claimOccurrence.endsAt.toISOString(),
      requestedByUserId: row.requestedByUserId,
      requestedByName: row.requestedByUser.name,
      reviewedByUserId: row.reviewedByUserId,
      reviewedByName: row.reviewedByUser?.name ?? null,
    }))
  },
)

export const createSwapRequest = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const relinquishOccurrenceId =
      typeof input.relinquishOccurrenceId === 'string'
        ? input.relinquishOccurrenceId
        : ''
    const claimOccurrenceId =
      typeof input.claimOccurrenceId === 'string' ? input.claimOccurrenceId : ''
    const claimForPersonId =
      typeof input.claimForPersonId === 'string' ? input.claimForPersonId : ''
    if (!relinquishOccurrenceId || !claimOccurrenceId || !claimForPersonId) {
      throw new Error('Relinquish, claim, and person are required.')
    }
    if (relinquishOccurrenceId === claimOccurrenceId) {
      throw new Error('Relinquish and claim slots must be different.')
    }
    const notes =
      typeof input.notes === 'string' && input.notes.trim()
        ? input.notes.trim()
        : null
    return {
      relinquishOccurrenceId,
      claimOccurrenceId,
      claimForPersonId,
      notes,
    }
  })
  .handler(async ({ data }): Promise<CareSwapRequestDto> => {
    const userId = await requireUserId()

    const [relinquish, claim, person] = await Promise.all([
      prisma.careCoverageOccurrence.findUnique({
        where: { id: data.relinquishOccurrenceId },
      }),
      prisma.careCoverageOccurrence.findUnique({
        where: { id: data.claimOccurrenceId },
      }),
      prisma.carePerson.findUnique({ where: { id: data.claimForPersonId } }),
    ])

    if (!relinquish || relinquish.status !== 'SCHEDULED') {
      throw new Error('Relinquish slot must be a scheduled occurrence.')
    }
    if (!relinquish.assigneeId) {
      throw new Error('Relinquish slot must already be assigned.')
    }
    if (!claim || claim.status !== 'SCHEDULED') {
      throw new Error('Claim slot must be a scheduled occurrence.')
    }
    if (claim.assigneeId) {
      throw new Error('Claim slot must be open.')
    }
    if (!person || !person.isActive) {
      throw new Error('Claim person not found or inactive.')
    }

    const pendingExists = await prisma.careSwapRequest.findFirst({
      where: {
        status: 'PENDING',
        OR: [
          { relinquishOccurrenceId: data.relinquishOccurrenceId },
          { claimOccurrenceId: data.claimOccurrenceId },
        ],
      },
    })
    if (pendingExists) {
      throw new Error('One of these slots already has a pending swap.')
    }

    const created = await prisma.careSwapRequest.create({
      data: {
        relinquishOccurrenceId: data.relinquishOccurrenceId,
        claimOccurrenceId: data.claimOccurrenceId,
        claimForPersonId: data.claimForPersonId,
        requestedByUserId: userId,
        notes: data.notes,
        status: 'PENDING',
      },
      include: {
        claimForPerson: { select: { name: true } },
        relinquishOccurrence: {
          select: { startsAt: true, endsAt: true },
        },
        claimOccurrence: {
          select: { startsAt: true, endsAt: true },
        },
        requestedByUser: { select: { name: true } },
        reviewedByUser: { select: { name: true } },
      },
    })
    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.swap,
      entityId: created.id,
      summary: `Requested swap for ${toDayKey(created.relinquishOccurrence.startsAt)}`,
      changes: createChanges(created, [
        'relinquishOccurrenceId',
        'claimOccurrenceId',
        'claimForPersonId',
        'status',
        'notes',
      ]),
      linkMeta: {
        day: toDayKey(created.relinquishOccurrence.startsAt),
        tab: 'swaps',
      },
      visibilityUserId: null,
    })

    return {
      id: created.id,
      status: created.status,
      notes: created.notes,
      createdAt: created.createdAt.toISOString(),
      reviewedAt: null,
      relinquishOccurrenceId: created.relinquishOccurrenceId,
      claimOccurrenceId: created.claimOccurrenceId,
      claimForPersonId: created.claimForPersonId,
      claimForPersonName: created.claimForPerson.name,
      relinquishStartsAt: created.relinquishOccurrence.startsAt.toISOString(),
      relinquishEndsAt: created.relinquishOccurrence.endsAt.toISOString(),
      claimStartsAt: created.claimOccurrence.startsAt.toISOString(),
      claimEndsAt: created.claimOccurrence.endsAt.toISOString(),
      requestedByUserId: created.requestedByUserId,
      requestedByName: created.requestedByUser.name,
      reviewedByUserId: null,
      reviewedByName: null,
    }
  })

export const reviewSwapRequest = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id : ''
    if (!id) throw new Error('Swap id is required.')
    const decision = input.decision
    if (decision !== 'APPROVED' && decision !== 'REJECTED' && decision !== 'CANCELLED') {
      throw new Error('Decision must be APPROVED, REJECTED, or CANCELLED.')
    }
    return { id, decision: decision as CareSwapStatus }
  })
  .handler(async ({ data }): Promise<CareSwapRequestDto> => {
    const userId = await requireUserId()
    const existing = await prisma.careSwapRequest.findUnique({
      where: { id: data.id },
      include: {
        relinquishOccurrence: true,
        claimOccurrence: true,
      },
    })
    if (!existing) throw new Error('Swap request not found.')
    if (existing.status !== 'PENDING') {
      throw new Error('Only pending swaps can be reviewed.')
    }

    if (data.decision !== 'APPROVED') {
      const updated = await prisma.careSwapRequest.update({
        where: { id: data.id },
        data: {
          status: data.decision,
          reviewedByUserId: userId,
          reviewedAt: new Date(),
        },
        include: {
          claimForPerson: { select: { name: true } },
          relinquishOccurrence: {
            select: { startsAt: true, endsAt: true },
          },
          claimOccurrence: {
            select: { startsAt: true, endsAt: true },
          },
          requestedByUser: { select: { name: true } },
          reviewedByUser: { select: { name: true } },
        },
      })
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.swap,
        entityId: updated.id,
        summary: `${data.decision === 'REJECTED' ? 'Rejected' : 'Cancelled'} swap for ${toDayKey(updated.relinquishOccurrence.startsAt)}`,
        changes: diffChanges(existing, updated, [
          'status',
          'reviewedByUserId',
          'reviewedAt',
        ]),
        linkMeta: {
          day: toDayKey(updated.relinquishOccurrence.startsAt),
          tab: 'swaps',
        },
        visibilityUserId: null,
      })
      return {
        id: updated.id,
        status: updated.status,
        notes: updated.notes,
        createdAt: updated.createdAt.toISOString(),
        reviewedAt: updated.reviewedAt?.toISOString() ?? null,
        relinquishOccurrenceId: updated.relinquishOccurrenceId,
        claimOccurrenceId: updated.claimOccurrenceId,
        claimForPersonId: updated.claimForPersonId,
        claimForPersonName: updated.claimForPerson.name,
        relinquishStartsAt: updated.relinquishOccurrence.startsAt.toISOString(),
        relinquishEndsAt: updated.relinquishOccurrence.endsAt.toISOString(),
        claimStartsAt: updated.claimOccurrence.startsAt.toISOString(),
        claimEndsAt: updated.claimOccurrence.endsAt.toISOString(),
        requestedByUserId: updated.requestedByUserId,
        requestedByName: updated.requestedByUser.name,
        reviewedByUserId: updated.reviewedByUserId,
        reviewedByName: updated.reviewedByUser?.name ?? null,
      }
    }

    const claim = existing.claimOccurrence
    if (claim.assigneeId) {
      throw new Error('Claim slot is no longer open.')
    }
    if (
      await occurrencesOverlap(
        existing.claimForPersonId,
        claim.startsAt,
        claim.endsAt,
        claim.id,
      )
    ) {
      throw new Error('Claim person has overlapping coverage.')
    }

    await prisma.$transaction(async (tx) => {
      await tx.careCoverageOccurrence.update({
        where: { id: existing.relinquishOccurrenceId },
        data: { assigneeId: null },
      })
      await tx.careCoverageOccurrence.update({
        where: { id: existing.claimOccurrenceId },
        data: { assigneeId: existing.claimForPersonId },
      })
      const updated = await tx.careSwapRequest.update({
        where: { id: data.id },
        data: {
          status: 'APPROVED',
          reviewedByUserId: userId,
          reviewedAt: new Date(),
        },
      })
      await logActivity(
        {
          actorUserId: userId,
          action: 'UPDATE',
          entityType: ACTIVITY_ENTITY_TYPES.swap,
          entityId: updated.id,
          summary: `Approved swap for ${toDayKey(existing.relinquishOccurrence.startsAt)}`,
          changes: diffChanges(existing, updated, [
            'status',
            'reviewedByUserId',
            'reviewedAt',
          ]),
          linkMeta: {
            day: toDayKey(existing.relinquishOccurrence.startsAt),
            tab: 'swaps',
          },
          visibilityUserId: null,
        },
        tx,
      )
    })

    await syncBillingForAssignee(existing.relinquishOccurrenceId, null)
    await syncBillingForAssignee(
      existing.claimOccurrenceId,
      existing.claimForPersonId,
    )

    const updated = await prisma.careSwapRequest.findUniqueOrThrow({
      where: { id: data.id },
      include: {
        claimForPerson: { select: { name: true } },
        relinquishOccurrence: {
          select: { startsAt: true, endsAt: true },
        },
        claimOccurrence: {
          select: { startsAt: true, endsAt: true },
        },
        requestedByUser: { select: { name: true } },
        reviewedByUser: { select: { name: true } },
      },
    })

    return {
      id: updated.id,
      status: updated.status,
      notes: updated.notes,
      createdAt: updated.createdAt.toISOString(),
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
      relinquishOccurrenceId: updated.relinquishOccurrenceId,
      claimOccurrenceId: updated.claimOccurrenceId,
      claimForPersonId: updated.claimForPersonId,
      claimForPersonName: updated.claimForPerson.name,
      relinquishStartsAt: updated.relinquishOccurrence.startsAt.toISOString(),
      relinquishEndsAt: updated.relinquishOccurrence.endsAt.toISOString(),
      claimStartsAt: updated.claimOccurrence.startsAt.toISOString(),
      claimEndsAt: updated.claimOccurrence.endsAt.toISOString(),
      requestedByUserId: updated.requestedByUserId,
      requestedByName: updated.requestedByUser.name,
      reviewedByUserId: updated.reviewedByUserId,
      reviewedByName: updated.reviewedByUser?.name ?? null,
    }
  })

// --- Invoices ---

export const listCareInvoices = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CareInvoiceDto[]> => {
    await requireUserId()
    await ensureDueShiftsCompleted()
    const rows = await prisma.careInvoice.findMany({
      include: invoiceInclude,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toInvoiceDto)
  },
)

export const settleCareInvoice = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id : ''
    const financialAccountId =
      typeof input.financialAccountId === 'string'
        ? input.financialAccountId
        : ''
    if (!id || !financialAccountId) {
      throw new Error('Invoice id and account are required.')
    }
    return { id, financialAccountId }
  })
  .handler(async ({ data }): Promise<CareInvoiceDto> => {
    const userId = await requireUserId()
    const invoice = await prisma.careInvoice.findUnique({
      where: { id: data.id },
      include: {
        carePerson: true,
        lines: {
          include: {
            occurrence: { select: { startsAt: true, endsAt: true } },
          },
          orderBy: { occurrence: { startsAt: 'asc' } },
        },
      },
    })
    if (!invoice) throw new Error('Invoice not found.')
    if (invoice.status !== 'OPEN') {
      throw new Error('Only open invoices can be settled.')
    }
    if (invoice.lines.length === 0) {
      throw new Error('Invoice has no coverage lines.')
    }

    const account = await prisma.financialAccount.findFirst({
      where: {
        AND: [{ id: data.financialAccountId }, ownOrGlobal(userId)],
      },
    })
    if (!account) throw new Error('Account not found or not visible.')

    let payee = await prisma.payee.findFirst({
      where: { name: invoice.carePerson.name },
      select: { id: true },
    })
    if (!payee) {
      payee = await prisma.payee.create({
        data: { name: invoice.carePerson.name },
        select: { id: true },
      })
    }

    const amount = Number(invoice.amount.toString())
    const signedAmount = toSignedTransactionAmount('EXPENSE', amount)
    const settleDate =
      invoice.periodEnd ??
      invoice.lines[invoice.lines.length - 1]!.occurrence.endsAt

    const result = await prisma.$transaction(async (tx) => {
      const createdTxn = await tx.transaction.create({
        data: {
          userId,
          financialAccountId: data.financialAccountId,
          type: 'EXPENSE',
          amount: signedAmount,
          date: settleDate,
          description: `Care coverage payment — ${invoice.carePerson.name}`,
          payeeId: payee!.id,
        },
      })

      const updated = await tx.careInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          financialAccountId: data.financialAccountId,
          settledTransactionId: createdTxn.id,
        },
        include: invoiceInclude,
      })
      await logActivity(
        {
          actorUserId: userId,
          action: 'UPDATE',
          entityType: ACTIVITY_ENTITY_TYPES.invoice,
          entityId: updated.id,
          summary: `Settled invoice for ${updated.carePerson.name}`,
          changes: diffChanges(invoice, updated, [
            'status',
            'financialAccountId',
            'settledTransactionId',
          ]),
          linkMeta: {
            day: toDayKey(
              updated.periodEnd ??
                updated.lines[0]?.occurrence.startsAt ??
                new Date(),
            ),
            tab: 'calendar',
          },
          visibilityUserId: null,
        },
        tx,
      )
      return updated
    })

    return toInvoiceDto(result)
  })

export const voidCareInvoice = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id : ''
    if (!id) throw new Error('Invoice id is required.')
    return { id }
  })
  .handler(async ({ data }): Promise<CareInvoiceDto> => {
    const userId = await requireUserId()
    const invoice = await prisma.careInvoice.findUnique({
      where: { id: data.id },
      include: {
        carePerson: { select: { name: true } },
        lines: true,
      },
    })
    if (!invoice) throw new Error('Invoice not found.')
    if (invoice.status !== 'OPEN') {
      throw new Error('Only open invoices can be voided.')
    }

    const result = await prisma.$transaction(async (tx) => {
      const occurrenceIds = invoice.lines.map((l) => l.occurrenceId)
      await tx.careInvoiceLine.deleteMany({
        where: { invoiceId: invoice.id },
      })
      if (occurrenceIds.length > 0) {
        await tx.careCoverageOccurrence.updateMany({
          where: { id: { in: occurrenceIds } },
          data: { billingStatus: 'ACCRUED' },
        })
      }
      const updated = await tx.careInvoice.update({
        where: { id: data.id },
        data: { status: 'VOID', amount: 0 },
        include: invoiceInclude,
      })
      await logActivity(
        {
          actorUserId: userId,
          action: 'UPDATE',
          entityType: ACTIVITY_ENTITY_TYPES.invoice,
          entityId: updated.id,
          summary: `Voided invoice for ${invoice.carePerson.name}`,
          changes: diffChanges(invoice, updated, ['status', 'amount']),
          linkMeta: {
            day: toDayKey(updated.periodEnd ?? updated.createdAt),
            tab: 'calendar',
          },
          visibilityUserId: null,
        },
        tx,
      )
      return updated
    })

    return toInvoiceDto(result)
  })
