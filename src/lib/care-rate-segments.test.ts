import { describe, expect, it } from 'vitest'
import {
  segmentCoverageWindow,
  totalSegmentAmount,
  type SegmentationInput,
  type StandardSchedule,
} from '#/lib/care-rate-segments'
import { billableQuantity, calendarDaysSpanned } from '#/lib/care-invoice'

// 2026-07-20 Mon … 2026-07-24 Fri, 2026-07-25 Sat, 2026-07-26 Sun, 2026-07-27 Mon
const MON = new Date(2026, 6, 20)
const FRI = new Date(2026, 6, 24)
const SAT = new Date(2026, 6, 25)

function at(day: Date, hours: number, minutes = 0): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hours,
    minutes,
  )
}

const WEEKDAYS: StandardSchedule = {
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '17:00',
}

const WEEKDAYS_ALLDAY: StandardSchedule = {
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: null,
  endTime: null,
}

function input(over: Partial<SegmentationInput>): SegmentationInput {
  return {
    startsAt: at(MON, 9),
    endsAt: at(MON, 17),
    schedule: WEEKDAYS,
    rateType: 'HOURLY',
    flatDaily: false,
    standardRate: 20,
    offScheduleRate: 30,
    ...over,
  }
}

describe('segmentCoverageWindow — fast paths', () => {
  it('returns one standard segment when no schedule is configured', () => {
    const segs = segmentCoverageWindow(
      input({ schedule: { daysOfWeek: [], startTime: null, endTime: null } }),
    )
    expect(segs).toHaveLength(1)
    expect(segs[0]!.band).toBe('STANDARD')
    expect(segs[0]!.quantity).toBe(8)
    expect(segs[0]!.rate).toBe(20)
  })

  it('returns one standard segment when there is no off-schedule rate', () => {
    const segs = segmentCoverageWindow(
      input({ startsAt: at(SAT, 9), endsAt: at(SAT, 17), offScheduleRate: null }),
    )
    expect(segs).toHaveLength(1)
    expect(segs[0]!.band).toBe('STANDARD')
    expect(segs[0]!.rate).toBe(20)
  })

  it('rejects a non-positive window', () => {
    expect(() =>
      segmentCoverageWindow(input({ startsAt: at(MON, 9), endsAt: at(MON, 9) })),
    ).toThrow(/End must be after start/)
  })
})

describe('segmentCoverageWindow — hourly', () => {
  it('prices a window wholly inside the schedule at the standard rate', () => {
    const segs = segmentCoverageWindow(input({}))
    expect(segs).toHaveLength(1)
    expect(segs[0]!.band).toBe('STANDARD')
    expect(segs[0]!.amount).toBe(160)
  })

  it('prices a window wholly outside the schedule at the premium rate', () => {
    const segs = segmentCoverageWindow(
      input({ startsAt: at(SAT, 9), endsAt: at(SAT, 17) }),
    )
    expect(segs).toHaveLength(1)
    expect(segs[0]!.band).toBe('OFF_SCHEDULE')
    expect(segs[0]!.amount).toBe(240)
  })

  it('splits a leading straddle', () => {
    const segs = segmentCoverageWindow(
      input({ startsAt: at(MON, 7), endsAt: at(MON, 12) }),
    )
    expect(segs.map((s) => [s.band, s.quantity])).toEqual([
      ['OFF_SCHEDULE', 2],
      ['STANDARD', 3],
    ])
  })

  it('splits a trailing straddle', () => {
    const segs = segmentCoverageWindow(
      input({ startsAt: at(MON, 15), endsAt: at(MON, 20) }),
    )
    expect(segs.map((s) => [s.band, s.quantity])).toEqual([
      ['STANDARD', 2],
      ['OFF_SCHEDULE', 3],
    ])
  })

  it('splits a window straddling both ends and conserves total hours', () => {
    const segs = segmentCoverageWindow(
      input({ startsAt: at(MON, 7), endsAt: at(MON, 20) }),
    )
    expect(segs.map((s) => [s.band, s.quantity])).toEqual([
      ['OFF_SCHEDULE', 2],
      ['STANDARD', 8],
      ['OFF_SCHEDULE', 3],
    ])
    expect(segs.reduce((s, x) => s + x.quantity, 0)).toBe(13)
    expect(totalSegmentAmount(segs)).toBe(2 * 30 + 8 * 20 + 3 * 30)
  })

  it('splits an overnight window crossing into a non-standard day', () => {
    const segs = segmentCoverageWindow(
      input({
        startsAt: at(FRI, 22),
        endsAt: at(SAT, 6),
        schedule: WEEKDAYS_ALLDAY,
      }),
    )
    expect(segs.map((s) => [s.band, s.quantity])).toEqual([
      ['STANDARD', 2],
      ['OFF_SCHEDULE', 6],
    ])
  })

  it('treats a whole standard day as standard when times are null', () => {
    const segs = segmentCoverageWindow(
      input({
        startsAt: at(MON, 3),
        endsAt: at(MON, 23),
        schedule: WEEKDAYS_ALLDAY,
      }),
    )
    expect(segs).toHaveLength(1)
    expect(segs[0]!.band).toBe('STANDARD')
  })

  it('honours an overnight standard window via the day-before lookback', () => {
    // Standard 22:00–06:00 Mon means Mon 22:00 → Tue 02:00 is all standard.
    const segs = segmentCoverageWindow(
      input({
        startsAt: at(MON, 23),
        endsAt: new Date(2026, 6, 21, 2),
        schedule: { daysOfWeek: [1], startTime: '22:00', endTime: '06:00' },
      }),
    )
    expect(segs).toHaveLength(1)
    expect(segs[0]!.band).toBe('STANDARD')
    expect(segs[0]!.quantity).toBe(3)
  })

  it('coalesces a whole weekend into a single off-schedule segment', () => {
    const segs = segmentCoverageWindow(
      input({
        startsAt: at(FRI, 18),
        endsAt: new Date(2026, 6, 27, 6),
        schedule: WEEKDAYS_ALLDAY,
      }),
    )
    // Fri 18:00–24:00 standard, then Sat 00:00 → Mon 00:00 one off-schedule
    // run, then Mon 00:00–06:00 standard.
    expect(segs.map((s) => s.band)).toEqual([
      'STANDARD',
      'OFF_SCHEDULE',
      'STANDARD',
    ])
    expect(segs[1]!.quantity).toBe(48)
  })

  it('emits no zero-length segment when the window starts on a boundary', () => {
    const segs = segmentCoverageWindow(
      input({ startsAt: at(MON, 9), endsAt: at(MON, 20) }),
    )
    expect(segs.every((s) => s.quantity > 0)).toBe(true)
    expect(segs.map((s) => s.band)).toEqual(['STANDARD', 'OFF_SCHEDULE'])
  })
})

describe('segmentCoverageWindow — daily non-flat', () => {
  it('splits on the same boundaries as hourly, in day units', () => {
    const segs = segmentCoverageWindow(
      input({
        startsAt: at(MON, 7),
        endsAt: at(MON, 20),
        rateType: 'DAILY',
        flatDaily: false,
      }),
    )
    expect(segs.map((s) => s.band)).toEqual([
      'OFF_SCHEDULE',
      'STANDARD',
      'OFF_SCHEDULE',
    ])
    const total = segs.reduce((s, x) => s + x.quantity, 0)
    expect(total).toBeCloseTo(13 / 24, 12)
  })
})

describe('segmentCoverageWindow — flat daily', () => {
  const flat = (over: Partial<SegmentationInput>) =>
    segmentCoverageWindow(
      input({ rateType: 'DAILY', flatDaily: true, ...over }),
    )

  it('assigns a day to STANDARD when standard time dominates', () => {
    const segs = flat({ startsAt: at(MON, 7), endsAt: at(MON, 20) })
    expect(segs).toHaveLength(1)
    expect(segs[0]!.band).toBe('STANDARD')
    expect(segs[0]!.quantity).toBe(1)
    expect(segs[0]!.amount).toBe(20)
  })

  it('assigns a day to OFF_SCHEDULE when off time dominates', () => {
    // Mon 06:00–12:00: 3h off (06–09) vs 3h standard (09–12) is a tie, so
    // shift the window to make off dominate.
    const segs = flat({ startsAt: at(MON, 5), endsAt: at(MON, 11) })
    expect(segs).toHaveLength(1)
    expect(segs[0]!.band).toBe('OFF_SCHEDULE')
    expect(segs[0]!.amount).toBe(30)
  })

  it('breaks an exact tie in favour of STANDARD', () => {
    const segs = flat({ startsAt: at(MON, 6), endsAt: at(MON, 12) })
    expect(segs).toHaveLength(1)
    expect(segs[0]!.band).toBe('STANDARD')
  })

  it('bills one day per calendar day across an overnight boundary', () => {
    const segs = flat({
      startsAt: at(FRI, 20),
      endsAt: at(SAT, 6),
      schedule: WEEKDAYS_ALLDAY,
    })
    expect(segs.map((s) => [s.band, s.quantity])).toEqual([
      ['STANDARD', 1],
      ['OFF_SCHEDULE', 1],
    ])
    expect(segs.reduce((s, x) => s + x.quantity, 0)).toBe(
      calendarDaysSpanned(at(FRI, 20), at(SAT, 6)),
    )
    expect(totalSegmentAmount(segs)).toBe(50)
  })

  it('does not add a phantom day when the window ends exactly at midnight', () => {
    const segs = flat({
      startsAt: at(FRI, 8),
      endsAt: at(SAT, 0),
      schedule: WEEKDAYS_ALLDAY,
    })
    expect(segs).toHaveLength(1)
    expect(segs[0]!.band).toBe('STANDARD')
  })
})

describe('segmentCoverageWindow — pricing', () => {
  it('rounds each segment amount to 4dp', () => {
    const segs = segmentCoverageWindow(
      input({
        startsAt: at(MON, 7),
        endsAt: at(MON, 20),
        standardRate: 33.333333,
        offScheduleRate: 41.777777,
      }),
    )
    for (const seg of segs) {
      expect(seg.amount).toBe(Math.round(seg.amount * 10_000) / 10_000)
    }
  })
})

describe('segmentCoverageWindow — quantity conservation (property)', () => {
  const schedules: StandardSchedule[] = [
    WEEKDAYS,
    WEEKDAYS_ALLDAY,
    { daysOfWeek: [0, 6], startTime: '08:00', endTime: '20:00' },
    { daysOfWeek: [1], startTime: '22:00', endTime: '06:00' },
    { daysOfWeek: [2, 4], startTime: null, endTime: null },
  ]

  it('conserves quantity against the unsegmented calculation', () => {
    let cases = 0
    for (const schedule of schedules) {
      for (let startDay = 20; startDay <= 26; startDay += 1) {
        for (const startHour of [0, 5, 9, 13, 17, 22]) {
          for (const lengthHours of [1, 4, 8, 13, 26, 50]) {
            const startsAt = new Date(2026, 6, startDay, startHour)
            const endsAt = new Date(startsAt.getTime() + lengthHours * 3_600_000)

            for (const [rateType, flatDaily] of [
              ['HOURLY', false],
              ['DAILY', false],
              ['DAILY', true],
            ] as const) {
              const segs = segmentCoverageWindow({
                startsAt,
                endsAt,
                schedule,
                rateType,
                flatDaily,
                standardRate: 20,
                offScheduleRate: 30,
              })

              expect(segs.length).toBeGreaterThan(0)
              expect(segs.every((s) => s.quantity > 0)).toBe(true)

              // Segments tile the window with no gaps or overlaps.
              expect(segs[0]!.startsAt.getTime()).toBe(startsAt.getTime())
              expect(segs[segs.length - 1]!.endsAt.getTime()).toBe(
                endsAt.getTime(),
              )
              for (let i = 1; i < segs.length; i += 1) {
                expect(segs[i]!.startsAt.getTime()).toBe(
                  segs[i - 1]!.endsAt.getTime(),
                )
              }

              const total = segs.reduce((s, x) => s + x.quantity, 0)
              const expected = flatDaily
                ? calendarDaysSpanned(startsAt, endsAt)
                : billableQuantity(startsAt, endsAt, rateType, false)
              expect(total).toBeCloseTo(expected, 9)
              cases += 1
            }
          }
        }
      }
    }
    expect(cases).toBeGreaterThan(600)
  })
})
