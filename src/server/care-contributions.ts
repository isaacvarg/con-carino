import { allocateCarePeriod } from '#/lib/care-allocation'
import type { ContributorProfile } from '#/lib/care-allocation'
import {
  contributionDueDates,
  proRateToCadence,
  transferAmountFor,
} from '#/lib/care-contribution-schedule'
import type { ContributionScheduleInput } from '#/lib/care-contribution-schedule'
import { ACTIVITY_ENTITY_TYPES } from '#/lib/activity'
import { prisma } from '#/lib/prisma'
import { logActivity } from '#/server/activity-log'
import { createTransferRows } from '#/server/transactions'

/**
 * The funding side of care: opening budget periods, closing them on real cost,
 * proposing the transfers that fund the pot, and posting the ones people asked
 * to be automatic.
 *
 * These run from the job registry rather than on page load, so a period closes
 * on time whether or not anyone opens the app.
 */

const HORIZON_DAYS = 35

function toNumber(value: { toString(): string } | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = Number(value.toString())
  return Number.isFinite(n) ? n : 0
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** Period containing `now`, given a 1–28 start day. */
function periodBoundsFor(
  now: Date,
  fundingPeriodDay: number,
): { start: Date; end: Date } {
  const day = Math.min(Math.max(fundingPeriodDay, 1), 28)
  const today = startOfLocalDay(now)
  let year = today.getFullYear()
  let month = today.getMonth()
  if (today.getDate() < day) {
    month -= 1
    if (month < 0) {
      month = 11
      year -= 1
    }
  }
  const start = new Date(year, month, day)
  const nextStart = new Date(year, month + 1, day)
  return { start, end: addDays(nextStart, -1) }
}

async function loadSettings() {
  return prisma.careSettings.findUnique({ where: { id: 'default' } })
}

async function loadContributors(): Promise<{
  profiles: Array<{
    carePersonId: string
    schedule: ContributionScheduleInput
    fundingAccountId: string | null
    autoPost: boolean
  }>
  contributors: ContributorProfile[]
}> {
  const rows = await prisma.careContributionProfile.findMany({
    where: { isActive: true },
  })
  return {
    profiles: rows.map((r) => ({
      carePersonId: r.carePersonId,
      schedule: {
        cadence: r.cadence,
        intervalWeeks: r.intervalWeeks,
        anchorDate: r.anchorDate,
        monthDay: r.monthDay,
      },
      fundingAccountId: r.fundingAccountId,
      autoPost: r.autoPost,
    })),
    contributors: rows.map((r) => ({
      personId: r.carePersonId,
      basis: r.basis,
      percent: r.percent === null ? null : Number(r.percent.toString()),
      fixedAmount:
        r.fixedAmount === null ? null : Number(r.fixedAmount.toString()),
    })),
  }
}

/** Running balance per person, straight from the append-only ledger. */
async function balances(): Promise<Map<string, number>> {
  const rows = await prisma.careContributionLedgerEntry.groupBy({
    by: ['carePersonId'],
    _sum: { amount: true },
  })
  return new Map(rows.map((r) => [r.carePersonId, toNumber(r._sum.amount)]))
}

/**
 * Open the funding period covering today, if it does not exist yet.
 * Idempotent via the unique on periodStart.
 */
export async function runOpenFundingPeriod(now = new Date()) {
  const settings = await loadSettings()
  if (!settings) return { opened: 0, reason: 'no-settings' }

  const { start, end } = periodBoundsFor(now, settings.fundingPeriodDay)
  const existing = await prisma.careFundingPeriod.findUnique({
    where: { periodStart: start },
  })
  if (existing) return { opened: 0, periodStart: start.toISOString() }

  await prisma.careFundingPeriod.create({
    data: {
      periodStart: start,
      periodEnd: end,
      plannedBudget: settings.plannedMonthlyBudget ?? 0,
    },
  })
  return { opened: 1, periodStart: start.toISOString() }
}

/**
 * Close every period whose end has passed, charging each contributor their
 * actual share.
 *
 * Re-closing an already-closed period is supported and is how a voided or
 * late invoice gets corrected: the first close writes a CHARGE, and any later
 * one writes a TRUE_UP for the difference. Both are idempotent — the CHARGE
 * via the partial unique index, the TRUE_UP because a re-run with unchanged
 * actuals computes a delta of zero.
 */
export async function runCloseFundingPeriods(now = new Date()) {
  const settings = await loadSettings()
  if (!settings) return { closed: 0, reason: 'no-settings' }

  const today = startOfLocalDay(now)
  const periods = await prisma.careFundingPeriod.findMany({
    where: { periodEnd: { lt: today } },
    orderBy: { periodStart: 'asc' },
  })
  if (periods.length === 0) return { closed: 0 }

  const { contributors } = await loadContributors()
  let closed = 0
  let charges = 0
  let trueUps = 0

  for (const period of periods) {
    // A period's window is inclusive of its end date.
    const windowEnd = addDays(period.periodEnd, 1)

    const invoices = await prisma.careInvoice.findMany({
      where: {
        status: { not: 'VOID' },
        lines: { some: {} },
        OR: [
          { periodEnd: { gte: period.periodStart, lt: windowEnd } },
          {
            periodEnd: null,
            lines: {
              some: { segmentEnd: { gte: period.periodStart, lt: windowEnd } },
            },
          },
        ],
      },
      include: {
        lines: {
          include: {
            occurrence: { select: { responsiblePersonId: true } },
          },
        },
      },
    })

    const actualCost = invoices.reduce((s, inv) => s + toNumber(inv.amount), 0)

    // Carve-outs come from persisted line amounts, never recomputed: the
    // invoice is the record of what was actually charged.
    const carveMap = new Map<string, number>()
    for (const inv of invoices) {
      for (const line of inv.lines) {
        const responsible = line.occurrence.responsiblePersonId
        if (!responsible) continue
        carveMap.set(
          responsible,
          (carveMap.get(responsible) ?? 0) + toNumber(line.amount),
        )
      }
    }

    const result = allocateCarePeriod({
      periodTotal: actualCost,
      carveOuts: [...carveMap].map(([personId, amount]) => ({
        personId,
        amount,
      })),
      contributors,
      policy: settings.splitPolicy,
      backstopPersonId: settings.backstopPersonId,
    })

    for (const allocation of result.allocations) {
      const prior = await prisma.careContributionLedgerEntry.findMany({
        where: {
          fundingPeriodId: period.id,
          carePersonId: allocation.personId,
          kind: { in: ['CHARGE', 'TRUE_UP'] },
        },
      })
      const already = prior.reduce((s, e) => s + toNumber(e.amount), 0)
      const delta =
        Math.round((allocation.amountDue - already) * 10_000) / 10_000
      if (delta === 0 && prior.length > 0) continue

      const isFirst = prior.length === 0
      if (isFirst && allocation.amountDue === 0) continue

      await prisma.careContributionLedgerEntry.create({
        data: {
          carePersonId: allocation.personId,
          fundingPeriodId: period.id,
          kind: isFirst ? 'CHARGE' : 'TRUE_UP',
          amount: isFirst ? allocation.amountDue : delta,
          description: isFirst
            ? `Share of care for ${period.periodStart.toISOString().slice(0, 10)}`
            : `Adjustment after actuals changed for ${period.periodStart.toISOString().slice(0, 10)}`,
        },
      })
      if (isFirst) charges += 1
      else trueUps += 1
    }

    await prisma.careFundingPeriod.update({
      where: { id: period.id },
      data: { actualCost, status: 'CLOSED', closedAt: new Date() },
    })
    closed += 1

    await logActivity({
      actorUserId: null,
      action: 'UPDATE',
      entityType: ACTIVITY_ENTITY_TYPES.care_settings,
      entityId: period.id,
      summary: `System closed the care funding period starting ${period.periodStart.toISOString().slice(0, 10)} at $${actualCost.toFixed(2)}`,
      visibilityUserId: null,
    })
  }

  return { closed, charges, trueUps }
}

/**
 * Propose the transfers falling due in the next ~5 weeks.
 *
 * A PROPOSED row writes nothing to the ledger, so regenerating is safe: it can
 * neither double-count nor leave a dangling transfer. Only PROPOSED rows in
 * the future are ever rewritten — anything POSTED is untouchable.
 */
export async function runGenerateContributions(now = new Date()) {
  const settings = await loadSettings()
  if (!settings) return { proposed: 0, reason: 'no-settings' }

  const { profiles, contributors } = await loadContributors()
  if (profiles.length === 0) return { proposed: 0 }

  const budget = toNumber(settings.plannedMonthlyBudget)
  // Budget shares use the same allocator as the close, with no carve-outs.
  // Sharing the algorithm is what makes the eventual true-up meaningful.
  const planned = allocateCarePeriod({
    periodTotal: budget,
    carveOuts: [],
    contributors,
    policy: settings.splitPolicy,
    backstopPersonId: settings.backstopPersonId,
  })
  const monthlyShare = new Map(
    planned.allocations.map((a) => [a.personId, a.amountDue]),
  )

  const today = startOfLocalDay(now)
  const horizon = addDays(today, HORIZON_DAYS)
  const balanceByPerson = await balances()
  let proposed = 0

  for (const profile of profiles) {
    // Regenerate only unposted future rows so a changed percentage or budget
    // takes effect without disturbing anything already acted on.
    await prisma.careScheduledContribution.deleteMany({
      where: {
        carePersonId: profile.carePersonId,
        status: 'PROPOSED',
        dueOn: { gt: today },
      },
    })

    const base = proRateToCadence(
      monthlyShare.get(profile.carePersonId) ?? 0,
      profile.schedule,
    )
    const carried = balanceByPerson.get(profile.carePersonId) ?? 0

    const dueDates = contributionDueDates(profile.schedule, today, horizon)
    for (const dueOn of dueDates) {
      const existing = await prisma.careScheduledContribution.findUnique({
        where: {
          carePersonId_dueOn: { carePersonId: profile.carePersonId, dueOn },
        },
      })
      if (existing) continue

      await prisma.careScheduledContribution.create({
        data: {
          carePersonId: profile.carePersonId,
          dueOn,
          baseAmount: base,
          carriedBalance: carried,
          amount: transferAmountFor(base, carried),
          fundingAccountIdSnapshot: profile.fundingAccountId,
          status: 'PROPOSED',
        },
      })
      proposed += 1
    }
  }

  return { proposed }
}

/**
 * Post the due transfers for contributors who opted into auto-posting.
 *
 * Everyone else's rows stay PROPOSED until a human confirms them in the app.
 */
export async function runAutoPostContributions(now = new Date()) {
  const settings = await loadSettings()
  if (!settings?.coverageAccountId) {
    return { posted: 0, reason: 'no-coverage-account' }
  }

  const today = startOfLocalDay(now)
  const due = await prisma.careScheduledContribution.findMany({
    where: {
      status: 'PROPOSED',
      dueOn: { lte: today },
      carePerson: { contributionProfile: { autoPost: true, isActive: true } },
    },
    include: { carePerson: { select: { name: true, userId: true } } },
    orderBy: { dueOn: 'asc' },
  })

  let posted = 0
  let skipped = 0
  for (const row of due) {
    const result = await postContribution({
      scheduledContributionId: row.id,
      // Auto-posted rows are attributed to the contributor's own user when
      // there is one; there is no acting user in a job.
      actorUserId: row.carePerson.userId,
    })
    if (result.posted) posted += 1
    else skipped += 1
  }
  return { posted, skipped }
}

export type PostContributionResult =
  | { posted: true; transferGroupId: string }
  | { posted: false; reason: string }

/**
 * Turn a proposed contribution into real money: a transfer pair into the
 * coverage pot plus the CONTRIBUTION ledger entry that credits the person.
 *
 * All three writes share one transaction — a contribution that moved money
 * without crediting the payer would be worse than one that never ran.
 */
export async function postContribution(input: {
  scheduledContributionId: string
  actorUserId: string | null
}): Promise<PostContributionResult> {
  const settings = await loadSettings()
  if (!settings?.coverageAccountId) {
    return { posted: false, reason: 'No coverage account is configured.' }
  }

  const row = await prisma.careScheduledContribution.findUnique({
    where: { id: input.scheduledContributionId },
    include: {
      carePerson: {
        select: { name: true, userId: true, contributionProfile: true },
      },
    },
  })
  if (!row) return { posted: false, reason: 'Contribution not found.' }
  if (row.status !== 'PROPOSED') {
    return { posted: false, reason: 'This contribution is no longer pending.' }
  }

  const amount = toNumber(row.amount)
  if (amount <= 0) {
    // Nothing to move: a credit covered it. Close the row without a transfer
    // so it stops showing as outstanding.
    await prisma.careScheduledContribution.update({
      where: { id: row.id },
      data: { status: 'SKIPPED' },
    })
    return { posted: false, reason: 'Nothing due — a credit covered it.' }
  }

  const fromAccountId =
    row.fundingAccountIdSnapshot ??
    row.carePerson.contributionProfile?.fundingAccountId ??
    null
  if (!fromAccountId) {
    return { posted: false, reason: 'No funding account is set for them.' }
  }
  if (fromAccountId === settings.coverageAccountId) {
    return {
      posted: false,
      reason: 'The funding account and the coverage pot are the same account.',
    }
  }

  const [fromAccount, toAccount] = await Promise.all([
    prisma.financialAccount.findUnique({
      where: { id: fromAccountId },
      select: { name: true, isGlobal: true, userId: true },
    }),
    prisma.financialAccount.findUnique({
      where: { id: settings.coverageAccountId },
      select: { name: true, isGlobal: true },
    }),
  ])
  if (!fromAccount || !toAccount) {
    return { posted: false, reason: 'An account no longer exists.' }
  }

  // Whose name the ledger rows go under. Prefer the person clicking confirm,
  // then the contributor's own account, and finally whoever owns the funding
  // account — an offline contributor has no user of their own, and their
  // auto-posted transfer must still be attributable to somebody.
  const userId =
    input.actorUserId ?? row.carePerson.userId ?? fromAccount.userId
  if (!userId) {
    return { posted: false, reason: 'No app user to attribute the transfer to.' }
  }

  const resolvePayee = async (name: string) => {
    const existing = await prisma.payee.findFirst({
      where: { name },
      select: { id: true },
    })
    if (existing) return existing.id
    const created = await prisma.payee.create({
      data: { name },
      select: { id: true },
    })
    return created.id
  }
  const [fromPayeeId, toPayeeId] = await Promise.all([
    resolvePayee(toAccount.name),
    resolvePayee(fromAccount.name),
  ])

  const description = `Care contribution — ${row.carePerson.name}`

  const transferGroupId = await prisma.$transaction(async (tx) => {
    const transfer = await createTransferRows(tx, {
      userId,
      fromAccountId,
      toAccountId: settings.coverageAccountId!,
      magnitude: amount,
      date: row.dueOn,
      description,
      fromPayeeId,
      toPayeeId,
      fromAccount,
      toAccount,
    })

    await tx.careScheduledContribution.update({
      where: { id: row.id },
      data: {
        status: 'POSTED',
        postedAt: new Date(),
        postedByUserId: input.actorUserId,
        transferGroupId: transfer.transferGroupId,
      },
    })

    await tx.careContributionLedgerEntry.create({
      data: {
        carePersonId: row.carePersonId,
        kind: 'CONTRIBUTION',
        // Negative: paying into the pot reduces what they owe.
        amount: -amount,
        description,
        scheduledContributionId: row.id,
        transactionId: transfer.to.id,
        createdByUserId: input.actorUserId,
      },
    })

    return transfer.transferGroupId
  })

  return { posted: true, transferGroupId }
}
