/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TaxonomyBadge } from '#/components/app/transactions/TaxonomyBadge'

afterEach(() => {
  cleanup()
})

describe('TaxonomyBadge', () => {
  it('renders the name with ghost fallback when colors are missing', () => {
    render(<TaxonomyBadge name="Groceries" />)
    const badge = screen.getByText('Groceries')
    expect(badge.className).toContain('badge')
    expect(badge.className).toContain('badge-ghost')
    expect(badge.style.backgroundColor).toBe('')
  })

  it('defaults to the small size and honours a larger one', () => {
    const { rerender } = render(<TaxonomyBadge name="Rent" />)
    expect(screen.getByText('Rent').className).toContain('badge-sm')

    rerender(<TaxonomyBadge name="Rent" size="lg" />)
    const badge = screen.getByText('Rent')
    expect(badge.className).toContain('badge-lg')
    expect(badge.className).not.toContain('badge-sm')
  })

  it('applies custom background and text colors', () => {
    render(
      <TaxonomyBadge name="Coffee" bgColor="#0d9488" textColor="#ffffff" />,
    )
    const badge = screen.getByText('Coffee')
    expect(badge.className).toContain('border-transparent')
    expect(badge.className).not.toContain('badge-ghost')
    expect(badge.style.getPropertyValue('--badge-color')).toBe('#0d9488')
    expect(badge.style.getPropertyValue('--badge-fg')).toBe('#ffffff')
    expect(badge.style.getPropertyValue('--badge-bg')).toBe('#0d9488')
    expect(badge.style.backgroundColor).toBe('rgb(13, 148, 136)')
    expect(badge.style.color).toBe('rgb(255, 255, 255)')
  })
})
