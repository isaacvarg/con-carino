import { useRouter } from '@tanstack/react-router'
import { useMemo, useState, type FormEvent } from 'react'
import { ConfirmDialog } from '#/components/app/ui/confirm-dialog'
import {
  FORM_INPUT_CLASS,
  FORM_SELECT_CLASS,
  FORM_TEXTAREA_CLASS,
  FormActions,
  FormField,
  FormRow,
  FormShell,
} from '#/components/app/ui/form'
import type {
  CareCalendarEventDto,
  CareCoverageOccurrenceDto,
  CareCoverageSeriesDto,
  CareEventTypeDto,
  CarePersonDto,
} from '#/server/care'
import {
  claimOccurrences,
  createCalendarEvent,
  createCoverageOccurrence,
  createCoverageSeries,
  createSwapRequest,
  deleteCoverageSeries,
  listCoverageSeries,
  updateOccurrence,
} from '#/server/care'
import {
  DAY_NAMES,
  dayKey,
  formatTimeRange,
  isSameLocalDay,
  monthGrid,
  personChipStyle,
  toDateInputValue,
  toLocalIsoFromParts,
} from './care-utils'

type CareCalendarPanelProps = {
  lovedOneName: string
  year: number
  month: number
  selectedDay: string
  occurrences: CareCoverageOccurrenceDto[]
  events: CareCalendarEventDto[]
  eventTypes: CareEventTypeDto[]
  people: CarePersonDto[]
  onMonthChange: (year: number, month: number) => void
  onSelectDay: (dayKey: string) => void
}

type ModalKind =
  | 'coverage'
  | 'series'
  | 'event'
  | 'swap'
  | 'assign'
  | 'manage'
  | null

export function CareCalendarPanel({
  lovedOneName,
  year,
  month,
  selectedDay,
  occurrences,
  events,
  eventTypes,
  people,
  onMonthChange,
  onSelectDay,
}: CareCalendarPanelProps) {
  const router = useRouter()
  const cells = useMemo(() => monthGrid(year, month), [year, month])
  const selectedDate = useMemo(() => {
    const [y, m, d] = selectedDay.split('-').map(Number)
    return new Date(y!, m! - 1, d!)
  }, [selectedDay])

  const dayOccurrences = occurrences.filter((o) =>
    isSameLocalDay(new Date(o.startsAt), selectedDate),
  )
  const dayEvents = events.filter((e) =>
    isSameLocalDay(new Date(e.startsAt), selectedDate),
  )

  const [modal, setModal] = useState<ModalKind>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [swapFromId, setSwapFromId] = useState<string | null>(null)
  const [assignOccurrenceId, setAssignOccurrenceId] = useState<string | null>(
    null,
  )
  const [selectMode, setSelectMode] = useState(false)
  const [selectedOpenIds, setSelectedOpenIds] = useState<string[]>([])
  const [bulkAssigneeId, setBulkAssigneeId] = useState('')
  const [seriesList, setSeriesList] = useState<CareCoverageSeriesDto[]>([])
  const [manageError, setManageError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [assigneeId, setAssigneeId] = useState('')
  const [startDate, setStartDate] = useState(selectedDay)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [endDate, setEndDate] = useState('')
  const [frequency, setFrequency] = useState<'WEEKLY' | 'BIWEEKLY'>('WEEKLY')
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([selectedDate.getDay()])
  const [notes, setNotes] = useState('')
  const [title, setTitle] = useState('')
  const [eventTypeId, setEventTypeId] = useState(eventTypes[0]?.id ?? '')
  const [claimId, setClaimId] = useState('')
  const [claimForPersonId, setClaimForPersonId] = useState(
    people.find((p) => p.isActive)?.id ?? '',
  )

  const openSlots = occurrences.filter(
    (o) => !o.assigneeId && o.status === 'SCHEDULED',
  )
  const activePeople = people.filter((p) => p.isActive)

  function openModal(
    kind: ModalKind,
    opts?: { swapFrom?: string; assignId?: string },
  ) {
    setError(null)
    setModal(kind)
    setStartDate(selectedDay)
    setStartTime('09:00')
    setEndTime('17:00')
    setEndDate('')
    setFrequency('WEEKLY')
    setDaysOfWeek([selectedDate.getDay()])
    setNotes('')
    setTitle('')
    setEventTypeId(eventTypes[0]?.id ?? '')
    setAssigneeId(activePeople[0]?.id ?? '')
    setClaimId('')
    setClaimForPersonId(activePeople[0]?.id ?? '')
    setSwapFromId(opts?.swapFrom ?? null)
    setAssignOccurrenceId(opts?.assignId ?? null)
  }

  async function openManageSeries() {
    setManageError(null)
    setError(null)
    setModal('manage')
    try {
      const rows = await listCoverageSeries()
      setSeriesList(rows)
    } catch (err) {
      setManageError(
        err instanceof Error ? err.message : 'Could not load recurring coverage.',
      )
    }
  }

  function prevMonth() {
    if (month === 0) onMonthChange(year - 1, 11)
    else onMonthChange(year, month - 1)
  }

  function nextMonth() {
    if (month === 11) onMonthChange(year + 1, 0)
    else onMonthChange(year, month + 1)
  }

  function toggleDay(d: number) {
    setDaysOfWeek((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    )
  }

  function toggleSelectMode() {
    setSelectMode((prev) => {
      if (prev) setSelectedOpenIds([])
      else setBulkAssigneeId(activePeople[0]?.id ?? '')
      return !prev
    })
  }

  function toggleOpenSelection(id: string) {
    setSelectedOpenIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function claimSelected() {
    if (!bulkAssigneeId || selectedOpenIds.length === 0) return
    setSaving(true)
    setError(null)
    try {
      await claimOccurrences({
        data: {
          occurrenceIds: selectedOpenIds,
          assigneeId: bulkAssigneeId,
        },
      })
      setSelectedOpenIds([])
      setSelectMode(false)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not claim slots.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteSeries(id: string) {
    setManageError(null)
    setDeleting(true)
    try {
      await deleteCoverageSeries({ data: { id } })
      setSeriesList((prev) => prev.filter((s) => s.id !== id))
      setConfirmDeleteId(null)
      await router.invalidate()
    } catch (err) {
      setManageError(
        err instanceof Error ? err.message : 'Could not delete series.',
      )
      setConfirmDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (modal === 'coverage') {
        await createCoverageOccurrence({
          data: {
            assigneeId: assigneeId || null,
            startsAt: toLocalIsoFromParts(startDate, startTime),
            endsAt: toLocalIsoFromParts(startDate, endTime),
            notes: notes || null,
          },
        })
      } else if (modal === 'series') {
        await createCoverageSeries({
          data: {
            assigneeId: assigneeId || null,
            startsOn: startDate,
            endsOn: endDate || null,
            startTime,
            endTime,
            frequency,
            daysOfWeek,
            notes: notes || null,
          },
        })
      } else if (modal === 'event') {
        await createCalendarEvent({
          data: {
            title,
            typeId: eventTypeId,
            startsAt: toLocalIsoFromParts(startDate, startTime),
            endsAt: toLocalIsoFromParts(startDate, endTime),
            notes: notes || null,
          },
        })
      } else if (modal === 'swap') {
        if (!swapFromId || !claimId || !claimForPersonId) {
          throw new Error('Pick an open slot and who will claim it.')
        }
        await createSwapRequest({
          data: {
            relinquishOccurrenceId: swapFromId,
            claimOccurrenceId: claimId,
            claimForPersonId,
            notes: notes || null,
          },
        })
      } else if (modal === 'assign') {
        if (!assignOccurrenceId || !assigneeId) {
          throw new Error('Pick who should cover this slot.')
        }
        await updateOccurrence({
          data: {
            id: assignOccurrenceId,
            assigneeId,
          },
        })
      }
      setModal(null)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const monthLabel = new Date(year, month, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  const modalTitle =
    modal === 'coverage'
      ? 'Add coverage'
      : modal === 'series'
        ? 'Recurring coverage'
        : modal === 'event'
          ? 'Add event'
          : modal === 'swap'
            ? 'Request swap'
            : modal === 'assign'
              ? 'Assign open slot'
              : modal === 'manage'
                ? 'Manage recurring coverage'
                : ''

  return (
    <div className="relative flex flex-col gap-4 lg:grid lg:grid-cols-[2.5fr_1fr] lg:items-start">
      <div className="app-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={prevMonth}>
            Prev
          </button>
          <h3 className="text-lg font-semibold">{monthLabel}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={nextMonth}>
            Next
          </button>
        </div>
        {lovedOneName ? (
          <p className="mb-3 text-sm text-base-content/60">
            Coverage calendar for {lovedOneName}
          </p>
        ) : null}
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={`btn btn-sm ${selectMode ? 'btn-primary' : 'btn-outline'}`}
            onClick={toggleSelectMode}
          >
            {selectMode ? 'Selecting…' : 'Select open slots'}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void openManageSeries()}
          >
            Manage recurring
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-center text-sm font-medium text-base-content/50">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {cells.map((cell) => {
            const key = dayKey(cell)
            const inMonth = cell.getMonth() === month
            const selected = key === selectedDay
            const dayOccs = occurrences.filter((o) =>
              isSameLocalDay(new Date(o.startsAt), cell),
            )
            const dayEvts = events.filter((ev) =>
              isSameLocalDay(new Date(ev.startsAt), cell),
            )
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectDay(key)}
                className={`flex aspect-square min-h-24 flex-col items-start rounded-xl border p-2 text-left transition ${
                  selected
                    ? 'border-primary bg-primary/10'
                    : 'border-base-300 hover:bg-base-200'
                } ${inMonth ? '' : 'opacity-40'}`}
              >
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[11px] font-medium text-base-content/50">
                    {DAY_NAMES[cell.getDay()]}
                  </span>
                  <span className="mt-0.5 text-base font-semibold">
                    {cell.getDate()}
                  </span>
                </div>
                <div className="mt-1.5 flex w-full flex-col gap-1">
                  {dayOccs.slice(0, 2).map((o) => (
                    <span
                      key={o.id}
                      className="truncate rounded-md px-1.5 py-0.5 text-xs font-medium leading-snug"
                      style={
                        o.assigneeBgColor
                          ? personChipStyle(
                              o.assigneeBgColor,
                              o.assigneeTextColor,
                            )
                          : { backgroundColor: '#94a3b8', color: '#fff' }
                      }
                    >
                      {o.assigneeName ?? 'Open'}
                    </span>
                  ))}
                  {dayEvts.slice(0, 1).map((ev) => (
                    <span
                      key={ev.id}
                      className="truncate rounded-md px-1.5 py-0.5 text-xs font-medium leading-snug"
                      style={personChipStyle(ev.bgColor, ev.textColor)}
                    >
                      {ev.title}
                    </span>
                  ))}
                  {dayOccs.length + dayEvts.length > 3 ? (
                    <span className="px-0.5 text-xs text-base-content/50">
                      +{dayOccs.length + dayEvts.length - 3}
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="app-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">
            {selectedDate.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h3>
          <div className="dropdown dropdown-end">
            <button type="button" tabIndex={0} className="btn btn-primary btn-sm">
              Add
            </button>
            <ul
              tabIndex={0}
              className="menu dropdown-content z-10 mt-1 w-52 rounded-box bg-base-100 p-2 shadow"
            >
              <li>
                <button type="button" onClick={() => openModal('coverage')}>
                  Coverage (one-off)
                </button>
              </li>
              <li>
                <button type="button" onClick={() => openModal('series')}>
                  Recurring coverage
                </button>
              </li>
              <li>
                <button type="button" onClick={() => openModal('event')}>
                  Appointment / event
                </button>
              </li>
            </ul>
          </div>
        </div>

        <section className="mt-4">
          <h4 className="text-sm font-medium text-base-content/70">Coverage</h4>
          {dayOccurrences.length === 0 ? (
            <p className="mt-2 text-sm text-base-content/50">No coverage slots.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {dayOccurrences.map((o) => {
                const isOpen = !o.assigneeId && o.status === 'SCHEDULED'
                const selectable = selectMode && isOpen
                const isSelected = selectedOpenIds.includes(o.id)
                return (
                  <li
                    key={o.id}
                    onClick={
                      selectable
                        ? () => toggleOpenSelection(o.id)
                        : undefined
                    }
                    className={`rounded-lg border p-3 transition ${
                      selectable
                        ? `cursor-pointer ${
                            isSelected
                              ? 'border-primary bg-primary/10'
                              : 'border-base-300 hover:bg-base-200'
                          }`
                        : 'border-base-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        {selectable ? (
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm mt-1 pointer-events-none"
                            checked={isSelected}
                            readOnly
                            tabIndex={-1}
                            aria-hidden="true"
                          />
                        ) : null}
                        <div>
                          <p className="text-base font-semibold text-base-content">
                            {formatTimeRange(o.startsAt, o.endsAt)}
                          </p>
                          <p className="text-sm text-base-content/60">
                            <span
                              className="mr-2 inline-block size-2 rounded-full align-middle"
                              style={{
                                backgroundColor:
                                  o.assigneeBgColor ?? '#94a3b8',
                              }}
                            />
                            {o.assigneeName ?? 'Open slot'}
                          </p>
                          <p className="text-xs text-base-content/50">
                            {o.status}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {isOpen && !selectMode ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-xs"
                            onClick={() =>
                              openModal('assign', { assignId: o.id })
                            }
                          >
                            Assign
                          </button>
                        ) : null}
                        {o.assigneeId && o.status === 'SCHEDULED' ? (
                          <button
                            type="button"
                            className="btn btn-outline btn-xs"
                            onClick={() =>
                              openModal('swap', { swapFrom: o.id })
                            }
                          >
                            Request swap
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="mt-4">
          <h4 className="text-sm font-medium text-base-content/70">Events</h4>
          {dayEvents.length === 0 ? (
            <p className="mt-2 text-sm text-base-content/50">No events.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {dayEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-lg border border-base-300 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                      style={personChipStyle(ev.bgColor, ev.textColor)}
                    >
                      {ev.typeName}
                    </span>
                    <p className="font-medium">{ev.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-base-content/60">
                    {formatTimeRange(ev.startsAt, ev.endsAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {selectMode ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-base-300 bg-base-100/95 px-4 py-3 shadow-lg backdrop-blur lg:sticky lg:bottom-4 lg:col-span-2 lg:rounded-box lg:border">
          <div className="mx-auto flex max-w-4xl flex-wrap items-end gap-3">
            <p className="text-sm font-medium">
              {selectedOpenIds.length} open slot
              {selectedOpenIds.length === 1 ? '' : 's'} selected
            </p>
            <label className="form-control min-w-48 flex-1">
              <span className="label-text text-xs">Assign to</span>
              <select
                className={FORM_SELECT_CLASS}
                value={bulkAssigneeId}
                onChange={(e) => setBulkAssigneeId(e.target.value)}
              >
                {activePeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSelectMode(false)
                setSelectedOpenIds([])
                setError(null)
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={
                saving || selectedOpenIds.length === 0 || !bulkAssigneeId
              }
              onClick={() => void claimSelected()}
            >
              {saving ? 'Claiming…' : 'Claim selected'}
            </button>
            {error ? (
              <p className="w-full text-sm text-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {modal === 'manage' ? (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <h3 className="text-lg font-semibold">{modalTitle}</h3>
            <p className="mt-1 text-sm text-base-content/60">
              Delete manually created recurring coverage. Required open slots are
              managed in Loved one settings.
            </p>
            {manageError ? (
              <p className="mt-2 text-sm text-error" role="alert">
                {manageError}
              </p>
            ) : null}
            <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto">
              {seriesList.length === 0 ? (
                <li className="text-sm text-base-content/50">
                  No recurring coverage series.
                </li>
              ) : (
                seriesList.map((series) => (
                  <li
                    key={series.id}
                    className="rounded-lg border border-base-300 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {series.assigneeName ?? 'Open'}
                          {series.isRequired ? (
                            <span className="ml-2 badge badge-ghost badge-sm">
                              Required
                            </span>
                          ) : null}
                        </p>
                        <p className="text-sm text-base-content/60">
                          {series.frequency} · {series.startTime}–{series.endTime}{' '}
                          ·{' '}
                          {series.daysOfWeek
                            .map((d) => DAY_NAMES[d])
                            .join(', ')}
                        </p>
                        <p className="text-xs text-base-content/50">
                          {series.occurrenceCount} slots
                          {series.notes ? ` · ${series.notes}` : ''}
                        </p>
                      </div>
                      {series.isRequired ? (
                        <span className="text-xs text-base-content/50">
                          Edit in settings
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-error btn-outline btn-xs"
                          onClick={() => setConfirmDeleteId(series.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
            <div className="modal-action">
              <button
                type="button"
                className="btn"
                onClick={() => setModal(null)}
              >
                Close
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setModal(null)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        tone="danger"
        title="Delete recurring coverage"
        message="This removes the recurring schedule and its upcoming, not-yet-completed slots. Past and completed slots are kept."
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={() => {
          if (confirmDeleteId) void deleteSeries(confirmDeleteId)
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {modal && modal !== 'manage' ? (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-lg">
            <h3 className="text-lg font-semibold">{modalTitle}</h3>
            <FormShell card={false} onSubmit={submit} className="mt-4">
              {modal === 'assign' ? (
                <>
                  <p className="text-sm text-base-content/70">
                    Assign this open slot to a person.
                  </p>
                  <FormField label="Assignee" htmlFor="assign-person">
                    <select
                      id="assign-person"
                      className={FORM_SELECT_CLASS}
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value)}
                      required
                    >
                      {activePeople.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </>
              ) : null}

              {modal === 'swap' ? (
                <>
                  <p className="text-sm text-base-content/70">
                    Relinquish this shift and claim an open slot. Another user
                    must approve.
                  </p>
                  <FormField label="Claim open slot" htmlFor="swap-claim">
                    <select
                      id="swap-claim"
                      className={FORM_SELECT_CLASS}
                      value={claimId}
                      onChange={(e) => setClaimId(e.target.value)}
                      required
                    >
                      <option value="">Select…</option>
                      {openSlots
                        .filter((o) => o.id !== swapFromId)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {formatTimeRange(o.startsAt, o.endsAt)}
                          </option>
                        ))}
                    </select>
                  </FormField>
                  <FormField label="Assign claim to" htmlFor="swap-person">
                    <select
                      id="swap-person"
                      className={FORM_SELECT_CLASS}
                      value={claimForPersonId}
                      onChange={(e) => setClaimForPersonId(e.target.value)}
                      required
                    >
                      {activePeople.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </>
              ) : null}

              {modal === 'event' ? (
                <>
                  <FormField label="Title" htmlFor="event-title">
                    <input
                      id="event-title"
                      className={FORM_INPUT_CLASS}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </FormField>
                  <FormField label="Type" htmlFor="event-type">
                    {eventTypes.length === 0 ? (
                      <p className="text-sm text-base-content/60">
                        No event types yet. Add one in Settings → Schedule.
                      </p>
                    ) : (
                      <select
                        id="event-type"
                        className={FORM_SELECT_CLASS}
                        value={eventTypeId}
                        onChange={(e) => setEventTypeId(e.target.value)}
                        required
                      >
                        {eventTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </FormField>
                </>
              ) : null}

              {modal === 'coverage' || modal === 'series' ? (
                <FormField
                  label="Assignee (optional = open)"
                  htmlFor="coverage-assignee"
                >
                  <select
                    id="coverage-assignee"
                    className={FORM_SELECT_CLASS}
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                  >
                    <option value="">Open slot</option>
                    {activePeople.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              ) : null}

              {modal !== 'swap' && modal !== 'assign' ? (
                <>
                  <FormField
                    label={modal === 'series' ? 'Starts on' : 'Date'}
                    htmlFor="coverage-date"
                  >
                    <input
                      id="coverage-date"
                      type="date"
                      className={FORM_INPUT_CLASS}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </FormField>
                  {modal === 'series' ? (
                    <FormField label="Ends on (optional)" htmlFor="coverage-ends">
                      <input
                        id="coverage-ends"
                        type="date"
                        className={FORM_INPUT_CLASS}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </FormField>
                  ) : null}
                  <FormRow>
                    <FormField label="Start time" htmlFor="coverage-start-time">
                      <input
                        id="coverage-start-time"
                        type="time"
                        className={FORM_INPUT_CLASS}
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        required
                      />
                    </FormField>
                    <FormField label="End time" htmlFor="coverage-end-time">
                      <input
                        id="coverage-end-time"
                        type="time"
                        className={FORM_INPUT_CLASS}
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        required
                      />
                    </FormField>
                  </FormRow>
                </>
              ) : null}

              {modal === 'series' ? (
                <>
                  <FormField label="Frequency" htmlFor="coverage-freq">
                    <select
                      id="coverage-freq"
                      className={FORM_SELECT_CLASS}
                      value={frequency}
                      onChange={(e) =>
                        setFrequency(e.target.value as 'WEEKLY' | 'BIWEEKLY')
                      }
                    >
                      <option value="WEEKLY">Weekly</option>
                      <option value="BIWEEKLY">Every other week</option>
                    </select>
                  </FormField>
                  <FormField label="Days">
                    <div className="flex flex-wrap gap-2">
                      {DAY_NAMES.map((dayLabel, i) => (
                        <label
                          key={dayLabel}
                          className="flex cursor-pointer items-center gap-1.5"
                        >
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={daysOfWeek.includes(i)}
                            onChange={() => toggleDay(i)}
                          />
                          <span className="text-sm font-medium text-base-content">
                            {dayLabel}
                          </span>
                        </label>
                      ))}
                    </div>
                  </FormField>
                </>
              ) : null}

              {modal !== 'assign' ? (
                <FormField label="Notes" htmlFor="coverage-notes">
                  <textarea
                    id="coverage-notes"
                    className={FORM_TEXTAREA_CLASS}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </FormField>
              ) : null}

              {error ? (
                <p className="text-sm text-error" role="alert">
                  {error}
                </p>
              ) : null}

              <FormActions>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? 'Saving…'
                    : modal === 'assign'
                      ? 'Assign'
                      : 'Save'}
                </button>
              </FormActions>
            </FormShell>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setModal(null)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </div>
  )
}

export function defaultCalendarMonth(): {
  year: number
  month: number
  day: string
} {
  const now = new Date()
  return {
    year: now.getFullYear(),
    month: now.getMonth(),
    day: toDateInputValue(now),
  }
}
