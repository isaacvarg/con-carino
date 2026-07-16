/** Catppuccin accent colors selectable as the app's primary color. */
export const ACCENTS = [
  'rosewater',
  'flamingo',
  'pink',
  'mauve',
  'red',
  'maroon',
  'peach',
  'yellow',
  'green',
  'teal',
  'sky',
  'sapphire',
  'blue',
  'lavender',
] as const

export type AccentName = (typeof ACCENTS)[number]

export const DEFAULT_ACCENT: AccentName = 'flamingo'

export const ACCENT_STORAGE_KEY = 'accent'

export function isAccentName(value: string): value is AccentName {
  return (ACCENTS as readonly string[]).includes(value)
}

export function resolveStoredAccent(stored: string | null): AccentName {
  if (stored && isAccentName(stored)) {
    return stored
  }
  return DEFAULT_ACCENT
}

export function applyAccent(accent: AccentName) {
  document.documentElement.setAttribute('data-accent', accent)
}
