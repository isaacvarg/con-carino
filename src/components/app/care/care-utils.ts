const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function formatDayTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatTimeRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  }
  if (sameDay) {
    return `${start.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })} · ${start.toLocaleTimeString(undefined, timeOpts)}–${end.toLocaleTimeString(undefined, timeOpts)}`
  }
  return `${start.toLocaleString(undefined, {
    ...timeOpts,
    month: 'short',
    day: 'numeric',
  })} – ${end.toLocaleString(undefined, {
    ...timeOpts,
    month: 'short',
    day: 'numeric',
  })}`
}

/** Times only, for lists that already carry a day heading. */
export function formatClockRange(startsAt: string, endsAt: string): string {
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  }
  return `${new Date(startsAt).toLocaleTimeString(undefined, timeOpts)}–${new Date(
    endsAt,
  ).toLocaleTimeString(undefined, timeOpts)}`
}

/** Sunday-anchored start of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - start.getDay())
  return start
}

export function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function toLocalIsoFromParts(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  return new Date(y!, m! - 1, d!, hh!, mm!, 0, 0).toISOString()
}

export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    cells.push(day)
  }
  return cells
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function dayKey(date: Date): string {
  return toDateInputValue(date)
}

export function personChipStyle(
  bgColor: string | null | undefined,
  textColor?: string | null,
): {
  backgroundColor?: string
  color?: string
} {
  if (!bgColor) return {}
  return {
    backgroundColor: bgColor,
    color: textColor || '#fff',
  }
}

export { DAY_NAMES }

export const DEFAULT_PERSON_BG_COLOR = '#0d9488'
export const DEFAULT_PERSON_TEXT_COLOR = '#ffffff'

export const DEFAULT_EVENT_BG_COLOR = '#f59e0b'
export const DEFAULT_EVENT_TEXT_COLOR = '#ffffff'
