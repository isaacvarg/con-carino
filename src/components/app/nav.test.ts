import { describe, expect, it } from 'vitest'
import {
  APP_NAV,
  flattenNavLinks,
  isModuleEnabled,
  titleForPath,
  visibleNavEntries,
  type AppNavEntry,
} from '#/components/app/nav'

const ALL_ON = { invoicingMode: 'ADVANCED', contributionsEnabled: true }
const SIMPLE = { invoicingMode: 'SIMPLE', contributionsEnabled: false }
const INVOICING_OFF = { invoicingMode: 'OFF', contributionsEnabled: false }

const paths = (entries: AppNavEntry[]) =>
  flattenNavLinks(entries).map((l) => l.to)

describe('isModuleEnabled', () => {
  it('keeps invoices for simple as well as advanced', () => {
    expect(isModuleEnabled('invoices', ALL_ON)).toBe(true)
    expect(isModuleEnabled('invoices', SIMPLE)).toBe(true)
    expect(isModuleEnabled('invoices', INVOICING_OFF)).toBe(false)
  })

  it('follows the contributions flag directly', () => {
    expect(isModuleEnabled('contributions', ALL_ON)).toBe(true)
    expect(isModuleEnabled('contributions', SIMPLE)).toBe(false)
  })
})

describe('visibleNavEntries', () => {
  it('shows everything when both modules are on', () => {
    expect(paths(visibleNavEntries(ALL_ON))).toEqual(paths(APP_NAV))
  })

  it('drops only contributions in simple mode', () => {
    const visible = paths(visibleNavEntries(SIMPLE))
    expect(visible).toContain('/invoices')
    expect(visible).not.toContain('/contributions')
  })

  it('drops both when invoicing is off', () => {
    const visible = paths(visibleNavEntries(INVOICING_OFF))
    expect(visible).not.toContain('/invoices')
    expect(visible).not.toContain('/contributions')
  })

  it('never touches links that belong to no module', () => {
    const visible = paths(visibleNavEntries(INVOICING_OFF))
    for (const to of ['/', '/accounts', '/transactions', '/schedule', '/settings']) {
      expect(visible).toContain(to)
    }
  })

  it('drops a group heading once its last link goes', () => {
    const entries: AppNavEntry[] = [
      {
        kind: 'group',
        label: 'Family ledger',
        items: APP_NAV.flatMap((e) =>
          e.kind === 'group' ? e.items.filter((i) => i.module) : [],
        ),
      },
    ]
    expect(visibleNavEntries(ALL_ON, entries)).toHaveLength(1)
    expect(visibleNavEntries(INVOICING_OFF, entries)).toEqual([])
  })

  it('keeps a group whose remaining links are unmoduled', () => {
    const ledger = APP_NAV.find(
      (e): e is Extract<AppNavEntry, { kind: 'group' }> =>
        e.kind === 'group' && e.label === 'Family ledger',
    )
    expect(ledger).toBeDefined()
    const visible = visibleNavEntries(INVOICING_OFF, [ledger!])
    expect(visible).toHaveLength(1)
    expect(paths(visible)).toEqual(['/accounts', '/transactions'])
  })
})

describe('titleForPath', () => {
  it('names the settings pages that had no entry', () => {
    expect(titleForPath('/settings/modules')).toBe('Modules')
    expect(titleForPath('/settings/contributions')).toBe('Contributions')
  })
})
