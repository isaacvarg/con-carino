import Fuse, { type IFuseOptions } from 'fuse.js'

function fuseOptions<T>(): IFuseOptions<T> {
  return {
    keys: ['name'],
    threshold: 0.4,
    // Match anywhere in the name, not just near the start.
    ignoreLocation: true,
  }
}

export function createTaxonomySearchIndex<T extends { name: string }>(
  items: T[],
): Fuse<T> {
  return new Fuse(items, fuseOptions<T>())
}

/**
 * Fuzzy-filter by name, ranked best-first. An empty query returns `items`
 * untouched so the picker shows everything in its original (name-sorted) order.
 */
export function searchTaxonomies<T extends { name: string }>(
  index: Fuse<T>,
  items: T[],
  query: string,
): T[] {
  const trimmed = query.trim()
  if (!trimmed) return items
  return index.search(trimmed).map((result) => result.item)
}
