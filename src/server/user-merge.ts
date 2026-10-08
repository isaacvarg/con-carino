/**
 * Folding one app user into another — the fix for a family member who signed
 * in once with Google and later by magic link with a different address, and
 * so ended up as two users with two caregiver records.
 *
 * Wrapped in `createServerOnlyFn` for the same reason as everything in
 * src/server/auth-guards.ts: src/server/users.ts imports this and is itself
 * pulled into the client graph by route files.
 */

import { createServerOnlyFn } from '@tanstack/react-start'
import type { Prisma } from '#/generated/prisma/client'
import { ACTIVITY_ENTITY_TYPES } from '#/lib/activity'
import { normalizeEmail } from '#/lib/user-email'
import { logActivity } from '#/server/activity-log'
import { repointCarePersonRefs } from '#/server/care'

type Tx = Prisma.TransactionClient

/**
 * Every column holding a User id that the merge simply repoints. Columns that
 * need a decision (1:1 links, sessions) are in USER_REFERENCES_HANDLED_SEPARATELY.
 *
 * src/server/user-merge.test.ts parses prisma/models and fails if a column that
 * references User is in neither list. That matters: most of these relations
 * cascade, so a column missed here would be silently deleted along with the
 * merged user instead of moved.
 */
export const USER_REFERENCE_COLUMNS = [
  { model: 'account', field: 'userId' },
  { model: 'financialAccount', field: 'userId' },
  { model: 'accountGroup', field: 'userId' },
  { model: 'transaction', field: 'userId' },
  { model: 'transaction', field: 'reconciliationUpdatedById' },
  { model: 'attachment', field: 'userId' },
  { model: 'document', field: 'userId' },
  { model: 'careSwapRequest', field: 'requestedByUserId' },
  { model: 'careSwapRequest', field: 'reviewedByUserId' },
  { model: 'careHireRequest', field: 'requestedByUserId' },
  { model: 'careHireRequest', field: 'reviewedByUserId' },
  { model: 'activityLog', field: 'actorUserId' },
  { model: 'activityLog', field: 'visibilityUserId' },
  { model: 'careContributionLedgerEntry', field: 'createdByUserId' },
  { model: 'careScheduledContribution', field: 'postedByUserId' },
  // Plain column, no relation — easy to miss, which is why it is listed.
  { model: 'careCoverageOccurrence', field: 'responsibleSetByUserId' },
  { model: 'automation', field: 'notifyUserId' },
  { model: 'automation', field: 'createdByUserId' },
  { model: 'userEmail', field: 'userId' },
] as const

/** Handled explicitly in mergeUserInto rather than by a plain repoint. */
export const USER_REFERENCES_HANDLED_SEPARATELY = [
  // Revoked: the merged user's devices sign in again as the kept user.
  { model: 'session', field: 'userId' },
  // Unique per user — moved only when the kept user has none.
  { model: 'userConfiguration', field: 'userId' },
  // Unique per user — merged via repointCarePersonRefs.
  { model: 'carePerson', field: 'userId' },
] as const

type RepointDelegate = {
  updateMany(args: {
    where: Record<string, string>
    data: Record<string, string>
  }): Promise<{ count: number }>
  count(args: { where: Record<string, string> }): Promise<number>
}

function delegateFor(tx: Tx, model: string): RepointDelegate {
  return (tx as unknown as Record<string, RepointDelegate>)[model]
}

/**
 * Throws with an admin-readable message when the merge cannot go ahead. Runs
 * inside the transaction so the checks and the writes see the same rows.
 */
async function assertMergeable(
  tx: Tx,
  keepId: string,
  mergeId: string,
): Promise<void> {
  const [keepPerson, mergePerson] = await Promise.all([
    tx.carePerson.findUnique({ where: { userId: keepId }, select: { id: true } }),
    tx.carePerson.findUnique({
      where: { userId: mergeId },
      select: { id: true },
    }),
  ])
  if (keepPerson && mergePerson) {
    const [keepProfile, mergeProfile] = await Promise.all([
      tx.careContributionProfile.count({
        where: { carePersonId: keepPerson.id },
      }),
      tx.careContributionProfile.count({
        where: { carePersonId: mergePerson.id },
      }),
    ])
    if (keepProfile > 0 && mergeProfile > 0) {
      throw new Error(
        'Both users’ care people have a contribution profile — remove one before merging.',
      )
    }
  }
}

async function mergeCarePersonOfUser(
  tx: Tx,
  keepId: string,
  mergeId: string,
): Promise<void> {
  const [keepPerson, mergePerson] = await Promise.all([
    tx.carePerson.findUnique({ where: { userId: keepId } }),
    tx.carePerson.findUnique({ where: { userId: mergeId } }),
  ])
  if (!mergePerson) return

  if (!keepPerson) {
    // Nothing to merge into: the record simply changes owner. If the merged
    // user had been archived its person was archived with it; the kept user is
    // live, so bring the record back (but leave isActive — putting them back
    // on the schedule is a separate decision, as in restoreUser).
    await tx.carePerson.update({
      where: { id: mergePerson.id },
      data: { userId: keepId, archivedAt: null },
    })
    return
  }

  await repointCarePersonRefs(tx, keepPerson.id, mergePerson.id)
  // At most one side has a profile (assertMergeable), so this is a plain move.
  await tx.careContributionProfile.updateMany({
    where: { carePersonId: mergePerson.id },
    data: { carePersonId: keepPerson.id },
  })

  // The kept record's expected sign-in email wins; take the other only if
  // it has none. Clear first — the column is unique.
  const takeEmail = !keepPerson.email && mergePerson.email
  await tx.carePerson.update({
    where: { id: mergePerson.id },
    data: { userId: null, email: null },
  })
  await tx.carePerson.delete({ where: { id: mergePerson.id } })
  if (takeEmail) {
    await tx.carePerson.update({
      where: { id: keepPerson.id },
      data: { email: mergePerson.email },
    })
  }
}

/**
 * Absorb user `mergeId` into user `keepId` in one transaction: every row they
 * own or authored moves over, their caregiver record merges into the kept
 * one, their sign-in methods (Google/Discord links and their email, now an
 * alias) move over, and the emptied user row is deleted. Before deleting, it
 * re-counts every repointed column and aborts if anything still points at the
 * merged user, so a missed column can never be cascaded away.
 */
export const mergeUserInto = createServerOnlyFn(
  async (
    tx: Tx,
    input: { keepId: string; mergeId: string; actorUserId: string },
  ): Promise<{ movedRows: number }> => {
    const { keepId, mergeId, actorUserId } = input
    const [keep, merge] = await Promise.all([
      tx.user.findUnique({ where: { id: keepId } }),
      tx.user.findUnique({ where: { id: mergeId } }),
    ])
    if (!keep) throw new Error('User to keep not found.')
    if (!merge) throw new Error('User to merge not found.')
    if (keep.archivedAt) {
      throw new Error('Restore the user to keep before merging into them.')
    }

    await assertMergeable(tx, keepId, mergeId)
    await mergeCarePersonOfUser(tx, keepId, mergeId)

    const keepConfig = await tx.userConfiguration.count({
      where: { userId: keepId },
    })
    if (keepConfig === 0) {
      await tx.userConfiguration.updateMany({
        where: { userId: mergeId },
        data: { userId: keepId },
      })
    }
    await tx.session.deleteMany({ where: { userId: mergeId } })

    let movedRows = 0
    for (const { model, field } of USER_REFERENCE_COLUMNS) {
      const result = await delegateFor(tx, model).updateMany({
        where: { [field]: mergeId },
        data: { [field]: keepId },
      })
      movedRows += result.count
    }

    // Activity rows *about* the merged user (profile edits, revoked
    // sessions) follow them too, so the kept user's history is complete.
    await tx.activityLog.updateMany({
      where: {
        entityId: mergeId,
        entityType: {
          in: [ACTIVITY_ENTITY_TYPES.user, ACTIVITY_ENTITY_TYPES.session],
        },
      },
      data: { entityId: keepId },
    })

    for (const { model, field } of USER_REFERENCE_COLUMNS) {
      const left = await delegateFor(tx, model).count({
        where: { [field]: mergeId },
      })
      if (left > 0) {
        throw new Error(
          `Merge aborted: ${left} ${model}.${field} row(s) still point at the merged user. Nothing was changed.`,
        )
      }
    }

    await tx.user.delete({ where: { id: mergeId } })

    // Their address keeps working for magic links — as the kept user.
    const mergeEmail = merge.email ? normalizeEmail(merge.email) : null
    const keepEmail = keep.email ? normalizeEmail(keep.email) : null
    await tx.user.update({
      where: { id: keepId },
      data: {
        isAdmin: keep.isAdmin || merge.isAdmin,
        name: keep.name ?? merge.name,
        image: keep.image ?? merge.image,
        ...(keep.email === null && merge.email
          ? { email: merge.email, emailVerified: merge.emailVerified }
          : {}),
      },
    })
    if (keep.email !== null && mergeEmail && mergeEmail !== keepEmail) {
      await tx.userEmail.upsert({
        where: { email: mergeEmail },
        create: { email: mergeEmail, userId: keepId },
        update: { userId: keepId },
      })
    }

    const keepLabel = keep.name ?? keep.email ?? keep.id
    const mergeLabel = merge.name ?? merge.email ?? merge.id
    await logActivity(
      {
        actorUserId,
        action: 'DELETE',
        entityType: ACTIVITY_ENTITY_TYPES.user,
        entityId: keepId,
        summary: `Merged user ${mergeLabel}${merge.email && merge.name ? ` (${merge.email})` : ''} into ${keepLabel}`,
        visibilityUserId: null,
      },
      tx,
    )

    return { movedRows }
  },
)
