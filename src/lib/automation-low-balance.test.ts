import { describe, expect, it } from 'vitest'
import {
  LOW_BALANCE_REALERT_MS,
  evaluateLowBalance,
  type LowBalanceState,
} from '#/lib/automation-low-balance'

const NOW = new Date('2026-07-28T12:00:00.000Z')

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs)
}

function evaluate(
  balance: number,
  state: LowBalanceState,
  now: Date = NOW,
) {
  return evaluateLowBalance({ balance, threshold: 200, state, now })
}

const CLEAR: LowBalanceState = { alertingSince: null, lastAlertedAt: null }

describe('evaluateLowBalance', () => {
  it('alerts on the first dip below the floor', () => {
    const decision = evaluate(150, CLEAR)
    expect(decision.action).toBe('alert')
    expect(decision.nextAlertingSince).toEqual(NOW)
    expect(decision.nextLastAlertedAt).toEqual(NOW)
  })

  it('stays quiet an hour later', () => {
    const state = { alertingSince: NOW, lastAlertedAt: NOW }
    expect(evaluate(150, state, at(60 * 60 * 1000)).action).toBe('quiet')
  })

  it('stays quiet at 23h59m', () => {
    const state = { alertingSince: NOW, lastAlertedAt: NOW }
    const almost = at(LOW_BALANCE_REALERT_MS - 60_000)
    expect(evaluate(150, state, almost).action).toBe('quiet')
  })

  it('re-alerts at 24h and keeps the original alertingSince', () => {
    const dipStart = at(-LOW_BALANCE_REALERT_MS)
    const state = { alertingSince: dipStart, lastAlertedAt: dipStart }
    const decision = evaluate(150, state)
    expect(decision.action).toBe('alert')
    expect(decision.nextAlertingSince).toEqual(dipStart)
    expect(decision.nextLastAlertedAt).toEqual(NOW)
  })

  it('treats sitting exactly on the floor as recovered', () => {
    const state = { alertingSince: NOW, lastAlertedAt: NOW }
    const decision = evaluate(200, state)
    expect(decision.action).toBe('clear')
    expect(decision.nextAlertingSince).toBeNull()
    expect(decision.nextLastAlertedAt).toBeNull()
  })

  it('clears both columns on recovery', () => {
    const state = { alertingSince: at(-1000), lastAlertedAt: at(-1000) }
    const decision = evaluate(500, state)
    expect(decision.action).toBe('clear')
    expect(decision.nextAlertingSince).toBeNull()
    expect(decision.nextLastAlertedAt).toBeNull()
  })

  it('writes nothing when the balance was never low', () => {
    expect(evaluate(500, CLEAR).action).toBe('quiet')
  })

  it('alerts immediately on a fresh dip rather than waiting out the old window', () => {
    // Recovery cleared the state a minute ago; dropping again should not have
    // to serve out the remainder of yesterday's 24h.
    const decision = evaluate(150, CLEAR, at(60_000))
    expect(decision.action).toBe('alert')
  })

  it('alerts when a dip is somehow marked but never sent', () => {
    const state = { alertingSince: at(-5000), lastAlertedAt: null }
    expect(evaluate(150, state).action).toBe('alert')
  })

  it('handles a negative floor for a credit account', () => {
    const state = CLEAR
    const below = evaluateLowBalance({
      balance: -600,
      threshold: -500,
      state,
      now: NOW,
    })
    expect(below.action).toBe('alert')
    const above = evaluateLowBalance({
      balance: -400,
      threshold: -500,
      state: { alertingSince: NOW, lastAlertedAt: NOW },
      now: NOW,
    })
    expect(above.action).toBe('clear')
  })
})
