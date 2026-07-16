import { describe, expect, it } from 'vitest'
import {
  searchDocumentIds,
  searchDocuments,
  type DocumentSearchable,
} from '#/lib/document-search'

const rows: DocumentSearchable[] = [
  {
    id: '1',
    name: 'January bank statement',
    fileName: 'chase-jan-2026.pdf',
    type: { name: 'Statement' },
  },
  {
    id: '2',
    name: 'Roof repair invoice',
    fileName: 'acme-roofing.pdf',
    type: { name: 'Invoice' },
  },
  {
    id: '3',
    name: 'Dental x-ray',
    fileName: 'xray-scan.png',
    type: { name: 'Medical' },
  },
]

describe('searchDocuments', () => {
  it('returns every row untouched for an empty query', () => {
    expect(searchDocuments(rows, '')).toEqual(rows)
    expect(searchDocuments(rows, '   ')).toEqual(rows)
  })

  it('finds by document name', () => {
    expect(searchDocuments(rows, 'bank statement').map((r) => r.id)).toContain('1')
  })

  it('is case insensitive', () => {
    expect(searchDocuments(rows, 'ROOF REPAIR').map((r) => r.id)).toContain('2')
  })

  it('tolerates a typo', () => {
    expect(searchDocuments(rows, 'invoise').map((r) => r.id)).toContain('2')
  })

  it('matches mid-string, not just the start', () => {
    expect(searchDocuments(rows, 'repair').map((r) => r.id)).toContain('2')
  })

  it('finds by file name', () => {
    expect(searchDocuments(rows, 'chase-jan').map((r) => r.id)).toContain('1')
  })

  it('finds by type name', () => {
    expect(searchDocuments(rows, 'Medical').map((r) => r.id)).toContain('3')
  })

  it('returns nothing when there is no reasonable match', () => {
    expect(searchDocuments(rows, 'zzzzqqqq')).toEqual([])
  })
})

describe('searchDocumentIds', () => {
  it('returns null for an empty query', () => {
    expect(searchDocumentIds(rows, '')).toBeNull()
    expect(searchDocumentIds(rows, '   ')).toBeNull()
  })

  it('returns a set of matching ids', () => {
    const ids = searchDocumentIds(rows, 'x-ray')
    expect(ids).not.toBeNull()
    expect(ids!.has('3')).toBe(true)
    expect(ids!.has('1')).toBe(false)
  })
})
