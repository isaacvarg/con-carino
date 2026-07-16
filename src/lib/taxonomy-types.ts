export type TaxonomyListItem = {
  id: string
  name: string
}

/** A taxonomy reference carrying enough to paint it. */
export type ColoredTaxonomyRef = TaxonomyListItem & {
  bgColor: string | null
  textColor: string | null
}

/** Prisma select yielding a `ColoredTaxonomyRef`. */
export const TAXONOMY_COLOR_SELECT = {
  id: true,
  name: true,
  bgColor: true,
  textColor: true,
} as const

export function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

export type PayeeRecord = TaxonomyListItem & {
  description: string | null
  iconId: string | null
  bgColor: string | null
  textColor: string | null
}

export type CategoryRecord = TaxonomyListItem & {
  isExpenditure: boolean
  iconId: string | null
  bgColor: string | null
  textColor: string | null
}

export type TagRecord = TaxonomyListItem & {
  iconId: string | null
  bgColor: string | null
  textColor: string | null
}
