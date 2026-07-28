import { describe, expect, it } from 'vitest'
import {
  allocateCarePeriod,
  type AllocationInput,
  type ContributorProfile,
} from '#/lib/care-allocation'

function pct(personId: string, percent: number): ContributorProfile {
  return { personId, basis: 'PERCENT', percent, fixedAmount: null }
}
function fix(personId: string, fixedAmount: number): ContributorProfile {
  return { personId, basis: 'FIXED', percent: null, fixedAmount }
}

function run(over: Partial<AllocationInput>) {
  return allocateCarePeriod({
    periodTotal: 1000,
    carveOuts: [],
    contributors: [],
    policy: 'FIXED_FIRST_THEN_PERCENT',
    backstopPersonId: null,
    ...over,
  })
}

function due(res: ReturnType<typeof run>, personId: string): number {
  return res.allocations.find((a) => a.personId === personId)?.amountDue ?? 0
}

function sumDue(res: ReturnType<typeof run>): number {
  return Math.round(res.allocations.reduce((s, a) => s + a.amountDue, 0) * 1e4) / 1e4
}

describe('allocateCarePeriod — fixed first, then percent', () => {
  it('splits evenly between two 50% contributors', () => {
    const res = run({ contributors: [pct('a', 50), pct('b', 50)] })
    expect(due(res, 'a')).toBe(500)
    expect(due(res, 'b')).toBe(500)
    expect(res.unallocated).toBe(0)
  })

  it('sums exactly with thirds', () => {
    const res = run({
      periodTotal: 100,
      contributors: [pct('a', 33.33), pct('b', 33.33), pct('c', 33.34)],
    })
    expect(sumDue(res)).toBe(100)
  })

  it('takes fixed off the top and splits the remainder', () => {
    const res = run({
      contributors: [fix('a', 400), pct('b', 50), pct('c', 50)],
    })
    expect(due(res, 'a')).toBe(400)
    expect(due(res, 'b')).toBe(300)
    expect(due(res, 'c')).toBe(300)
  })

  it('renormalises percentages that do not sum to 100', () => {
    // 60/20 of the 1000 remainder becomes 75% / 25%.
    const res = run({ contributors: [pct('b', 60), pct('c', 20)] })
    expect(due(res, 'b')).toBe(750)
    expect(due(res, 'c')).toBe(250)
  })

  it('scales fixed pledges down when they exceed the pool', () => {
    const res = run({
      periodTotal: 300,
      contributors: [fix('a', 400), fix('b', 200), pct('c', 100)],
    })
    expect(res.warnings).toContain('fixed-exceeds-pool')
    expect(due(res, 'a')).toBe(200)
    expect(due(res, 'b')).toBe(100)
    expect(due(res, 'c')).toBe(0)
    expect(sumDue(res)).toBe(300)
  })

  it('routes the remainder to the backstop when nobody has a percentage', () => {
    const res = run({
      contributors: [fix('a', 400)],
      backstopPersonId: 'z',
    })
    expect(res.warnings).toContain('no-percent-contributors-used-backstop')
    expect(due(res, 'z')).toBe(600)
    expect(sumDue(res)).toBe(1000)
  })

  it('surfaces an unallocated remainder rather than dropping it', () => {
    const res = run({ contributors: [fix('a', 400)] })
    expect(res.warnings).toContain('no-percent-contributors')
    expect(res.unallocated).toBe(600)
    expect(sumDue(res) + res.unallocated).toBe(1000)
  })
})

describe('allocateCarePeriod — backstop policy', () => {
  const backstop = { policy: 'BACKSTOP' as const, backstopPersonId: 'c' }

  it('applies percentages literally and gives the rest to the backstop', () => {
    const res = run({
      ...backstop,
      contributors: [pct('a', 30), fix('b', 100), pct('c', 0)],
    })
    expect(due(res, 'a')).toBe(300)
    expect(due(res, 'b')).toBe(100)
    expect(due(res, 'c')).toBe(600)
    expect(sumDue(res)).toBe(1000)
  })

  it('lets the backstop go negative when others over-fund', () => {
    const res = run({
      ...backstop,
      contributors: [pct('a', 80), pct('b', 80)],
    })
    expect(due(res, 'a')).toBe(800)
    expect(due(res, 'b')).toBe(800)
    expect(due(res, 'c')).toBe(-600)
    expect(sumDue(res)).toBe(1000)
  })

  it('surfaces the residual when no backstop is nominated', () => {
    const res = run({
      policy: 'BACKSTOP',
      backstopPersonId: null,
      contributors: [pct('a', 30)],
    })
    expect(res.warnings).toContain('no-backstop')
    expect(res.unallocated).toBe(700)
    expect(sumDue(res) + res.unallocated).toBe(1000)
  })
})

describe('allocateCarePeriod — carve-outs', () => {
  it('bills a carve-out on top of the pooled share', () => {
    const res = run({
      carveOuts: [{ personId: 'a', amount: 200 }],
      contributors: [pct('a', 50), pct('b', 50)],
    })
    // Pool is 800, split 400/400; 'a' also owes their 200 carve-out.
    expect(res.pooled).toBe(800)
    expect(due(res, 'a')).toBe(600)
    expect(due(res, 'b')).toBe(400)
    expect(sumDue(res)).toBe(1000)
  })

  it('includes a responsible person who has no contribution profile', () => {
    const res = run({
      carveOuts: [{ personId: 'guest', amount: 200 }],
      contributors: [pct('a', 100)],
    })
    const guest = res.allocations.find((x) => x.personId === 'guest')
    expect(guest).toMatchObject({ carveOut: 200, poolShare: 0, amountDue: 200 })
    expect(due(res, 'a')).toBe(800)
  })

  it('handles carve-outs covering the entire total', () => {
    const res = run({
      carveOuts: [{ personId: 'a', amount: 1000 }],
      contributors: [pct('a', 50), pct('b', 50)],
    })
    expect(res.pooled).toBe(0)
    expect(due(res, 'a')).toBe(1000)
    expect(due(res, 'b')).toBe(0)
  })

  it('throws when carve-outs exceed the total', () => {
    expect(() =>
      run({ carveOuts: [{ personId: 'a', amount: 1200 }], contributors: [pct('a', 100)] }),
    ).toThrow(/exceed the period total/)
  })

  it('merges multiple carve-outs for one person', () => {
    const res = run({
      carveOuts: [
        { personId: 'a', amount: 100 },
        { personId: 'a', amount: 150 },
      ],
      contributors: [pct('a', 100)],
    })
    expect(res.allocations.find((x) => x.personId === 'a')?.carveOut).toBe(250)
  })
})

describe('allocateCarePeriod — edge cases', () => {
  it('distributes sub-penny amounts deterministically', () => {
    const res = run({
      periodTotal: 0.0003,
      contributors: [pct('a', 50), pct('b', 50)],
    })
    expect(sumDue(res)).toBe(0.0003)
    expect(due(res, 'a')).toBe(0.0002)
    expect(due(res, 'b')).toBe(0.0001)
  })

  it('produces no NaN with no contributors', () => {
    const res = run({ contributors: [] })
    expect(res.warnings).toContain('no-contributors')
    expect(res.unallocated).toBe(1000)
    expect(res.allocations).toEqual([])
  })

  it('is independent of contributor order', () => {
    const contributors = [pct('a', 33.33), pct('b', 33.33), fix('c', 250)]
    const forward = run({ contributors })
    const reversed = run({ contributors: [...contributors].reverse() })
    expect(forward.allocations).toEqual(reversed.allocations)
  })

  it('is deterministic across repeated runs', () => {
    const args = {
      periodTotal: 1000.0001,
      contributors: [pct('a', 33.333333), pct('b', 33.333333), pct('c', 33.333334)],
    }
    expect(run(args).allocations).toEqual(run(args).allocations)
  })
})

describe('allocateCarePeriod — exact summation (property)', () => {
  it('always balances across randomised inputs', () => {
    // Deterministic LCG so a failure is reproducible.
    let seed = 987654321
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }

    for (let i = 0; i < 500; i += 1) {
      const n = 1 + Math.floor(rnd() * 8)
      const contributors: ContributorProfile[] = []
      for (let k = 0; k < n; k += 1) {
        const id = `p${k}`
        contributors.push(
          rnd() < 0.5
            ? pct(id, Math.round(rnd() * 10000) / 100)
            : fix(id, Math.round(rnd() * 50000) / 100),
        )
      }
      const periodTotal = Math.round(rnd() * 500000) / 100
      const carveOuts =
        rnd() < 0.4
          ? [
              {
                personId: `p${Math.floor(rnd() * n)}`,
                amount: Math.round(rnd() * periodTotal * 50) / 100,
              },
            ]
          : []
      const policy = rnd() < 0.5 ? 'FIXED_FIRST_THEN_PERCENT' : 'BACKSTOP'
      const backstopPersonId = rnd() < 0.7 ? `p${Math.floor(rnd() * n)}` : null

      const res = allocateCarePeriod({
        periodTotal,
        carveOuts,
        contributors,
        policy,
        backstopPersonId,
      })

      const sumUnits = res.allocations.reduce(
        (s, a) => s + Math.round(a.amountDue * 1e4),
        0,
      )
      expect(sumUnits + Math.round(res.unallocated * 1e4)).toBe(
        Math.round(periodTotal * 1e4),
      )
    }
  })
})
