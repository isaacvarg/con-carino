import { describe, expect, it } from 'vitest'
import {
  duplicateMagnitude,
  percentMatchMagnitude,
  roundsToZero,
} from '#/lib/automation-amount'

describe('percentMatchMagnitude', () => {
  it('takes a plain percentage of a round amount', () => {
    expect(percentMatchMagnitude(100, 15)).toBe(15)
    expect(percentMatchMagnitude(250, 10)).toBe(25)
  })

  it('rounds a half-cent up', () => {
    // 1.515 exactly.
    expect(percentMatchMagnitude(10.1, 15)).toBe(1.52)
  })

  it('rounds up where binary floating point would round down', () => {
    // 10.30 * 0.15 is 1.5449999999999999 in IEEE 754, which naively floors to
    // 1.54. Working in integer cents gives 1545 -> 1.55, the answer on paper.
    expect(percentMatchMagnitude(10.3, 15)).toBe(1.55)
  })

  it('is the identity at 100%', () => {
    for (const amount of [0.01, 1, 12.34, 999.99, 1_000_000.05]) {
      expect(percentMatchMagnitude(amount, 100)).toBe(amount)
    }
  })

  it('ignores the sign of the source', () => {
    expect(percentMatchMagnitude(-200, 25)).toBe(50)
  })

  it('always lands exactly on a cent', () => {
    const amounts = [0.03, 0.07, 1.11, 3.33, 7.77, 19.99, 123.45, 9_999.99]
    const percents = [1, 3.5, 7, 12.5, 33.33, 66.67, 99]
    for (const amount of amounts) {
      for (const percent of percents) {
        const result = percentMatchMagnitude(amount, percent)
        // The Decimal(19,4) safety property: a value that survives a round trip
        // through two decimal places.
        expect(Number(result.toFixed(2))).toBe(result)
      }
    }
  })

  it('rounds a tiny percentage away to nothing', () => {
    expect(percentMatchMagnitude(0.01, 15)).toBe(0)
    expect(roundsToZero(percentMatchMagnitude(0.01, 15))).toBe(true)
  })

  it('rejects non-finite input', () => {
    expect(() => percentMatchMagnitude(Number.NaN, 15)).toThrow()
    expect(() => percentMatchMagnitude(Number.POSITIVE_INFINITY, 15)).toThrow()
    expect(() => percentMatchMagnitude(100, Number.NaN)).toThrow()
  })
})

describe('duplicateMagnitude', () => {
  it('strips the sign off a signed amount', () => {
    expect(duplicateMagnitude(-42.5)).toBe(42.5)
    expect(duplicateMagnitude(42.5)).toBe(42.5)
  })

  it('rejects non-finite input', () => {
    expect(() => duplicateMagnitude(Number.NaN)).toThrow()
  })
})

describe('roundsToZero', () => {
  it('is true only below half a cent', () => {
    expect(roundsToZero(0)).toBe(true)
    expect(roundsToZero(0.004)).toBe(true)
    expect(roundsToZero(0.005)).toBe(false)
    expect(roundsToZero(0.01)).toBe(false)
    expect(roundsToZero(-0.01)).toBe(false)
  })
})
