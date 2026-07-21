import { describe, expect, it } from 'vitest'
import {
  buildSwapEmail,
  buildSwapScheduleUrl,
  resolveAppOrigin,
  shouldNotifyParticipant,
} from '#/lib/swap-notify'

describe('shouldNotifyParticipant', () => {
  it('notifies a linked participant with email', () => {
    expect(
      shouldNotifyParticipant(
        { userId: 'user-a', email: 'a@example.com' },
        'user-b',
      ),
    ).toBe(true)
  })

  it('skips offline participants', () => {
    expect(
      shouldNotifyParticipant({ userId: null, email: null }, 'user-b'),
    ).toBe(false)
  })

  it('skips linked participants without email', () => {
    expect(
      shouldNotifyParticipant({ userId: 'user-a', email: '  ' }, 'user-b'),
    ).toBe(false)
  })

  it('skips when the participant is the actor', () => {
    expect(
      shouldNotifyParticipant(
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


describe('buildSwapEmail', () => {
  const base = {
    kind: 'REQUESTED' as const,
    actorName: 'Alex',
    requesterPersonName: 'Alex',
    targetPersonName: 'Jordan',
    takeWindows: [
      {
        startsAt: new Date(2026, 6, 25, 7, 0, 0),
        endsAt: new Date(2026, 6, 25, 15, 0, 0),
      },
      {
        startsAt: new Date(2026, 6, 26, 7, 0, 0),
        endsAt: new Date(2026, 6, 26, 15, 0, 0),
      },
    ],
    giveWindows: [
      {
        startsAt: new Date(2026, 6, 28, 7, 0, 0),
        endsAt: new Date(2026, 6, 28, 15, 0, 0),
      },
    ],
    notes: 'Need the weekend',
    scheduleUrl: 'https://app.example.com/schedule?tab=swaps',
    dayLabel: '2026-07-25',
  }

  it('lists every take and give window', () => {
    const email = buildSwapEmail(base)
    expect(email.subject).toBe('Swap requested for your coverage on 2026-07-25')
    expect(email.text).toContain('Alex takes from Jordan')
    expect(email.text).toContain('Jordan receives from Alex')
    expect(email.text).toContain('Sat, Jul 25')
    expect(email.text).toContain('Sun, Jul 26')
    expect(email.text).toContain('Tue, Jul 28')
    expect(email.text).toContain('Notes: Need the weekend')
    expect(email.text).toContain(base.scheduleUrl)
    expect(email.html.match(/<li>/g)).toHaveLength(3)
  })

  it('says nothing is offered for a take-only request', () => {
    const email = buildSwapEmail({ ...base, giveWindows: [] })
    expect(email.text).toContain('Nothing offered in exchange.')
    expect(email.html).toContain('Nothing offered in exchange.')
    expect(email.html.match(/<li>/g)).toHaveLength(2)
  })

  it.each([
    ['APPROVED', 'Your swap for 2026-07-25 was approved', 'approved the swap'],
    ['REJECTED', 'Your swap for 2026-07-25 was declined', 'declined the swap'],
    [
      'CANCELLED',
      'A swap request for 2026-07-25 was cancelled',
      'cancelled the swap request',
    ],
  ] as const)('builds the %s email', (kind, subject, lead) => {
    const email = buildSwapEmail({ ...base, kind })
    expect(email.subject).toBe(subject)
    expect(email.text).toContain(lead)
  })

  it('escapes HTML in names and notes', () => {
    const email = buildSwapEmail({
      ...base,
      actorName: '<script>x</script>',
      notes: 'a & b <c>',
    })
    expect(email.html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(email.html).toContain('a &amp; b &lt;c&gt;')
    expect(email.html).not.toContain('<script>')
  })

  it('falls back when there is no schedule URL', () => {
    const email = buildSwapEmail({ ...base, scheduleUrl: null })
    expect(email.text).toContain('Schedule → Swaps')
    expect(email.html).toContain('Schedule → Swaps')
  })
})
