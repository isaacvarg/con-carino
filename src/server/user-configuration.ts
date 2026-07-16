import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import {
  AppAccent as AppAccentEnum,
  AppTheme as AppThemeEnum,
} from '#/generated/prisma/enums'
import type { AppAccent, AppTheme } from '#/generated/prisma/enums'
import {
  DEFAULT_ACCENT,
  isAccentName,
  type AccentName,
} from '#/lib/accents'
import { prisma } from '#/lib/prisma'
import { DEFAULT_THEME, isThemeName, type ThemeName } from '#/lib/themes'
import { authConfig } from '#/utils/auth'

const APP_THEMES = Object.values(AppThemeEnum)
const APP_ACCENTS = Object.values(AppAccentEnum)

async function requireUserId() {
  const request = getRequest()
  const session = await getSession(request, authConfig)
  const userId = session?.user?.id
  if (!userId) {
    throw new Error('You must be signed in to manage user configuration.')
  }
  return userId
}

function toThemeName(theme: AppTheme): ThemeName {
  return isThemeName(theme) ? theme : DEFAULT_THEME
}

function toAccentName(accent: AppAccent): AccentName {
  return isAccentName(accent) ? accent : DEFAULT_ACCENT
}

export const getUserConfiguration = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    const config = await prisma.userConfiguration.findUnique({
      where: { userId },
      select: { theme: true, accent: true },
    })
    return {
      theme: toThemeName(config?.theme ?? DEFAULT_THEME),
      accent: toAccentName(config?.accent ?? DEFAULT_ACCENT),
    }
  },
)

export const upsertUserTheme = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (
      typeof data !== 'object' ||
      data === null ||
      !('theme' in data) ||
      typeof (data as { theme: unknown }).theme !== 'string'
    ) {
      throw new Error('Invalid theme payload.')
    }
    const theme = (data as { theme: string }).theme
    if (!APP_THEMES.includes(theme as AppTheme)) {
      throw new Error('Theme must be latte or macchiato.')
    }
    return { theme: theme as AppTheme }
  })
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const config = await prisma.userConfiguration.upsert({
      where: { userId },
      create: { userId, theme: data.theme },
      update: { theme: data.theme },
      select: { theme: true },
    })
    return { theme: toThemeName(config.theme) }
  })

export const upsertUserAccent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (
      typeof data !== 'object' ||
      data === null ||
      !('accent' in data) ||
      typeof (data as { accent: unknown }).accent !== 'string'
    ) {
      throw new Error('Invalid accent payload.')
    }
    const accent = (data as { accent: string }).accent
    if (!APP_ACCENTS.includes(accent as AppAccent)) {
      throw new Error('Accent must be a Catppuccin accent color.')
    }
    return { accent: accent as AppAccent }
  })
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const config = await prisma.userConfiguration.upsert({
      where: { userId },
      create: { userId, accent: data.accent },
      update: { accent: data.accent },
      select: { accent: true },
    })
    return { accent: toAccentName(config.accent) }
  })
