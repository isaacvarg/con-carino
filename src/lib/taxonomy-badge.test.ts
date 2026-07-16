import { describe, expect, it } from 'vitest'
import {
  isValidHexColor,
  taxonomyBadgeStyle,
} from '#/lib/taxonomy-badge'

describe('taxonomyBadgeStyle', () => {
  it('returns empty styles when background is missing', () => {
    expect(taxonomyBadgeStyle(null)).toEqual({})
    expect(taxonomyBadgeStyle(undefined)).toEqual({})
    expect(taxonomyBadgeStyle('')).toEqual({})
  })

  it('rejects invalid hex colors', () => {
    expect(isValidHexColor('red')).toBe(false)
    expect(isValidHexColor('#gg0000')).toBe(false)
    expect(taxonomyBadgeStyle('not-a-color')).toEqual({})
  })

  it('sets DaisyUI badge CSS variables and defaults text to white', () => {
    expect(taxonomyBadgeStyle('#0d9488')).toEqual({
      '--badge-color': '#0d9488',
      '--badge-bg': '#0d9488',
      '--badge-fg': '#ffffff',
      backgroundColor: '#0d9488',
      backgroundImage: 'none',
      color: '#ffffff',
      borderColor: '#0d9488',
    })
  })

  it('uses provided text color when valid', () => {
    expect(taxonomyBadgeStyle('#111111', '#eeeeee')).toEqual({
      '--badge-color': '#111111',
      '--badge-bg': '#111111',
      '--badge-fg': '#eeeeee',
      backgroundColor: '#111111',
      backgroundImage: 'none',
      color: '#eeeeee',
      borderColor: '#111111',
    })
  })

  it('accepts 3-digit hex', () => {
    expect(taxonomyBadgeStyle('#abc', '#fff')).toEqual({
      '--badge-color': '#abc',
      '--badge-bg': '#abc',
      '--badge-fg': '#fff',
      backgroundColor: '#abc',
      backgroundImage: 'none',
      color: '#fff',
      borderColor: '#abc',
    })
  })
})
