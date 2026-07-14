/** daisyUI theme names (built-in + brand). */
export const THEMES = [
  'concarino',
  'light',
  'dark',
  'cupcake',
  'bumblebee',
  'emerald',
  'corporate',
  'synthwave',
  'retro',
  'cyberpunk',
  'valentine',
  'halloween',
  'garden',
  'forest',
  'aqua',
  'lofi',
  'pastel',
  'fantasy',
  'wireframe',
  'black',
  'luxury',
  'dracula',
  'cmyk',
  'autumn',
  'business',
  'acid',
  'lemonade',
  'night',
  'coffee',
  'winter',
  'dim',
  'nord',
  'sunset',
  'caramellatte',
  'abyss',
  'silk',
] as const

export type ThemeName = (typeof THEMES)[number]
export type ThemeSelection = 'system' | ThemeName

const DARK_THEMES = new Set<ThemeName>([
  'dark',
  'synthwave',
  'halloween',
  'forest',
  'black',
  'luxury',
  'dracula',
  'business',
  'night',
  'coffee',
  'dim',
  'abyss',
  'sunset',
])

export function isThemeName(value: string): value is ThemeName {
  return (THEMES as readonly string[]).includes(value)
}

export function isThemeSelection(value: string): value is ThemeSelection {
  return value === 'system' || isThemeName(value)
}

export function colorSchemeForTheme(theme: ThemeName): 'light' | 'dark' {
  return DARK_THEMES.has(theme) ? 'dark' : 'light'
}

export function formatThemeLabel(theme: ThemeName): string {
  if (theme === 'concarino') {
    return 'Con cariño'
  }
  return theme.charAt(0).toUpperCase() + theme.slice(1)
}
