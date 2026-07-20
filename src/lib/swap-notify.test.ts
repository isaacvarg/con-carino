import { describe, expect, it } from 'vitest'
import {
  buildSwapRequestEmail,
  buildSwapScheduleUrl,
  resolveAppOrigin,
  shouldNotifyAssignee,
} from '#/lib/swap-notify'

describe('shouldNotifyAssignee', () => {
  it('notifies a linked assignee with email', () => {
    expect(
      shouldNotifyAssignee(
        { userId: 'user-a', email: 'a@example.com' },
        'user-b',
      ),
    ).toBe(true)
  })

  it('skips offline assignees', () => {
    expect(
      shouldNotifyAssignee({ userId: null, email: null }, 'user-b'),
    ).toBe(false)
  })

  it('skips linked assignees without email', () => {
    expect(
      shouldNotifyAssignee({ userId: 'user-a', email: '  ' }, 'user-b'),
    ).toBe(false)
  })

  it('skips when the requester is the assignee', () => {
    expect(
      shouldNotifyAssignee(
        { userId: 'user-a', email: 'a@example.com' },
        'user-a',
      ),
    ).toBe(false)
  })
})

describe('resolveAppOrigin', () => {
  it('uses AUTH_URL origin and strips the auth path', () => {
    expect(
      resolveAppOrigin({
        authUrl: 'https://enos.example.com/api/auth',
        requestUrl: 'http://localhost:3000/rpc',
      }),
    ).toBe('https://enos.example.com')
  })

  it('falls back to the request URL origin', () => {
    expect(
      resolveAppOrigin({
        authUrl: null,
        requestUrl: 'http://localhost:3000/rpc',
      }),
    ).toBe('http://localhost:3000')
  })

  it('returns null when neither is usable', () => {
    expect(resolveAppOrigin({ authUrl: 'not-a-url', requestUrl: null })).toBe(
      null,
    )
  })
})

describe('buildSwapScheduleUrl', () => {
  it('builds a swaps-tab URL with 0-based month', () => {
    expect(buildSwapScheduleUrl('https://app.example.com', '2026-07-20')).toBe(
      'https://app.example.com/schedule?tab=swaps&year=2026&month=6&day=2026-07-20',
    )
  })

  it('strips a trailing slash on the origin', () => {
    expect(buildSwapScheduleUrl('https://app.example.com/', '2026-01-02')).toBe(
      'https://app.example.com/schedule?tab=swaps&year=2026&month=0&day=2026-01-02',
    )
  })
})

describe('buildSwapRequestEmail', () => {
  const base = {
    requesterName: 'Alex',
    relinquishStartsAt: new Date(2026, 6, 20, 9, 0, 0),
    relinquishEndsAt: new Date(2026, 6, 20, 17, 0, 0),
    claimStartsAt: new Date(2026, 6, 22, 9, 0, 0),
    claimEndsAt: new Date(2026, 6, 22, 17, 0, 0),
    claimForPersonName: 'Jordan',
    notes: 'Need Tuesday free',
    scheduleUrl: 'https://app.example.com/schedule?tab=swaps',
    dayLabel: '2026-07-20',
  }

  it('includes subject, windows, notes, and link', () => {
    const email = buildSwapRequestEmail(base)
    expect(email.subject).toBe('Swap requested for your coverage on 2026-07-20')
    expect(email.text).toContain('Alex requested a swap')
    expect(email.text).toContain('Claim for: Jordan')
    expect(email.text).toContain('Notes: Need Tuesday free')
    expect(email.text).toContain(base.scheduleUrl)
    expect(email.html).toContain('Review the swap request')
    expect(email.html).toContain(base.scheduleUrl)
  })

  it('escapes HTML in names and notes', () => {
    const email = buildSwapRequestEmail({
      ...base,
      requesterName: '<script>x</script>',
      notes: 'a & b <c>',
    })
    expect(email.html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(email.html).toContain('a &amp; b &lt;c&gt;')
    expect(email.html).not.toContain('<script>')
  })

  it('falls back when there is no schedule URL', () => {
    const email = buildSwapRequestEmail({ ...base, scheduleUrl: null })
    expect(email.text).toContain('Schedule → Swaps')
    expect(email.html).toContain('Schedule → Swaps')
  })
})
