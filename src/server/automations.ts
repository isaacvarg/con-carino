/**
 * Automations: rules that write transactions or send alerts on the family's
 * behalf.
 *
 * This module is imported by the settings route loader, which puts it in the
 * client import graph. Every export that is not a `createServerFn` is therefore
 * wrapped in `createServerOnlyFn` — same rule, and same reason, as
 * `care-modules.ts`: a plain export keeps its references alive in the browser
 * build, including `prisma`, which drags the pg driver in and breaks hydration
 * app-wide.
 *
 * Every decision this file makes — does a transaction match, how much is the
 * new one for, should an alert go out — lives in a pure, tested function under
 * `src/lib/`. What is left here is I/O: read, write, log, mail. Keep it that
 * way; `src/server/*` is untested by convention.
 */

import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import type { Prisma } from '#/generated/prisma/client'
import {
  ACTIVITY_ENTITY_TYPES,
  createChanges,
  diffChanges,
} from '#/lib/activity'
import {
  duplicateMagnitude,
  percentMatchMagnitude,
  roundsToZero,
} from '#/lib/automation-amount'
import type { AutomationInput } from '#/lib/automation-input'
import { parseAutomationInput } from '#/lib/automation-input'
import { selectTriggeredAutomations } from '#/lib/automation-matching'
import { evaluateLowBalance } from '#/lib/automation-low-balance'
import {
  buildAccountUrl,
  buildLowBalanceEmail,
} from '#/lib/automation-notify'
import type {
  AutomationDto,
  AutomationRunDto,
  AutomationRunStatus,
} from '#/lib/automation-types'
import { sendEmail } from '#/lib/email'
import { prisma } from '#/lib/prisma'
import { isUniqueViolation } from '#/lib/prisma-errors'
import { resolveAppOrigin } from '#/lib/swap-notify'
import { TAXONOMY_COLOR_SELECT } from '#/lib/taxonomy-types'
import {
  signedAmountFor,
  TRANSACTION_TYPE_REF_SELECT,
  type TransactionTypeRef,
} from '#/lib/transaction-types'
import { currentBalancesForAccounts } from '#/server/accounts'
import { logActivity } from '#/server/activity-log'
import { authConfig } from '#/utils/auth'

const AUTOMATION_ACTIVITY_FIELDS = [
  'name',
  'kind',
  'isEnabled',
  'financialAccountId',
  'type',
  'categoryId',
  'tagIds',
  'targetAccountId',
  'percent',
  'thresholdAmount',
  'notifyUserId',
] as const

const TRANSACTION_ACTIVITY_FIELDS = [
  'financialAccountId',
  'type',
  'amount',
  'description',
  'date',
  'weekStart',
  'payeeId',
  'categoryId',
  'transferGroupId',
] as const

const ACCOUNT_REF_SELECT = { id: true, name: true } as const
const USER_REF_SELECT = { id: true, name: true, email: true } as const

const AUTOMATION_INCLUDE = {
  triggerAccount: { select: ACCOUNT_REF_SELECT },
  targetAccount: { select: ACCOUNT_REF_SELECT },
  triggerCategory: { select: TAXONOMY_COLOR_SELECT },
  triggerType: { select: TRANSACTION_TYPE_REF_SELECT },
  triggerTags: { select: TAXONOMY_COLOR_SELECT, orderBy: { name: 'asc' } },
  notifyUser: { select: USER_REF_SELECT },
  runs: { orderBy: { createdAt: 'desc' }, take: 1 },
} as const

async function requireUserId() {
  const request = getRequest()
  const session = await getSession(request, authConfig)
  const userId = session?.user?.id
  if (!userId) {
    throw new Error('You must be signed in to manage automations.')
  }
  return userId
}

function ownOrGlobal(userId: string) {
  return {
    OR: [{ userId }, { isGlobal: true }],
  }
}

/** A rule may only reference accounts its author can see. */
async function assertAccountVisible(userId: string, accountId: string) {
  const account = await prisma.financialAccount.findFirst({
    where: { AND: [{ id: accountId }, ownOrGlobal(userId)] },
    select: { id: true, name: true },
  })
  if (!account) {
    throw new Error('Account not found.')
  }
  return account
}

/**
 * A rule may only watch a live, non-directional type.
 *
 * DIRECTIONAL types are excluded because `applyAutomation` signs the row it
 * creates with no direction argument — there is nobody to ask at that point.
 * This replaces the hand-written `AUTOMATION_TRIGGER_TYPES` list, which would
 * have gone stale the first time an admin added a type.
 */
async function assertUsableTriggerType(typeId: string) {
  const type = await prisma.transactionTypeDef.findUnique({
    where: { id: typeId },
    select: { id: true, label: true, sign: true, archivedAt: true },
  })
  if (!type) throw new Error('Transaction type not found.')
  if (type.archivedAt) {
    throw new Error(`“${type.label}” is archived and cannot be watched.`)
  }
  if (type.sign === 'DIRECTIONAL') {
    throw new Error(
      `“${type.label}” asks for a direction on each entry, so an automation cannot watch it.`,
    )
  }
}

async function assertInputReferences(userId: string, input: AutomationInput) {
  await assertAccountVisible(userId, input.triggerAccountId)
  if (input.targetAccountId) {
    await assertAccountVisible(userId, input.targetAccountId)
  }
  if (input.triggerTypeId) {
    await assertUsableTriggerType(input.triggerTypeId)
  }
  if (input.notifyUserId) {
    const user = await prisma.user.findUnique({
      where: { id: input.notifyUserId },
      select: { id: true },
    })
    if (!user) throw new Error('The person to notify was not found.')
  }
}

// Derived from the generated payload type rather than `typeof prisma.…`: a
// `typeof prisma` anywhere, even in a type position, is enough to keep the
// client alive through the server-fn stubbing pass and drag the pg driver into
// the browser bundle.
type AutomationRow = Prisma.AutomationGetPayload<{
  include: typeof AUTOMATION_INCLUDE
}>

function toRunDto(run: {
  id: string
  status: AutomationRunStatus
  detail: string | null
  createdAt: Date
  createdTransactionId: string | null
}): AutomationRunDto {
  return {
    id: run.id,
    status: run.status,
    detail: run.detail,
    createdAt: run.createdAt.toISOString(),
    createdTransactionId: run.createdTransactionId,
  }
}

function toAutomationDto(row: AutomationRow): AutomationDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    isEnabled: row.isEnabled,
    triggerAccount: row.triggerAccount,
    triggerType: row.triggerType,
    triggerTags: row.triggerTags,
    triggerCategory: row.triggerCategory,
    targetAccount: row.targetAccount,
    percent: row.percent?.toString() ?? null,
    thresholdAmount: row.thresholdAmount?.toString() ?? null,
    notifyUser: row.notifyUser,
    alertingSince: row.alertingSince?.toISOString() ?? null,
    lastAlertedAt: row.lastAlertedAt?.toISOString() ?? null,
    lastRun: row.runs[0] ? toRunDto(row.runs[0]) : null,
  }
}

/** The shape `diffChanges` compares, so create and update read alike. */
function activitySnapshot(row: AutomationRow): Record<string, unknown> {
  return {
    name: row.name,
    kind: row.kind,
    isEnabled: row.isEnabled,
    financialAccountId: row.triggerAccountId,
    type: row.triggerType?.label ?? null,
    categoryId: row.triggerCategoryId,
    tagIds: row.triggerTags.map((tag) => tag.id),
    targetAccountId: row.targetAccountId,
    percent: row.percent?.toString() ?? null,
    thresholdAmount: row.thresholdAmount?.toString() ?? null,
    notifyUserId: row.notifyUserId,
  }
}

function writeData(input: AutomationInput) {
  return {
    name: input.name,
    isEnabled: input.isEnabled,
    triggerAccountId: input.triggerAccountId,
    triggerTypeId: input.triggerTypeId,
    triggerCategoryId: input.triggerCategoryId,
    targetAccountId: input.targetAccountId,
    percent: input.percent,
    thresholdAmount: input.thresholdAmount,
    notifyUserId: input.notifyUserId,
  }
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

export const listAutomations = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AutomationDto[]> => {
    await requireUserId()
    const rows = await prisma.automation.findMany({
      include: AUTOMATION_INCLUDE,
      orderBy: [{ createdAt: 'asc' }],
    })
    return rows.map(toAutomationDto)
  },
)

export const createAutomation = createServerFn({ method: 'POST' })
  .validator(parseAutomationInput)
  .handler(async ({ data }): Promise<AutomationDto> => {
    const userId = await requireUserId()
    await assertInputReferences(userId, data)

    const created = await prisma.automation.create({
      data: {
        ...writeData(data),
        kind: data.kind,
        createdByUserId: userId,
        ...(data.triggerTagIds.length > 0
          ? { triggerTags: { connect: data.triggerTagIds.map((id) => ({ id })) } }
          : {}),
      },
      include: AUTOMATION_INCLUDE,
    })

    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.automation,
      entityId: created.id,
      summary: `Created automation “${created.name}”`,
      changes: createChanges(activitySnapshot(created), AUTOMATION_ACTIVITY_FIELDS),
    })

    return toAutomationDto(created)
  })

export const updateAutomation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id.trim() : ''
    if (!id) throw new Error('Automation id is required.')
    return { id, input: parseAutomationInput(data) }
  })
  .handler(async ({ data }): Promise<AutomationDto> => {
    const userId = await requireUserId()
    const existing = await prisma.automation.findUnique({
      where: { id: data.id },
      include: AUTOMATION_INCLUDE,
    })
    if (!existing) throw new Error('Automation not found.')
    if (existing.kind !== data.input.kind) {
      // Changing kind would strand the per-kind columns and trip the
      // automations_kind_shape_check constraint.
      throw new Error(
        "An automation's kind cannot be changed. Delete it and create a new one.",
      )
    }
    await assertInputReferences(userId, data.input)

    // A new floor deserves a fresh evaluation rather than inheriting a
    // suppressed one: without this, raising the threshold would stay silent
    // until the old 24h window expired.
    const thresholdChanged =
      existing.thresholdAmount?.toString() !==
      (data.input.thresholdAmount === null
        ? undefined
        : String(data.input.thresholdAmount))

    const updated = await prisma.automation.update({
      where: { id: data.id },
      data: {
        ...writeData(data.input),
        triggerTags: { set: data.input.triggerTagIds.map((id) => ({ id })) },
        ...(thresholdChanged ? { alertingSince: null, lastAlertedAt: null } : {}),
      },
      include: AUTOMATION_INCLUDE,
    })

    await logActivity({
      actorUserId: userId,
      action: 'UPDATE',
      entityType: ACTIVITY_ENTITY_TYPES.automation,
      entityId: updated.id,
      summary: `Updated automation “${updated.name}”`,
      changes: diffChanges(
        activitySnapshot(existing),
        activitySnapshot(updated),
        AUTOMATION_ACTIVITY_FIELDS,
      ),
    })

    return toAutomationDto(updated)
  })

export const setAutomationEnabled = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id.trim() : ''
    if (!id) throw new Error('Automation id is required.')
    return { id, isEnabled: Boolean(input.isEnabled) }
  })
  .handler(async ({ data }): Promise<AutomationDto> => {
    const userId = await requireUserId()
    const updated = await prisma.automation.update({
      where: { id: data.id },
      data: {
        isEnabled: data.isEnabled,
        // Turning a balance alert off then on again should not resume a
        // half-served 24h window.
        ...(data.isEnabled ? {} : { alertingSince: null, lastAlertedAt: null }),
      },
      include: AUTOMATION_INCLUDE,
    })

    await logActivity({
      actorUserId: userId,
      action: 'UPDATE',
      entityType: ACTIVITY_ENTITY_TYPES.automation,
      entityId: updated.id,
      summary: `${data.isEnabled ? 'Enabled' : 'Disabled'} automation “${updated.name}”`,
      changes: {
        isEnabled: { before: !data.isEnabled, after: data.isEnabled },
      },
    })

    return toAutomationDto(updated)
  })

export const deleteAutomation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id.trim() : ''
    if (!id) throw new Error('Automation id is required.')
    return { id }
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const userId = await requireUserId()
    const deleted = await prisma.automation.delete({
      where: { id: data.id },
      select: { id: true, name: true },
    })

    await logActivity({
      actorUserId: userId,
      action: 'DELETE',
      entityType: ACTIVITY_ENTITY_TYPES.automation,
      entityId: deleted.id,
      summary: `Deleted automation “${deleted.name}”`,
    })

    return { id: deleted.id }
  })

export const listAutomationRuns = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>
    const automationId =
      typeof input.automationId === 'string' ? input.automationId.trim() : ''
    if (!automationId) throw new Error('Automation id is required.')
    return { automationId }
  })
  .handler(async ({ data }): Promise<AutomationRunDto[]> => {
    await requireUserId()
    const runs = await prisma.automationRun.findMany({
      where: { automationId: data.automationId },
      orderBy: { createdAt: 'desc' },
      take: 25,
    })
    return runs.map(toRunDto)
  })

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

function toErrorText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.slice(0, 500)
}

async function recordRun(
  automationId: string,
  sourceTransactionId: string | null,
  status: AutomationRunStatus,
  detail: string | null,
) {
  try {
    await prisma.automationRun.create({
      data: { automationId, sourceTransactionId, status, detail },
    })
  } catch (err) {
    // A duplicate claim is the expected outcome of a re-run, and a bookkeeping
    // failure must not escalate into a failed automation.
    if (!isUniqueViolation(err)) {
      console.error('[automations] Could not record a run:', err)
    }
  }
}

type SourceTransaction = {
  id: string
  userId: string
  financialAccountId: string
  type: TransactionTypeRef
  amount: { toString(): string }
  date: Date
  description: string | null
  weekStart: string | null
  payeeId: string | null
  categoryId: string | null
  createdByAutomationId: string | null
  tags: Array<{ id: string }>
}

type TransactionAutomation = {
  id: string
  name: string
  kind: 'DUPLICATE_TO_ACCOUNT' | 'PERCENT_MATCH' | 'LOW_BALANCE_ALERT'
  isEnabled: boolean
  triggerAccountId: string
  triggerTypeId: string | null
  triggerCategoryId: string | null
  triggerTagIds: string[]
  targetAccountId: string | null
  percent: { toString(): string } | null
}

/**
 * Create the transaction one rule calls for.
 *
 * Returns true when a row was written. The AutomationRun is claimed *first*
 * inside the same `$transaction`: the `[automationId, sourceTransactionId]`
 * unique means a second attempt for the same source loses the insert and backs
 * out, which is what keeps a retry from doubling the ledger. Same claim-by-
 * insert idiom the job runner uses for scheduling buckets.
 */
async function applyAutomation(
  automation: TransactionAutomation,
  source: SourceTransaction,
): Promise<boolean> {
  const signedAmount = Number(source.amount.toString())
  const magnitude =
    automation.kind === 'PERCENT_MATCH'
      ? percentMatchMagnitude(
          signedAmount,
          Number(automation.percent?.toString() ?? '0'),
        )
      : duplicateMagnitude(signedAmount)

  if (roundsToZero(magnitude)) {
    await recordRun(automation.id, source.id, 'SKIPPED', 'rounds-to-zero')
    return false
  }

  const targetAccountId = automation.targetAccountId
  if (!targetAccountId) {
    await recordRun(automation.id, source.id, 'FAILED', 'no target account')
    return false
  }

  // Archiving the target does not disable the rule, so without this the
  // automation keeps writing rows into an account every cross-account view
  // filters out — invisible money. Skipped rather than failed: nothing is
  // broken, the destination is just out of use.
  const targetArchived = await prisma.financialAccount.findFirst({
    where: { id: targetAccountId, archivedAt: { not: null } },
    select: { id: true },
  })
  if (targetArchived) {
    await recordRun(
      automation.id,
      source.id,
      'SKIPPED',
      'target account archived',
    )
    return false
  }

  const tagIds = source.tags.map((tag) => tag.id)

  let created
  try {
    created = await prisma.$transaction(async (tx) => {
      const run = await tx.automationRun.create({
        data: {
          automationId: automation.id,
          sourceTransactionId: source.id,
          status: 'APPLIED',
        },
        select: { id: true },
      })
      const txn = await tx.transaction.create({
        data: {
          userId: source.userId,
          financialAccountId: targetAccountId,
          typeId: source.type.id,
          // No direction argument: only DIRECTIONAL types need one, and
          // `assertUsableTriggerType` refuses to let a rule watch one.
          amount: signedAmountFor(source.type, magnitude),
          date: source.date,
          description: source.description ?? `Automation: ${automation.name}`,
          // Carried over with the rest of the organizing fields: a copy filed
          // under a different week than its source would be a surprise.
          weekStart: source.weekStart,
          payeeId: source.payeeId,
          categoryId: source.categoryId,
          createdByAutomationId: automation.id,
          ...(tagIds.length > 0
            ? { tags: { connect: tagIds.map((id) => ({ id })) } }
            : {}),
        },
        include: {
          financialAccount: {
            select: { name: true, isGlobal: true, userId: true },
          },
          type: { select: TRANSACTION_TYPE_REF_SELECT },
        },
      })
      await tx.automationRun.update({
        where: { id: run.id },
        data: {
          createdTransactionId: txn.id,
          detail: `${automation.kind === 'PERCENT_MATCH' ? `${automation.percent?.toString() ?? ''}% of ` : ''}${Math.abs(signedAmount).toFixed(2)}`,
        },
      })
      return txn
    })
  } catch (err) {
    if (isUniqueViolation(err)) return false
    throw err
  }

  const amountLabel = Math.abs(Number(created.amount.toString())).toFixed(2)
  await logActivity({
    // No actor: nobody clicked this.
    actorUserId: null,
    action: 'CREATE',
    entityType: ACTIVITY_ENTITY_TYPES.transaction,
    entityId: created.id,
    summary: `Automation “${automation.name}” created ${created.type.label.toLowerCase()} of $${amountLabel} on ${created.financialAccount.name}`,
    changes: createChanges(
      {
        financialAccountId: created.financialAccountId,
        type: created.type.label,
        amount: created.amount.toString(),
        description: created.description,
        date: created.date.toISOString(),
        weekStart: created.weekStart,
        payeeId: created.payeeId,
        categoryId: created.categoryId,
        transferGroupId: created.transferGroupId,
      },
      TRANSACTION_ACTIVITY_FIELDS,
    ),
    linkMeta: {
      isGlobal: created.financialAccount.isGlobal,
      accountName: created.financialAccount.name,
    },
    visibilityUserId: created.financialAccount.userId,
  })

  return true
}

export type AutomationDispatchResult = {
  fired: number
  skipped: number
  failed: number
}

/**
 * Run every transaction-triggered rule against one freshly created row.
 *
 * Never throws. Each rule is isolated so one broken automation cannot stop the
 * others, and the caller in `createTransaction` is protected from all of it —
 * a failure here must never fail the transaction the user just saved.
 */
export const runAutomationsForTransaction = createServerOnlyFn(
  async (sourceTransactionId: string): Promise<AutomationDispatchResult> => {
    const result: AutomationDispatchResult = { fired: 0, skipped: 0, failed: 0 }

    // Re-read rather than trusting a passed-in row: this sees committed state
    // and makes the function reusable from a backfill or a "run now" button.
    const source = await prisma.transaction.findUnique({
      where: { id: sourceTransactionId },
      select: {
        id: true,
        userId: true,
        financialAccountId: true,
        type: { select: TRANSACTION_TYPE_REF_SELECT },
        amount: true,
        date: true,
        description: true,
        weekStart: true,
        payeeId: true,
        categoryId: true,
        createdByAutomationId: true,
        tags: { select: { id: true } },
      },
    })
    if (!source) return result

    const touchedAccountIds = new Set<string>([source.financialAccountId])

    const candidates = await prisma.automation.findMany({
      where: {
        isEnabled: true,
        kind: { in: ['DUPLICATE_TO_ACCOUNT', 'PERCENT_MATCH'] },
        triggerAccountId: source.financialAccountId,
      },
      include: { triggerTags: { select: { id: true } } },
    })

    const matched = selectTriggeredAutomations(
      candidates.map((automation) => ({
        ...automation,
        triggerTagIds: automation.triggerTags.map((tag) => tag.id),
      })),
      {
        id: source.id,
        financialAccountId: source.financialAccountId,
        typeId: source.type.id,
        tagIds: source.tags.map((tag) => tag.id),
        categoryId: source.categoryId,
        createdByAutomationId: source.createdByAutomationId,
      },
    )

    for (const automation of matched) {
      try {
        const applied = await applyAutomation(automation, source)
        if (applied) {
          result.fired += 1
          if (automation.targetAccountId) {
            touchedAccountIds.add(automation.targetAccountId)
          }
        } else {
          result.skipped += 1
        }
      } catch (err) {
        result.failed += 1
        console.error(
          `[automations] Automation ${automation.id} failed on transaction ${source.id}:`,
          err,
        )
        await recordRun(automation.id, source.id, 'FAILED', toErrorText(err))
      }
    }

    // Deliberately outside the loop-prevention gate above: an automation's own
    // withdrawal landing in a watched pot is exactly the event that should trip
    // a low-balance alert. Only the transaction-creating kinds need the guard.
    try {
      await runLowBalanceAlerts(new Date(), [...touchedAccountIds])
    } catch (err) {
      console.error('[automations] Low-balance check failed:', err)
    }

    return result
  },
)

export type LowBalanceSweepResult = {
  checked: number
  alerted: number
  cleared: number
}

/**
 * Evaluate low-balance rules. `accountIds` narrows the sweep to the accounts a
 * just-posted transaction touched; omit it for the job's full pass.
 *
 * The instant path and the hourly job share this function and the same two
 * state columns, so they cannot double-send: whichever runs first writes
 * `lastAlertedAt` and the other reads back `quiet`.
 */
export const runLowBalanceAlerts = createServerOnlyFn(
  async (
    now: Date = new Date(),
    accountIds?: string[],
  ): Promise<LowBalanceSweepResult> => {
    const result: LowBalanceSweepResult = { checked: 0, alerted: 0, cleared: 0 }

    const automations = await prisma.automation.findMany({
      where: {
        kind: 'LOW_BALANCE_ALERT',
        isEnabled: true,
        // No point emailing about an account nobody can see any more.
        triggerAccount: { archivedAt: null },
        ...(accountIds ? { triggerAccountId: { in: accountIds } } : {}),
      },
      include: {
        triggerAccount: { select: { id: true, name: true, initialBalance: true } },
        notifyUser: { select: USER_REF_SELECT },
      },
    })
    if (automations.length === 0) return result

    const accounts = [
      ...new Map(
        automations.map((a) => [a.triggerAccount.id, a.triggerAccount]),
      ).values(),
    ]
    const balances = await currentBalancesForAccounts(accounts)

    // The job path has no request, so AUTH_URL is the only origin it can use.
    let requestUrl: string | null = null
    try {
      requestUrl = getRequest().url
    } catch {
      // Not in a request; AUTH_URL alone decides.
    }
    const origin = resolveAppOrigin({
      authUrl: process.env.AUTH_URL,
      requestUrl,
    })

    for (const automation of automations) {
      result.checked += 1
      try {
        const balance = Number(balances.get(automation.triggerAccount.id) ?? '0')
        const threshold = Number(automation.thresholdAmount?.toString() ?? '0')
        const decision = evaluateLowBalance({
          balance,
          threshold,
          state: {
            alertingSince: automation.alertingSince,
            lastAlertedAt: automation.lastAlertedAt,
          },
          now,
        })

        if (decision.action === 'quiet') continue

        if (decision.action === 'clear') {
          await prisma.automation.update({
            where: { id: automation.id },
            data: { alertingSince: null, lastAlertedAt: null },
          })
          result.cleared += 1
          continue
        }

        const email = buildLowBalanceEmail({
          automationName: automation.name,
          accountName: automation.triggerAccount.name,
          balance,
          threshold,
          accountUrl: origin
            ? buildAccountUrl(origin, automation.triggerAccount.id)
            : null,
        })

        let outcome = 'no recipient email'
        const to = automation.notifyUser?.email?.trim()
        if (to) {
          try {
            const sent = await sendEmail({ to, ...email })
            outcome = sent.sent ? 'email sent' : `email skipped: ${sent.reason}`
          } catch (err) {
            // A send failure must never fail the sweep.
            outcome = `email failed: ${toErrorText(err)}`
          }
        }

        // State advances whatever the mail did. Otherwise a dev install with no
        // AUTH_RESEND_KEY — where sendEmail no-ops by design — would retry
        // every hour forever. The outcome is recorded on the run instead.
        await prisma.automation.update({
          where: { id: automation.id },
          data: {
            alertingSince: decision.nextAlertingSince,
            lastAlertedAt: decision.nextLastAlertedAt,
          },
        })
        await recordRun(
          automation.id,
          null,
          'APPLIED',
          `${balance.toFixed(2)} below ${threshold.toFixed(2)}; ${outcome}`,
        )
        result.alerted += 1
      } catch (err) {
        console.error(
          `[automations] Low-balance rule ${automation.id} failed:`,
          err,
        )
        await recordRun(automation.id, null, 'FAILED', toErrorText(err))
      }
    }

    return result
  },
)
