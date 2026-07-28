import { useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import {
  FORM_INPUT_CLASS,
  FORM_SELECT_CLASS,
  FormActions,
  FormField,
  FormRow,
  FormShell,
} from '#/components/app/ui/form'
import { ConfirmDialog } from '#/components/app/ui/confirm-dialog'
import type { AccountListItem } from '#/server/accounts'
import type {
  CareContributionProfileDto,
  CarePersonDto,
  CareSettingsDto,
} from '#/server/care'
import {
  deleteContributionProfile,
  updateCareFundingSettings,
  upsertContributionProfile,
} from '#/server/care'
import type {
  CareContributionBasis,
  CareContributionCadence,
  CareSplitPolicy,
} from '#/generated/prisma/enums'

type CareContributionsPanelProps = {
  settings: CareSettingsDto
  people: CarePersonDto[]
  profiles: CareContributionProfileDto[]
  accounts: AccountListItem[]
}

const CADENCES: Array<{ value: CareContributionCadence; label: string }> = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'EVERY_N_WEEKS', label: 'Every N weeks' },
]

function money(value: string | null): string {
  if (value === null) return '—'
  return `$${Number(value).toFixed(2)}`
}

/** Positive balance = they owe the pot; negative = the pot owes them. */
function balanceLabel(balance: string): {
  text: string
  className: string
} {
  const n = Number(balance)
  if (Math.abs(n) < 0.005) {
    return { text: 'Settled up', className: 'text-base-content/50' }
  }
  return n > 0
    ? { text: `Owes $${n.toFixed(2)}`, className: 'text-warning' }
    : { text: `Credit $${Math.abs(n).toFixed(2)}`, className: 'text-success' }
}

type ProfileForm = {
  carePersonId: string
  basis: CareContributionBasis
  percent: string
  fixedAmount: string
  fundingAccountId: string
  cadence: CareContributionCadence
  intervalWeeks: string
  anchorDate: string
  monthDay: string
  autoPost: boolean
}

function emptyProfileForm(): ProfileForm {
  const today = new Date()
  return {
    carePersonId: '',
    basis: 'PERCENT',
    percent: '',
    fixedAmount: '',
    fundingAccountId: '',
    cadence: 'MONTHLY',
    intervalWeeks: '3',
    anchorDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
    monthDay: '1',
    autoPost: false,
  }
}

export function CareContributionsPanel({
  settings,
  people,
  profiles,
  accounts,
}: CareContributionsPanelProps) {
  const router = useRouter()

  const [fundingSaving, setFundingSaving] = useState(false)
  const [fundingError, setFundingError] = useState<string | null>(null)
  const [coverageAccountId, setCoverageAccountId] = useState(
    settings.coverageAccountId ?? '',
  )
  const [splitPolicy, setSplitPolicy] = useState<CareSplitPolicy>(
    settings.splitPolicy,
  )
  const [backstopPersonId, setBackstopPersonId] = useState(
    settings.backstopPersonId ?? '',
  )
  const [budget, setBudget] = useState(settings.plannedMonthlyBudget ?? '')
  const [fundingPeriodDay, setFundingPeriodDay] = useState(
    String(settings.fundingPeriodDay),
  )

  const [showProfileForm, setShowProfileForm] = useState(false)
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const configured = new Set(profiles.map((p) => p.carePersonId))
  const availablePeople = people.filter(
    (p) => p.isActive && (!configured.has(p.id) || p.id === profileForm.carePersonId),
  )

  const percentTotal = profiles
    .filter((p) => p.isActive && p.basis === 'PERCENT')
    .reduce((s, p) => s + Number(p.percent ?? 0), 0)

  function patch(next: Partial<ProfileForm>) {
    setProfileForm((prev) => ({ ...prev, ...next }))
  }

  function startEdit(profile: CareContributionProfileDto) {
    setProfileError(null)
    setProfileForm({
      carePersonId: profile.carePersonId,
      basis: profile.basis,
      percent: profile.percent ? String(Number(profile.percent)) : '',
      fixedAmount: profile.fixedAmount ?? '',
      fundingAccountId: profile.fundingAccountId ?? '',
      cadence: profile.cadence,
      intervalWeeks: String(profile.intervalWeeks),
      anchorDate: profile.anchorDate ?? emptyProfileForm().anchorDate,
      monthDay: String(profile.monthDay ?? 1),
      autoPost: profile.autoPost,
    })
    setShowProfileForm(true)
  }

  async function saveFunding(e: FormEvent) {
    e.preventDefault()
    setFundingSaving(true)
    setFundingError(null)
    try {
      await updateCareFundingSettings({
        data: {
          coverageAccountId: coverageAccountId || null,
          splitPolicy,
          backstopPersonId: backstopPersonId || null,
          plannedMonthlyBudget: budget || null,
          fundingPeriodDay: Number(fundingPeriodDay),
        },
      })
      await router.invalidate()
    } catch (err) {
      setFundingError(
        err instanceof Error ? err.message : 'Could not save funding settings.',
      )
    } finally {
      setFundingSaving(false)
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setProfileSaving(true)
    setProfileError(null)
    try {
      await upsertContributionProfile({
        data: {
          carePersonId: profileForm.carePersonId,
          basis: profileForm.basis,
          percent: profileForm.percent,
          fixedAmount: profileForm.fixedAmount,
          fundingAccountId: profileForm.fundingAccountId || null,
          cadence: profileForm.cadence,
          intervalWeeks: Number(profileForm.intervalWeeks),
          anchorDate: profileForm.anchorDate,
          monthDay: Number(profileForm.monthDay),
          autoPost: profileForm.autoPost,
          isActive: true,
        },
      })
      setShowProfileForm(false)
      setProfileForm(emptyProfileForm())
      await router.invalidate()
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Could not save the contribution.',
      )
    } finally {
      setProfileSaving(false)
    }
  }

  async function removeProfile(carePersonId: string) {
    setRemoving(true)
    try {
      await deleteContributionProfile({ data: { carePersonId } })
      setRemoveId(null)
      await router.invalidate()
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Could not remove the contribution.',
      )
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FormShell onSubmit={saveFunding}>
        <h2 className="text-lg font-semibold">Coverage pot</h2>
        <p className="text-sm text-base-content/60">
          The joint account everyone contributes to. Care invoices settle out of
          it by default, so the money going out is comparable with the money
          coming in.
        </p>

        <FormRow>
          <FormField label="Coverage account" htmlFor="coverage-account">
            <select
              id="coverage-account"
              className={FORM_SELECT_CLASS}
              value={coverageAccountId}
              onChange={(e) => setCoverageAccountId(e.target.value)}
            >
              <option value="">Not set</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Planned care budget" htmlFor="planned-budget">
            <input
              id="planned-budget"
              className={FORM_INPUT_CLASS}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
            <p className="mt-1 text-xs text-base-content/60">
              Per funding period. Sizes the recurring transfers before the real
              cost is known.
            </p>
          </FormField>
        </FormRow>

        <FormRow>
          <FormField label="Period starts on day" htmlFor="funding-period-day">
            <input
              id="funding-period-day"
              className={FORM_INPUT_CLASS}
              type="number"
              min="1"
              max="28"
              value={fundingPeriodDay}
              onChange={(e) => setFundingPeriodDay(e.target.value)}
            />
          </FormField>
          <FormField label="When shares don't add up" htmlFor="split-policy">
            <select
              id="split-policy"
              className={FORM_SELECT_CLASS}
              value={splitPolicy}
              onChange={(e) =>
                setSplitPolicy(e.target.value as CareSplitPolicy)
              }
            >
              <option value="FIXED_FIRST_THEN_PERCENT">
                Fixed amounts first, percentages split the rest
              </option>
              <option value="BACKSTOP">One person absorbs the remainder</option>
            </select>
            <p className="mt-1 text-xs text-base-content/60">
              {splitPolicy === 'FIXED_FIRST_THEN_PERCENT'
                ? 'Fixed pledges come off the top; percentage contributors split what remains, scaled against each other so the pot is always fully covered.'
                : 'Percentages and fixed amounts apply literally. Whatever is left over — or short — goes to the person you nominate.'}
            </p>
          </FormField>
        </FormRow>

        {splitPolicy === 'BACKSTOP' ? (
          <FormField label="Who absorbs the remainder" htmlFor="backstop">
            <select
              id="backstop"
              className={FORM_SELECT_CLASS}
              value={backstopPersonId}
              onChange={(e) => setBackstopPersonId(e.target.value)}
              required
            >
              <option value="">Select someone…</option>
              {people
                .filter((p) => p.isActive)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </FormField>
        ) : null}

        {fundingError ? (
          <p className="text-sm text-error" role="alert">
            {fundingError}
          </p>
        ) : null}

        <FormActions>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={fundingSaving}
          >
            {fundingSaving ? 'Saving…' : 'Save'}
          </button>
        </FormActions>
      </FormShell>

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Contributions</h2>
              <p className="text-sm text-base-content/60">
                Who funds care, how much, and where it comes from.
              </p>
            </div>
            {!showProfileForm ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setProfileError(null)
                  setProfileForm(emptyProfileForm())
                  setShowProfileForm(true)
                }}
              >
                Add contributor
              </button>
            ) : null}
          </div>

          {profiles.length > 0 &&
          splitPolicy === 'FIXED_FIRST_THEN_PERCENT' &&
          percentTotal > 0 &&
          Math.abs(percentTotal - 100) > 0.0001 ? (
            <div className="alert alert-info text-sm">
              Percentages add up to {percentTotal.toFixed(2)}%. They are scaled
              against each other, so the pot is still fully covered — each
              person&rsquo;s real share just differs from the number shown.
            </div>
          ) : null}

          {showProfileForm ? (
            <FormShell card={false} onSubmit={saveProfile}>
              <FormRow>
                <FormField label="Person" htmlFor="contrib-person">
                  <select
                    id="contrib-person"
                    className={FORM_SELECT_CLASS}
                    value={profileForm.carePersonId}
                    onChange={(e) => patch({ carePersonId: e.target.value })}
                    required
                  >
                    <option value="">Select someone…</option>
                    {availablePeople.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Contributes" htmlFor="contrib-basis">
                  <select
                    id="contrib-basis"
                    className={FORM_SELECT_CLASS}
                    value={profileForm.basis}
                    onChange={(e) =>
                      patch({ basis: e.target.value as CareContributionBasis })
                    }
                  >
                    <option value="PERCENT">A percentage of the cost</option>
                    <option value="FIXED">A fixed amount</option>
                  </select>
                </FormField>
              </FormRow>

              <FormRow>
                {profileForm.basis === 'PERCENT' ? (
                  <FormField label="Percentage" htmlFor="contrib-percent">
                    <input
                      id="contrib-percent"
                      className={FORM_INPUT_CLASS}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      inputMode="decimal"
                      value={profileForm.percent}
                      onChange={(e) => patch({ percent: e.target.value })}
                      required
                    />
                  </FormField>
                ) : (
                  <FormField label="Amount" htmlFor="contrib-fixed">
                    <input
                      id="contrib-fixed"
                      className={FORM_INPUT_CLASS}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={profileForm.fixedAmount}
                      onChange={(e) => patch({ fixedAmount: e.target.value })}
                      required
                    />
                    <p className="mt-1 text-xs text-base-content/60">
                      Paid regardless of what the percentages work out to.
                    </p>
                  </FormField>
                )}
                <FormField label="Comes from" htmlFor="contrib-account">
                  <select
                    id="contrib-account"
                    className={FORM_SELECT_CLASS}
                    value={profileForm.fundingAccountId}
                    onChange={(e) => patch({ fundingAccountId: e.target.value })}
                  >
                    <option value="">No account (pays another way)</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              </FormRow>

              <FormRow>
                <FormField label="Transfer cadence" htmlFor="contrib-cadence">
                  <select
                    id="contrib-cadence"
                    className={FORM_SELECT_CLASS}
                    value={profileForm.cadence}
                    onChange={(e) =>
                      patch({
                        cadence: e.target.value as CareContributionCadence,
                      })
                    }
                  >
                    {CADENCES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                {profileForm.cadence === 'MONTHLY' ? (
                  <FormField label="Day of month" htmlFor="contrib-month-day">
                    <input
                      id="contrib-month-day"
                      className={FORM_INPUT_CLASS}
                      type="number"
                      min="1"
                      max="28"
                      value={profileForm.monthDay}
                      onChange={(e) => patch({ monthDay: e.target.value })}
                    />
                  </FormField>
                ) : (
                  <>
                    {profileForm.cadence === 'EVERY_N_WEEKS' ? (
                      <FormField label="Every N weeks" htmlFor="contrib-weeks">
                        <input
                          id="contrib-weeks"
                          className={FORM_INPUT_CLASS}
                          type="number"
                          min="1"
                          max="12"
                          value={profileForm.intervalWeeks}
                          onChange={(e) =>
                            patch({ intervalWeeks: e.target.value })
                          }
                        />
                      </FormField>
                    ) : null}
                    <FormField label="Starting from" htmlFor="contrib-anchor">
                      <input
                        id="contrib-anchor"
                        className={FORM_INPUT_CLASS}
                        type="date"
                        value={profileForm.anchorDate}
                        onChange={(e) => patch({ anchorDate: e.target.value })}
                      />
                    </FormField>
                  </>
                )}
              </FormRow>

              <FormField
                label="Create the transfer automatically"
                htmlFor="contrib-auto"
              >
                <input
                  id="contrib-auto"
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={profileForm.autoPost}
                  onChange={(e) => patch({ autoPost: e.target.checked })}
                />
                <p className="mt-1 text-xs text-base-content/60">
                  {profileForm.autoPost
                    ? 'The transfer is posted on the due date with no review.'
                    : 'The transfer is proposed on the due date and waits for one click to confirm.'}
                </p>
              </FormField>

              {profileError ? (
                <p className="text-sm text-error" role="alert">
                  {profileError}
                </p>
              ) : null}

              <FormActions>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setShowProfileForm(false)
                    setProfileError(null)
                  }}
                  disabled={profileSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={profileSaving}
                >
                  {profileSaving ? 'Saving…' : 'Save'}
                </button>
              </FormActions>
            </FormShell>
          ) : null}

          {profiles.length === 0 ? (
            <p className="text-sm text-base-content/50">
              No contributors yet. Add one to start splitting the cost of care.
            </p>
          ) : (
            <ul className="divide-y divide-base-300">
              {profiles.map((p) => {
                const bal = balanceLabel(p.balance)
                return (
                  <li
                    key={p.carePersonId}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{p.carePersonName}</p>
                      <p className="text-sm text-base-content/60">
                        {p.basis === 'PERCENT'
                          ? `${Number(p.percent ?? 0).toFixed(2)}% of cost`
                          : `${money(p.fixedAmount)} fixed`}
                        {' · '}
                        {p.cadence === 'MONTHLY'
                          ? `monthly on day ${p.monthDay ?? 1}`
                          : p.cadence === 'WEEKLY'
                            ? 'weekly'
                            : `every ${p.intervalWeeks} weeks`}
                        {' · '}
                        {p.autoPost ? 'auto-posts' : 'confirms manually'}
                      </p>
                      <p className={`text-sm ${bal.className}`}>{bal.text}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => startEdit(p)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-error"
                        onClick={() => setRemoveId(p.carePersonId)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={removeId !== null}
        tone="danger"
        title="Remove this contribution"
        message="They stop being billed for future periods. Ledger history and any running balance are kept."
        confirmLabel="Remove"
        busy={removing}
        onConfirm={() => {
          if (removeId) void removeProfile(removeId)
        }}
        onCancel={() => setRemoveId(null)}
      />
    </div>
  )
}
