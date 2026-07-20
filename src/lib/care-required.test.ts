import { describe, expect, it } from 'vitest'
import { buildRequiredCoverageWindows } from '#/lib/care-required'

describe('buildRequiredCoverageWindows requiredShiftId threading', () => {
  it('ALL_DAY window carries a null requiredShiftId', () => {
    const { windows } = buildRequiredCoverageWindows({
      coverageNeed: 'FULL',
      coverageWindowKind: 'ALL_DAY',
      partialDaysOfWeek: [],
      shifts: [],
    })
    expect(windows).toHaveLength(1)
    expect(windows[0]!.requiredShiftId).toBeNull()
  })

  it('SHIFTS windows carry each shift id in sort order', () => {
    const { windows } = buildRequiredCoverageWindows({
      coverageNeed: 'FULL',
      coverageWindowKind: 'SHIFTS',
      partialDaysOfWeek: [],
      shifts: [
        { id: 'pm', label: 'PM', startTime: '15:00', endTime: '23:00', sortOrder: 1 },
        { id: 'am', label: 'AM', startTime: '07:00', endTime: '15:00', sortOrder: 0 },
      ],
    })
    expect(windows.map((w) => w.requiredShiftId)).toEqual(['am', 'pm'])
  })
})
