/** Catppuccin daisyUI theme names. */
export const THEMES = ['latte', 'macchiato'] as const

export type ThemeName = (typeof THEMES)[number]

export const DEFAULT_THEME: ThemeName = 'latte'

export const STORAGE_KEY = 'theme'

export function isThemeName(value: string): value is ThemeName {
  return (THEMES as readonly string[]).includes(value)
}

export function colorSchemeForTheme(theme: ThemeName): 'light' | 'dark' {
  return theme === 'macchiato' ? 'dark' : 'light'
}

export function resolveStoredTheme(stored: string | null): ThemeName {
  if (stored && isThemeName(stored)) {
    return stored
  }
  return DEFAULT_THEME
}

export function applyTheme(theme: ThemeName) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = colorSchemeForTheme(theme)
}
