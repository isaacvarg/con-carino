import { describe, expect, it } from 'vitest'
import {
  buildScheduleUrl,
  escapeHtml,
  formatWindow,
} from '#/lib/email-format'

describe('escapeHtml', () => {
  it('escapes the characters that can break out of markup', () => {
    expect(escapeHtml('a & b < c > d "e"')).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot;',
    )
  })

  it('escapes ampersands before the entities it introduces', () => {
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('formatWindow', () => {
  it('collapses a same-day window to one date and a time range', () => {
    expect(
      formatWindow(new Date(2026, 6, 25, 7, 0), new Date(2026, 6, 25, 15, 0)),
    ).toBe('Sat, Jul 25 · 7:00 AM–3:00 PM')
  })

  it('shows both dates when the window crosses midnight', () => {
    const label = formatWindow(
      new Date(2026, 6, 25, 22, 0),
      new Date(2026, 6, 26, 6, 0),
    )
    expect(label).toContain('Jul 25')
    expect(label).toContain('Jul 26')
    expect(label).not.toContain('·')
  })
})

describe('buildScheduleUrl', () => {
  it('converts the month to the 0-based value the route expects', () => {
    expect(buildScheduleUrl('https://example.com', '2026-07-20', 'calendar')).toBe(
      'https://example.com/schedule?tab=calendar&year=2026&month=6&day=2026-07-20',
    )
  })

  it('carries the requested tab through', () => {
    expect(
      buildScheduleUrl('https://example.com', '2026-07-20', 'swaps'),
    ).toContain('tab=swaps')
  })

  it('strips a trailing slash from the origin', () => {
    expect(
      buildScheduleUrl('https://example.com/', '2026-12-31', 'calendar'),
    ).toBe(
      'https://example.com/schedule?tab=calendar&year=2026&month=11&day=2026-12-31',
    )
  })

  it('falls back to the current month for a malformed day', () => {
    const now = new Date()
    const url = buildScheduleUrl('https://example.com', 'not-a-day', 'calendar')
    expect(url).toContain(`year=${now.getFullYear()}`)
    expect(url).toContain(`month=${now.getMonth()}`)
    expect(url).toContain('day=not-a-day')
  })
})
