import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HIRE_CALENDAR_LABEL,
  formatHireCalendarLabel,
} from '#/lib/care-hire-label'

const names = { originalUser: 'Alex', employedUser: 'Jordan' }

describe('formatHireCalendarLabel', () => {
  it('fills both placeholders in the default template', () => {
    expect(formatHireCalendarLabel(DEFAULT_HIRE_CALENDAR_LABEL, names)).toBe(
      'Alex hired Jordan',
    )
  })

  it('supports an original-only template', () => {
    expect(formatHireCalendarLabel('%originalUser hired', names)).toBe(
      'Alex hired',
    )
  })

  it('leaves unknown tokens as-is', () => {
    expect(formatHireCalendarLabel('%originalUser → %other', names)).toBe(
      'Alex → %other',
    )
  })

  it('falls back to the employed name when the template is blank', () => {
    expect(formatHireCalendarLabel('   ', names)).toBe('Jordan')
  })
})
