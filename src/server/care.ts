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
  CareRateType,
  CareSwapItemRole,
  CareSwapStatus,
} from '#/generated/prisma/enums'
import {
  CareAssignmentScope as CareAssignmentScopeEnum,
  CareCoverageFrequency as CareCoverageFrequencyEnum,
  CareCoverageNeed as CareCoverageNeedEnum,
  CareCoverageWindowKind as CareCoverageWindowKindEnum,
  CareOccurrenceStatus as CareOccurrenceStatusEnum,
  CarePayInterval as CarePayIntervalEnum,
  CareRateType as CareRateTypeEnum,
} from '#/generated/prisma/enums'
import {
  billableQuantity,
  computeInvoiceAmount,
  effectiveRate,
  lastClosedPayPeriodEnd,
  payPeriodStart,
} from '#/lib/care-invoice'
import { occurrenceMatchesRule } from '#/lib/care-assignment'
import { buildRequiredCoverageWindows } from '#/lib/care-required'
import { expandSeriesOccurrences, parseHhMm } from '#/lib/care-recurrence'
import {
  ACTIVITY_ENTITY_TYPES,
  createChanges,
  diffChanges,
} from '#/lib/activity'
import { sendEmail } from '#/lib/email'
import { prisma } from '#/lib/prisma'
import type { SwapEmailKind } from '#/lib/swap-notify'
import {
  buildSwapEmail,
  buildSwapScheduleUrl,
  resolveAppOrigin,
  shouldNotifyParticipant,
} from '#/lib/swap-notify'
import type { Prisma, PrismaClient } from '#/generated/prisma/client'
import { toSignedTransactionAmount } from '#/lib/transaction-amount'
import { requireHexColor } from '#/lib/validators'
import { logActivity } from '#/server/activity-log'
import { authConfig } from '#/utils/auth'

const FREQUENCIES = Object.values(CareCoverageFrequencyEnum)
const COVERAGE_NEEDS = Object.values(CareCoverageNeedEnum)
const COVERAGE_WINDOW_KINDS = Object.values(CareCoverageWindowKindEnum)
const ASSIGNMENT_SCOPES = Object.values(CareAssignmentScopeEnum)
const RATE_TYPES = Object.values(CareRateTypeEnum)

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

/** Build the effectiveRate input from a person joined with its type. */
function personRateInput(person: {
  hourlyRate: { toString(): string } | null
  rateType: CareRateType
  flatDailyRate: boolean
  type: {
    isPaid: boolean
  }
}) {
  return {
    personHourlyRate: decimalToString(person.hourlyRate),
    personRateType: person.rateType,
    personFlatDailyRate: person.flatDailyRate,
    typeIsPaid: person.type.isPaid,
  }
}

function parseOptionalRate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  const n = Number(raw.trim())
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Rate must be a non-negative number.')
  }
  return n.toFixed(4)
}

function parseRateType(value: unknown): CareRateType {
  if (value === null || value === undefined || value === '') return 'HOURLY'
  if (typeof value !== 'string' || !RATE_TYPES.includes(value as CareRateType)) {
    throw new Error('Rate type is invalid.')
  }
  return value as CareRateType
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

/** Human-readable window, for error messages that name a specific shift. */
function formatWindowLabel(startsAt: Date, endsAt: Date): string {
  const time: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
  const day = startsAt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  return `${day} ${startsAt.toLocaleTimeString('en-US', time)}–${endsAt.toLocaleTimeString('en-US', time)}`
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

export type CareAssignmentScope = 'ALL_SHIFTS' | 'SPECIFIC_SHIFTS'

export type CareCoverageAssignmentRuleDto = {
  id: string
  assigneeId: string
  assigneeName: string | null
  startsOn: string
  endsOn: string | null
  daysOfWeek: number[]
  intervalWeeks: number
  scope: CareAssignmentScope
  shiftIds: string[]
  notes: string | null
  filledCount: number
}

export type CreateAssignmentRuleResult = {
  rule: CareCoverageAssignmentRuleDto
  assigned: number
  skipped: number
}

export type CarePersonTypeDto = {
  id: string
  name: string
  isPaid: boolean
}

export type CarePersonDto = {
  id: string
  name: string
  userId: string | null
  typeId: string
  typeName: string
  isPaid: boolean
  hourlyRate: string | null
  rateType: CareRateType
  flatDailyRate: boolean
  effectiveHourlyRate: string | null
  effectiveRateType: CareRateType
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

export type CareSwapWindowDto = {
  occurrenceId: string
  startsAt: string
  endsAt: string
}

export type CareSwapRequestDto = {
  id: string
  status: CareSwapStatus
  notes: string | null
  createdAt: string
  reviewedAt: string | null
  requesterPersonId: string
  requesterPersonName: string
  targetPersonId: string
  targetPersonName: string
  /** null when the target person has no linked app user (offline) */
  targetUserId: string | null
  /** Windows moving from the target person to the requester person */
  takeWindows: CareSwapWindowDto[]
  /** Windows moving the other way; empty for a take-only request */
  giveWindows: CareSwapWindowDto[]
  requestedByUserId: string
  requestedByName: string | null
  reviewedByUserId: string | null
  reviewedByName: string | null
  /** Computed for the requesting viewer; drives which buttons render */
  canReview: boolean
  canCancel: boolean
}

export type CareInvoiceLineDto = {
  id: string
  occurrenceId: string
  amount: string
  hourlyRateSnapshot: string
  hoursSnapshot: string
  rateType: CareRateType
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

export function toPersonDto(person: {
  id: string
  name: string
  userId: string | null
  typeId: string
  hourlyRate: { toString(): string } | null
  rateType: CareRateType
  flatDailyRate: boolean
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
  }
  user: { name: string | null; email: string | null } | null
}): CarePersonDto {
  const rate = effectiveRate({
    personHourlyRate: decimalToString(person.hourlyRate),
    personRateType: person.rateType,
    personFlatDailyRate: person.flatDailyRate,
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
    rateType: person.rateType,
    flatDailyRate: person.flatDailyRate,
    effectiveHourlyRate: rate !== null ? rate.amount.toFixed(4) : null,
    effectiveRateType: rate?.rateType ?? 'HOURLY',
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
    rateType: CareRateType
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
      rateType: line.rateType,
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
  const rate = effectiveRate(personRateInput(person))
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
  rateType: CareRateType
  flatDaily: boolean
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
    const quantity = billableQuantity(
      occ.startsAt,
      occ.endsAt,
      input.rateType,
      input.flatDaily,
    )
    const computed = computeInvoiceAmount(occ.hourlyRate, quantity)
    return {
      occurrenceId: occ.id,
      amount: computed.amount,
      hourlyRateSnapshot: computed.hourlyRate,
      hoursSnapshot: computed.hours,
      rateType: input.rateType,
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
    const rate = effectiveRate(personRateInput(occ.assignee))
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
    const resolved = effectiveRate(personRateInput(person))
    if (resolved === null) continue
    const rate = resolved.amount
    const rateType = resolved.rateType
    const flatDaily = resolved.flatDaily

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
          rateType,
          flatDaily,
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
      rateType,
      flatDaily,
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
  exclude?: string | string[],
) {
  const excludeIds = exclude
    ? Array.isArray(exclude)
      ? exclude
      : [exclude]
    : []
  const conflict = await prisma.careCoverageOccurrence.findFirst({
    where: {
      assigneeId: personId,
      status: { not: 'CANCELLED' },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
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
        { swapItems: { some: { swap: { status: 'PENDING' } } } },
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
      swapItems: { none: { swap: { status: 'PENDING' } } },
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
      swapItems: { none: { swap: { status: 'PENDING' } } },
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
      id: s.id,
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
          requiredShiftId: window.requiredShiftId,
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
          requiredShiftId: window.requiredShiftId,
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

/** Recover the local midnight of a Prisma @db.Date value (stored at UTC midnight). */
function dateOnlyToLocalMidnight(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

type AssignmentApplyResult = {
  assigned: number
  skippedOverlap: number
  alreadyCovered: number
}

/**
 * Assign open required occurrences to the person named by each active
 * assignment rule, for occurrences within [rangeStart, rangeEnd]. Fills only
 * genuinely open (unassigned, SCHEDULED, not-yet-elapsed) slots that match the
 * rule's days and shift scope, skipping any where the person already has
 * overlapping coverage. Idempotent: assigned slots carry assignedByRuleId and
 * are skipped on later passes.
 */
async function applyAssignmentRules(
  rangeStart: Date,
  rangeEnd: Date,
  onlyRuleId?: string,
): Promise<AssignmentApplyResult> {
  const result: AssignmentApplyResult = {
    assigned: 0,
    skippedOverlap: 0,
    alreadyCovered: 0,
  }
  const rules = await prisma.careCoverageAssignmentRule.findMany({
    where: onlyRuleId ? { id: onlyRuleId } : {},
  })
  if (rules.length === 0) return result

  const now = new Date()

  for (const rule of rules) {
    const person = await prisma.carePerson.findUnique({
      where: { id: rule.assigneeId },
    })
    if (!person || !person.isActive) continue

    const startsOn = dateOnlyToLocalMidnight(rule.startsOn)
    const endsOn = rule.endsOn ? dateOnlyToLocalMidnight(rule.endsOn) : null
    const lowerBound =
      startsOn.getTime() > rangeStart.getTime() ? startsOn : rangeStart
    let upperBound = rangeEnd
    if (endsOn) {
      const end = new Date(endsOn)
      end.setDate(end.getDate() + 1) // include the whole end date
      if (end.getTime() < upperBound.getTime()) upperBound = end
    }
    if (lowerBound.getTime() > upperBound.getTime()) continue

    const ruleShape = {
      daysOfWeek: rule.daysOfWeek,
      intervalWeeks: rule.intervalWeeks,
      startsOn,
      endsOn,
      scope: rule.scope,
      shiftIds: rule.shiftIds,
    }

    const candidates = await prisma.careCoverageOccurrence.findMany({
      where: {
        status: 'SCHEDULED',
        endsAt: { gt: now },
        startsAt: { gte: lowerBound, lte: upperBound },
        series: { isRequired: true },
      },
      include: { series: { select: { requiredShiftId: true } } },
      orderBy: { startsAt: 'asc' },
    })

    const billingStatus = await billingStatusForAssigneeId(rule.assigneeId)

    for (const occ of candidates) {
      const matches = occurrenceMatchesRule(
        ruleShape,
        {
          startsAt: occ.startsAt,
          endsAt: occ.endsAt,
          requiredShiftId: occ.series?.requiredShiftId ?? null,
        },
        now,
      )
      if (!matches) continue
      if (occ.assigneeId) {
        if (occ.assigneeId !== rule.assigneeId) result.alreadyCovered += 1
        continue
      }
      if (
        await occurrencesOverlap(rule.assigneeId, occ.startsAt, occ.endsAt)
      ) {
        result.skippedOverlap += 1
        continue
      }
      await prisma.careCoverageOccurrence.update({
        where: { id: occ.id },
        data: {
          assigneeId: rule.assigneeId,
          assignedByRuleId: rule.id,
          billingStatus,
        },
      })
      result.assigned += 1
    }
  }

  return result
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

    const shifts: Array<{
      label: string | null
      startTime: string
      endTime: string
      sortOrder: number
    }> = []
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

function toPersonTypeDto(row: {
  id: string
  name: string
  isPaid: boolean
}): CarePersonTypeDto {
  return {
    id: row.id,
    name: row.name,
    isPaid: row.isPaid,
  }
}

export const listCarePersonTypes = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CarePersonTypeDto[]> => {
    await requireUserId()
    await ensureDefaultTypes()
    const rows = await prisma.carePersonType.findMany({
      orderBy: { name: 'asc' },
    })
    return rows.map(toPersonTypeDto)
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
    }
  })
  .handler(async ({ data }): Promise<CarePersonTypeDto> => {
    const userId = await requireUserId()
    const created = await prisma.carePersonType.create({
      data: {
        name: data.name,
        isPaid: data.isPaid,
      },
    })
    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.care_person_type,
      entityId: created.id,
      summary: `Created care person type ${created.name}`,
      changes: createChanges(created, ['name', 'isPaid']),
      visibilityUserId: null,
    })
    return toPersonTypeDto(created)
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
      },
    })
    const changes = diffChanges(before, updated, ['name', 'isPaid'])
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
    return toPersonTypeDto(updated)
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
      rateType: parseRateType(input.rateType),
      flatDailyRate: Boolean(input.flatDailyRate),
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
    if (type.isPaid && data.hourlyRate === null) {
      throw new Error('Rate is required for paid people.')
    }
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
        rateType: type.isPaid ? data.rateType : 'HOURLY',
        flatDailyRate:
          type.isPaid && data.rateType === 'DAILY' ? data.flatDailyRate : false,
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
        'rateType',
        'flatDailyRate',
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
      rateType: parseRateType(input.rateType),
      flatDailyRate: Boolean(input.flatDailyRate),
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
    if (type.isPaid && data.hourlyRate === null) {
      throw new Error('Rate is required for paid people.')
    }
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
        rateType: type.isPaid ? data.rateType : 'HOURLY',
        flatDailyRate:
          type.isPaid && data.rateType === 'DAILY' ? data.flatDailyRate : false,
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
      'rateType',
      'flatDailyRate',
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
    await applyAssignmentRules(padStart, padEnd)
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

export type OpenCoverageSlotDto = {
  id: string
  startsAt: string
  endsAt: string
  notes: string | null
  isRequired: boolean
  seriesNotes: string | null
}

export type CoverageAssigneeStat = {
  personId: string
  name: string
  count: number
  bgColor: string | null
  textColor: string | null
}

/** Local Sunday 00:00 through Saturday of the following week 23:59:59. */
function thisAndNextWeekRange(now = new Date()) {
  const rangeStart = new Date(now)
  rangeStart.setHours(0, 0, 0, 0)
  rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay())

  const rangeEnd = new Date(rangeStart)
  rangeEnd.setDate(rangeEnd.getDate() + 13)
  rangeEnd.setHours(23, 59, 59, 999)

  return { rangeStart, rangeEnd }
}

export const listOpenCoverageSlots = createServerFn({
  method: 'GET',
}).handler(async (): Promise<OpenCoverageSlotDto[]> => {
  await requireUserId()

  const { rangeStart, rangeEnd } = thisAndNextWeekRange()

  const padStart = new Date(rangeStart)
  padStart.setDate(padStart.getDate() - 7)
  const padEnd = new Date(rangeEnd)
  padEnd.setDate(padEnd.getDate() + 7)

  await ensureCalendarMaintenance(padStart, padEnd)

  const rows = await prisma.careCoverageOccurrence.findMany({
    where: {
      assigneeId: null,
      status: 'SCHEDULED',
      startsAt: { gte: rangeStart, lte: rangeEnd },
    },
    orderBy: { startsAt: 'asc' },
    include: {
      series: { select: { isRequired: true, notes: true } },
    },
  })

  return rows.map((row) => ({
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    notes: row.notes,
    isRequired: row.series?.isRequired ?? false,
    seriesNotes: row.series?.notes ?? null,
  }))
})

export const getCoverageAssigneeStats = createServerFn({
  method: 'GET',
}).handler(async (): Promise<CoverageAssigneeStat[]> => {
  await requireUserId()

  const { rangeStart, rangeEnd } = thisAndNextWeekRange()

  const padStart = new Date(rangeStart)
  padStart.setDate(padStart.getDate() - 7)
  const padEnd = new Date(rangeEnd)
  padEnd.setDate(padEnd.getDate() + 7)

  await ensureCalendarMaintenance(padStart, padEnd)

  const groups = await prisma.careCoverageOccurrence.groupBy({
    by: ['assigneeId'],
    where: {
      assigneeId: { not: null },
      status: { in: ['SCHEDULED', 'COMPLETED'] },
      startsAt: { gte: rangeStart, lte: rangeEnd },
    },
    _count: { _all: true },
  })

  const personIds = groups
    .map((g) => g.assigneeId)
    .filter((id): id is string => typeof id === 'string')

  if (personIds.length === 0) return []

  const people = await prisma.carePerson.findMany({
    where: { id: { in: personIds } },
    select: { id: true, name: true, bgColor: true, textColor: true },
  })
  const personById = new Map(people.map((p) => [p.id, p]))

  return groups
    .map((g) => {
      const person = g.assigneeId ? personById.get(g.assigneeId) : undefined
      return {
        personId: g.assigneeId!,
        name: person?.name ?? 'Unknown',
        count: g._count._all,
        bgColor: person?.bgColor ?? null,
        textColor: person?.textColor ?? null,
      }
    })
    .sort((a, b) => b.count - a.count)
})

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
    const userId = await requireUserId()

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
        // Only badge swaps this viewer can actually act on or is waiting on.
        prisma.careSwapRequest.count({
          where: {
            status: 'PENDING',
            OR: [
              { targetPerson: { userId } },
              { targetPerson: { userId: null } },
              { requestedByUserId: userId },
            ],
          },
        }),
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

// --- Recurring assignment rules ---

function toAssignmentRuleDto(row: {
  id: string
  assigneeId: string
  startsOn: Date
  endsOn: Date | null
  daysOfWeek: number[]
  intervalWeeks: number
  scope: CareAssignmentScope
  shiftIds: string[]
  notes: string | null
  assignee: { name: string } | null
  _count?: { occurrences: number }
}): CareCoverageAssignmentRuleDto {
  return {
    id: row.id,
    assigneeId: row.assigneeId,
    assigneeName: row.assignee?.name ?? null,
    startsOn: row.startsOn.toISOString().slice(0, 10),
    endsOn: row.endsOn ? row.endsOn.toISOString().slice(0, 10) : null,
    daysOfWeek: row.daysOfWeek,
    intervalWeeks: row.intervalWeeks,
    scope: row.scope,
    shiftIds: row.shiftIds,
    notes: row.notes,
    filledCount: row._count?.occurrences ?? 0,
  }
}

export const listCoverageAssignmentRules = createServerFn({
  method: 'GET',
}).handler(async (): Promise<CareCoverageAssignmentRuleDto[]> => {
  await requireUserId()
  const rows = await prisma.careCoverageAssignmentRule.findMany({
    include: {
      assignee: { select: { name: true } },
      _count: { select: { occurrences: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toAssignmentRuleDto)
})

export const createCoverageAssignmentRule = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const assigneeId =
      typeof input.assigneeId === 'string' ? input.assigneeId.trim() : ''
    if (!assigneeId) throw new Error('Assignee is required.')
    const scopeRaw = input.scope
    if (
      typeof scopeRaw !== 'string' ||
      !ASSIGNMENT_SCOPES.includes(scopeRaw as CareAssignmentScope)
    ) {
      throw new Error('Shift scope is invalid.')
    }
    const scope = scopeRaw as CareAssignmentScope
    let shiftIds: string[] = []
    if (scope === 'SPECIFIC_SHIFTS') {
      if (!Array.isArray(input.shiftIds) || input.shiftIds.length === 0) {
        throw new Error('Select at least one shift.')
      }
      shiftIds = [
        ...new Set(
          input.shiftIds.map((id) => {
            if (typeof id !== 'string' || !id.trim()) {
              throw new Error('Shift id is invalid.')
            }
            return id.trim()
          }),
        ),
      ]
    }
    const endsOnRaw =
      typeof input.endsOn === 'string' && input.endsOn.trim()
        ? input.endsOn.trim()
        : null
    const notes =
      typeof input.notes === 'string' && input.notes.trim()
        ? input.notes.trim()
        : null
    let intervalWeeks = 1
    if (input.intervalWeeks !== undefined && input.intervalWeeks !== null) {
      const n =
        typeof input.intervalWeeks === 'number'
          ? input.intervalWeeks
          : Number(input.intervalWeeks)
      if (!Number.isInteger(n) || n < 1 || n > 8) {
        throw new Error('Repeat interval must be a whole number of 1–8 weeks.')
      }
      intervalWeeks = n
    }
    return {
      assigneeId,
      startsOn: parseDateOnly(input.startsOn, 'Start date'),
      endsOn: endsOnRaw ? parseDateOnly(endsOnRaw, 'End date') : null,
      daysOfWeek: parseDaysOfWeek(input.daysOfWeek),
      intervalWeeks,
      scope,
      shiftIds,
      notes,
    }
  })
  .handler(async ({ data }): Promise<CreateAssignmentRuleResult> => {
    const userId = await requireUserId()
    const person = await prisma.carePerson.findUnique({
      where: { id: data.assigneeId },
    })
    if (!person || !person.isActive) {
      throw new Error('Assignee not found or inactive.')
    }
    if (data.endsOn && data.endsOn.getTime() < data.startsOn.getTime()) {
      throw new Error('End date must be on or after the start date.')
    }
    if (data.scope === 'SPECIFIC_SHIFTS') {
      const found = await prisma.careRequiredShift.findMany({
        where: { id: { in: data.shiftIds } },
        select: { id: true },
      })
      if (found.length !== data.shiftIds.length) {
        throw new Error('One or more selected shifts no longer exist.')
      }
    }

    const created = await prisma.careCoverageAssignmentRule.create({
      data: {
        assigneeId: data.assigneeId,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        daysOfWeek: data.daysOfWeek,
        intervalWeeks: data.intervalWeeks,
        scope: data.scope,
        shiftIds: data.shiftIds,
        notes: data.notes,
      },
    })

    // Ensure the target window is materialized, then fill matching open slots.
    const now = new Date()
    const rangeStart = new Date(now)
    rangeStart.setDate(rangeStart.getDate() - 7)
    const rangeEnd = new Date(now)
    rangeEnd.setDate(rangeEnd.getDate() + 90)
    await materializeSeriesInRange(rangeStart, rangeEnd)
    const applied = await applyAssignmentRules(rangeStart, rangeEnd, created.id)

    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.coverage_assignment_rule,
      entityId: created.id,
      summary: `Assigned ${person.name} to recurring coverage`,
      changes: createChanges(created, [
        'assigneeId',
        'startsOn',
        'endsOn',
        'daysOfWeek',
        'intervalWeeks',
        'scope',
        'shiftIds',
        'notes',
      ]),
      linkMeta: { day: toDayKey(created.startsOn), tab: 'calendar' },
      visibilityUserId: null,
    })

    const dto = toAssignmentRuleDto({
      ...created,
      assignee: { name: person.name },
      _count: { occurrences: applied.assigned },
    })
    return {
      rule: dto,
      assigned: applied.assigned,
      skipped: applied.skippedOverlap + applied.alreadyCovered,
    }
  })

export const deleteCoverageAssignmentRule = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id.trim() : ''
    if (!id) throw new Error('Rule id is required.')
    return { id }
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const userId = await requireUserId()
    const rule = await prisma.careCoverageAssignmentRule.findUnique({
      where: { id: data.id },
      include: { assignee: { select: { name: true } } },
    })
    if (!rule) throw new Error('Recurring assignment not found.')

    // Reopen upcoming, not-yet-completed slots this rule filled; preserve past,
    // completed, invoiced, and pending-swap ones as-is.
    await prisma.careCoverageOccurrence.updateMany({
      where: {
        assignedByRuleId: rule.id,
        status: 'SCHEDULED',
        startsAt: { gte: startOfLocalToday() },
        invoiceLine: null,
        swapItems: { none: { swap: { status: 'PENDING' } } },
      },
      data: {
        assigneeId: null,
        assignedByRuleId: null,
        billingStatus: 'NOT_BILLABLE',
      },
    })

    // Deleting the rule clears assignedByRuleId on any preserved occurrences.
    await prisma.careCoverageAssignmentRule.delete({ where: { id: rule.id } })

    await logActivity({
      actorUserId: userId,
      action: 'DELETE',
      entityType: ACTIVITY_ENTITY_TYPES.coverage_assignment_rule,
      entityId: rule.id,
      summary: `Removed recurring coverage for ${rule.assignee?.name ?? 'assignee'}`,
      changes: diffChanges(rule, null, [
        'assigneeId',
        'startsOn',
        'endsOn',
        'daysOfWeek',
        'intervalWeeks',
        'scope',
        'shiftIds',
        'notes',
      ]),
      linkMeta: { day: toDayKey(rule.startsOn), tab: 'calendar' },
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

const swapInclude = {
  requesterPerson: {
    select: {
      id: true,
      name: true,
      userId: true,
      user: { select: { email: true } },
    },
  },
  targetPerson: {
    select: {
      id: true,
      name: true,
      userId: true,
      user: { select: { email: true } },
    },
  },
  requestedByUser: { select: { name: true, email: true } },
  reviewedByUser: { select: { name: true } },
  items: {
    select: {
      role: true,
      occurrenceId: true,
      occurrence: {
        select: { startsAt: true, endsAt: true, assigneeId: true, status: true },
      },
    },
    orderBy: { occurrence: { startsAt: 'asc' } },
  },
} satisfies Prisma.CareSwapRequestInclude

type SwapRow = {
  id: string
  status: CareSwapStatus
  notes: string | null
  createdAt: Date
  reviewedAt: Date | null
  requesterPersonId: string
  targetPersonId: string
  requestedByUserId: string
  reviewedByUserId: string | null
  requesterPerson: {
    name: string
    userId: string | null
    user: { email: string | null } | null
  }
  targetPerson: {
    name: string
    userId: string | null
    user: { email: string | null } | null
  }
  requestedByUser: { name: string | null; email: string | null }
  reviewedByUser: { name: string | null } | null
  items: Array<{
    role: CareSwapItemRole
    occurrenceId: string
    occurrence: {
      startsAt: Date
      endsAt: Date
      assigneeId: string | null
      status: CareOccurrenceStatus
    }
  }>
}

function swapWindows(row: SwapRow, role: CareSwapItemRole): CareSwapWindowDto[] {
  return row.items
    .filter((item) => item.role === role)
    .map((item) => ({
      occurrenceId: item.occurrenceId,
      startsAt: item.occurrence.startsAt.toISOString(),
      endsAt: item.occurrence.endsAt.toISOString(),
    }))
}

/**
 * Who may approve or reject: the target person is the one losing coverage, so
 * when they are linked to an app user only that user decides. Offline people
 * cannot answer, so anyone signed in may act on their behalf.
 */
function canReviewSwap(
  row: { targetPerson: { userId: string | null } },
  viewerUserId: string,
): boolean {
  const targetUserId = row.targetPerson.userId
  return targetUserId ? targetUserId === viewerUserId : true
}

function toSwapDto(row: SwapRow, viewerUserId: string): CareSwapRequestDto {
  const pending = row.status === 'PENDING'
  return {
    id: row.id,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    requesterPersonId: row.requesterPersonId,
    requesterPersonName: row.requesterPerson.name,
    targetPersonId: row.targetPersonId,
    targetPersonName: row.targetPerson.name,
    targetUserId: row.targetPerson.userId,
    takeWindows: swapWindows(row, 'TAKE'),
    giveWindows: swapWindows(row, 'GIVE'),
    requestedByUserId: row.requestedByUserId,
    requestedByName: row.requestedByUser.name,
    reviewedByUserId: row.reviewedByUserId,
    reviewedByName: row.reviewedByUser?.name ?? null,
    canReview: pending && canReviewSwap(row, viewerUserId),
    canCancel: pending && row.requestedByUserId === viewerUserId,
  }
}

/** Earliest window in the swap; anchors the day used in links and summaries. */
function swapAnchorDay(row: SwapRow): string {
  const earliest = row.items.reduce<Date | null>(
    (acc, item) =>
      acc === null || item.occurrence.startsAt < acc
        ? item.occurrence.startsAt
        : acc,
    null,
  )
  return toDayKey(earliest ?? row.createdAt)
}

/**
 * Email every linked participant except whoever performed the action. A send
 * failure must never fail the mutation that triggered it.
 */
async function notifySwapParticipants(
  row: SwapRow,
  kind: SwapEmailKind,
  actorUserId: string,
  actorName: string | null,
) {
  try {
    const recipients = new Map<string, string>()
    const participants = [
      { userId: row.targetPerson.userId, email: row.targetPerson.user?.email },
      {
        userId: row.requesterPerson.userId,
        email: row.requesterPerson.user?.email,
      },
      { userId: row.requestedByUserId, email: row.requestedByUser.email },
    ]
    for (const participant of participants) {
      const email = participant.email ?? null
      if (
        !email ||
        !shouldNotifyParticipant(
          { userId: participant.userId ?? null, email },
          actorUserId,
        )
      ) {
        continue
      }
      recipients.set(participant.userId!, email)
    }
    if (recipients.size === 0) return

    const day = swapAnchorDay(row)
    const origin = resolveAppOrigin({
      authUrl: process.env.AUTH_URL,
      requestUrl: getRequest().url,
    })
    const email = buildSwapEmail({
      kind,
      actorName,
      requesterPersonName: row.requesterPerson.name,
      targetPersonName: row.targetPerson.name,
      takeWindows: row.items
        .filter((item) => item.role === 'TAKE')
        .map((item) => item.occurrence),
      giveWindows: row.items
        .filter((item) => item.role === 'GIVE')
        .map((item) => item.occurrence),
      notes: row.notes,
      scheduleUrl: origin ? buildSwapScheduleUrl(origin, day) : null,
      dayLabel: day,
    })
    for (const to of recipients.values()) {
      await sendEmail({
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      })
    }
  } catch (err) {
    console.error(`[care] Failed to send swap ${kind} email:`, err)
  }
}

/** The CarePerson this user acts as, if any. CarePerson.userId is unique. */
async function personForUser(userId: string) {
  return prisma.carePerson.findUnique({ where: { userId } })
}

export const listSwapRequests = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CareSwapRequestDto[]> => {
    const userId = await requireUserId()
    const rows = await prisma.careSwapRequest.findMany({
      include: swapInclude,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((row) => toSwapDto(row, userId))
  },
)

/**
 * Assigned, future, not-already-promised windows for one person. Feeds the
 * week-at-a-time swap picker, which pages outside the loaded calendar month.
 */
export const listSwapCandidateWindows = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const personId =
      typeof input.personId === 'string' ? input.personId.trim() : ''
    if (!personId) throw new Error('Person is required.')
    const rangeStart =
      typeof input.rangeStart === 'string' ? new Date(input.rangeStart) : null
    const rangeEnd =
      typeof input.rangeEnd === 'string' ? new Date(input.rangeEnd) : null
    if (
      !rangeStart ||
      !rangeEnd ||
      Number.isNaN(rangeStart.getTime()) ||
      Number.isNaN(rangeEnd.getTime())
    ) {
      throw new Error('A valid range is required.')
    }
    return { personId, rangeStart, rangeEnd }
  })
  .handler(async ({ data }): Promise<CareSwapWindowDto[]> => {
    await requireUserId()
    const floor = startOfLocalToday()
    const rows = await prisma.careCoverageOccurrence.findMany({
      where: {
        assigneeId: data.personId,
        status: 'SCHEDULED',
        startsAt: {
          gte: data.rangeStart > floor ? data.rangeStart : floor,
          lte: data.rangeEnd,
        },
        swapItems: { none: { swap: { status: 'PENDING' } } },
      },
      select: { id: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: 'asc' },
    })
    return rows.map((row) => ({
      occurrenceId: row.id,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
    }))
  })

function uniqueIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list.`)
  return [
    ...new Set(
      value.map((id) => {
        if (typeof id !== 'string' || !id.trim()) {
          throw new Error(`${label} contains an invalid window.`)
        }
        return id.trim()
      }),
    ),
  ]
}

export const createSwapRequest = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const targetPersonId =
      typeof input.targetPersonId === 'string' ? input.targetPersonId.trim() : ''
    if (!targetPersonId) throw new Error('Pick whose windows you are taking.')
    const requesterPersonId =
      typeof input.requesterPersonId === 'string' &&
      input.requesterPersonId.trim()
        ? input.requesterPersonId.trim()
        : null
    const takeOccurrenceIds = uniqueIds(
      input.takeOccurrenceIds,
      'Windows to take',
    )
    if (takeOccurrenceIds.length === 0) {
      throw new Error('Pick at least one window to take.')
    }
    const giveOccurrenceIds = uniqueIds(
      input.giveOccurrenceIds ?? [],
      'Windows to give',
    )
    const overlap = giveOccurrenceIds.filter((id) =>
      takeOccurrenceIds.includes(id),
    )
    if (overlap.length > 0) {
      throw new Error('A window cannot be both taken and given.')
    }
    const notes =
      typeof input.notes === 'string' && input.notes.trim()
        ? input.notes.trim()
        : null
    return {
      targetPersonId,
      requesterPersonId,
      takeOccurrenceIds,
      giveOccurrenceIds,
      notes,
    }
  })
  .handler(async ({ data }): Promise<CareSwapRequestDto> => {
    const userId = await requireUserId()

    const linkedPerson = data.requesterPersonId ? null : await personForUser(userId)
    const requesterPersonId = data.requesterPersonId ?? linkedPerson?.id ?? null
    if (!requesterPersonId) {
      throw new Error(
        'Your account is not linked to a caregiver, so pick who is taking these windows.',
      )
    }
    if (requesterPersonId === data.targetPersonId) {
      throw new Error('Pick a different person to swap with.')
    }

    const [requesterPerson, targetPerson] = await Promise.all([
      prisma.carePerson.findUnique({ where: { id: requesterPersonId } }),
      prisma.carePerson.findUnique({ where: { id: data.targetPersonId } }),
    ])
    if (!requesterPerson || !requesterPerson.isActive) {
      throw new Error('The person taking these windows is not active.')
    }
    if (!targetPerson || !targetPerson.isActive) {
      throw new Error('The person you are swapping with is not active.')
    }

    const allIds = [...data.takeOccurrenceIds, ...data.giveOccurrenceIds]
    const occurrences = await prisma.careCoverageOccurrence.findMany({
      where: { id: { in: allIds } },
      select: { id: true, assigneeId: true, status: true, startsAt: true },
    })
    if (occurrences.length !== allIds.length) {
      throw new Error('One or more windows were not found.')
    }
    const byId = new Map(occurrences.map((row) => [row.id, row]))
    const floor = startOfLocalToday()
    for (const [ids, expectedAssigneeId, label] of [
      [data.takeOccurrenceIds, data.targetPersonId, targetPerson.name],
      [data.giveOccurrenceIds, requesterPersonId, requesterPerson.name],
    ] as const) {
      for (const id of ids) {
        const row = byId.get(id)!
        if (row.status !== 'SCHEDULED' || row.assigneeId !== expectedAssigneeId) {
          throw new Error(`One of the windows is no longer assigned to ${label}.`)
        }
        if (row.startsAt < floor) {
          throw new Error('Past windows cannot be swapped.')
        }
      }
    }

    const promised = await prisma.careSwapItem.findFirst({
      where: { occurrenceId: { in: allIds }, swap: { status: 'PENDING' } },
      select: { id: true },
    })
    if (promised) {
      throw new Error('One of these windows is already in a pending swap.')
    }

    const created = await prisma.careSwapRequest.create({
      data: {
        requesterPersonId,
        targetPersonId: data.targetPersonId,
        requestedByUserId: userId,
        notes: data.notes,
        status: 'PENDING',
        items: {
          create: [
            ...data.takeOccurrenceIds.map((occurrenceId) => ({
              occurrenceId,
              role: 'TAKE' as const,
            })),
            ...data.giveOccurrenceIds.map((occurrenceId) => ({
              occurrenceId,
              role: 'GIVE' as const,
            })),
          ],
        },
      },
      include: swapInclude,
    })

    const takeCount = data.takeOccurrenceIds.length
    const giveCount = data.giveOccurrenceIds.length
    const day = swapAnchorDay(created)
    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.swap,
      entityId: created.id,
      summary:
        `Requested to take ${takeCount} window${takeCount === 1 ? '' : 's'} from ${targetPerson.name}` +
        (giveCount > 0 ? `, offering ${giveCount} back` : ''),
      changes: createChanges(created, [
        'requesterPersonId',
        'targetPersonId',
        'status',
        'notes',
      ]),
      linkMeta: { day, tab: 'swaps' },
      visibilityUserId: null,
    })

    await notifySwapParticipants(
      created,
      'REQUESTED',
      userId,
      created.requestedByUser.name,
    )

    return toSwapDto(created, userId)
  })

const SWAP_DECISIONS = ['APPROVED', 'REJECTED', 'CANCELLED'] as const
type SwapDecision = (typeof SWAP_DECISIONS)[number]

export const reviewSwapRequest = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id : ''
    if (!id) throw new Error('Swap id is required.')
    const decision = input.decision as SwapDecision
    if (!SWAP_DECISIONS.includes(decision)) {
      throw new Error('Decision must be APPROVED, REJECTED, or CANCELLED.')
    }
    return { id, decision }
  })
  .handler(async ({ data }): Promise<CareSwapRequestDto> => {
    const userId = await requireUserId()
    const existing = await prisma.careSwapRequest.findUnique({
      where: { id: data.id },
      include: swapInclude,
    })
    if (!existing) throw new Error('Swap request not found.')
    if (existing.status !== 'PENDING') {
      throw new Error('Only pending swaps can be reviewed.')
    }

    if (data.decision === 'CANCELLED') {
      if (existing.requestedByUserId !== userId) {
        throw new Error('Only the person who asked can cancel this swap.')
      }
    } else if (!canReviewSwap(existing, userId)) {
      throw new Error(
        `Only ${existing.targetPerson.name} can approve or decline this swap.`,
      )
    }

    const actorName =
      (await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      }))?.name ?? null
    const day = swapAnchorDay(existing)

    if (data.decision !== 'APPROVED') {
      const updated = await prisma.careSwapRequest.update({
        where: { id: data.id },
        data: {
          status: data.decision,
          reviewedByUserId: userId,
          reviewedAt: new Date(),
        },
        include: swapInclude,
      })
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.swap,
        entityId: updated.id,
        summary: `${data.decision === 'REJECTED' ? 'Declined' : 'Cancelled'} swap for ${day}`,
        changes: diffChanges(existing, updated, [
          'status',
          'reviewedByUserId',
          'reviewedAt',
        ]),
        linkMeta: { day, tab: 'swaps' },
        visibilityUserId: null,
      })
      await notifySwapParticipants(updated, data.decision, userId, actorName)
      return toSwapDto(updated, userId)
    }

    // Approving moves real coverage, so re-check that the schedule has not
    // shifted since the request was made.
    const takeIds: string[] = []
    const giveIds: string[] = []
    for (const item of existing.items) {
      const expectedAssigneeId =
        item.role === 'TAKE' ? existing.targetPersonId : existing.requesterPersonId
      const expectedName =
        item.role === 'TAKE'
          ? existing.targetPerson.name
          : existing.requesterPerson.name
      if (
        item.occurrence.status !== 'SCHEDULED' ||
        item.occurrence.assigneeId !== expectedAssigneeId
      ) {
        throw new Error(
          `${formatWindowLabel(item.occurrence.startsAt, item.occurrence.endsAt)} is no longer assigned to ${expectedName}.`,
        )
      }
      ;(item.role === 'TAKE' ? takeIds : giveIds).push(item.occurrenceId)
    }
    const involvedIds = [...takeIds, ...giveIds]

    // Fail before touching anything if billing would block the move.
    const paidLine = await prisma.careInvoiceLine.findFirst({
      where: {
        occurrenceId: { in: involvedIds },
        invoice: { status: 'PAID' },
      },
      select: { id: true },
    })
    if (paidLine) {
      throw new Error(
        'One of these windows is on a paid invoice and cannot be reassigned. Void the invoice first.',
      )
    }

    // Excluding the whole involved set makes this a check against everything
    // *else* on the calendar, which is what the post-swap state looks like.
    for (const item of existing.items) {
      const destinationId =
        item.role === 'TAKE' ? existing.requesterPersonId : existing.targetPersonId
      const destinationName =
        item.role === 'TAKE'
          ? existing.requesterPerson.name
          : existing.targetPerson.name
      if (
        await occurrencesOverlap(
          destinationId,
          item.occurrence.startsAt,
          item.occurrence.endsAt,
          involvedIds,
        )
      ) {
        throw new Error(
          `${destinationName} already has coverage overlapping ${formatWindowLabel(item.occurrence.startsAt, item.occurrence.endsAt)}.`,
        )
      }
    }

    await prisma.$transaction(async (tx) => {
      // Clear first so a true two-way swap never collides with itself. The
      // rule link goes too: after a manual swap the slot is no longer the
      // rule's to revert.
      await tx.careCoverageOccurrence.updateMany({
        where: { id: { in: involvedIds } },
        data: { assigneeId: null, assignedByRuleId: null },
      })
      if (takeIds.length > 0) {
        await tx.careCoverageOccurrence.updateMany({
          where: { id: { in: takeIds } },
          data: { assigneeId: existing.requesterPersonId },
        })
      }
      if (giveIds.length > 0) {
        await tx.careCoverageOccurrence.updateMany({
          where: { id: { in: giveIds } },
          data: { assigneeId: existing.targetPersonId },
        })
      }
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
          summary: `Approved swap for ${day}`,
          changes: diffChanges(existing, updated, [
            'status',
            'reviewedByUserId',
            'reviewedAt',
          ]),
          linkMeta: { day, tab: 'swaps' },
          visibilityUserId: null,
        },
        tx,
      )
    })

    for (const id of takeIds) {
      await syncBillingForAssignee(id, existing.requesterPersonId)
    }
    for (const id of giveIds) {
      await syncBillingForAssignee(id, existing.targetPersonId)
    }

    const updated = await prisma.careSwapRequest.findUniqueOrThrow({
      where: { id: data.id },
      include: swapInclude,
    })
    await notifySwapParticipants(updated, 'APPROVED', userId, actorName)
    return toSwapDto(updated, userId)
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
