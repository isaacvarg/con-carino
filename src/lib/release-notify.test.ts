import { describe, expect, it } from 'vitest'
import {
  buildReleaseEmail,
  buildReleaseScheduleUrl,
} from '#/lib/release-notify'

const SAME_DAY = {
  startsAt: new Date(2026, 6, 25, 7, 0),
  endsAt: new Date(2026, 6, 25, 15, 0),
}

function build(overrides: Partial<Parameters<typeof buildReleaseEmail>[0]> = {}) {
  return buildReleaseEmail({
    actorName: 'Alex',
    startsAt: SAME_DAY.startsAt,
    endsAt: SAME_DAY.endsAt,
    scheduleUrl: 'https://enos.example.com/schedule?tab=calendar',
    dayLabel: '2026-07-25',
    ...overrides,
  })
}

describe('buildReleaseEmail', () => {
  it('names the day in the subject', () => {
    expect(build().subject).toBe('Coverage is open on 2026-07-25')
  })

  it('leads with who gave the slot up', () => {
    const email = build()
    expect(email.text).toContain(
      'Alex removed themselves from the slot, and it is now open.',
    )
    expect(email.html).toContain(
      'Alex removed themselves from the slot, and it is now open.',
    )
  })

  it('falls back to "Someone" for a missing or blank actor', () => {
    expect(build({ actorName: null }).text).toContain(
      'Someone removed themselves from the slot',
    )
    expect(build({ actorName: '   ' }).text).toContain(
      'Someone removed themselves from the slot',
    )
  })

  it('renders a same-day window as one date with a time range', () => {
    expect(build().text).toContain('Sat, Jul 25 · 7:00 AM–3:00 PM')
  })

  it('renders an overnight window with both dates', () => {
    const email = build({
      startsAt: new Date(2026, 6, 25, 22, 0),
      endsAt: new Date(2026, 6, 26, 6, 0),
    })
    expect(email.text).toContain('Jul 25')
    expect(email.text).toContain('Jul 26')
  })

  it('links to the schedule when an origin is known', () => {
    const email = build()
    expect(email.text).toContain(
      'Pick it up: https://enos.example.com/schedule?tab=calendar',
    )
    expect(email.html).toContain('<a href="https://enos.example.com/schedule')
  })

  it('falls back to in-app instructions without a link', () => {
    const email = build({ scheduleUrl: null })
    expect(email.text).toContain('Open the Schedule tab in the app to pick it up.')
    expect(email.html).toContain('Open the Schedule tab in the app to pick it up.')
    expect(email.html).not.toContain('<a href')
  })

  it('escapes html in the actor name', () => {
    const email = build({ actorName: '<script>alert(1)</script>' })
    expect(email.html).toContain('&lt;script&gt;')
    expect(email.html).not.toContain('<script>')
  })
})

describe('buildReleaseScheduleUrl', () => {
  it('deep-links the calendar tab with a 0-based month', () => {
    expect(
      buildReleaseScheduleUrl('https://enos.example.com', '2026-07-20'),
    ).toBe(
      'https://enos.example.com/schedule?tab=calendar&year=2026&month=6&day=2026-07-20',
    )
  })

  it('strips a trailing slash from the origin', () => {
    expect(
      buildReleaseScheduleUrl('https://enos.example.com/', '2026-01-02'),
    ).toBe(
      'https://enos.example.com/schedule?tab=calendar&year=2026&month=0&day=2026-01-02',
    )
  })
})
