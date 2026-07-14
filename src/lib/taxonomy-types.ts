export type TaxonomyListItem = {
  id: string
  name: string
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
