import { describe, expect, it } from 'vitest'
import { floorToInterval, isJobDue, nextBucketStart } from '#/lib/job-schedule'

const MINUTE = 60_000
const HOUR = 3_600_000

describe('floorToInterval', () => {
  it('floors to the start of the containing bucket', () => {
    const now = new Date('2026-07-28T14:37:42.123Z')
    expect(floorToInterval(now, MINUTE).toISOString()).toBe(
      '2026-07-28T14:37:00.000Z',
    )
    expect(floorToInterval(now, 5 * MINUTE).toISOString()).toBe(
      '2026-07-28T14:35:00.000Z',
    )
    expect(floorToInterval(now, HOUR).toISOString()).toBe(
      '2026-07-28T14:00:00.000Z',
    )
  })

  it('is idempotent on an exact boundary', () => {
    const boundary = new Date('2026-07-28T14:00:00.000Z')
    expect(floorToInterval(boundary, HOUR).getTime()).toBe(boundary.getTime())
  })

  it('agrees for any two instants inside the same bucket', () => {
    const a = new Date('2026-07-28T14:00:00.000Z')
    const b = new Date('2026-07-28T14:59:59.999Z')
    expect(floorToInterval(a, HOUR).getTime()).toBe(
      floorToInterval(b, HOUR).getTime(),
    )
  })

  it('separates instants either side of a boundary', () => {
    const before = new Date('2026-07-28T14:59:59.999Z')
    const after = new Date('2026-07-28T15:00:00.000Z')
    expect(floorToInterval(after, HOUR).getTime()).toBeGreaterThan(
      floorToInterval(before, HOUR).getTime(),
    )
  })

  it('is unaffected by a DST transition', () => {
    // America/Los_Angeles springs forward 2026-03-08 02:00 local.
    const before = new Date('2026-03-08T09:30:00.000Z')
    const after = new Date('2026-03-08T10:30:00.000Z')
    expect(floorToInterval(before, HOUR).toISOString()).toBe(
      '2026-03-08T09:00:00.000Z',
    )
    expect(floorToInterval(after, HOUR).toISOString()).toBe(
      '2026-03-08T10:00:00.000Z',
    )
  })

  it('handles an interval that does not divide an hour', () => {
    const now = new Date('2026-07-28T14:37:00.000Z')
    // 7-minute buckets from the epoch; assert the result is a real multiple.
    const bucket = floorToInterval(now, 7 * MINUTE)
    expect(bucket.getTime() % (7 * MINUTE)).toBe(0)
    expect(bucket.getTime()).toBeLessThanOrEqual(now.getTime())
    expect(bucket.getTime() + 7 * MINUTE).toBeGreaterThan(now.getTime())
  })

  it('rejects a non-positive or non-finite interval', () => {
    const now = new Date()
    expect(() => floorToInterval(now, 0)).toThrow(/positive/)
    expect(() => floorToInterval(now, -1)).toThrow(/positive/)
    expect(() => floorToInterval(now, Number.NaN)).toThrow(/positive/)
  })

  it('rejects an invalid date', () => {
    expect(() => floorToInterval(new Date('nope'), MINUTE)).toThrow(/valid/)
  })
})

describe('isJobDue', () => {
  it('is always due when never run', () => {
    expect(isJobDue(null, new Date('2026-07-28T14:00:00.000Z'), HOUR)).toBe(true)
  })

  it('is not due again inside the same bucket', () => {
    const bucket = new Date('2026-07-28T14:00:00.000Z')
    expect(isJobDue(bucket, new Date('2026-07-28T14:00:00.000Z'), HOUR)).toBe(
      false,
    )
    expect(isJobDue(bucket, new Date('2026-07-28T14:59:59.999Z'), HOUR)).toBe(
      false,
    )
  })

  it('is due once the next bucket opens', () => {
    const bucket = new Date('2026-07-28T14:00:00.000Z')
    expect(isJobDue(bucket, new Date('2026-07-28T15:00:00.000Z'), HOUR)).toBe(
      true,
    )
  })

  it('is not due when the recorded bucket is in the future', () => {
    const bucket = new Date('2026-07-28T16:00:00.000Z')
    expect(isJobDue(bucket, new Date('2026-07-28T15:00:00.000Z'), HOUR)).toBe(
      false,
    )
  })
})

describe('nextBucketStart', () => {
  it('returns the boundary after the containing bucket', () => {
    expect(
      nextBucketStart(new Date('2026-07-28T14:37:00.000Z'), HOUR).toISOString(),
    ).toBe('2026-07-28T15:00:00.000Z')
  })

  it('advances a full interval from an exact boundary', () => {
    expect(
      nextBucketStart(new Date('2026-07-28T14:00:00.000Z'), HOUR).toISOString(),
    ).toBe('2026-07-28T15:00:00.000Z')
  })
})
