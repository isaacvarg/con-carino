import { describe, expect, it } from 'vitest'
import { buildHireEmail, buildHireScheduleUrl } from '#/lib/hire-notify'

describe('buildHireScheduleUrl', () => {
  it('builds a swaps-tab URL with 0-based month', () => {
    expect(buildHireScheduleUrl('https://app.example.com', '2026-07-25')).toBe(
      'https://app.example.com/schedule?tab=swaps&year=2026&month=6&day=2026-07-25',
    )
  })
})

describe('buildHireEmail', () => {
  const base = {
    kind: 'REQUESTED' as const,
    audience: 'target' as const,
    actorName: 'Alex',
    requesterPersonName: 'Alex',
    targetPersonName: 'Jordan',
    windows: [
      {
        startsAt: new Date(2026, 6, 25, 7, 0, 0),
        endsAt: new Date(2026, 6, 25, 15, 0, 0),
      },
      {
        startsAt: new Date(2026, 6, 26, 7, 0, 0),
        endsAt: new Date(2026, 6, 26, 15, 0, 0),
      },
    ],
    notes: 'Need the weekend',
    scheduleUrl: 'https://app.example.com/schedule?tab=swaps',
    dayLabel: '2026-07-25',
  }

  it('asks the employee to approve a request', () => {
    const email = buildHireEmail(base)
    expect(email.subject).toBe('Hire request for coverage on 2026-07-25')
    expect(email.text).toContain('wants to hire you')
    expect(email.text).toContain('Sat, Jul 25')
    expect(email.text).toContain('Sun, Jul 26')
    expect(email.text).toContain('Notes: Need the weekend')
    expect(email.html.match(/<li>/g)).toHaveLength(2)
  })

  it('asks admins to confirm an offline employee in person', () => {
    const email = buildHireEmail({ ...base, audience: 'admin' })
    expect(email.subject).toBe(
      'Hire request for Jordan needs in-person confirmation',
    )
    expect(email.text).toContain('does not have an app account')
    expect(email.text).toContain('Confirm with them in person')
    expect(email.text).toContain('Schedule → Swaps')
  })

  it.each([
    [
      'APPROVED',
      'Your hire request for 2026-07-25 was approved',
      'approved the hire',
    ],
    [
      'REJECTED',
      'Your hire request for 2026-07-25 was declined',
      'declined the hire',
    ],
    [
      'CANCELLED',
      'A hire request for 2026-07-25 was cancelled',
      'cancelled the hire request',
    ],
  ] as const)('builds the %s email for the requester', (kind, subject, lead) => {
    const email = buildHireEmail({
      ...base,
      kind,
      audience: 'requester',
    })
    expect(email.subject).toBe(subject)
    expect(email.text).toContain(lead)
  })

  it('escapes HTML in names and notes', () => {
    const email = buildHireEmail({
      ...base,
      actorName: '<script>x</script>',
      notes: 'a & b <c>',
    })
    expect(email.html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(email.html).toContain('a &amp; b &lt;c&gt;')
    expect(email.html).not.toContain('<script>')
  })

  it('falls back when there is no schedule URL', () => {
    const email = buildHireEmail({ ...base, scheduleUrl: null })
    expect(email.text).toContain('Schedule → Swaps')
    expect(email.html).toContain('Schedule → Swaps')
  })
})
