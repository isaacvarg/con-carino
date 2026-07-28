import { useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { FormActions, FormShell } from '#/components/app/ui/form'
import type { CareInvoicingMode } from '#/generated/prisma/enums'
import { clearModuleFlagsCache } from '#/lib/care-module-flags'
import type { CareModuleFlags } from '#/lib/care-modules'
import { contributionsAllowed } from '#/lib/care-modules'
import { updateCareModuleSettings } from '#/server/care-modules'

type ModulesSettingsPanelProps = {
  modules: CareModuleFlags
}

const INVOICING_CHOICES: Array<{
  value: CareInvoicingMode
  label: string
  description: string
}> = [
  {
    value: 'OFF',
    label: 'Off',
    description:
      'Hide invoicing entirely. No amounts are calculated and nothing is billed.',
  },
  {
    value: 'SIMPLE',
    label: 'Simple',
    description:
      'A read-only overview of what each paid caregiver should be paid, by week or by month. Nothing to settle or approve.',
  },
  {
    value: 'ADVANCED',
    label: 'Advanced',
    description:
      'Pay-period invoices you can settle against an account or void, plus the upcoming cost forecast.',
  },
]

export function ModulesSettingsPanel({ modules }: ModulesSettingsPanelProps) {
  const router = useRouter()
  const [invoicingMode, setInvoicingMode] = useState(modules.invoicingMode)
  const [contributionsEnabled, setContributionsEnabled] = useState(
    modules.contributionsEnabled,
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const canEnableContributions = contributionsAllowed(invoicingMode)
  // Shown as off the moment invoicing drops below advanced, matching what the
  // save will actually store.
  const contributionsChecked = contributionsEnabled && canEnableContributions

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateCareModuleSettings({
        data: { invoicingMode, contributionsEnabled: contributionsChecked },
      })
      // The sidebar reads the flags from route context, which is memoized.
      clearModuleFlagsCache()
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save modules.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormShell onSubmit={onSubmit}>
      <div>
        <h3 className="font-semibold text-base-content">Modules</h3>
        <p className="mt-1 text-sm text-base-content/60">
          Turn off the parts of the app your family does not use. Nothing is
          deleted — a module you switch back on picks up where it left off.
        </p>
      </div>

      <fieldset>
        <legend className="font-medium text-base-content">Invoicing</legend>
        <p className="mt-1 text-sm text-base-content/60">
          How much of the caregiver billing flow to show.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {INVOICING_CHOICES.map((choice) => (
            <label
              key={choice.value}
              className="flex cursor-pointer items-start gap-3 rounded-box border border-base-200 px-4 py-3"
            >
              <input
                type="radio"
                name="invoicing-mode"
                className="radio radio-primary mt-0.5"
                checked={invoicingMode === choice.value}
                onChange={() => setInvoicingMode(choice.value)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-base-content">
                  {choice.label}
                </span>
                <span className="mt-0.5 block text-xs text-base-content/60">
                  {choice.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-medium text-base-content">Contributions</legend>
        <label
          className={`mt-3 flex items-center justify-between gap-3 rounded-box border border-base-200 px-4 py-3 ${
            canEnableContributions ? 'cursor-pointer' : 'opacity-60'
          }`}
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-base-content">
              Enabled
            </span>
            <span className="mt-0.5 block text-xs text-base-content/60">
              The coverage pot, who funds it, funding periods, and how the cost
              is split between contributors.
            </span>
          </span>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={contributionsChecked}
            disabled={!canEnableContributions}
            onChange={(e) => setContributionsEnabled(e.target.checked)}
            aria-label="Enable contributions"
          />
        </label>
        {!canEnableContributions ? (
          <p className="mt-2 text-xs text-warning">
            Requires advanced invoicing — each person&apos;s share is calculated
            from the actual invoiced cost of a period, which simple and off do
            not produce.
          </p>
        ) : null}
      </fieldset>

      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      <FormActions>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </FormActions>
    </FormShell>
  )
}
