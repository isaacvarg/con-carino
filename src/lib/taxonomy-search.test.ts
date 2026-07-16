import { describe, expect, it } from 'vitest'
import {
  createTaxonomySearchIndex,
  searchTaxonomies,
} from '#/lib/taxonomy-search'

const items = [
  { id: '1', name: 'Groceries' },
  { id: '2', name: 'Utilities' },
  { id: '3', name: 'Rent' },
  { id: '4', name: 'Coffee Shops' },
]

function search(query: string) {
  return searchTaxonomies(createTaxonomySearchIndex(items), items, query)
}

describe('searchTaxonomies', () => {
  it('returns every item untouched for an empty query', () => {
    expect(search('')).toEqual(items)
    expect(search('   ')).toEqual(items)
  })

  it('finds an exact name', () => {
    expect(search('Rent').map((item) => item.name)).toContain('Rent')
  })

  it('is case insensitive', () => {
    expect(search('groceries').map((item) => item.name)).toContain('Groceries')
  })

  it('tolerates a typo', () => {
    expect(search('grocerys').map((item) => item.name)).toContain('Groceries')
  })

  it('matches mid-name, not just the start', () => {
    expect(search('Shops').map((item) => item.name)).toContain('Coffee Shops')
  })

  it('returns nothing when there is no reasonable match', () => {
    expect(search('zzzzqqqq')).toEqual([])
  })
})
