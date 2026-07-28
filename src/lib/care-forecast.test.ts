import { describe, expect, it } from 'vitest'
import {
  projectCareCosts,
  type ForecastOccurrence,
  type ForecastPerson,
} from '#/lib/care-forecast'

// 2026-07-20 is a Monday; 2026-07-25 a Saturday.
const at = (day: number, hour: number) => new Date(2026, 6, day, hour)

const minerva: ForecastPerson = {
  id: 'minerva',
  name: 'Minerva',
  rate: { amount: 200, rateType: 'DAILY', flatDaily: true },
  schedule: { daysOfWeek: [1, 2, 3, 4, 5], startTime: null, endTime: null },
  offScheduleRate: 300,
}
const family: ForecastPerson = {
  id: 'isaac',
  name: 'Isaac',
  rate: null,
  schedule: { daysOfWeek: [], startTime: null, endTime: null },
  offScheduleRate: null,
}

function occ(over: Partial<ForecastOccurrence>): ForecastOccurrence {
  return {
    id: Math.random().toString(36).slice(2),
    startsAt: at(20, 8),
    endsAt: at(20, 20),
    assigneeId: 'minerva',
    responsiblePersonId: null,
    ...over,
  }
}

describe('projectCareCosts', () => {
  it('prices an assigned weekday at the standard rate', () => {
    const res = projectCareCosts({ occurrences: [occ({})], people: [minerva] })
    expect(res.totalCost).toBe(200)
    expect(res.pricedShifts).toBe(1)
    expect(res.byCaregiver).toEqual([
      { personId: 'minerva', personName: 'Minerva', amount: 200, shifts: 1 },
    ])
  })

  it('prices a weekend at the off-schedule rate', () => {
    const res = projectCareCosts({
      occurrences: [occ({ startsAt: at(25, 8), endsAt: at(25, 20) })],
      people: [minerva],
    })
    expect(res.totalCost).toBe(300)
  })

  it('splits a straddling window across both rates', () => {
    const res = projectCareCosts({
      occurrences: [occ({ startsAt: at(24, 22), endsAt: at(25, 8) })],
      people: [minerva],
    })
    expect(res.totalCost).toBe(500)
  })

  it('counts unclaimed windows without pricing them', () => {
    const res = projectCareCosts({
      occurrences: [occ({}), occ({ assigneeId: null })],
      people: [minerva],
    })
    expect(res.totalCost).toBe(200)
    expect(res.unassignedShifts).toBe(1)
    expect(res.pricedShifts).toBe(1)
  })

  it('treats an unpaid assignee as free, not unknown', () => {
    const res = projectCareCosts({
      occurrences: [occ({ assigneeId: 'isaac' })],
      people: [minerva, family],
    })
    expect(res.totalCost).toBe(0)
    expect(res.unpaidShifts).toBe(1)
    expect(res.unassignedShifts).toBe(0)
  })

  it('treats an assignee it has never heard of as unpaid rather than crashing', () => {
    const res = projectCareCosts({
      occurrences: [occ({ assigneeId: 'ghost' })],
      people: [minerva],
    })
    expect(res.totalCost).toBe(0)
    expect(res.unpaidShifts).toBe(1)
  })

  it('reports sole-responsibility costs as carve-outs', () => {
    const res = projectCareCosts({
      occurrences: [
        occ({}),
        occ({
          startsAt: at(25, 8),
          endsAt: at(25, 20),
          responsiblePersonId: 'isaac',
        }),
      ],
      people: [minerva, family],
    })
    expect(res.totalCost).toBe(500)
    expect(res.carveOuts).toEqual([{ personId: 'isaac', amount: 300 }])
  })

  it('accumulates several shifts per caregiver', () => {
    const res = projectCareCosts({
      occurrences: [
        occ({}),
        occ({ startsAt: at(21, 8), endsAt: at(21, 20) }),
        occ({ startsAt: at(22, 8), endsAt: at(22, 20) }),
      ],
      people: [minerva],
    })
    expect(res.totalCost).toBe(600)
    expect(res.byCaregiver[0]).toMatchObject({ amount: 600, shifts: 3 })
  })

  it('sorts caregivers by cost, highest first', () => {
    const cheap: ForecastPerson = {
      ...minerva,
      id: 'cheap',
      name: 'Cheap',
      rate: { amount: 50, rateType: 'DAILY', flatDaily: true },
    }
    const res = projectCareCosts({
      occurrences: [occ({}), occ({ assigneeId: 'cheap' })],
      people: [minerva, cheap],
    })
    expect(res.byCaregiver.map((x) => x.personName)).toEqual([
      'Minerva',
      'Cheap',
    ])
  })

  it('skips a zero-length window instead of throwing', () => {
    const res = projectCareCosts({
      occurrences: [occ({ startsAt: at(20, 8), endsAt: at(20, 8) })],
      people: [minerva],
    })
    expect(res.totalCost).toBe(0)
    expect(res.pricedShifts).toBe(0)
  })

  it('returns zeroes for an empty schedule', () => {
    const res = projectCareCosts({ occurrences: [], people: [minerva] })
    expect(res).toMatchObject({
      totalCost: 0,
      pricedShifts: 0,
      unassignedShifts: 0,
      unpaidShifts: 0,
      byCaregiver: [],
      carveOuts: [],
    })
  })

  it('keeps the total equal to the sum of per-caregiver amounts', () => {
    const res = projectCareCosts({
      occurrences: [
        occ({}),
        occ({ startsAt: at(24, 22), endsAt: at(25, 8) }),
        occ({ assigneeId: null }),
        occ({ assigneeId: 'isaac' }),
      ],
      people: [minerva, family],
    })
    const sum = res.byCaregiver.reduce((s, x) => s + x.amount, 0)
    expect(sum).toBe(res.totalCost)
  })
})
