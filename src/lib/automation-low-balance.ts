/**
 * Should a low-balance alert go out right now?
 *
 * The rule the user picked: email once when the balance crosses below the
 * floor, then at most once a day for as long as it stays there, and go quiet
 * again once it recovers. Two columns carry that state — `alertingSince` marks
 * "we are currently in a dip", `lastAlertedAt` paces the repeats — and both are
 * cleared on recovery so the next dip alerts immediately instead of serving out
 * the remainder of a window from the previous one.
 *
 * The 24h is a rolling window from the last send, not a calendar day. Same
 * reasoning as `floorToInterval` in job-schedule.ts: anything anchored to local
 * midnight moves under DST and disagrees between processes in different zones.
 */

export const LOW_BALANCE_REALERT_MS = 24 * 60 * 60 * 1000

export type LowBalanceState = {
  alertingSince: Date | null
  lastAlertedAt: Date | null
}

export type LowBalanceDecision = {
  /**
   * `alert` — send, then persist the returned state.
   * `clear` — the balance recovered; persist the nulls.
   * `quiet` — nothing to do, no write.
   */
  action: 'alert' | 'clear' | 'quiet'
  nextAlertingSince: Date | null
  nextLastAlertedAt: Date | null
}

export function evaluateLowBalance(input: {
  balance: number
  threshold: number
  state: LowBalanceState
  now: Date
}): LowBalanceDecision {
  const { balance, threshold, state, now } = input

  // Strict: sitting exactly on the floor has not dropped below it.
  const isBelow = balance < threshold

  if (!isBelow) {
    // Recovering is what re-arms the alert. A rule that was never alerting has
    // nothing to write.
    if (state.alertingSince === null && state.lastAlertedAt === null) {
      return { action: 'quiet', nextAlertingSince: null, nextLastAlertedAt: null }
    }
    return { action: 'clear', nextAlertingSince: null, nextLastAlertedAt: null }
  }

  if (state.alertingSince === null) {
    return { action: 'alert', nextAlertingSince: now, nextLastAlertedAt: now }
  }

  const since = state.lastAlertedAt
  if (since === null || now.getTime() - since.getTime() >= LOW_BALANCE_REALERT_MS) {
    // Keep the original alertingSince: it records when this dip started, which
    // is worth showing even after several repeats.
    return {
      action: 'alert',
      nextAlertingSince: state.alertingSince,
      nextLastAlertedAt: now,
    }
  }

  return {
    action: 'quiet',
    nextAlertingSince: state.alertingSince,
    nextLastAlertedAt: state.lastAlertedAt,
  }
}
