import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_FIELD_LABELS,
  formatActivityField,
  resolveActivityHref,
  type ActivityLinkMeta,
} from '#/lib/activity'

describe('activity reconciliation metadata', () => {
  it('labels reconciliation status field', () => {
    expect(ACTIVITY_FIELD_LABELS.reconciliationStatus).toBe(
      'Reconciliation status',
    )
    expect(formatActivityField('reconciliationStatus')).toBe(
      'Reconciliation status',
    )
  })

  it('preserves duringReconciliation on link meta type usage', () => {
    const meta: ActivityLinkMeta = {
      accountName: 'Checking',
      duringReconciliation: true,
    }
    expect(meta.duringReconciliation).toBe(true)
  })

  it('includes recon search defaults on account activity hrefs', () => {
    const href = resolveActivityHref({
      entityType: 'account',
      entityId: 'acct-1',
    })
    expect(href).toEqual({
      to: '/accounts/$accountId',
      params: { accountId: 'acct-1' },
      search: {
        page: 1,
        pageSize: 10,
        sort: '-date',
        q: '',
        cols: '',
        mode: '',
        reconView: 'list',
      },
    })
  })
})
