import { useRouter } from '@tanstack/react-router'
import { useEffect, useState, useTransition, type FormEvent } from 'react'
import {
  CarePersonFormFields,
  carePersonFormPayload,
  type CarePersonFormValues,
} from '#/components/app/care/CarePersonFormFields'
import {
  DEFAULT_PERSON_BG_COLOR,
  DEFAULT_PERSON_TEXT_COLOR,
} from '#/components/app/care/care-utils'
import { ActivityTable } from '#/components/app/activity/ActivityViews'
import {
  FORM_INPUT_CLASS,
  FormActions,
  FormField,
  FormShell,
} from '#/components/app/ui/form'
import { uploadFile } from '#/lib/upload-client'
import type { ActivityListItem } from '#/server/activity'
import type { CarePersonTypeDto } from '#/server/care'
import type { UserDetail } from '#/server/users'
import {
  listUserActivity,
  revokeUserSessions,
  updateUserCarePerson,
  updateUserProfile,
} from '#/server/users'

function personFormFromDetail(user: UserDetail): CarePersonFormValues {
  const person = user.carePerson
  return {
    name: person?.name ?? user.name ?? '',
    typeId: person?.typeId ?? '',
    userId: user.id,
    hourlyRate: person?.hourlyRate ?? '',
    rateType: person?.rateType ?? 'HOURLY',
    flatDailyRate: person?.flatDailyRate ?? false,
    payInterval: person?.payInterval ?? 'PER_SHIFT',
    payWeekday: String(person?.payWeekday ?? 5),
    payAnchorDate: person?.payAnchorDate ?? '',
    payMonthDay: String(person?.payMonthDay ?? 1),
    bgColor: person?.bgColor ?? DEFAULT_PERSON_BG_COLOR,
    textColor: person?.textColor ?? DEFAULT_PERSON_TEXT_COLOR,
    isActive: person?.isActive ?? true,
  }
}

type UserDetailPanelProps = {
  user: UserDetail
  types: CarePersonTypeDto[]
  activity: { items: ActivityListItem[]; nextCursor: string | null }
}

export function UserDetailPanel({
  user,
  types,
  activity: initialActivity,
}: UserDetailPanelProps) {
  const router = useRouter()

  const [name, setName] = useState(user.name ?? '')
  const [isAdmin, setIsAdmin] = useState(user.isAdmin)
  const [imageUrl, setImageUrl] = useState(user.imageUrl)
  const [pendingImageKey, setPendingImageKey] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [personForm, setPersonForm] = useState<CarePersonFormValues>(() =>
    personFormFromDetail(user),
  )
  const [personError, setPersonError] = useState<string | null>(null)
  const [personSaving, setPersonSaving] = useState(false)

  const [sessionError, setSessionError] = useState<string | null>(null)
  const [sessionBusy, setSessionBusy] = useState(false)

  const [extra, setExtra] = useState<ActivityListItem[]>([])
  const [nextCursor, setNextCursor] = useState(initialActivity.nextCursor)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setName(user.name ?? '')
    setIsAdmin(user.isAdmin)
    setImageUrl(user.imageUrl)
    setPendingImageKey(null)
    setPersonForm(personFormFromDetail(user))
    setExtra([])
    setNextCursor(initialActivity.nextCursor)
  }, [user, initialActivity])

  async function onAvatarChange(file: File | null) {
    if (!file) return
    setUploading(true)
    setProfileError(null)
    try {
      const uploaded = await uploadFile(file)
      setPendingImageKey(uploaded.storageKey)
      setImageUrl(URL.createObjectURL(file))
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Could not upload image.',
      )
    } finally {
      setUploading(false)
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setProfileSaving(true)
    setProfileError(null)
    try {
      await updateUserProfile({
        data: {
          userId: user.id,
          name,
          isAdmin,
          ...(pendingImageKey !== null ? { image: pendingImageKey } : {}),
        },
      })
      setPendingImageKey(null)
      await router.invalidate()
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Could not save profile.',
      )
    } finally {
      setProfileSaving(false)
    }
  }

  async function saveCarePerson(e: FormEvent) {
    e.preventDefault()
    setPersonSaving(true)
    setPersonError(null)
    try {
      await updateUserCarePerson({
        data: {
          ...carePersonFormPayload(personForm),
          userId: user.id,
        },
      })
      await router.invalidate()
    } catch (err) {
      setPersonError(
        err instanceof Error ? err.message : 'Could not save care person.',
      )
    } finally {
      setPersonSaving(false)
    }
  }

  async function revokeSessions() {
    if (
      !window.confirm(
        `Revoke all sessions for ${user.name ?? user.email ?? 'this user'}? They will be signed out everywhere.`,
      )
    ) {
      return
    }
    setSessionBusy(true)
    setSessionError(null)
    try {
      await revokeUserSessions({ data: { userId: user.id } })
      await router.invalidate()
    } catch (err) {
      setSessionError(
        err instanceof Error ? err.message : 'Could not revoke sessions.',
      )
    } finally {
      setSessionBusy(false)
    }
  }

  function loadMoreActivity() {
    if (!nextCursor || pending) return
    startTransition(async () => {
      const page = await listUserActivity({
        data: { userId: user.id, take: 50, cursor: nextCursor },
      })
      setExtra((prev) => [...prev, ...page.items])
      setNextCursor(page.nextCursor)
    })
  }

  const activityItems = [...initialActivity.items, ...extra]
  const initials = (user.name?.trim() || user.email?.trim() || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex flex-col gap-6">
      <div className="app-card p-4 sm:p-6">
        <h3 className="text-xl font-bold tracking-tight text-base-content">
          Profile
        </h3>
        <p className="mt-1 text-sm text-base-content/60">
          Display name, photo, and admin access.
        </p>
        <FormShell card={false} onSubmit={saveProfile} className="mt-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="avatar">
              <div className="w-16 rounded-full bg-primary text-primary-content">
                {imageUrl ? (
                  <img src={imageUrl} alt="" />
                ) : (
                  <span className="flex size-full items-center justify-center text-sm font-semibold">
                    {initials}
                  </span>
                )}
              </div>
            </div>
            <label className="btn btn-sm btn-ghost">
              {uploading ? 'Uploading…' : 'Change photo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading || profileSaving}
                onChange={(e) =>
                  void onAvatarChange(e.target.files?.[0] ?? null)
                }
              />
            </label>
          </div>
          <FormField label="Display name" htmlFor="user-name">
            <input
              id="user-name"
              className={FORM_INPUT_CLASS}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField label="Email" htmlFor="user-email">
            <input
              id="user-email"
              className={FORM_INPUT_CLASS}
              value={user.email ?? ''}
              disabled
            />
          </FormField>
          <FormField label="Admin" htmlFor="user-admin">
            <input
              id="user-admin"
              type="checkbox"
              className="toggle toggle-primary"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
            />
          </FormField>
          {profileError ? (
            <p className="text-sm text-error" role="alert">
              {profileError}
            </p>
          ) : null}
          <FormActions>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={profileSaving || uploading}
            >
              {profileSaving ? 'Saving…' : 'Save profile'}
            </button>
          </FormActions>
        </FormShell>
      </div>

      <div className="app-card p-4 sm:p-6">
        <h3 className="text-xl font-bold tracking-tight text-base-content">
          Care person
        </h3>
        <p className="mt-1 text-sm text-base-content/60">
          Calendar name, type, pay, and colors for this linked person.
        </p>
        {types.length === 0 ? (
          <p className="mt-4 text-sm text-base-content/60">
            Create a person type under People settings first.
          </p>
        ) : (
          <FormShell card={false} onSubmit={saveCarePerson} className="mt-4">
            <CarePersonFormFields
              idPrefix="user-person"
              types={types}
              values={personForm}
              onChange={(patch) =>
                setPersonForm((prev) => ({ ...prev, ...patch }))
              }
            />
            {personError ? (
              <p className="text-sm text-error" role="alert">
                {personError}
              </p>
            ) : null}
            <FormActions>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={personSaving}
              >
                {personSaving ? 'Saving…' : 'Save care person'}
              </button>
            </FormActions>
          </FormShell>
        )}
      </div>

      <div className="app-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-base-content">
              Sessions
            </h3>
            <p className="mt-1 text-sm text-base-content/60">
              {user.sessions.length} active session
              {user.sessions.length === 1 ? '' : 's'}. Revoking signs them out
              everywhere.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-error btn-outline btn-sm"
            disabled={sessionBusy || user.sessions.length === 0}
            onClick={() => void revokeSessions()}
          >
            {sessionBusy ? 'Revoking…' : 'Revoke all sessions'}
          </button>
        </div>
        {sessionError ? (
          <p className="mt-3 text-sm text-error" role="alert">
            {sessionError}
          </p>
        ) : null}
        {user.sessions.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-base-content/70">
            {user.sessions.map((session) => (
              <li key={session.id}>
                Expires{' '}
                {new Date(session.expires).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="app-card p-4 sm:p-6">
        <h3 className="text-xl font-bold tracking-tight text-base-content">
          Activity
        </h3>
        <p className="mt-1 mb-4 text-sm text-base-content/60">
          Actions performed by this user, including sign-in and sign-out.
        </p>
        <ActivityTable items={activityItems} />
        {nextCursor ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-3"
            disabled={pending}
            onClick={loadMoreActivity}
          >
            {pending ? 'Loading…' : 'Load more'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
