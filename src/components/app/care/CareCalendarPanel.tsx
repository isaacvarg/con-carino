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
  CareCoverageAssignmentRuleDto,
  CareCoverageOccurrenceDto,
  CareCoverageSeriesDto,
  CareEventTypeDto,
  CarePersonDto,
  CareSettingsDto,
} from '#/server/care'
import {
  claimOccurrences,
  createCalendarEvent,
  createCoverageAssignmentRule,
  createCoverageOccurrence,
  createSwapRequest,
  deleteCoverageAssignmentRule,
  deleteCoverageSeries,
  listCoverageAssignmentRules,
  listCoverageSeries,
  updateOccurrence,
} from '#/server/care'
import { SwapWindowPicker } from './SwapWindowPicker'
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
  settings: CareSettingsDto
  year: number
  month: number
  selectedDay: string
  occurrences: CareCoverageOccurrenceDto[]
  events: CareCalendarEventDto[]
  eventTypes: CareEventTypeDto[]
  people: CarePersonDto[]
  /** Signed-in user; used to find which caregiver they act as when swapping */
  viewerUserId: string | null
  onMonthChange: (year: number, month: number) => void
  onSelectDay: (dayKey: string) => void
}

type ModalKind =
  | 'coverage'
  | 'assignRule'
  | 'event'
  | 'swap'
  | 'assign'
  | 'manage'
  | null

export function CareCalendarPanel({
  lovedOneName,
  settings,
  year,
  month,
  selectedDay,
  occurrences,
  events,
  eventTypes,
  people,
  viewerUserId,
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
  const [daySheetOpen, setDaySheetOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [swapTargetPersonId, setSwapTargetPersonId] = useState<string | null>(
    null,
  )
  const [swapTakeIds, setSwapTakeIds] = useState<string[]>([])
  const [swapGiveIds, setSwapGiveIds] = useState<string[]>([])
  const [swapTrading, setSwapTrading] = useState(false)
  const [assignOccurrenceId, setAssignOccurrenceId] = useState<string | null>(
    null,
  )
  const [selectMode, setSelectMode] = useState(false)
  const [selectedOpenIds, setSelectedOpenIds] = useState<string[]>([])
  const [bulkAssigneeId, setBulkAssigneeId] = useState('')
  const [ruleList, setRuleList] = useState<CareCoverageAssignmentRuleDto[]>([])
  const [legacySeries, setLegacySeries] = useState<CareCoverageSeriesDto[]>([])
  const [manageError, setManageError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteSeriesId, setConfirmDeleteSeriesId] = useState<
    string | null
  >(null)
  const [deleting, setDeleting] = useState(false)
  const [ruleSummary, setRuleSummary] = useState<string | null>(null)

  const [assigneeId, setAssigneeId] = useState('')
  const [startDate, setStartDate] = useState(selectedDay)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [endDate, setEndDate] = useState('')
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([selectedDate.getDay()])
  const [shiftScope, setShiftScope] = useState<'ALL_SHIFTS' | 'SPECIFIC_SHIFTS'>(
    'ALL_SHIFTS',
  )
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([])
  const [intervalWeeks, setIntervalWeeks] = useState(1)
  const [notes, setNotes] = useState('')
  const [title, setTitle] = useState('')
  const [eventTypeId, setEventTypeId] = useState(eventTypes[0]?.id ?? '')

  const activePeople = people.filter((p) => p.isActive)
  /** The caregiver this user is, when their account is linked to one. */
  const linkedPerson = viewerUserId
    ? (activePeople.find((p) => p.userId === viewerUserId) ?? null)
    : null
  /** Who receives the taken windows. Unlinked users arrange on someone's behalf. */
  const [swapRequesterPersonId, setSwapRequesterPersonId] = useState('')
  const requesterPersonId = linkedPerson?.id ?? swapRequesterPersonId
  const requesterPerson =
    activePeople.find((p) => p.id === requesterPersonId) ?? null
  const swapTargetPerson =
    activePeople.find((p) => p.id === swapTargetPersonId) ?? null
  const coveredDays = useMemo(
    () =>
      settings.coverageNeed === 'FULL'
        ? [0, 1, 2, 3, 4, 5, 6]
        : [...settings.partialDaysOfWeek].sort((a, b) => a - b),
    [settings.coverageNeed, settings.partialDaysOfWeek],
  )
  const usesShifts = settings.coverageWindowKind === 'SHIFTS'
  const shiftLabelById = useMemo(
    () =>
      new Map(
        settings.shifts.map((s) => [
          s.id,
          s.label?.trim() ? s.label.trim() : `${s.startTime}–${s.endTime}`,
        ]),
      ),
    [settings.shifts],
  )

  function openModal(
    kind: ModalKind,
    opts?: { swapFrom?: CareCoverageOccurrenceDto; assignId?: string },
  ) {
    setError(null)
    setModal(kind)
    setStartDate(selectedDay)
    setStartTime('09:00')
    setEndTime('17:00')
    setEndDate('')
    setDaysOfWeek(
      kind === 'assignRule' && coveredDays.length > 0
        ? coveredDays
        : [selectedDate.getDay()],
    )
    setShiftScope('ALL_SHIFTS')
    setSelectedShiftIds([])
    setIntervalWeeks(1)
    setNotes('')
    setTitle('')
    setEventTypeId(eventTypes[0]?.id ?? '')
    setAssigneeId(activePeople[0]?.id ?? '')
    setSwapTargetPersonId(opts?.swapFrom?.assigneeId ?? null)
    setSwapTakeIds(opts?.swapFrom ? [opts.swapFrom.id] : [])
    setSwapGiveIds([])
    setSwapTrading(false)
    setSwapRequesterPersonId(
      activePeople.find((p) => p.id !== opts?.swapFrom?.assigneeId)?.id ?? '',
    )
    setAssignOccurrenceId(opts?.assignId ?? null)
  }

  async function openManageSeries() {
    setManageError(null)
    setError(null)
    setModal('manage')
    try {
      const [rules, series] = await Promise.all([
        listCoverageAssignmentRules(),
        listCoverageSeries(),
      ])
      setRuleList(rules)
      setLegacySeries(series.filter((s) => !s.isRequired))
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

  function toggleShift(id: string) {
    setSelectedShiftIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function toggleSwapId(
    id: string,
    setIds: (update: (prev: string[]) => string[]) => void,
  ) {
    setIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
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

  function handleSelectDay(key: string) {
    onSelectDay(key)
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setDaySheetOpen(true)
    }
  }

  function renderDayDetail() {
    return (
      <>
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
              className="menu dropdown-content z-30 mt-1 w-52 rounded-box bg-base-100 p-2 shadow"
            >
              <li>
                <button type="button" onClick={() => openModal('coverage')}>
                  Coverage (one-off)
                </button>
              </li>
              <li>
                <button type="button" onClick={() => openModal('assignRule')}>
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
                        {o.assigneeId &&
                        o.status === 'SCHEDULED' &&
                        o.assigneeId !== linkedPerson?.id ? (
                          <button
                            type="button"
                            className="btn btn-outline btn-xs"
                            onClick={() => openModal('swap', { swapFrom: o })}
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
      </>
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

  async function deleteRule(id: string) {
    setManageError(null)
    setDeleting(true)
    try {
      await deleteCoverageAssignmentRule({ data: { id } })
      setRuleList((prev) => prev.filter((r) => r.id !== id))
      setConfirmDeleteId(null)
      await router.invalidate()
    } catch (err) {
      setManageError(
        err instanceof Error ? err.message : 'Could not remove recurring coverage.',
      )
      setConfirmDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  async function deleteLegacySeries(id: string) {
    setManageError(null)
    setDeleting(true)
    try {
      await deleteCoverageSeries({ data: { id } })
      setLegacySeries((prev) => prev.filter((s) => s.id !== id))
      setConfirmDeleteSeriesId(null)
      await router.invalidate()
    } catch (err) {
      setManageError(
        err instanceof Error ? err.message : 'Could not delete series.',
      )
      setConfirmDeleteSeriesId(null)
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
      } else if (modal === 'assignRule') {
        if (!assigneeId) {
          throw new Error('Pick who will cover these slots.')
        }
        if (daysOfWeek.length === 0) {
          throw new Error('Select at least one day.')
        }
        if (usesShifts && shiftScope === 'SPECIFIC_SHIFTS' && selectedShiftIds.length === 0) {
          throw new Error('Select at least one shift.')
        }
        const scope =
          usesShifts && shiftScope === 'SPECIFIC_SHIFTS'
            ? 'SPECIFIC_SHIFTS'
            : 'ALL_SHIFTS'
        const res = await createCoverageAssignmentRule({
          data: {
            assigneeId,
            startsOn: startDate,
            endsOn: endDate || null,
            daysOfWeek,
            intervalWeeks,
            scope,
            shiftIds: scope === 'SPECIFIC_SHIFTS' ? selectedShiftIds : [],
            notes: notes || null,
          },
        })
        setModal(null)
        setRuleSummary(
          `Assigned ${res.assigned} slot${res.assigned === 1 ? '' : 's'}` +
            (res.skipped > 0
              ? ` · skipped ${res.skipped} already covered`
              : ''),
        )
        await router.invalidate()
        return
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
        if (!swapTargetPersonId || swapTakeIds.length === 0) {
          throw new Error('Pick at least one window to take.')
        }
        if (!requesterPersonId) {
          throw new Error('Pick who is taking these windows.')
        }
        await createSwapRequest({
          data: {
            targetPersonId: swapTargetPersonId,
            requesterPersonId,
            takeOccurrenceIds: swapTakeIds,
            giveOccurrenceIds: swapTrading ? swapGiveIds : [],
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
      : modal === 'assignRule'
        ? 'Assign recurring coverage'
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
        {ruleSummary ? (
          <div className="mb-3 alert alert-success py-2 text-sm">
            <span>{ruleSummary}</span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setRuleSummary(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-base-content/50 sm:text-sm lg:gap-1.5">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-1 lg:py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1 lg:mt-1.5 lg:gap-1.5">
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
            const totalItems = dayOccs.length + dayEvts.length
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectDay(key)}
                className={`flex min-h-16 flex-col items-start rounded-lg border p-1.5 text-left transition lg:aspect-square lg:min-h-24 lg:rounded-xl lg:p-2 ${
                  selected
                    ? 'border-primary bg-primary/10'
                    : 'border-base-300 hover:bg-base-200'
                } ${inMonth ? '' : 'opacity-40'}`}
              >
                <div className="flex flex-col items-start leading-none">
                  <span className="hidden text-[11px] font-medium text-base-content/50 lg:inline">
                    {DAY_NAMES[cell.getDay()]}
                  </span>
                  <span className="text-sm font-semibold lg:mt-0.5 lg:text-base">
                    {cell.getDate()}
                  </span>
                </div>
                <div className="mt-1 flex w-full flex-col gap-0.5 lg:mt-1.5 lg:gap-1">
                  {dayOccs.slice(0, 2).map((o, i) => (
                    <span
                      key={o.id}
                      className={`truncate rounded-md px-1 py-0.5 text-[10px] font-medium leading-snug lg:px-1.5 lg:text-xs ${
                        i > 0 ? 'hidden lg:block' : ''
                      }`}
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
                      className="hidden truncate rounded-md px-1.5 py-0.5 text-xs font-medium leading-snug lg:block"
                      style={personChipStyle(ev.bgColor, ev.textColor)}
                    >
                      {ev.title}
                    </span>
                  ))}
                  {totalItems > 1 ? (
                    <span className="px-0.5 text-[10px] text-base-content/50 lg:hidden">
                      +{totalItems - 1}
                    </span>
                  ) : null}
                  {totalItems > 3 ? (
                    <span className="hidden px-0.5 text-xs text-base-content/50 lg:block">
                      +{totalItems - 3}
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="app-card hidden p-4 lg:block">{renderDayDetail()}</div>

      {daySheetOpen ? (
        <dialog className="modal modal-bottom modal-open lg:hidden">
          <div className="modal-box max-h-[85vh] overflow-y-auto rounded-t-2xl">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDaySheetOpen(false)}
              >
                Close
              </button>
            </div>
            {renderDayDetail()}
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setDaySheetOpen(false)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}

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
              Remove a recurring assignment to reopen its upcoming slots. Past
              and completed slots are kept.
            </p>
            {manageError ? (
              <p className="mt-2 text-sm text-error" role="alert">
                {manageError}
              </p>
            ) : null}
            <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto">
              {ruleList.length === 0 ? (
                <li className="text-sm text-base-content/50">
                  No recurring assignments yet.
                </li>
              ) : (
                ruleList.map((rule) => {
                  const scopeLabel =
                    rule.scope === 'ALL_SHIFTS'
                      ? 'All shifts'
                      : rule.shiftIds
                          .map((id) => shiftLabelById.get(id) ?? 'Shift')
                          .join(', ')
                  return (
                    <li
                      key={rule.id}
                      className="rounded-lg border border-base-300 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {rule.assigneeName ?? 'Unknown'}
                          </p>
                          <p className="text-sm text-base-content/60">
                            {scopeLabel} ·{' '}
                            {rule.daysOfWeek
                              .map((d) => DAY_NAMES[d])
                              .join(', ')}
                            {rule.intervalWeeks > 1
                              ? ` · every ${rule.intervalWeeks} weeks`
                              : ''}
                          </p>
                          <p className="text-xs text-base-content/50">
                            From {rule.startsOn}
                            {rule.endsOn ? ` to ${rule.endsOn}` : ' · indefinite'}{' '}
                            · {rule.filledCount} slots
                            {rule.notes ? ` · ${rule.notes}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-error btn-outline btn-xs"
                          onClick={() => setConfirmDeleteId(rule.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  )
                })
              )}
            </ul>
            {legacySeries.length > 0 ? (
              <div className="mt-6">
                <h4 className="text-sm font-semibold">Older recurring coverage</h4>
                <p className="mt-1 text-xs text-base-content/60">
                  Series created before recurring assignments. Delete any that
                  duplicate required open slots.
                </p>
                <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                  {legacySeries.map((series) => (
                    <li
                      key={series.id}
                      className="rounded-lg border border-base-300 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {series.assigneeName ?? 'Open'}
                          </p>
                          <p className="text-sm text-base-content/60">
                            {series.frequency} · {series.startTime}–
                            {series.endTime} ·{' '}
                            {series.daysOfWeek
                              .map((d) => DAY_NAMES[d])
                              .join(', ')}
                          </p>
                          <p className="text-xs text-base-content/50">
                            {series.occurrenceCount} slots
                            {series.notes ? ` · ${series.notes}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-error btn-outline btn-xs"
                          onClick={() => setConfirmDeleteSeriesId(series.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="modal-action">
              <button
                type="button"
                className="btn"
                onClick={() => setModal(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => openModal('assignRule')}
              >
                Add
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
        open={confirmDeleteSeriesId !== null}
        tone="danger"
        title="Delete recurring coverage"
        message="This removes the series and its upcoming, not-yet-completed slots. Past and completed slots are kept."
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={() => {
          if (confirmDeleteSeriesId) void deleteLegacySeries(confirmDeleteSeriesId)
        }}
        onCancel={() => setConfirmDeleteSeriesId(null)}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        tone="danger"
        title="Remove recurring coverage"
        message="This reopens the assignment's upcoming, not-yet-completed slots. Past and completed slots keep their assignee."
        confirmLabel="Remove"
        busy={deleting}
        onConfirm={() => {
          if (confirmDeleteId) void deleteRule(confirmDeleteId)
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

              {modal === 'swap' && swapTargetPerson ? (
                <>
                  {linkedPerson ? null : (
                    <FormField label="Acting for" htmlFor="swap-requester">
                      <select
                        id="swap-requester"
                        className={FORM_SELECT_CLASS}
                        value={swapRequesterPersonId}
                        onChange={(e) => {
                          setSwapRequesterPersonId(e.target.value)
                          setSwapGiveIds([])
                        }}
                        required
                      >
                        {activePeople
                          .filter((p) => p.id !== swapTargetPerson.id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </FormField>
                  )}

                  <FormField label={`Taking from ${swapTargetPerson.name}`}>
                    <SwapWindowPicker
                      personId={swapTargetPerson.id}
                      personName={swapTargetPerson.name}
                      selectedIds={swapTakeIds}
                      onToggle={(id) => toggleSwapId(id, setSwapTakeIds)}
                      initialDay={selectedDay}
                      emptyLabel={`${swapTargetPerson.name} has no coverage this week.`}
                    />
                  </FormField>

                  <FormField label="In exchange">
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          className="radio radio-sm"
                          name="swap-mode"
                          checked={!swapTrading}
                          onChange={() => setSwapTrading(false)}
                        />
                        Just take these windows
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          className="radio radio-sm"
                          name="swap-mode"
                          checked={swapTrading}
                          onChange={() => setSwapTrading(true)}
                        />
                        Trade some of mine
                      </label>
                    </div>
                  </FormField>

                  {swapTrading ? (
                    requesterPerson ? (
                      <FormField
                        label={`Giving ${swapTargetPerson.name}`}
                        hint={
                          swapGiveIds.length === swapTakeIds.length
                            ? `${swapTakeIds.length} taken · ${swapGiveIds.length} offered`
                            : `${swapTakeIds.length} taken · ${swapGiveIds.length} offered — an even trade is usually easier to approve`
                        }
                      >
                        <SwapWindowPicker
                          personId={requesterPerson.id}
                          personName={requesterPerson.name}
                          selectedIds={swapGiveIds}
                          onToggle={(id) => toggleSwapId(id, setSwapGiveIds)}
                          initialDay={selectedDay}
                          emptyLabel="You have no coverage this week to offer."
                        />
                      </FormField>
                    ) : (
                      <p className="text-sm text-base-content/60">
                        Pick who you are acting for to offer windows back.
                      </p>
                    )
                  ) : null}

                  <p className="text-sm text-base-content/60">
                    {swapTargetPerson.userId
                      ? `${swapTargetPerson.name} has to approve this.`
                      : `${swapTargetPerson.name} has no app account, so any signed-in user can approve this.`}
                  </p>
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

              {modal === 'coverage' ? (
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

              {modal === 'assignRule' ? (
                <>
                  <p className="text-sm text-base-content/70">
                    Assign a person to the loved one&apos;s required open slots on
                    a recurring basis. Only open slots are filled — slots already
                    covered by someone else are left as-is.
                  </p>
                  <FormField label="Assignee" htmlFor="rule-assignee">
                    <select
                      id="rule-assignee"
                      className={FORM_SELECT_CLASS}
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value)}
                      required
                    >
                      {activePeople.length === 0 ? (
                        <option value="">No active people</option>
                      ) : null}
                      {activePeople.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </>
              ) : null}

              {modal === 'coverage' || modal === 'event' || modal === 'assignRule' ? (
                <>
                  <FormField
                    label={modal === 'assignRule' ? 'Starts on' : 'Date'}
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
                  {modal === 'assignRule' ? (
                    <FormField
                      label="Ends on (blank = indefinite)"
                      htmlFor="coverage-ends"
                    >
                      <input
                        id="coverage-ends"
                        type="date"
                        className={FORM_INPUT_CLASS}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </FormField>
                  ) : null}
                  {modal === 'coverage' || modal === 'event' ? (
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
                  ) : null}
                </>
              ) : null}

              {modal === 'assignRule' ? (
                <>
                  <FormField label="Applies on">
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
                  <FormField label="Repeats" htmlFor="rule-interval">
                    <select
                      id="rule-interval"
                      className={FORM_SELECT_CLASS}
                      value={intervalWeeks}
                      onChange={(e) => setIntervalWeeks(Number(e.target.value))}
                    >
                      <option value={1}>Every week</option>
                      <option value={2}>Every 2 weeks</option>
                      <option value={3}>Every 3 weeks</option>
                      <option value={4}>Every 4 weeks</option>
                    </select>
                  </FormField>
                  {usesShifts ? (
                    <FormField label="Shifts">
                      <div className="flex flex-col gap-2">
                        <label className="flex cursor-pointer items-center gap-1.5">
                          <input
                            type="radio"
                            name="shift-scope"
                            className="radio radio-sm"
                            checked={shiftScope === 'ALL_SHIFTS'}
                            onChange={() => setShiftScope('ALL_SHIFTS')}
                          />
                          <span className="text-sm font-medium">
                            All shifts that day
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-1.5">
                          <input
                            type="radio"
                            name="shift-scope"
                            className="radio radio-sm"
                            checked={shiftScope === 'SPECIFIC_SHIFTS'}
                            onChange={() => setShiftScope('SPECIFIC_SHIFTS')}
                          />
                          <span className="text-sm font-medium">
                            Specific shifts
                          </span>
                        </label>
                        {shiftScope === 'SPECIFIC_SHIFTS' ? (
                          <div className="ml-6 flex flex-col gap-1.5">
                            {settings.shifts.map((s) => (
                              <label
                                key={s.id}
                                className="flex cursor-pointer items-center gap-1.5"
                              >
                                <input
                                  type="checkbox"
                                  className="checkbox checkbox-sm"
                                  checked={selectedShiftIds.includes(s.id)}
                                  onChange={() => toggleShift(s.id)}
                                />
                                <span className="text-sm">
                                  {shiftLabelById.get(s.id)}{' '}
                                  <span className="text-base-content/50">
                                    ({s.startTime}–{s.endTime})
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </FormField>
                  ) : null}
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
                    : modal === 'assign' || modal === 'assignRule'
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
