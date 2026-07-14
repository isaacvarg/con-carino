import { useEffect, useState, type ChangeEvent } from 'react'
import {
  THEMES,
  colorSchemeForTheme,
  formatThemeLabel,
  isThemeSelection,
  type ThemeName,
  type ThemeSelection,
} from '#/lib/themes'

const STORAGE_KEY = 'theme'

function getInitialSelection(): ThemeSelection {
  if (typeof window === 'undefined') {
    return 'system'
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored && isThemeSelection(stored)) {
    return stored
  }

  // Migrate legacy light/dark/auto values
  if (stored === 'auto') {
    return 'system'
  }

  return 'system'
}

export function applyThemeSelection(selection: ThemeSelection) {
  const root = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

  if (selection === 'system') {
    root.removeAttribute('data-theme')
    root.style.colorScheme = prefersDark ? 'dark' : 'light'
    return
  }

  root.setAttribute('data-theme', selection)
  root.style.colorScheme = colorSchemeForTheme(selection)
}

export default function ThemeToggle() {
  const [selection, setSelection] = useState<ThemeSelection>('system')

  useEffect(() => {
    const initial = getInitialSelection()
    setSelection(initial)
    applyThemeSelection(initial)
  }, [])

  useEffect(() => {
    if (selection !== 'system') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyThemeSelection('system')

    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [selection])

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value
    if (!isThemeSelection(next)) {
      return
    }

    setSelection(next)
    applyThemeSelection(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Theme</span>
      <select
        className="select select-bordered select-sm w-[9.5rem] font-semibold text-base-content"
        value={selection}
        onChange={onChange}
        aria-label="Color theme"
      >
        <option value="system">System</option>
        {THEMES.map((theme: ThemeName) => (
          <option key={theme} value={theme}>
            {formatThemeLabel(theme)}
          </option>
        ))}
      </select>
    </label>
  )
}
