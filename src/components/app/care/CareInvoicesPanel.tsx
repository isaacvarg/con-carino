import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  FORM_SELECT_CLASS,
  FormActions,
  FormField,
} from '#/components/app/ui/form'
import type { AccountListItem } from '#/server/accounts'
import type { CareInvoiceDto } from '#/server/care'
import { settleCareInvoice, voidCareInvoice } from '#/server/care'
import { formatTimeRange } from './care-utils'

type CareInvoicesPanelProps = {
  invoices: CareInvoiceDto[]
  accounts: AccountListItem[]
}

export function CareInvoicesPanel({
  invoices,
  accounts,
}: CareInvoicesPanelProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [settleId, setSettleId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')

  const open = invoices.filter((i) => i.status === 'OPEN')
  const closed = invoices.filter((i) => i.status !== 'OPEN')

  async function settle() {
    if (!settleId || !accountId) return
    setBusyId(settleId)
    setError(null)
    try {
      await settleCareInvoice({
        data: { id: settleId, financialAccountId: accountId },
      })
      setSettleId(null)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not settle.')
    } finally {
      setBusyId(null)
    }
  }

  async function voidInvoice(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await voidCareInvoice({ data: { id } })
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not void.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="rounded-box bg-base-100 p-4 shadow-sm">
        <h3 className="font-semibold">Open invoices</h3>
        <p className="mt-1 text-sm text-base-content/60">
          Created after paid coverage shifts end. Settle into a household
          account as an expense.
        </p>
        {open.length === 0 ? (
          <p className="mt-4 text-sm text-base-content/50">No open invoices.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {open.map((inv) => (
              <li
                key={inv.id}
                className="rounded-lg border border-base-300 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {inv.carePersonName} · $
                      {Number(inv.amount).toFixed(2)}
                    </p>
                    <p className="text-sm text-base-content/60">
                      {formatTimeRange(inv.startsAt, inv.endsAt)}
                    </p>
                    <p className="text-xs text-base-content/50">
                      {Number(inv.hoursSnapshot).toFixed(2)} hrs × $
                      {Number(inv.hourlyRateSnapshot).toFixed(2)}/hr
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busyId === inv.id || accounts.length === 0}
                      onClick={() => {
                        setSettleId(inv.id)
                        setAccountId(accounts[0]?.id ?? '')
                      }}
                    >
                      Settle
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busyId === inv.id}
                      onClick={() => voidInvoice(inv.id)}
                    >
                      Void
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {accounts.length === 0 ? (
          <p className="mt-3 text-sm text-warning">
            Add a financial account before settling invoices.
          </p>
        ) : null}
      </section>

      <section className="rounded-box bg-base-100 p-4 shadow-sm">
        <h3 className="font-semibold">Paid & voided</h3>
        {closed.length === 0 ? (
          <p className="mt-4 text-sm text-base-content/50">None yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-base-300">
            {closed.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <p className="font-medium">
                    {inv.carePersonName} · ${Number(inv.amount).toFixed(2)}
                  </p>
                  <p className="text-sm text-base-content/60">
                    {formatTimeRange(inv.startsAt, inv.endsAt)}
                  </p>
                </div>
                <span className="badge badge-outline">{inv.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {settleId ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="text-lg font-semibold">Settle invoice</h3>
            <p className="mt-2 text-sm text-base-content/70">
              Creates an expense on the selected account.
            </p>
            <div className="app-form mt-4">
              <FormField label="Account" htmlFor="settle-account">
                <select
                  id="settle-account"
                  className={FORM_SELECT_CLASS}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currentBalance})
                    </option>
                  ))}
                </select>
              </FormField>
              <FormActions>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSettleId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyId === settleId}
                  onClick={settle}
                >
                  {busyId === settleId ? 'Settling…' : 'Confirm payment'}
                </button>
              </FormActions>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setSettleId(null)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </div>
  )
}
