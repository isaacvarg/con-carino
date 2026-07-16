import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import type { AuthSession } from 'start-authjs'
import {
  ACCENT_STORAGE_KEY,
  applyAccent,
  DEFAULT_ACCENT,
  resolveStoredAccent,
  type AccentName,
} from '#/lib/accents'
import {
  applyTheme,
  DEFAULT_THEME,
  resolveStoredTheme,
  STORAGE_KEY,
  type ThemeName,
} from '#/lib/themes'
import {
  getUserConfiguration,
  upsertUserAccent,
  upsertUserTheme,
} from '#/server/user-configuration'

type Appearance = {
  theme: ThemeName
  accent: AccentName
  setTheme: (theme: ThemeName) => void
  setAccent: (accent: AccentName) => void
}

const AppearanceContext = createContext<Appearance | null>(null)

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME)
  const [accent, setAccentState] = useState<AccentName>(DEFAULT_ACCENT)
  const session = useRouterState({
    select: (state) =>
      (state.matches[0]?.context as { session?: AuthSession | null } | undefined)
        ?.session ?? null,
  })
  const isSignedIn = Boolean(session?.user?.id)

  useEffect(() => {
    let cancelled = false

    async function sync() {
      const localTheme = resolveStoredTheme(
        window.localStorage.getItem(STORAGE_KEY),
      )
      const localAccent = resolveStoredAccent(
        window.localStorage.getItem(ACCENT_STORAGE_KEY),
      )
      setThemeState(localTheme)
      setAccentState(localAccent)
      applyTheme(localTheme)
      applyAccent(localAccent)

      if (!isSignedIn) {
        return
      }

      try {
        const config = await getUserConfiguration()
        if (cancelled) return
        setThemeState(config.theme)
        setAccentState(config.accent)
        applyTheme(config.theme)
        applyAccent(config.accent)
        window.localStorage.setItem(STORAGE_KEY, config.theme)
        window.localStorage.setItem(ACCENT_STORAGE_KEY, config.accent)
      } catch {
        // Keep local preferences if the user is signed out mid-flight or the fetch fails.
      }
    }

    void sync()
    return () => {
      cancelled = true
    }
  }, [isSignedIn])

  function setTheme(next: ThemeName) {
    setThemeState(next)
    applyTheme(next)
    window.localStorage.setItem(STORAGE_KEY, next)

    if (isSignedIn) {
      void upsertUserTheme({ data: { theme: next } }).catch(() => {
        // Local preference already applied; DB sync can retry on next change.
      })
    }
  }

  function setAccent(next: AccentName) {
    setAccentState(next)
    applyAccent(next)
    window.localStorage.setItem(ACCENT_STORAGE_KEY, next)

    if (isSignedIn) {
      void upsertUserAccent({ data: { accent: next } }).catch(() => {
        // Local preference already applied; DB sync can retry on next change.
      })
    }
  }

  return (
    <AppearanceContext.Provider value={{ theme, accent, setTheme, setAccent }}>
      {children}
    </AppearanceContext.Provider>
  )
}

export function useAppearance() {
  const value = useContext(AppearanceContext)
  if (!value) {
    throw new Error('useAppearance must be used within an AppearanceProvider.')
  }
  return value
}
