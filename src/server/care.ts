import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import type {
  CareCalendarEventKind,
  CareCoverageFrequency,
  CareCoverageNeed,
  CareCoverageWindowKind,
  CareInvoiceStatus,
  CareOccurrenceStatus,
  CareSwapStatus,
} from '#/generated/prisma/enums'
import {
  CareCalendarEventKind as CareCalendarEventKindEnum,
  CareCoverageFrequency as CareCoverageFrequencyEnum,
  CareCoverageNeed as CareCoverageNeedEnum,
  CareCoverageWindowKind as CareCoverageWindowKindEnum,
  CareOccurrenceStatus as CareOccurrenceStatusEnum,
} from '#/generated/prisma/enums'
import {
  computeInvoiceAmount,
  effectiveHourlyRate,
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
import { prisma } from '#/lib/prisma'
import { toSignedTransactionAmount } from '#/lib/transaction-amount'
import { authConfig } from '#/utils/auth'

const FREQUENCIES = Object.values(CareCoverageFrequencyEnum)
const EVENT_KINDS = Object.values(CareCalendarEventKindEnum)
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
  isActive: boolean
  color: string | null
  userEmail: string | null
  userName: string | null
}

export type CareCoverageOccurrenceDto = {
  id: string
  seriesId: string | null
  assigneeId: string | null
  assigneeName: string | null
  assigneeColor: string | null
  startsAt: string
  endsAt: string
  status: CareOccurrenceStatus
  notes: string | null
  hasInvoice: boolean
}

export type CareCalendarEventDto = {
  id: string
  kind: CareCalendarEventKind
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

export type CareInvoiceDto = {
  id: string
  occurrenceId: string
  carePersonId: string
  carePersonName: string
  amount: string
  hourlyRateSnapshot: string
  hoursSnapshot: string
  status: CareInvoiceStatus
  financialAccountId: string | null
  settledTransactionId: string | null
  startsAt: string
  endsAt: string
  createdAt: string
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
  isActive: boolean
  color: string | null
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
    isActive: person.isActive,
    color: person.color,
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
  notes: string | null
  assignee: { name: string; color: string | null } | null
  invoice: { id: string } | null
}): CareCoverageOccurrenceDto {
  return {
    id: row.id,
    seriesId: row.seriesId,
    assigneeId: row.assigneeId,
    assigneeName: row.assignee?.name ?? null,
    assigneeColor: row.assignee?.color ?? null,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    notes: row.notes,
    hasInvoice: Boolean(row.invoice),
  }
}

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
  await prisma.careSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', lovedOneName: '' },
    update: {},
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
    await prisma.careCoverageOccurrence.createMany({
      data: slots.map((slot) => ({
        seriesId: series.id,
        assigneeId: series.assigneeId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: 'SCHEDULED' as const,
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
    include: {
      assignee: {
        include: {
          type: true,
        },
      },
      invoice: true,
    },
  })

  for (const occ of due) {
    await prisma.careCoverageOccurrence.update({
      where: { id: occ.id },
      data: { status: 'COMPLETED' },
    })

    if (occ.invoice || !occ.assignee) continue

    const rate = effectiveHourlyRate({
      personHourlyRate: decimalToString(occ.assignee.hourlyRate),
      typeDefaultHourlyRate: decimalToString(occ.assignee.type.defaultHourlyRate),
      typeIsPaid: occ.assignee.type.isPaid,
    })
    if (rate === null) continue

    const hours = hoursBetween(occ.startsAt, occ.endsAt)
    const computed = computeInvoiceAmount(rate, hours)

    await prisma.careInvoice.create({
      data: {
        occurrenceId: occ.id,
        carePersonId: occ.assignee.id,
        amount: computed.amount,
        hourlyRateSnapshot: computed.hourlyRate,
        hoursSnapshot: computed.hours,
        status: 'OPEN',
      },
    })
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
        { invoice: { isNot: null } },
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
      invoice: null,
      swapRelinquish: { none: { status: 'PENDING' } },
      swapClaim: { none: { status: 'PENDING' } },
    },
  })
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
    await requireUserId()
    await ensureDefaultTypes()

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
    await requireUserId()
    const created = await prisma.carePersonType.create({
      data: {
        name: data.name,
        isPaid: data.isPaid,
        defaultHourlyRate: data.defaultHourlyRate,
      },
    })
    return {
      id: created.id,
      name: created.name,
      isPaid: created.isPaid,
      defaultHourlyRate: decimalToString(created.defaultHourlyRate),
    }
  })

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
    const color =
      typeof input.color === 'string' && input.color.trim()
        ? input.color.trim()
        : null
    return {
      name,
      typeId,
      userId,
      hourlyRate: parseOptionalRate(input.hourlyRate),
      color,
      isActive: input.isActive === undefined ? true : Boolean(input.isActive),
    }
  })
  .handler(async ({ data }): Promise<CarePersonDto> => {
    await requireUserId()
    const type = await prisma.carePersonType.findUnique({
      where: { id: data.typeId },
    })
    if (!type) throw new Error('Person type not found.')
    if (data.userId) {
      const user = await prisma.user.findUnique({ where: { id: data.userId } })
      if (!user) throw new Error('Linked user not found.')
    }
    const created = await prisma.carePerson.create({
      data: {
        name: data.name,
        typeId: data.typeId,
        userId: data.userId,
        hourlyRate: data.hourlyRate,
        color: data.color,
        isActive: data.isActive,
      },
      include: {
        type: true,
        user: { select: { name: true, email: true } },
      },
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
    const color =
      typeof input.color === 'string' && input.color.trim()
        ? input.color.trim()
        : null
    return {
      id,
      name,
      typeId,
      userId,
      hourlyRate: parseOptionalRate(input.hourlyRate),
      color,
      isActive: Boolean(input.isActive),
    }
  })
  .handler(async ({ data }): Promise<CarePersonDto> => {
    await requireUserId()
    const updated = await prisma.carePerson.update({
      where: { id: data.id },
      data: {
        name: data.name,
        typeId: data.typeId,
        userId: data.userId,
        hourlyRate: data.hourlyRate,
        color: data.color,
        isActive: data.isActive,
      },
      include: {
        type: true,
        user: { select: { name: true, email: true } },
      },
    })
    return toPersonDto(updated)
  })

// --- Calendar ---

export type CareCalendarPayload = {
  settings: CareSettingsDto
  occurrences: CareCoverageOccurrenceDto[]
  events: CareCalendarEventDto[]
  pendingSwapCount: number
  openInvoiceCount: number
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
    await ensureDefaultTypes()

    const padStart = new Date(data.rangeStart)
    padStart.setDate(padStart.getDate() - 7)
    const padEnd = new Date(data.rangeEnd)
    padEnd.setDate(padEnd.getDate() + 90)

    await syncRequiredCoverageSeries()
    await materializeSeriesInRange(padStart, padEnd)
    await completeDueShifts()

    const settings = await loadCareSettingsDto()

    const [occurrences, events, pendingSwapCount, openInvoiceCount] =
      await Promise.all([
        prisma.careCoverageOccurrence.findMany({
          where: {
            startsAt: { lte: data.rangeEnd },
            endsAt: { gte: data.rangeStart },
            status: { not: 'CANCELLED' },
          },
          include: {
            assignee: { select: { name: true, color: true } },
            invoice: { select: { id: true } },
          },
          orderBy: { startsAt: 'asc' },
        }),
        prisma.careCalendarEvent.findMany({
          where: {
            startsAt: { lte: data.rangeEnd },
            endsAt: { gte: data.rangeStart },
          },
          orderBy: { startsAt: 'asc' },
        }),
        prisma.careSwapRequest.count({ where: { status: 'PENDING' } }),
        prisma.careInvoice.count({ where: { status: 'OPEN' } }),
      ])

    return {
      settings,
      occurrences: occurrences.map(toOccurrenceDto),
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        title: e.title,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        notes: e.notes,
      })),
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
    await requireUserId()
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
    await requireUserId()
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
    const created = await prisma.careCoverageOccurrence.create({
      data: {
        assigneeId: data.assigneeId,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        notes: data.notes,
        status: 'SCHEDULED',
      },
      include: {
        assignee: { select: { name: true, color: true } },
        invoice: { select: { id: true } },
      },
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
    await requireUserId()
    const existing = await prisma.careCoverageOccurrence.findUnique({
      where: { id: data.id },
    })
    if (!existing) throw new Error('Occurrence not found.')

    const nextAssignee =
      data.assigneeId === undefined ? existing.assigneeId : data.assigneeId
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

    const updated = await prisma.careCoverageOccurrence.update({
      where: { id: data.id },
      data: {
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      include: {
        assignee: { select: { name: true, color: true } },
        invoice: { select: { id: true } },
      },
    })
    return toOccurrenceDto(updated)
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
    await requireUserId()
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
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!
        const b = sorted[j]!
        if (a.startsAt < b.endsAt && a.endsAt > b.startsAt) {
          throw new Error('Selected slots overlap each other.')
        }
      }
    }
    for (const row of sorted) {
      if (
        await occurrencesOverlap(data.assigneeId, row.startsAt, row.endsAt)
      ) {
        throw new Error(
          'Assignee already has overlapping coverage for one of the selected slots.',
        )
      }
    }

    await prisma.$transaction(
      sorted.map((row) =>
        prisma.careCoverageOccurrence.update({
          where: { id: row.id },
          data: { assigneeId: data.assigneeId },
        }),
      ),
    )

    const updated = await prisma.careCoverageOccurrence.findMany({
      where: { id: { in: data.occurrenceIds } },
      include: {
        assignee: { select: { name: true, color: true } },
        invoice: { select: { id: true } },
      },
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
    await requireUserId()
    const series = await prisma.careCoverageSeries.findUnique({
      where: { id: data.id },
    })
    if (!series) throw new Error('Series not found.')
    if (series.isRequired) {
      throw new Error(
        'Required coverage is managed in Loved one settings. Change the schedule there instead.',
      )
    }
    await deleteRequiredSeries(series.id)
    return { id: data.id }
  })

export const createCalendarEvent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const title = typeof input.title === 'string' ? input.title.trim() : ''
    if (!title) throw new Error('Title is required.')
    const kind = input.kind
    if (
      typeof kind !== 'string' ||
      !EVENT_KINDS.includes(kind as CareCalendarEventKind)
    ) {
      throw new Error('Event kind is invalid.')
    }
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
      kind: kind as CareCalendarEventKind,
      startsAt,
      endsAt,
      notes,
    }
  })
  .handler(async ({ data }): Promise<CareCalendarEventDto> => {
    await requireUserId()
    const created = await prisma.careCalendarEvent.create({
      data: {
        title: data.title,
        kind: data.kind,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        notes: data.notes,
      },
    })
    return {
      id: created.id,
      kind: created.kind,
      title: created.title,
      startsAt: created.startsAt.toISOString(),
      endsAt: created.endsAt.toISOString(),
      notes: created.notes,
    }
  })

export const updateCalendarEvent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id : ''
    if (!id) throw new Error('Event id is required.')
    const title = typeof input.title === 'string' ? input.title.trim() : ''
    if (!title) throw new Error('Title is required.')
    const kind = input.kind
    if (
      typeof kind !== 'string' ||
      !EVENT_KINDS.includes(kind as CareCalendarEventKind)
    ) {
      throw new Error('Event kind is invalid.')
    }
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
      kind: kind as CareCalendarEventKind,
      startsAt,
      endsAt,
      notes,
    }
  })
  .handler(async ({ data }): Promise<CareCalendarEventDto> => {
    await requireUserId()
    const updated = await prisma.careCalendarEvent.update({
      where: { id: data.id },
      data: {
        title: data.title,
        kind: data.kind,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        notes: data.notes,
      },
    })
    return {
      id: updated.id,
      kind: updated.kind,
      title: updated.title,
      startsAt: updated.startsAt.toISOString(),
      endsAt: updated.endsAt.toISOString(),
      notes: updated.notes,
    }
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

    await prisma.$transaction([
      prisma.careCoverageOccurrence.update({
        where: { id: existing.relinquishOccurrenceId },
        data: { assigneeId: null },
      }),
      prisma.careCoverageOccurrence.update({
        where: { id: existing.claimOccurrenceId },
        data: { assigneeId: existing.claimForPersonId },
      }),
      prisma.careSwapRequest.update({
        where: { id: data.id },
        data: {
          status: 'APPROVED',
          reviewedByUserId: userId,
          reviewedAt: new Date(),
        },
      }),
    ])

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
    await completeDueShifts()
    const rows = await prisma.careInvoice.findMany({
      include: {
        carePerson: { select: { name: true } },
        occurrence: { select: { startsAt: true, endsAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((row) => ({
      id: row.id,
      occurrenceId: row.occurrenceId,
      carePersonId: row.carePersonId,
      carePersonName: row.carePerson.name,
      amount: row.amount.toString(),
      hourlyRateSnapshot: row.hourlyRateSnapshot.toString(),
      hoursSnapshot: row.hoursSnapshot.toString(),
      status: row.status,
      financialAccountId: row.financialAccountId,
      settledTransactionId: row.settledTransactionId,
      startsAt: row.occurrence.startsAt.toISOString(),
      endsAt: row.occurrence.endsAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }))
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
        occurrence: true,
      },
    })
    if (!invoice) throw new Error('Invoice not found.')
    if (invoice.status !== 'OPEN') {
      throw new Error('Only open invoices can be settled.')
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

    const result = await prisma.$transaction(async (tx) => {
      const createdTxn = await tx.transaction.create({
        data: {
          userId,
          financialAccountId: data.financialAccountId,
          type: 'EXPENSE',
          amount: signedAmount,
          date: invoice.occurrence.endsAt,
          description: `Care coverage payment — ${invoice.carePerson.name}`,
          payeeId: payee!.id,
        },
      })

      return tx.careInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          financialAccountId: data.financialAccountId,
          settledTransactionId: createdTxn.id,
        },
        include: {
          carePerson: { select: { name: true } },
          occurrence: { select: { startsAt: true, endsAt: true } },
        },
      })
    })

    return {
      id: result.id,
      occurrenceId: result.occurrenceId,
      carePersonId: result.carePersonId,
      carePersonName: result.carePerson.name,
      amount: result.amount.toString(),
      hourlyRateSnapshot: result.hourlyRateSnapshot.toString(),
      hoursSnapshot: result.hoursSnapshot.toString(),
      status: result.status,
      financialAccountId: result.financialAccountId,
      settledTransactionId: result.settledTransactionId,
      startsAt: result.occurrence.startsAt.toISOString(),
      endsAt: result.occurrence.endsAt.toISOString(),
      createdAt: result.createdAt.toISOString(),
    }
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
    await requireUserId()
    const invoice = await prisma.careInvoice.findUnique({
      where: { id: data.id },
    })
    if (!invoice) throw new Error('Invoice not found.')
    if (invoice.status !== 'OPEN') {
      throw new Error('Only open invoices can be voided.')
    }
    const result = await prisma.careInvoice.update({
      where: { id: data.id },
      data: { status: 'VOID' },
      include: {
        carePerson: { select: { name: true } },
        occurrence: { select: { startsAt: true, endsAt: true } },
      },
    })
    return {
      id: result.id,
      occurrenceId: result.occurrenceId,
      carePersonId: result.carePersonId,
      carePersonName: result.carePerson.name,
      amount: result.amount.toString(),
      hourlyRateSnapshot: result.hourlyRateSnapshot.toString(),
      hoursSnapshot: result.hoursSnapshot.toString(),
      status: result.status,
      financialAccountId: result.financialAccountId,
      settledTransactionId: result.settledTransactionId,
      startsAt: result.occurrence.startsAt.toISOString(),
      endsAt: result.occurrence.endsAt.toISOString(),
      createdAt: result.createdAt.toISOString(),
    }
  })
