import { beforeEach, describe, expect, it, vi } from 'vitest'

// Stubbed so this stays a pure unit test — the real module reaches for prisma,
// and the branching logic under test never touches the database itself.
const logActivity = vi.fn()
vi.mock('#/server/activity-log', () => ({ logActivity }))

const { archiveOrDelete, restoreArchived } = await import('#/server/archive')

type Calls = {
  hardDelete: number
  archive: number
}

function harness(refCount: number) {
  const calls: Calls = { hardDelete: 0, archive: 0 }
  return {
    calls,
    options: {
      entityType: 'payee' as const,
      id: 'payee-1',
      label: 'Coffee Shop',
      actorUserId: 'user-1',
      countRefs: async () => refCount,
      hardDelete: async () => {
        calls.hardDelete += 1
      },
      archive: async () => {
        calls.archive += 1
      },
    },
  }
}

beforeEach(() => {
  logActivity.mockClear()
})

describe('archiveOrDelete', () => {
  it('deletes outright when nothing references it', async () => {
    const { calls, options } = harness(0)

    const result = await archiveOrDelete({ ...options, allowArchive: true })

    expect(result).toEqual({ outcome: 'deleted', refCount: 0 })
    expect(calls).toEqual({ hardDelete: 1, archive: 0 })
    expect(logActivity).toHaveBeenCalledTimes(1)
    expect(logActivity.mock.calls[0][0]).toMatchObject({
      action: 'DELETE',
      entityType: 'payee',
      entityId: 'payee-1',
    })
  })

  it('archives instead once anything references it', async () => {
    const { calls, options } = harness(3)

    const result = await archiveOrDelete({ ...options, allowArchive: true })

    expect(result).toEqual({ outcome: 'archived', refCount: 3 })
    expect(calls).toEqual({ hardDelete: 0, archive: 1 })
    // UPDATE, not a new ActivityAction member: archiving is a field change.
    const entry = logActivity.mock.calls[0][0]
    expect(entry.action).toBe('UPDATE')
    expect(entry.changes.archivedAt.before).toBeNull()
    expect(typeof entry.changes.archivedAt.after).toBe('string')
    expect(entry.summary).toContain('3 linked records')
  })

  it('refuses rather than archiving on the non-admin path', async () => {
    const { calls, options } = harness(2)

    await expect(
      archiveOrDelete({ ...options, allowArchive: false }),
    ).rejects.toThrow(/used by 2 records/)

    expect(calls).toEqual({ hardDelete: 0, archive: 0 })
    expect(logActivity).not.toHaveBeenCalled()
  })

  it('still deletes an unreferenced row on the non-admin path', async () => {
    // The whole point of the user-facing path: cleaning up your own mistake
    // works, hiding a shared label from everyone else does not.
    const { calls, options } = harness(0)

    const result = await archiveOrDelete({ ...options, allowArchive: false })

    expect(result.outcome).toBe('deleted')
    expect(calls.hardDelete).toBe(1)
  })

  it('uses a caller-supplied refusal message', async () => {
    const { options } = harness(5)

    await expect(
      archiveOrDelete({
        ...options,
        allowArchive: false,
        refuseMessage: (n) => `nope, ${n} things`,
      }),
    ).rejects.toThrow('nope, 5 things')
  })

  it('says "record" in the singular', async () => {
    const { options } = harness(1)

    await expect(
      archiveOrDelete({ ...options, allowArchive: false }),
    ).rejects.toThrow(/used by 1 record,/)
  })
})

describe('restoreArchived', () => {
  it('clears the flag and logs the reverse change', async () => {
    let restored = 0

    await restoreArchived({
      entityType: 'payee',
      id: 'payee-1',
      label: 'Coffee Shop',
      actorUserId: 'user-1',
      archivedAt: new Date('2026-07-01T00:00:00.000Z'),
      restore: async () => {
        restored += 1
      },
    })

    expect(restored).toBe(1)
    const entry = logActivity.mock.calls[0][0]
    expect(entry.action).toBe('UPDATE')
    expect(entry.changes.archivedAt).toEqual({
      before: '2026-07-01T00:00:00.000Z',
      after: null,
    })
  })
})
